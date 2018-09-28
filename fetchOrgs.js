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

  await fetchOrgs();
  return;

  async function fetchOrgs() {
    let spinner;

    const orgs = new DbFile(data.orgs);
    orgs.orgs = orgs.orgs || {};

    // In this file we store repo owners that we know aren't organizations. This avoids querying
    // them next time.
    const nonOrgs = new DbFile(data.nonOrgs);
    nonOrgs.non_orgs = nonOrgs.non_orgs || [];

    const users = [];
    for (const file of fs.readdirSync(data.users)) {
      if (file.endsWith('.json')) {
        const user = new DbFile(path.join(data.users, file));
        if (!user.ghuser_deleted_because) {
          users.push(user);
        }
      }
    }

    let userOrgs = new Set([]);
    for (const user of users) {
      userOrgs = new Set([...userOrgs, ...user.organizations]);
    }
    await fetchOrgs(userOrgs);

    let contribOwners = new Set([]);
    for (const user of users) {
      contribOwners = new Set([
        ...contribOwners,
        ...(user.contribs && user.contribs.repos.map(repo => repo.split('/')[0]) || [])
      ]);
    }
    await fetchOrgs(contribOwners);

    stripUnreferencedOrgs();

    return;

    async function fetchOrgs(owners) {
      owners:
      for (const owner of owners) {
        spinner = ora(`Fetching owner ${owner}...`).start();
        if (orgs.orgs[owner] && orgs.orgs[owner].avatar_url) {
          spinner.succeed(`Organization ${owner} is already known`);
          continue;
        }
        if (nonOrgs.non_orgs.indexOf(owner) !== -1) {
          spinner.succeed(`${owner} is a user`);
          continue;
        }
        for (const user of users) {
          if (user.login === owner) {
            spinner.succeed(`${owner} is a user`);
            nonOrgs.non_orgs.push(owner);
            nonOrgs.write();
            continue owners;
          }
        }

        const orgUrl = `https://api.github.com/orgs/${owner}`;
        const orgJson = await github.fetchGHJson(orgUrl, spinner, [404]);
        if (orgJson === 404) {
          spinner.succeed(`${owner} must be a user`);
          nonOrgs.non_orgs.push(owner);
          nonOrgs.write();
          continue;
        }
        spinner.succeed(`Fetched organization ${owner}`);

        orgs.orgs[orgJson.login] = {...orgs.orgs[orgJson.login], ...orgJson};

        // Keep the DB small:
        delete orgs.orgs[orgJson.login].id;
        delete orgs.orgs[orgJson.login].node_id;
        delete orgs.orgs[orgJson.login].events_url;
        delete orgs.orgs[orgJson.login].hooks_url;
        delete orgs.orgs[orgJson.login].issues_url;
        delete orgs.orgs[orgJson.login].repos_url;
        delete orgs.orgs[orgJson.login].members_url;
        delete orgs.orgs[orgJson.login].public_members_url;
        delete orgs.orgs[orgJson.login].description;
        delete orgs.orgs[orgJson.login].company;
        delete orgs.orgs[orgJson.login].blog;
        delete orgs.orgs[orgJson.login].location;
        delete orgs.orgs[orgJson.login].email;
        delete orgs.orgs[orgJson.login].has_organization_projects;
        delete orgs.orgs[orgJson.login].has_repository_projects;
        delete orgs.orgs[orgJson.login].public_repos;
        delete orgs.orgs[orgJson.login].public_gists;
        delete orgs.orgs[orgJson.login].followers;
        delete orgs.orgs[orgJson.login].following;
        delete orgs.orgs[orgJson.login].is_verified;
        delete orgs.orgs[orgJson.login].total_private_repos;
        delete orgs.orgs[orgJson.login].owned_private_repos;
        delete orgs.orgs[orgJson.login].private_gists;
        delete orgs.orgs[orgJson.login].disk_usage;
        delete orgs.orgs[orgJson.login].billing_email;
        delete orgs.orgs[orgJson.login].plan;
        delete orgs.orgs[orgJson.login].default_repository_permission;
        delete orgs.orgs[orgJson.login].members_can_create_repositories;
        delete orgs.orgs[orgJson.login].two_factor_requirement_enabled;

        orgs.write();
      }
    }

    function stripUnreferencedOrgs() {
      // Deletes orgs that are not referenced by any user.

      const toBeDeleted = [];
      for (const org in orgs.orgs) {
        if (!userOrgs.has(org) && !contribOwners.has(org)) {
          toBeDeleted.push(org);
        }
      }
      for (const org of toBeDeleted) {
        delete orgs.orgs[org];
      }

      orgs.write();
    }
  }

})();
