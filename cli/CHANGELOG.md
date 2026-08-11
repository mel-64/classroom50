# Changelog

All notable changes to the Classroom 50 CLI extensions (`gh-teacher`,
`gh-student`) are documented here. The web app (classroom50.org) has its own
release track and is not covered by this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are automated with
[release-please](https://github.com/googleapis/release-please): feature PRs
merge into `main` and release-please maintains a release PR that bumps this file
from [Conventional Commits](https://www.conventionalcommits.org/) (`feat:` ->
minor, `fix:` -> patch, `feat!:`/`fix!:` -> major). Merging that release PR tags
`cli-vX.Y.Z`, which the existing CLI release workflow consumes to build and
publish the extensions (see `.github/workflows/cli-release.yaml`). You no longer
tag by hand; write Conventional Commit messages and release-please compiles the
notes.

## [1.23.0](https://github.com/mel-64/classroom50/compare/cli-v1.27.2...cli-v1.23.0) (2026-08-11)


### ⚠ BREAKING CHANGES

* remove students.csv legacy roster support ([#474](https://github.com/mel-64/classroom50/issues/474))
* a classroom still on a -instructor team or with a teams.instructor ref is no longer accepted rather than silently normalized; a role=instructor CSV row imports as an unknown role (degrades to student).
* **roster:** rename students.csv onboarding column reconciled_at -> enrolled_at ([#195](https://github.com/mel-64/classroom50/issues/195)) (#197)

### Features

* add Head TA (HTA) role ([#344](https://github.com/mel-64/classroom50/issues/344)) ([b6a7deb](https://github.com/mel-64/classroom50/commit/b6a7debaba1f829759f546690fc0600ff50e47f1))
* add lockable assignments that block student access and revoke private-template read ([#441](https://github.com/mel-64/classroom50/issues/441)) ([127982b](https://github.com/mel-64/classroom50/commit/127982b9a518ee6b8a3c91fc4a6e1143f0f793c6))
* add no_autograder assignment state for teacher-supplied CI ([#554](https://github.com/mel-64/classroom50/issues/554)) ([bd58fce](https://github.com/mel-64/classroom50/commit/bd58fce09ed8553f041338e9d0aa333ce91ff374))
* add per-assignment release date (available_from) and hide unreleased assignments from students ([#439](https://github.com/mel-64/classroom50/issues/439)) ([6cc15f0](https://github.com/mel-64/classroom50/commit/6cc15f07852545e0f50988ffa7386339a87dc99e))
* add Rust runtime toolchain support to the autograder ([#132](https://github.com/mel-64/classroom50/issues/132)) ([4db3da2](https://github.com/mel-64/classroom50/commit/4db3da2679ba9f5faf735073c04d49d7dc5ea783))
* add submission release assets ([#363](https://github.com/mel-64/classroom50/issues/363)) ([3a69695](https://github.com/mel-64/classroom50/commit/3a69695ab407cb204ff6e7170aa943b272ae7838))
* **assignment:** add optional pass_threshold to assignments/v1 ([#199](https://github.com/mel-64/classroom50/issues/199)) ([#201](https://github.com/mel-64/classroom50/issues/201)) ([fcef14e](https://github.com/mel-64/classroom50/commit/fcef14e1c89b9811c2200dce3df80ce38872168b))
* **assignments:** add opt-in empty-repo option ([#311](https://github.com/mel-64/classroom50/issues/311)) ([f06ee63](https://github.com/mel-64/classroom50/commit/f06ee632d0005a3db499178f57c0504a6be01052))
* **ci:** add release-please automation for cli releases ([#341](https://github.com/mel-64/classroom50/issues/341)) ([b5a3b94](https://github.com/mel-64/classroom50/commit/b5a3b944da0e8746be50d95f21d77feeee11db1b)), closes [#143](https://github.com/mel-64/classroom50/issues/143)
* **cli:** add latest-submission link to Feedback PR body ([#323](https://github.com/mel-64/classroom50/issues/323)) ([2883b28](https://github.com/mel-64/classroom50/commit/2883b287d04ed1d04cea0637a189222b6850f6fd)), closes [#262](https://github.com/mel-64/classroom50/issues/262)
* **cli:** open and repair Feedback PRs from the teacher CLI ([#435](https://github.com/mel-64/classroom50/issues/435)) ([70ff18a](https://github.com/mel-64/classroom50/commit/70ff18ae30c95f0823d85f54064dbcc4f9169600))
* **cli:** reuse/refresh gh auth instead of clobbering it on login ([#537](https://github.com/mel-64/classroom50/issues/537)) ([6fe861a](https://github.com/mel-64/classroom50/commit/6fe861a7b43bd413853d4287361518f1e8769917))
* **cli:** skip autograde grade job when no autograder is configured ([#458](https://github.com/mel-64/classroom50/issues/458)) ([aa16f0a](https://github.com/mel-64/classroom50/commit/aa16f0a2fc3452282246e8d790f0f02a01e4fd18))
* **cli:** staff-team management + stricter audit verdict to match the web GUI ([#281](https://github.com/mel-64/classroom50/issues/281)) ([f2611e6](https://github.com/mel-64/classroom50/commit/f2611e63f40db072dd6d63d1850b90d9d8cb2777))
* **cli:** surface roster role column and note dual staff/student roles ([#475](https://github.com/mel-64/classroom50/issues/475)) ([634cbb4](https://github.com/mel-64/classroom50/commit/634cbb4df50aa39b47e4403ff1180a98a5e8b2cc))
* **cli:** unify gh-teacher and gh-student OAuth login scopes ([#282](https://github.com/mel-64/classroom50/issues/282)) ([6e91127](https://github.com/mel-64/classroom50/commit/6e9112744c3dcc9b53f4b01fed2b24373520dbc7))
* **cli:** version/commit/date in --version + canonical gh asset names ([#277](https://github.com/mel-64/classroom50/issues/277)) ([61a4e1e](https://github.com/mel-64/classroom50/commit/61a4e1ea25a6702aecbbccfcb04055c8ba3d73c6))
* collect and show accepted staff submissions ([#393](https://github.com/mel-64/classroom50/issues/393)) ([675e117](https://github.com/mel-64/classroom50/commit/675e117a6ce0ee8692edc21e0963ff1a7d29a8d5))
* **commits:** prefix all automated commits with [Classroom 50] ([#244](https://github.com/mel-64/classroom50/issues/244)) ([#273](https://github.com/mel-64/classroom50/issues/273)) ([85dfaa8](https://github.com/mel-64/classroom50/commit/85dfaa8a238ea9f94442a8e3648c5d01f09706cf))
* configurable student assignment-repo access with per-repo and bulk controls ([#466](https://github.com/mel-64/classroom50/issues/466)) ([efb69f8](https://github.com/mel-64/classroom50/commit/efb69f8294512eadb7956bfff69e8e912bbd7ae5))
* decouple classroom from students.csv — team as source of truth ([#108](https://github.com/mel-64/classroom50/issues/108)) ([#112](https://github.com/mel-64/classroom50/issues/112)) ([be1c1c1](https://github.com/mel-64/classroom50/commit/be1c1c138b263f19d973767cad3dc6c5f6d512b3))
* enforce a $0 Actions budget cap as org policy ([#356](https://github.com/mel-64/classroom50/issues/356)) ([3cb60e4](https://github.com/mel-64/classroom50/commit/3cb60e4653cf14b80cd3c46961b9f271a4562235))
* **gh-teacher:** add additional details to autograded logs.  ([#353](https://github.com/mel-64/classroom50/issues/353)) ([254381e](https://github.com/mel-64/classroom50/commit/254381e9fae3dcc8f63b4f0c43e6c4ad3b695aa1))
* grant students push (not admin) on individual assignment repos ([#231](https://github.com/mel-64/classroom50/issues/231)) ([052ce36](https://github.com/mel-64/classroom50/commit/052ce360eca39f4e90dcc981abc000d3ae9df627))
* grant TA (staff) teams repo access during score collection ([#244](https://github.com/mel-64/classroom50/issues/244)) ([3c5b369](https://github.com/mel-64/classroom50/commit/3c5b369d790da97dc25b890767a1127234426e7f))
* grant TA staff team read on templates at setup, not only at collect-scores ([#288](https://github.com/mel-64/classroom50/issues/288)) ([9e4e5a3](https://github.com/mel-64/classroom50/commit/9e4e5a3bb71c6c3ec2247851c9abe66d828e5e0f))
* migrate students.csv to roster.csv on write ([#219](https://github.com/mel-64/classroom50/issues/219)) ([86fd1d9](https://github.com/mel-64/classroom50/commit/86fd1d9dd5c7b97e7bc3c3f03e29236512115e68))
* open the Feedback PR at accept time via the GitHub API ([#409](https://github.com/mel-64/classroom50/issues/409)) ([5ce01b7](https://github.com/mel-64/classroom50/commit/5ce01b749db789192f613040715657ff09b38358))
* per-assignment submission triggers — modes and milestone tags ([#477](https://github.com/mel-64/classroom50/issues/477)) ([#531](https://github.com/mel-64/classroom50/issues/531)) ([90c45a7](https://github.com/mel-64/classroom50/commit/90c45a749d047e4087543b04d417ad3cd0112626))
* remove legacy "instructor" staff-role alias ([#473](https://github.com/mel-64/classroom50/issues/473)) ([85164b9](https://github.com/mel-64/classroom50/commit/85164b9a7bb3791c72f652c3bbf42196928d7255))
* remove students.csv legacy roster support ([#474](https://github.com/mel-64/classroom50/issues/474)) ([b00ce2c](https://github.com/mel-64/classroom50/commit/b00ce2ce0df7f9e72fdb964646082461d28b17bc))
* rename students.csv to roster.csv with read-fallback and migrator ([#215](https://github.com/mel-64/classroom50/issues/215)) ([aca0711](https://github.com/mel-64/classroom50/commit/aca071166068c1fd89359630c16eac463f6516dd))
* restrict assignment accept to enrolled classroom members ([#442](https://github.com/mel-64/classroom50/issues/442)) ([0e06012](https://github.com/mel-64/classroom50/commit/0e0601219e6006083da6a6767f8e6a520b85845c))
* standardize on "teacher" terminology (backward-compatible role/team migration) ([#321](https://github.com/mel-64/classroom50/issues/321)) ([0b6d5a0](https://github.com/mel-64/classroom50/commit/0b6d5a0a24d8d874724cca549d20dd9e618c8d05))
* sync instructors/TAs into roster.csv and add a best-effort role column ([#216](https://github.com/mel-64/classroom50/issues/216)) ([af17992](https://github.com/mel-64/classroom50/commit/af17992da0fbc21063050c45da707aab9bf370e2))
* **teacher:** assignment reuse + classroom archival semantics ([#202](https://github.com/mel-64/classroom50/issues/202), [#203](https://github.com/mel-64/classroom50/issues/203)) ([#204](https://github.com/mel-64/classroom50/issues/204)) ([049aa9f](https://github.com/mel-64/classroom50/commit/049aa9f659578b7d678a2df84764d761eb21bebe))
* **teacher:** regrade pipeline — re-run autograder without moving submission time ([#208](https://github.com/mel-64/classroom50/issues/208)) ([#209](https://github.com/mel-64/classroom50/issues/209)) ([b9e30e2](https://github.com/mel-64/classroom50/commit/b9e30e2402d974ed95e2c3fbbfd2cfa04b1b1dfa))
* **web:** bundle skeleton into the deploy, align CLI/GUI contracts ([1aa7b63](https://github.com/mel-64/classroom50/commit/1aa7b63ad6fba3ed4374afc14cd0209ec1bd094c))
* **web:** bundle skeleton into the deploy, align CLI/GUI contracts ([8603fd9](https://github.com/mel-64/classroom50/commit/8603fd947fab386a28131b74adbca1dc6fed3a41))
* **web:** capability-gate RBAC so TAs/Head TAs can't invoke owner-only or write ops ([#346](https://github.com/mel-64/classroom50/issues/346)) ([4335378](https://github.com/mel-64/classroom50/commit/433537843d3f78f441b74e7eedbf9fdd8df6fcca))
* **web:** manage service tokens across organizations ([#443](https://github.com/mel-64/classroom50/issues/443)) ([549d34a](https://github.com/mel-64/classroom50/commit/549d34aab497dc1a3050111f4bfbd8cbf974479d))
* **web:** org-level bulk membership management ([#70](https://github.com/mel-64/classroom50/issues/70) Phase 1) ([#117](https://github.com/mel-64/classroom50/issues/117)) ([28b7c99](https://github.com/mel-64/classroom50/commit/28b7c9934263eee6015075384ee1abd162c608c5))
* **web:** per-assignment repository features (issues/wiki/projects/pull requests) ([#479](https://github.com/mel-64/classroom50/issues/479)) ([bd9725d](https://github.com/mel-64/classroom50/commit/bd9725de6c3fbc249dcaa2a4dded10908a9e97e7))
* **web:** student classrooms view, assignment discovery, and submit guidance ([#328](https://github.com/mel-64/classroom50/issues/328)) ([4bff93b](https://github.com/mel-64/classroom50/commit/4bff93b748528d35618718bf2ca6a31ad8de127b))
* **web:** surface skeleton drift and bump skeleton action pins ([#90](https://github.com/mel-64/classroom50/issues/90)) ([2e6314f](https://github.com/mel-64/classroom50/commit/2e6314fc85ee05ee870d276f30efc7b515050af2)), closes [#88](https://github.com/mel-64/classroom50/issues/88)
* **web:** teacher tools to open and repair Feedback PRs ([#434](https://github.com/mel-64/classroom50/issues/434)) ([91ce244](https://github.com/mel-64/classroom50/commit/91ce244303cf63e99aac4f183442124babd8c97e))


### Bug Fixes

* **cli:** auto-install pytest + pytest-json-report for python autograding ([#229](https://github.com/mel-64/classroom50/issues/229)) ([15f936d](https://github.com/mel-64/classroom50/commit/15f936d1463381b8635a0f8c41b46cbd1610df3d))
* **cli:** correct help text listing --template as required and other stale flag references ([#452](https://github.com/mel-64/classroom50/issues/452)) ([98e5551](https://github.com/mel-64/classroom50/commit/98e555164899649e1e8f1ed023c807af36684412))
* **cli:** record a submission when no autograder is configured ([#535](https://github.com/mel-64/classroom50/issues/535)) ([f3dd96c](https://github.com/mel-64/classroom50/commit/f3dd96c8c949cb7d763743ad942ffa22718e68fc))
* **cli:** single-source the assignment-repo naming formula ([#279](https://github.com/mel-64/classroom50/issues/279)) ([aaeb3cd](https://github.com/mel-64/classroom50/commit/aaeb3cdfd9109789a8c5e1bb315841add2803780))
* **cli:** skip managed toolchain setup on self-hosted autograde runners ([#370](https://github.com/mel-64/classroom50/issues/370)) ([d1cf8b0](https://github.com/mel-64/classroom50/commit/d1cf8b05e6b4cf95fdffb050fa0c78b413f808c8))
* **cli:** tolerate a malformed pre-existing roster.csv row on write ([#267](https://github.com/mel-64/classroom50/issues/267)) ([3242505](https://github.com/mel-64/classroom50/commit/32425055282290b05b53d9e08be5800d6d5038ae))
* close the roster.csv formula-guard, padded-id, and i18n gaps ([#417](https://github.com/mel-64/classroom50/issues/417)) ([3aa8e22](https://github.com/mel-64/classroom50/commit/3aa8e22996cdab1fd2e1dd4256f432af45ba897c))
* enable notifications on staff teams (teacher/ta) ([#337](https://github.com/mel-64/classroom50/issues/337)) ([28c6e10](https://github.com/mel-64/classroom50/commit/28c6e106c005bab2aabc84b41290a97bcb0bb7d5))
* exempt forks from the empty-template size-0 guard ([#536](https://github.com/mel-64/classroom50/issues/536)) ([6be63f1](https://github.com/mel-64/classroom50/commit/6be63f1838124645da20f3a4ffa6e62a769b6080))
* keep classroom creator on the instructor team only ([#243](https://github.com/mel-64/classroom50/issues/243)) ([511d3f0](https://github.com/mel-64/classroom50/commit/511d3f0fcc5f6b85a41db1ce5b11f199c475de6d))
* name the fork's upstream org for cross-org fork templates ([#468](https://github.com/mel-64/classroom50/issues/468)) ([#470](https://github.com/mel-64/classroom50/issues/470)) ([53785b8](https://github.com/mel-64/classroom50/commit/53785b807133023c418580f5b02fcd95a90b3c1f))
* name the real cause when an org blocks student repo creation ([#418](https://github.com/mel-64/classroom50/issues/418)) ([789b65c](https://github.com/mel-64/classroom50/commit/789b65c4ebdb65539d6f69d7389aaf75bbe4db5c))
* patch dependabot security alerts in x/crypto and happy-dom ([#224](https://github.com/mel-64/classroom50/issues/224)) ([5f51ba0](https://github.com/mel-64/classroom50/commit/5f51ba0a8033717d35ef1758c95c0cec72dc1d5e))
* reject a malformed github_id in both the web app and the CLI ([#411](https://github.com/mel-64/classroom50/issues/411)) ([f2576d8](https://github.com/mel-64/classroom50/commit/f2576d89b9c1da97f845238b6f929ab76b434f5e))
* reject an empty (commitless) template before accept ([#528](https://github.com/mel-64/classroom50/issues/528)) ([5ca964f](https://github.com/mel-64/classroom50/commit/5ca964f4d50656d2bfa0c9f77ac995f2f79e9003))
* **roster:** rename students.csv onboarding column reconciled_at -&gt; enrolled_at ([#195](https://github.com/mel-64/classroom50/issues/195)) ([#197](https://github.com/mel-64/classroom50/issues/197)) ([73262d7](https://github.com/mel-64/classroom50/commit/73262d7a7e38b649c8cd2f1826942ce96c53d333))
* **roster:** tolerate and preserve web onboarding columns in students.csv ([#194](https://github.com/mel-64/classroom50/issues/194)) ([39d5aa9](https://github.com/mel-64/classroom50/commit/39d5aa91c1b5b417aa188ea9ad4f1828705cf12d))
* silence staff-team removal email by granting config-repo access after owner drop ([#529](https://github.com/mel-64/classroom50/issues/529)) ([34c4014](https://github.com/mel-64/classroom50/commit/34c401403eb3178040551763fd2fef575685233f))
* stop enforcing private-repo forking org policy ([#179](https://github.com/mel-64/classroom50/issues/179)) ([898156a](https://github.com/mel-64/classroom50/commit/898156a12b0b86bd90825fb0017f5ff83ddc120a)), closes [#109](https://github.com/mel-64/classroom50/issues/109)
* support non-main default branches in org setup and submit ([#235](https://github.com/mel-64/classroom50/issues/235)) ([1b31591](https://github.com/mel-64/classroom50/commit/1b31591ae51e8f81cce71f0720caeafaa33ce430))
* **web:** let org owners accept assignments despite residual admin ([#286](https://github.com/mel-64/classroom50/issues/286)) ([23c8515](https://github.com/mel-64/classroom50/commit/23c8515f3515fdb13bc7a2f087d565a609953aea))
* **web:** remediate brace-expansion DoS and refresh dependencies ([#436](https://github.com/mel-64/classroom50/issues/436)) ([9e1d355](https://github.com/mel-64/classroom50/commit/9e1d355940fac44589d3bf8361f77c75b3f57d29))
* **web:** stop force-disabling repo features on template-less assignments ([#482](https://github.com/mel-64/classroom50/issues/482)) ([da7825d](https://github.com/mel-64/classroom50/commit/da7825dd3e46d4c82f5bce544704f06406352f3c))
* **web:** use branches probe, not repo size, to detect empty templates ([#545](https://github.com/mel-64/classroom50/issues/545)) ([4ed82f5](https://github.com/mel-64/classroom50/commit/4ed82f54d606736433bca081fbc18c7a53b0c425))
* **web:** write students.csv header on an empty roster; make regrade team-driven ([#133](https://github.com/mel-64/classroom50/issues/133)) ([19f9dc9](https://github.com/mel-64/classroom50/commit/19f9dc9b3fee79d566854744ff5267e890071d11))


### Miscellaneous Chores

* release 1.0.0 ([bfc33a3](https://github.com/mel-64/classroom50/commit/bfc33a3c48d021790beebd59cd87c8c94832e291))
* release 1.23.0 ([#476](https://github.com/mel-64/classroom50/issues/476)) ([4a50632](https://github.com/mel-64/classroom50/commit/4a50632a2832fdfa5a5e3bc385712620a0d9e797))

## [1.27.2](https://github.com/foundation50/classroom50/compare/cli-v1.27.1...cli-v1.27.2) (2026-08-09)


### Miscellaneous Chores

* **cli:** Synchronize classroom50 versions

## [1.27.1](https://github.com/foundation50/classroom50/compare/cli-v1.27.0...cli-v1.27.1) (2026-08-09)


### Bug Fixes

* **web:** use branches probe, not repo size, to detect empty templates ([#545](https://github.com/foundation50/classroom50/issues/545)) ([4ed82f5](https://github.com/foundation50/classroom50/commit/4ed82f54d606736433bca081fbc18c7a53b0c425))

## [1.27.0](https://github.com/foundation50/classroom50/compare/cli-v1.26.1...cli-v1.27.0) (2026-08-07)


### Features

* **cli:** reuse/refresh gh auth instead of clobbering it on login ([#537](https://github.com/foundation50/classroom50/issues/537)) ([6fe861a](https://github.com/foundation50/classroom50/commit/6fe861a7b43bd413853d4287361518f1e8769917))


### Bug Fixes

* **cli:** record a submission when no autograder is configured ([#535](https://github.com/foundation50/classroom50/issues/535)) ([f3dd96c](https://github.com/foundation50/classroom50/commit/f3dd96c8c949cb7d763743ad942ffa22718e68fc))
* exempt forks from the empty-template size-0 guard ([#536](https://github.com/foundation50/classroom50/issues/536)) ([6be63f1](https://github.com/foundation50/classroom50/commit/6be63f1838124645da20f3a4ffa6e62a769b6080))

## [1.26.1](https://github.com/foundation50/classroom50/compare/cli-v1.26.0...cli-v1.26.1) (2026-08-07)


### Bug Fixes

* reject an empty (commitless) template before accept ([#528](https://github.com/foundation50/classroom50/issues/528)) ([5ca964f](https://github.com/foundation50/classroom50/commit/5ca964f4d50656d2bfa0c9f77ac995f2f79e9003))
* silence staff-team removal email by granting config-repo access after owner drop ([#529](https://github.com/foundation50/classroom50/issues/529)) ([34c4014](https://github.com/foundation50/classroom50/commit/34c401403eb3178040551763fd2fef575685233f))

## [1.26.0](https://github.com/foundation50/classroom50/compare/cli-v1.25.1...cli-v1.26.0) (2026-08-06)


### Miscellaneous Chores

* **cli:** Synchronize classroom50 versions

## [1.25.1](https://github.com/foundation50/classroom50/compare/cli-v1.25.0...cli-v1.25.1) (2026-08-04)


### Miscellaneous Chores

* **cli:** Synchronize classroom50 versions

## [1.25.0](https://github.com/foundation50/classroom50/compare/cli-v1.24.1...cli-v1.25.0) (2026-08-04)


### Miscellaneous Chores

* **cli:** Synchronize classroom50 versions

## [1.24.1](https://github.com/foundation50/classroom50/compare/cli-v1.24.0...cli-v1.24.1) (2026-08-02)


### Bug Fixes

* **web:** stop force-disabling repo features on template-less assignments ([#482](https://github.com/foundation50/classroom50/issues/482)) ([da7825d](https://github.com/foundation50/classroom50/commit/da7825dd3e46d4c82f5bce544704f06406352f3c))

## [1.24.0](https://github.com/foundation50/classroom50/compare/cli-v1.23.0...cli-v1.24.0) (2026-08-02)


### Features

* **web:** per-assignment repository features (issues/wiki/projects/pull requests) ([#479](https://github.com/foundation50/classroom50/issues/479)) ([bd9725d](https://github.com/foundation50/classroom50/commit/bd9725de6c3fbc249dcaa2a4dded10908a9e97e7))

## [1.23.0](https://github.com/foundation50/classroom50/compare/cli-v1.22.0...cli-v1.23.0) (2026-08-02)


### ⚠ BREAKING CHANGES

* remove students.csv legacy roster support ([#474](https://github.com/foundation50/classroom50/issues/474))
* a classroom still on a -instructor team or with a teams.instructor ref is no longer accepted rather than silently normalized; a role=instructor CSV row imports as an unknown role (degrades to student).

### Features

* **cli:** surface roster role column and note dual staff/student roles ([#475](https://github.com/foundation50/classroom50/issues/475)) ([634cbb4](https://github.com/foundation50/classroom50/commit/634cbb4df50aa39b47e4403ff1180a98a5e8b2cc))
* remove legacy "instructor" staff-role alias ([#473](https://github.com/foundation50/classroom50/issues/473)) ([85164b9](https://github.com/foundation50/classroom50/commit/85164b9a7bb3791c72f652c3bbf42196928d7255))
* remove students.csv legacy roster support ([#474](https://github.com/foundation50/classroom50/issues/474)) ([b00ce2c](https://github.com/foundation50/classroom50/commit/b00ce2ce0df7f9e72fdb964646082461d28b17bc))


### Miscellaneous Chores

* release 1.23.0 ([#476](https://github.com/foundation50/classroom50/issues/476)) ([4a50632](https://github.com/foundation50/classroom50/commit/4a50632a2832fdfa5a5e3bc385712620a0d9e797))

## [1.22.0](https://github.com/foundation50/classroom50/compare/cli-v1.21.0...cli-v1.22.0) (2026-08-01)


### Features

* **cli:** skip autograde grade job when no autograder is configured ([#458](https://github.com/foundation50/classroom50/issues/458)) ([aa16f0a](https://github.com/foundation50/classroom50/commit/aa16f0a2fc3452282246e8d790f0f02a01e4fd18))
* configurable student assignment-repo access with per-repo and bulk controls ([#466](https://github.com/foundation50/classroom50/issues/466)) ([efb69f8](https://github.com/foundation50/classroom50/commit/efb69f8294512eadb7956bfff69e8e912bbd7ae5))


### Bug Fixes

* name the fork's upstream org for cross-org fork templates ([#468](https://github.com/foundation50/classroom50/issues/468)) ([#470](https://github.com/foundation50/classroom50/issues/470)) ([53785b8](https://github.com/foundation50/classroom50/commit/53785b807133023c418580f5b02fcd95a90b3c1f))

## [1.21.0](https://github.com/foundation50/classroom50/compare/cli-v1.20.0...cli-v1.21.0) (2026-07-29)


### Bug Fixes

* **cli:** correct help text listing --template as required and other stale flag references ([#452](https://github.com/foundation50/classroom50/issues/452)) ([98e5551](https://github.com/foundation50/classroom50/commit/98e555164899649e1e8f1ed023c807af36684412))

## [1.20.0](https://github.com/foundation50/classroom50/compare/cli-v1.19.0...cli-v1.20.0) (2026-07-29)


### Features

* **web:** manage service tokens across organizations ([#443](https://github.com/foundation50/classroom50/issues/443)) ([549d34a](https://github.com/foundation50/classroom50/commit/549d34aab497dc1a3050111f4bfbd8cbf974479d))

## [1.19.0](https://github.com/foundation50/classroom50/compare/cli-v1.18.1...cli-v1.19.0) (2026-07-28)


### Features

* add lockable assignments that block student access and revoke private-template read ([#441](https://github.com/foundation50/classroom50/issues/441)) ([127982b](https://github.com/foundation50/classroom50/commit/127982b9a518ee6b8a3c91fc4a6e1143f0f793c6))
* add per-assignment release date (available_from) and hide unreleased assignments from students ([#439](https://github.com/foundation50/classroom50/issues/439)) ([6cc15f0](https://github.com/foundation50/classroom50/commit/6cc15f07852545e0f50988ffa7386339a87dc99e))
* restrict assignment accept to enrolled classroom members ([#442](https://github.com/foundation50/classroom50/issues/442)) ([0e06012](https://github.com/foundation50/classroom50/commit/0e0601219e6006083da6a6767f8e6a520b85845c))

## [1.18.1](https://github.com/foundation50/classroom50/compare/cli-v1.18.0...cli-v1.18.1) (2026-07-28)


### Bug Fixes

* **web:** remediate brace-expansion DoS and refresh dependencies ([#436](https://github.com/foundation50/classroom50/issues/436)) ([9e1d355](https://github.com/foundation50/classroom50/commit/9e1d355940fac44589d3bf8361f77c75b3f57d29))

## [1.18.0](https://github.com/foundation50/classroom50/compare/cli-v1.17.0...cli-v1.18.0) (2026-07-28)


### Features

* **cli:** open and repair Feedback PRs from the teacher CLI ([#435](https://github.com/foundation50/classroom50/issues/435)) ([70ff18a](https://github.com/foundation50/classroom50/commit/70ff18ae30c95f0823d85f54064dbcc4f9169600))
* **web:** teacher tools to open and repair Feedback PRs ([#434](https://github.com/foundation50/classroom50/issues/434)) ([91ce244](https://github.com/foundation50/classroom50/commit/91ce244303cf63e99aac4f183442124babd8c97e))

## [1.17.0](https://github.com/foundation50/classroom50/compare/cli-v1.16.1...cli-v1.17.0) (2026-07-28)


### Features

* open the Feedback PR at accept time via the GitHub API ([#409](https://github.com/foundation50/classroom50/issues/409)) ([5ce01b7](https://github.com/foundation50/classroom50/commit/5ce01b749db789192f613040715657ff09b38358))

## [1.16.1](https://github.com/foundation50/classroom50/compare/cli-v1.16.0...cli-v1.16.1) (2026-07-27)


### Bug Fixes

* close the roster.csv formula-guard, padded-id, and i18n gaps ([#417](https://github.com/foundation50/classroom50/issues/417)) ([3aa8e22](https://github.com/foundation50/classroom50/commit/3aa8e22996cdab1fd2e1dd4256f432af45ba897c))
* name the real cause when an org blocks student repo creation ([#418](https://github.com/foundation50/classroom50/issues/418)) ([789b65c](https://github.com/foundation50/classroom50/commit/789b65c4ebdb65539d6f69d7389aaf75bbe4db5c))
* reject a malformed github_id in both the web app and the CLI ([#411](https://github.com/foundation50/classroom50/issues/411)) ([f2576d8](https://github.com/foundation50/classroom50/commit/f2576d89b9c1da97f845238b6f929ab76b434f5e))

## [1.16.0](https://github.com/foundation50/classroom50/compare/cli-v1.15.0...cli-v1.16.0) (2026-07-25)


### Miscellaneous Chores

* **cli:** Synchronize classroom50 versions

## [1.15.0](https://github.com/foundation50/classroom50/compare/cli-v1.14.0...cli-v1.15.0) (2026-07-24)


### Features

* collect and show accepted staff submissions ([#393](https://github.com/foundation50/classroom50/issues/393)) ([675e117](https://github.com/foundation50/classroom50/commit/675e117a6ce0ee8692edc21e0963ff1a7d29a8d5))

## [1.14.0](https://github.com/foundation50/classroom50/compare/cli-v1.13.0...cli-v1.14.0) (2026-07-23)


### Features

* **gh-teacher:** add additional details to autograded logs.  ([#353](https://github.com/foundation50/classroom50/issues/353)) ([254381e](https://github.com/foundation50/classroom50/commit/254381e9fae3dcc8f63b4f0c43e6c4ad3b695aa1))


### Bug Fixes

* **cli:** skip managed toolchain setup on self-hosted autograde runners ([#370](https://github.com/foundation50/classroom50/issues/370)) ([d1cf8b0](https://github.com/foundation50/classroom50/commit/d1cf8b05e6b4cf95fdffb050fa0c78b413f808c8))

## [1.13.0](https://github.com/foundation50/classroom50/compare/cli-v1.12.0...cli-v1.13.0) (2026-07-22)


### Features

* add submission release assets ([#363](https://github.com/foundation50/classroom50/issues/363)) ([3a69695](https://github.com/foundation50/classroom50/commit/3a69695ab407cb204ff6e7170aa943b272ae7838))

## [1.12.0](https://github.com/foundation50/classroom50/compare/cli-v1.11.0...cli-v1.12.0) (2026-07-21)


### Features

* add Head TA (HTA) role ([#344](https://github.com/foundation50/classroom50/issues/344)) ([b6a7deb](https://github.com/foundation50/classroom50/commit/b6a7debaba1f829759f546690fc0600ff50e47f1))
* **ci:** add release-please automation for cli releases ([#341](https://github.com/foundation50/classroom50/issues/341)) ([b5a3b94](https://github.com/foundation50/classroom50/commit/b5a3b944da0e8746be50d95f21d77feeee11db1b)), closes [#143](https://github.com/foundation50/classroom50/issues/143)
* enforce a $0 Actions budget cap as org policy ([#356](https://github.com/foundation50/classroom50/issues/356)) ([3cb60e4](https://github.com/foundation50/classroom50/commit/3cb60e4653cf14b80cd3c46961b9f271a4562235))
* **web:** capability-gate RBAC so TAs/Head TAs can't invoke owner-only or write ops ([#346](https://github.com/foundation50/classroom50/issues/346)) ([4335378](https://github.com/foundation50/classroom50/commit/433537843d3f78f441b74e7eedbf9fdd8df6fcca))

## 1.11.0

Automated releases start here. CLI versions through `cli-v1.11.0` were cut by
hand (tags aligned to the matching web release commit) before this track
existed, so they are not itemized above; see the git history and the per-tag
Releases on the `gh-teacher` / `gh-student` repos for those. release-please
compiles every entry from this point forward.
