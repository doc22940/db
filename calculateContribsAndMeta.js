#!/usr/bin/env node
'use strict';

(async () => {

  const fs = require('fs');
  const ora = require('ora');
  const path = require('path');
  const sleep = require('await-sleep');

  const data = require('./impl/data');
  const DbFile = require('./impl/dbFile');
  const scriptUtils = require('./impl/scriptUtils');

  scriptUtils.printUnhandledRejections();

  await calculateContribsAndMeta();
  return;

  async function calculateContribsAndMeta() {
    let spinner;

    let spinnerText = 'Reading users from DB...';
    spinner = ora(spinnerText).start();
    const users = {};
    let numUsers = 0;
    for (const file of fs.readdirSync(data.users)) {
      await sleep(0); // make loop interruptible

      if (file.endsWith('.json')) {
        const user = new DbFile(path.join(data.users, file));
        if (!user.ghuser_deleted_because && !user.removed_from_github) {
          users[file] = user;
          ++numUsers;
          spinner.text = `${spinnerText} [${numUsers}]`;

          // Make sure the corresponding contrib file exists (not the case if it's a new user):
          (new DbFile(path.join(data.contribs, file))).write();
        }
      }
    }
    spinner.succeed(`Found ${numUsers} users in DB`);

    spinnerText = 'Reading contribution lists from DB...';
    spinner = ora(spinnerText).start();
    const contribs = {};
    for (const file of fs.readdirSync(data.contribs)) {
      await sleep(0); // make loop interruptible

      if (file.endsWith('.json')) {
        const contribList = new DbFile(path.join(data.contribs, file));
        contribList.repos = {};
        contribs[file] = contribList;
        spinner.text = `${spinnerText} [${Object.keys(contribs).length}]`;
      }
    }
    spinner.succeed(`Found ${Object.keys(contribs).length} contribution lists in DB`);

    stripUnreferencedContribs();

    let numContribs = 0;
    for (const filename in contribs) {
      await sleep(0); // make loop interruptible

      numContribs += calculateScores(filename);
      stripInsignificantContribs(filename);
      calculateOrgs(filename);
    }

    const meta = new DbFile(data.meta);
    meta.num_users = numUsers;
    meta.num_contribs = numContribs;
    meta.write();

    return;

    function stripUnreferencedContribs() {
      // Deletes contrib files that aren't referenced by any user.

      const toBeDeleted = [];
      for (const contribList in contribs) {
        if (!users[contribList]) {
          toBeDeleted.push(contribList);
        }
      }
      for (const contribList of toBeDeleted) {
        delete contribs[contribList];
        fs.unlinkSync(path.join(data.contribs, contribList));
      }
    }

    // Calculates all scores for the given user.
    // Returns the number of contributions.
    function calculateScores(filename) {
      const userLogin = users[filename].login;

      spinner = ora(`Calculating scores for ${userLogin}...`).start();

      let numContribs = 0;
      for (const repo of users[filename].contribs.repos) {
        const repoPath = path.join(data.repos, `${repo}.json`);
        if (!fs.existsSync(repoPath)) { // repo has been stripped
          continue;
        }

        const repoFile = new DbFile(repoPath);
        if (!repoFile.full_name // repo hasn't been crawled yet
            || repoFile.removed_from_github
            || repoFile.ghuser_insignificant
           ) {
          continue;
        }
        ++numContribs;

        const full_name = repoFile.full_name;
        const score = contribs[filename].repos[full_name] = {
          full_name,
          name: repoFile.name,
          stargazers_count: repoFile.stargazers_count,
        };

        let totalContribs = 0;
        for (const contributor in repoFile.contributors) {
          // We don't want to count web-flow's work as real contributions, see
          // https://github.com/ghuser-io/ghuser.io/issues/181
          if (contributor != 'web-flow') {
            totalContribs += repoFile.contributors[contributor];
          }
        }

        score.percentage = repoFile.contributors && repoFile.contributors[userLogin] &&
                           100 * repoFile.contributors[userLogin] / totalContribs || 0;
        score.total_commits_count = totalContribs;
      }

      spinner.succeed(`Calculated scores for ${userLogin}`);
      contribs[filename].write();
      return numContribs;
    }

    function stripInsignificantContribs(filename) {
      // Deletes contributions to forks if the user has done 0%.

      const toBeDeleted = [];
      for (const repo in contribs[filename].repos) {
        const score = contribs[filename].repos[repo];
        const repoPath = path.join(data.repos, `${repo}.json`);
        if (fs.existsSync(repoPath)) {
          const repoFile = new DbFile(repoPath);
          if (repoFile.fork && score.percentage === 0) {
            toBeDeleted.push(repo);
          }
        }
      }
      for (const repo of toBeDeleted) {
        delete contribs[filename].repos[repo];
      }

      contribs[filename].write();
    }

    function calculateOrgs(filename) {
      contribs[filename].organizations = getContribsOwners(contribs[filename].repos).filter(
        owner => (new DbFile(path.join(data.orgs, `${owner}.json`))).login);
      contribs[filename].write();
      return;

      function getContribsOwners(contribRepos) {
        const result = new Set([]);
        for (const repo in contribRepos) {
          if (!contribRepos[repo].percentage) {
            continue;
          }

          const originalOwner = repo.split('/')[0];
          result.add(originalOwner);
          if (contribRepos[repo].full_name) {
            const currentOwner = contribRepos[repo].full_name.split('/')[0];
            result.add(currentOwner);
          }
        }
        return [...result];
      }
    }
  }

})();
