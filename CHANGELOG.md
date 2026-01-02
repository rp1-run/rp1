# Changelog

## [0.2.10](https://github.com/rp1-run/rp1/compare/v0.2.9...v0.2.10) (2026-01-02)


### Features

* Add /blueprint-archive for PRD lifecycle management ([#178](https://github.com/rp1-run/rp1/issues/178)) ([5cc082e](https://github.com/rp1-run/rp1/commit/5cc082e0e9cf5018c65eb49628550bf2fda71208))
* Add task DAG with parallelization hints to feature design ([#176](https://github.com/rp1-run/rp1/issues/176)) ([140fdb0](https://github.com/rp1-run/rp1/commit/140fdb0aceea493bcda396e5a39760ffad9fde82))
* add worktree skill ([#158](https://github.com/rp1-run/rp1/issues/158)) ([95b00c5](https://github.com/rp1-run/rp1/commit/95b00c57cb40bebd78fae93548540ad1e2cafbcc))
* build command ([#171](https://github.com/rp1-run/rp1/issues/171)) ([b3265ac](https://github.com/rp1-run/rp1/commit/b3265acfd186436577d7ce267b791ccf43a0b475))
* **dev:** add /build-fast command for quick-iteration development ([#181](https://github.com/rp1-run/rp1/issues/181)) ([1248e99](https://github.com/rp1-run/rp1/commit/1248e9975b2bb4a8f45c05fe04fa22f029567c40))
* **dev:** add comment check to /feature-verify ([#150](https://github.com/rp1-run/rp1/issues/150)) ([07c39a8](https://github.com/rp1-run/rp1/commit/07c39a85db679c578cc1937632efccc58a3dc889))
* **dev:** add GitHub code links to PR review reports ([#168](https://github.com/rp1-run/rp1/issues/168)) ([f380fbd](https://github.com/rp1-run/rp1/commit/f380fbdd7c9a688f706f68b76bd929128163beee))
* **dev:** add post-build follow-up orchestration for feature-build ([#159](https://github.com/rp1-run/rp1/issues/159)) ([34f85ae](https://github.com/rp1-run/rp1/commit/34f85aeb23bbd1cdb99a6ab224085f0185bd9603))
* ensure git worktrees are safely created inside a repo (check git ignore) ([#185](https://github.com/rp1-run/rp1/issues/185)) ([c7846a8](https://github.com/rp1-run/rp1/commit/c7846a8800b5a7d48dac5487b9bde6e17efaee85))
* ensure requirements from build flow through ([#180](https://github.com/rp1-run/rp1/issues/180)) ([2ed0d5c](https://github.com/rp1-run/rp1/commit/2ed0d5c2a185e38cf6f8709347a4860c356f2062))
* ensure worktree deps are installed ([#156](https://github.com/rp1-run/rp1/issues/156)) ([616a9c0](https://github.com/rp1-run/rp1/commit/616a9c0c15e77de0afc9ea8d14170bed7e9c542a))
* feature flow now uses worktrees by default ([#170](https://github.com/rp1-run/rp1/issues/170)) ([90773cd](https://github.com/rp1-run/rp1/commit/90773cd93a0cb2e492ec5903e3981478c4edcd50))
* flat build command with subagent orchestration ([#172](https://github.com/rp1-run/rp1/issues/172)) ([96d8cb3](https://github.com/rp1-run/rp1/commit/96d8cb32dd5432fe854078024acb7fa174534e17))
* git worktree support for parallel work ([#147](https://github.com/rp1-run/rp1/issues/147)) ([78650c3](https://github.com/rp1-run/rp1/commit/78650c3b9b254692d04bc698ca8a086d53659484))
* **promts:** build is now a wrapper command ([#179](https://github.com/rp1-run/rp1/issues/179)) ([34ce424](https://github.com/rp1-run/rp1/commit/34ce424ac3922d67db08abfcdd9963219eb71e6e))
* webui overhaul ([#183](https://github.com/rp1-run/rp1/issues/183)) ([58731fe](https://github.com/rp1-run/rp1/commit/58731fec6e790ff4556b52a1124d5cfed37a46fe))


### Bug Fixes

* bring back feature-archive ([#175](https://github.com/rp1-run/rp1/issues/175)) ([837b139](https://github.com/rp1-run/rp1/commit/837b1393ba16f6e7808dafd1570d89933ddd0aa5))
* ensure git worktrees are created non-recursively ([#151](https://github.com/rp1-run/rp1/issues/151)) ([5b1f0b7](https://github.com/rp1-run/rp1/commit/5b1f0b7e960a7462c5bf5e8564ccf2360251d244))
* ensure mv to main work dir before cleaning up worktrees ([#152](https://github.com/rp1-run/rp1/issues/152)) ([a938ff8](https://github.com/rp1-run/rp1/commit/a938ff8c874f30e45c7b9125d9ec700cb8c2c1a1))
* ensure worktrees are safer ([0739d69](https://github.com/rp1-run/rp1/commit/0739d69f09e6116ae31bacc769690353b682510e))
* handle dirty git state gracefully in /pr-review ([#146](https://github.com/rp1-run/rp1/issues/146)) ([7108843](https://github.com/rp1-run/rp1/commit/710884385af2412d2444e0d8077fb73cd7887267))
* isolate git tests to ensure they don't mess with main repo ([#160](https://github.com/rp1-run/rp1/issues/160)) ([29301ef](https://github.com/rp1-run/rp1/commit/29301efa484be258868a00e5f3c10af3d881cffb))
* opencode skills (no longer requires plugin) ([#184](https://github.com/rp1-run/rp1/issues/184)) ([2802fe6](https://github.com/rp1-run/rp1/commit/2802fe696dd2133eccd3beba40775b6e7bfe1fee))
* reduce diagram over-generation in /feature-design ([#143](https://github.com/rp1-run/rp1/issues/143)) ([bf1a2e9](https://github.com/rp1-run/rp1/commit/bf1a2e96836a6058f502ad24ec3384a13e508fec))
* remove incorrect --slug option from worktree skill ([#162](https://github.com/rp1-run/rp1/issues/162)) ([f2491e9](https://github.com/rp1-run/rp1/commit/f2491e99eff328738aed0868665c2bd24c3a0bcf))
* **security:** prevent path traversal in webui static file server ([#141](https://github.com/rp1-run/rp1/issues/141)) ([c81cd7c](https://github.com/rp1-run/rp1/commit/c81cd7c8c8f8ccaf3e5593ee48e91a35bc6d7e73))
* **test:** handle worktree environment in captureMainRepoState ([#165](https://github.com/rp1-run/rp1/issues/165)) ([a016aa3](https://github.com/rp1-run/rp1/commit/a016aa33528f1b419b1cbb744ecb1063d2a75cc8))


### Performance Improvements

* run code-check and feature-check in parallel in /feature-verify ([#144](https://github.com/rp1-run/rp1/issues/144)) ([4b0f04f](https://github.com/rp1-run/rp1/commit/4b0f04f9e62169e40fb87449d7ae7ba06b076718))


### Code Refactoring

* clean up defensive worktree code by disabling hooks ([#163](https://github.com/rp1-run/rp1/issues/163)) ([8a56b65](https://github.com/rp1-run/rp1/commit/8a56b6579345d359f429ba1895bc3a31bfb81443))
* **dev:** consolidate PR feedback commands into /address-pr-feedback ([#173](https://github.com/rp1-run/rp1/issues/173)) ([dd2e91c](https://github.com/rp1-run/rp1/commit/dd2e91cfd85201986614ee1ab3177ae8c3495240))
* leaner build command ([#174](https://github.com/rp1-run/rp1/issues/174)) ([daaee87](https://github.com/rp1-run/rp1/commit/daaee878410a7676348fe8e1abe36290d30f143f))
* mv comment fetcher to agent-tools ([#182](https://github.com/rp1-run/rp1/issues/182)) ([7e3c204](https://github.com/rp1-run/rp1/commit/7e3c2048082d0d986f46dd6f5242e70d8df10d9d))
* terse build ([#177](https://github.com/rp1-run/rp1/issues/177)) ([9170730](https://github.com/rp1-run/rp1/commit/917073022ad3e47d2b2a1449079139386733303c))


### Documentation

* fix navigation, improve homepage messaging, update deprecated commands ([#186](https://github.com/rp1-run/rp1/issues/186)) ([20489ae](https://github.com/rp1-run/rp1/commit/20489ae3cd6492a79b8331ea1b0db16115991dee))

## [0.2.9](https://github.com/rp1-run/rp1/compare/v0.2.8...v0.2.9) (2025-12-28)


### Features

* update docs to match features and some prompt improvements ([#139](https://github.com/rp1-run/rp1/issues/139)) ([cd707fc](https://github.com/rp1-run/rp1/commit/cd707fc7bd19422699bb1d25021c5d36ac1a2cbe))

## [0.2.8](https://github.com/rp1-run/rp1/compare/v0.2.7...v0.2.8) (2025-12-27)


### Features

* better greenfield experience ([#137](https://github.com/rp1-run/rp1/issues/137)) ([d2d0fe4](https://github.com/rp1-run/rp1/commit/d2d0fe4d818d5c257959fe50eab5ffa80c5e5a93))

## [0.2.7](https://github.com/rp1-run/rp1/compare/v0.2.6...v0.2.7) (2025-12-26)


### Features

* better init wizard ([#116](https://github.com/rp1-run/rp1/issues/116)) ([e0d86b2](https://github.com/rp1-run/rp1/commit/e0d86b2dad00ca95d7bf1671b348a1094d12a3c4))

## [0.2.6](https://github.com/rp1-run/rp1/compare/v0.2.5...v0.2.6) (2025-12-25)


### Features

* blazing fast validation of mmd using new built-in agent-tools ([#114](https://github.com/rp1-run/rp1/issues/114)) ([b560bc9](https://github.com/rp1-run/rp1/commit/b560bc97151db0ed5f27fc1b02c3a2b750b8fe84))

## [0.2.5](https://github.com/rp1-run/rp1/compare/v0.2.4...v0.2.5) (2025-12-23)


### Documentation

* update README ([#111](https://github.com/rp1-run/rp1/issues/111)) ([2202bef](https://github.com/rp1-run/rp1/commit/2202bef432c000915bf9563d4f3d8daab3a5ce46))

## [0.2.4](https://github.com/rp1-run/rp1/compare/v0.2.3...v0.2.4) (2025-12-23)


### Features

* prompt refinements ([#109](https://github.com/rp1-run/rp1/issues/109)) ([b91ae94](https://github.com/rp1-run/rp1/commit/b91ae94ce991cac5f435b12b80ec140633a26b97))

## [Unreleased]

### Features

* **cli:** add automatic version update notifications at session start
* **cli:** add `rp1 check-update` command to check for available updates
* **cli:** add `rp1 self-update` command to update via Homebrew, Scoop, or manual instructions
* **plugins:** add `/self-update` slash command to rp1-base plugin
* **plugins:** add Claude Code session hook for automatic update notifications
* **plugins:** add OpenCode plugin for automatic update notifications

### Notes

- Version check results are cached for 24 hours (use `--force` to bypass)
- Configuration stored in `~/.config/rp1/` directory
- Restart Claude Code or OpenCode after updating to use new version

## [0.2.3](https://github.com/rp1-run/rp1/compare/v0.2.2...v0.2.3) (2025-12-08)


### Bug Fixes

* **cli:** ci build for webui ([#107](https://github.com/rp1-run/rp1/issues/107)) ([5b1c725](https://github.com/rp1-run/rp1/commit/5b1c7255f0b25b84f31bf697c6b9c7d78aa3a02b))

## [0.2.2](https://github.com/rp1-run/rp1/compare/v0.2.1...v0.2.2) (2025-12-08)


### Bug Fixes

* **cli:** install issues and bundle generations  ([#105](https://github.com/rp1-run/rp1/issues/105)) ([339f52f](https://github.com/rp1-run/rp1/commit/339f52f6678c5a6139c8fadf8478483fd926546e))

## [0.2.1](https://github.com/rp1-run/rp1/compare/v0.2.0...v0.2.1) (2025-12-08)


### Documentation

* update for open source release ([89dcdb9](https://github.com/rp1-run/rp1/commit/89dcdb907966cc7dcbe466473b83623bedaf6386))

## [0.2.0](https://github.com/rp1-run/rp1/compare/v0.1.0...v0.2.0) (2025-12-08)


### ⚠ BREAKING CHANGES

* npm package is no longer published. Install via Homebrew, Scoop, or direct binary download instead.
* **cli:** CLI now distributed as native binaries via Homebrew, Scoop, and install script instead of npm.
* **cli:** cli refactoring and introduce web-ui ([#67](https://github.com/rp1-run/rp1/issues/67))

### Features

* add release-please with auto-merge and version markers ([cd402f1](https://github.com/rp1-run/rp1/commit/cd402f11eb2e5634deb84976732ef1d94b2e4354))
* **cli:** cli refactoring and introduce web-ui ([#67](https://github.com/rp1-run/rp1/issues/67)) ([869747a](https://github.com/rp1-run/rp1/commit/869747aca7bdc0c6a9498227ce79820b41bcfedb))
* **cli:** single binary distribution via package managers ([c73e606](https://github.com/rp1-run/rp1/commit/c73e6060a46e4d1b03158f249706075bd6571aac))
* **cli:** use bun when available ([#84](https://github.com/rp1-run/rp1/issues/84)) ([3a43940](https://github.com/rp1-run/rp1/commit/3a43940ed23a89a1920ad4a77da36baf278d5dbb))
* **docs:** add analytics and Lighthouse CI ([#22](https://github.com/rp1-run/rp1/issues/22)) ([1c03156](https://github.com/rp1-run/rp1/commit/1c03156cd375e734585872aa488dd98b3bc1af6e))
* **docs:** add documentation site with MkDocs Material ([#10](https://github.com/rp1-run/rp1/issues/10)) ([f9d309d](https://github.com/rp1-run/rp1/commit/f9d309d30dad80ac034d1dbb7d0fd917476b4e00))
* **prompts:** code-quick-build should write artifacts ([#82](https://github.com/rp1-run/rp1/issues/82)) ([955a5f4](https://github.com/rp1-run/rp1/commit/955a5f4012879ee7fb42c1149c47e267c4e09acf))
* **prompts:** enhance kb load ([#78](https://github.com/rp1-run/rp1/issues/78)) ([fada076](https://github.com/rp1-run/rp1/commit/fada0765b5a855fab569e6902b8f4176700ad10d))
* set up the correct plugin marketplace metadata ([#24](https://github.com/rp1-run/rp1/issues/24)) ([3545df0](https://github.com/rp1-run/rp1/commit/3545df0b164b2ed6826d3b788b4fa898443597c8))
* **tests:** add tests for cli ([#87](https://github.com/rp1-run/rp1/issues/87)) ([d95687a](https://github.com/rp1-run/rp1/commit/d95687a067ba14e656610e1d100a35615fd92567))


### Bug Fixes

* badge again ([5ac23e1](https://github.com/rp1-run/rp1/commit/5ac23e1c6d18506895126903c8335ce3ec035172))
* badge displays ([401a9e2](https://github.com/rp1-run/rp1/commit/401a9e2d28931dbc3ccfe5e6a3de78f32690ac73))
* **ci:** add id-token permission for npm OIDC publish [skip ci] ([5bcf65a](https://github.com/rp1-run/rp1/commit/5bcf65a8fa2bf99d2edca167d9456974360c58e4))
* **ci:** ensure release please uses the correct gh token ([#26](https://github.com/rp1-run/rp1/issues/26)) ([6cac4e0](https://github.com/rp1-run/rp1/commit/6cac4e0dbb77c7e4bbc40564e2cb44fa853c4756))
* **ci:** fix release workflow build commands ([a8df061](https://github.com/rp1-run/rp1/commit/a8df06144a423bdfd248f32d095d1da58bcd55fc))
* **ci:** install npm@latest for OIDC trusted publishing [skip ci] ([eb9628d](https://github.com/rp1-run/rp1/commit/eb9628de2919271e6c7fefaf93ff4d03a211705b))
* **ci:** simplify releases ([#75](https://github.com/rp1-run/rp1/issues/75)) ([bb358c8](https://github.com/rp1-run/rp1/commit/bb358c83f26f61066b977e458848f7561450e793))
* **ci:** use format_overrides for Windows zip archive ([8f3a463](https://github.com/rp1-run/rp1/commit/8f3a46377aacbe525f15b02150c856a40188a29a))
* **ci:** use Node 22 for npm OIDC trusted publishing [skip ci] ([03e0b28](https://github.com/rp1-run/rp1/commit/03e0b28f69701fa2a8b26b45a30d421a6dd11ab0))
* **ci:** use zip archive for Windows to support Scoop ([29670bd](https://github.com/rp1-run/rp1/commit/29670bd23731e258f506169e62050f4e96f534e0))
* **ci:** wrap goreleaser hook in bash for shell command execution ([f7cea2c](https://github.com/rp1-run/rp1/commit/f7cea2cf0c373eaea50b6b1e4bdd084d28fcea98))
* **cli:** bun is now required ([3cc42d6](https://github.com/rp1-run/rp1/commit/3cc42d6034fb3b1ff013f6f69a8ecb6b9cc0a8f4))
* **cli:** bundle OpenCode artifacts with npm package ([#80](https://github.com/rp1-run/rp1/issues/80)) ([8a90205](https://github.com/rp1-run/rp1/commit/8a90205c79d24ccd5e5d2f8f8aaea5f69d2fbf1d))
* **docs:** style issues ([#31](https://github.com/rp1-run/rp1/issues/31)) ([a627756](https://github.com/rp1-run/rp1/commit/a627756b52b575f885cbe878c353d427bf017a20))
* **homebrew:** switch from cask to formula to fix macOS Gatekeeper error ([894441b](https://github.com/rp1-run/rp1/commit/894441b53a0742078659f40b7e69cbe6870909f5))
* **homebrew:** use cask post-install hook to remove quarantine attribute ([be35462](https://github.com/rp1-run/rp1/commit/be35462719bc8c34c4fb6a459568cd19b8046075))
* **homebrew:** use staged_path directly for xattr (not hardcoded binary name) ([999b2f7](https://github.com/rp1-run/rp1/commit/999b2f7ea185271c6cf62b4474d8ba9f07676b68))


### Documentation

* add artifacts screenshot ([#33](https://github.com/rp1-run/rp1/issues/33)) ([e0dcd96](https://github.com/rp1-run/rp1/commit/e0dcd96b73c5f63d056bd45dc2d91957ed4ad46e))
* add more guides ([#12](https://github.com/rp1-run/rp1/issues/12)) ([a7beb22](https://github.com/rp1-run/rp1/commit/a7beb22a3045153e1520e9501761d1b5b367e461))
* better landing page ([#20](https://github.com/rp1-run/rp1/issues/20)) ([d88d288](https://github.com/rp1-run/rp1/commit/d88d2882fa3136c0f413811ceb334fa63bdd40e9))
* better looking landing page ([#14](https://github.com/rp1-run/rp1/issues/14)) ([d2ee3b7](https://github.com/rp1-run/rp1/commit/d2ee3b748a94b516fff847c97d4fbd77d0fd8e41))
* fix carousel on lp ([#28](https://github.com/rp1-run/rp1/issues/28)) ([265232b](https://github.com/rp1-run/rp1/commit/265232b669c8b52124dca8d47351874b267f81a1))
* **install:** use simple curl + sh to install rp1 for opencode ([139e0ab](https://github.com/rp1-run/rp1/commit/139e0abc3044990a431e17f3f8c55c0ec4e95942))
* more polish ([#18](https://github.com/rp1-run/rp1/issues/18)) ([8d95280](https://github.com/rp1-run/rp1/commit/8d95280538a314abc6c8993d4e8dc3d4f843cacb))
* small tweaks ([#16](https://github.com/rp1-run/rp1/issues/16)) ([2078428](https://github.com/rp1-run/rp1/commit/20784281b73267647446c8cbf826dfc975fb419b))
* some more copy changes ([#35](https://github.com/rp1-run/rp1/issues/35)) ([badfc88](https://github.com/rp1-run/rp1/commit/badfc8876a9e71aa69e66ac8791f0755063da417))
* update uv instructions ([b9c486c](https://github.com/rp1-run/rp1/commit/b9c486c0d20a30a0f99e5cce7f4843b9b2c6f0bf))
* use bunx commands ([be37565](https://github.com/rp1-run/rp1/commit/be37565b1922e422bc6786494650b9197bfd04f7))


### Miscellaneous Chores

* reset to v6.0.0 and remove npm publishing ([0df239f](https://github.com/rp1-run/rp1/commit/0df239ffd6654876835f5073bb84fafb10b1d9cc))

## [0.1.0](https://github.com/rp1-run/rp1/releases/tag/v0.1.0) (2025-12-08)

### Notes

This release marks a version reset for the rp1 open-source launch. Previous development history (v4.x-v6.x) has been archived. Version numbering now follows semantic versioning from 0.1.0, building towards a stable 1.0.0 release.

### Features

- 21 slash commands across rp1-base and rp1-dev plugins
- 18 specialized AI agents for development workflows
- Multi-platform distribution (Claude Code, OpenCode)
- Homebrew and Scoop package manager support
- Automated knowledge base generation
