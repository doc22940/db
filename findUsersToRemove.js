#!/usr/bin/env node
'use strict';

(async () => {

  const fs = require('fs');
  const ora = require('ora');
  const path = require('path');

  const data = require('./impl/data');
  const DbFile = require('./impl/dbFile');
  const github = require('./impl/github');
  const scriptUtils = require('./impl/scriptUtils');

  scriptUtils.printUnhandledRejections();

  await findUsersToRemove();
  return;

  async function findUsersToRemove() {
    // The goal is to find users who meet all these criteria:
    // * have had their profiles for a while,
    // * aren't marked not to be deleted,
    // * haven't starred the project, and
    // * have an empty profile.

    let spinner;
    const now = new Date;
    const minAgeMonths = 1;

    const users = [];
    for (const file of fs.readdirSync(data.users)) {
      if (file.endsWith('.json')) {
        const user = new DbFile(path.join(data.users, file));
        if (!user.ghuser_deleted_because && !user.ghuser_keep_because && !user.removed_from_github
            && now - Date.parse(user.ghuser_created_at) > minAgeMonths * 30 * 24 * 60 * 60 * 1000) {
          let isToBeRemoved = !user.contribs.repos.length;
          if (!isToBeRemoved) {
            const contribs = new DbFile(path.join(data.contribs, file));
            let total_stars = 0;
            for (const repo in contribs.repos) {
              total_stars += contribs.repos[repo].stargazers_count;
            }
            isToBeRemoved = !total_stars;
          }
          if (isToBeRemoved) {
            users.push(user);
          }
        }
      }
    }

    const stargazers = await fetchStargazers('ghuser-io/ghuser.io');
    const toRemove = users.map(user => user.login).filter(user => stargazers.indexOf(user) === -1);

    if (toRemove.length) {
      console.log(`
Users to remove:
`);
      for (const user of toRemove) {
        console.log(user);
      }
    }

    return;

    async function fetchStargazers(repo) {
      let stargazers = [];
      spinner = ora(`Fetching ${repo}'s stargazers...`).start();

      const perPage = 100;
      for (let page = 1;; ++page) {
        const ghUrl = `https://api.github.com/repos/${repo}/stargazers?page=${page}&per_page=${perPage}`;
        const ghDataJson = await github.fetchGHJson(ghUrl, spinner);

        stargazers = [...stargazers, ...ghDataJson.map(stargazer => stargazer.login)];

        if (ghDataJson.length < perPage) {
          break;
        }
      }

      spinner.succeed(`${repo} has ${stargazers.length} stargazers`);
      return stargazers;
    }
  }

})();
