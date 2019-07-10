[![Build Status](https://travis-ci.org/ghuser-io/db.svg?branch=master)](https://travis-ci.org/ghuser-io/db)
[![All Contributors](https://img.shields.io/badge/all_contributors-3-orange.svg?style=flat-square)](#contributors)

[<img src="https://cdn.jsdelivr.net/gh/ghuser-io/db@598204a2e16787819f9a489bc9e8a26fb8650c9b/thirdparty/octicons/database.svg" align="left" width="64" height="64">](https://github.com/ghuser-io/db)

# [ghuser.io](https://github.com/ghuser-io/ghuser.io)'s database scripts

This repository provides scripts to update the database for the
[ghuser.io](https://github.com/ghuser-io/ghuser.io) Reframe app. The database consists of
[JSON](#production-json-files) files. The production data is stored on
[AWS](https://github.com/ghuser-io/ghuser.io/blob/master/aws). The scripts expect it at `~/data` and
this can be overridden by setting the `GHUSER_DBDIR` environment variable.

The [fetchBot](fetchBot/) calls these scripts. It runs every few days on an
[EC2 instance](https://github.com/ghuser-io/ghuser.io/blob/master/aws/ec2).

## Table of Contents

<!-- toc -->

- [Setup](#setup)
- [Usage](#usage)
- [Implementation](#implementation)
- [Production JSON files](#production-json-files)
- [Contributors](#contributors)

<!-- tocstop -->

## Setup

API keys can be created [here](https://github.com/settings/developers).

```bash
$ npm install
```

## Usage

**Start tracking a user**

```bash
$ ./addUser.js USER
```

**Stop tracking a user**

```bash
$ ./rmUser.js USER "you asked us to remove your profile in https://github.com/ghuser-io/ghuser.io/issues/666"
```

**Refresh and clean data for all tracked users**

```
$ export GITHUB_CLIENT_ID=0123456789abcdef0123
$ export GITHUB_CLIENT_SECRET=0123456789abcdef0123456789abcdef01234567
$ export GITHUB_USERNAME=AurelienLourot
$ export GITHUB_PASSWORD=********
$ ./fetchAndCalculateAll.sh
GitHub API key found.
GitHub credentials found.
...
/home/ubuntu/data/users
  2654 users
  largest: gdi2290.json (26 KB)
  total: 5846 KB
/home/ubuntu/data/contribs
  largest: orta.json (144 KB)
  total: 14 MB
/home/ubuntu/data/repos
  112924 repos
  65706 significant repos
  largest: jlord/patchwork.json (712 KB)
  total: 203 MB
/home/ubuntu/data/repoCommits
  largest: CocoaPods/Specs.json (3965 KB)
  total: 397 MB
/home/ubuntu/data/orgs
  11072 orgs
  largest: google-certified-mobile-web-specialists.json (445 B)
  total: 3520 KB
/home/ubuntu/data/nonOrgs.json: 252 KB
/home/ubuntu/data/meta.json: 49 B
total: 623 MB

=> 240 KB/user

real    449m19.774s
user    15m52.644s
sys     2m21.976s
```

## Implementation

Several scripts form a pipeline for updating the database. Here is the data flow:

```
[ ./addUser.js myUser ]   [ ./rmUser.js myUser ]
                 │             │
                 v             v
              ┌───────────────────┐
              │ users/myuser.json │<───────────┐
              └────────────────┬──┘ │─┐        │
                └──────────────│────┘ │        │                    ╔════════╗
                  └────┬───────│──────┘        │                    ║ GitHub ║
                       │       │               │                    ╚════╤═══╝
                       │       v               │                         │
                       │   [ ./fetchUserDetailsAndContribs.js myUser ]<──┤
                       │                                                 │
                       ├────────────>[ ./fetchOrgs.js ]<─────────────────┤
                       │                   ^     ^                       │
                       │                   │     │                       │
                       │                   v     v                       │
                       │      ┌──────────────┐ ┌─────────────────┐       │
                       │      │ nonOrgs.json │ │ orgs/myOrg.json │─┐     │
                       │      └──────────────┘ └─────────────────┘ │─┐   │
                       │                         └─────────────────┘ │   │
                       │                           └──────────┬──────┘   │
                       │                                      │          │
                       ├──>[ ./fetchRepos.js ]<──────────────────────────┘
                       │             ^                        │
                       │             │                        │
                       │             v                        │
                       │  ┌───────────────────────────┐       │
                       │  │ repo*/myOwner/myRepo.json │─┐     │
                       │  └───────────────────────────┘ │─┐   │
                       │    └───────────────────────────┘ │   │
                       │      └────┬──────────────────────┘   │
                       │           │                          │
                       │           │          ┌───────────────┘
                       │           │          │
                       v           v          v
                   [ ./calculateContribsAndMeta.js ]
                           │               │
                           v               v
       ┌──────────────────────┐         ┌───────────┐
       │ contribs/myuser.json │─┐       │ meta.json │
       └──────────────────────┘ │─┐     └───────────┘
         └──────────────────────┘ │
           └──────────────────────┘
```

> **NOTES**:
>
> * These scripts also delete unreferenced data.
> * Instead of calling each of these scripts directly, you can call `./fetchAndCalculateAll.sh`
>   which will orchestrate them.

## Production JSON files

The production JSON files are currently stored on
[S3](https://github.com/ghuser-io/ghuser.io/blob/master/aws) and exposed to front end over HTTPS,
e.g.

* [`users/brillout.json`](https://s3.amazonaws.com/ghuser/data/users/brillout.json)
* [`nonOrgs.json`](https://s3.amazonaws.com/ghuser/data/nonOrgs.json)
* [`orgs/reframejs.json`](https://s3.amazonaws.com/ghuser/data/orgs/reframejs.json)
* [`repos/reframejs/reframe.json`](https://s3.amazonaws.com/ghuser/data/repos/reframejs/reframe.json)
* [`repoCommits/reframejs/reframe.json`](https://s3.amazonaws.com/ghuser/data/repoCommits/reframejs/reframe.json)
* [`contribs/brillout.json`](https://s3.amazonaws.com/ghuser/data/contribs/brillout.json)
* [`meta.json`](https://s3.amazonaws.com/ghuser/data/meta.json)

Every few days a backup named `YYYY-MM-DD.tar.gz` containing all the JSON files is created, e.g.
[`2018-10-07.tar.gz`](https://s3.amazonaws.com/ghuser/backups/2018-10-07.tar.gz).

## Contributors

Thanks goes to these wonderful people ([emoji key](https://github.com/kentcdodds/all-contributors#emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore -->
| [<img src="https://avatars1.githubusercontent.com/u/11795312?v=4" width="100px;"/><br /><sub><b>Aurelien Lourot</b></sub>](https://ghuser.io/AurelienLourot)<br />[💬](#question-AurelienLourot "Answering Questions") [💻](https://github.com/ghuser-io/db/commits?author=AurelienLourot "Code") [📖](https://github.com/ghuser-io/db/commits?author=AurelienLourot "Documentation") [👀](#review-AurelienLourot "Reviewed Pull Requests") | [<img src="https://avatars3.githubusercontent.com/u/4883293?v=4" width="100px;"/><br /><sub><b>Charles</b></sub>](https://github.com/wowawiwa)<br />[💻](https://github.com/ghuser-io/db/commits?author=wowawiwa "Code") [📖](https://github.com/ghuser-io/db/commits?author=wowawiwa "Documentation") [🤔](#ideas-wowawiwa "Ideas, Planning, & Feedback") | [<img src="https://avatars2.githubusercontent.com/u/1005638?v=4" width="100px;"/><br /><sub><b>Romuald Brillout</b></sub>](https://twitter.com/brillout)<br />[🤔](#ideas-brillout "Ideas, Planning, & Feedback") |
| :---: | :---: | :---: |
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/kentcdodds/all-contributors) specification. Contributions of any kind welcome!
