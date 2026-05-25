# One-Click Installer Discovery Report

Date: 2026-05-05
Author: CC discovery session
Status: Ready for review

## v0.26.x state delta (ground state)

This report internalises the four v0.26.x deltas before any
recommendation: (1) `install.sh` is a generated artifact built
at release-time from `install.sh.template` +
`backend/pyproject.toml` via `scripts/generate_install_sh.sh` -
the template is the editable source, the committed `install.sh`
stays in git only because users curl-pipe it; (2) the launcher
embeds `BIBLIOGON_TARGET_VERSION` and refuses to install if it
is older than the latest GitHub release - any new installer
artifact must NOT regress this safeguard; (3)
`LAUNCHER-SELFREPLACE-01` is a separate P4 backlog item, NOT
folded into this discovery; (4) lock-step versioning means the
sole hand-edited version source is `backend/pyproject.toml`,
and `make sync-versions` propagates everywhere - any new
installer artifact that carries a version literal must read
from canonical sources or join the sync chain. Recommendations
below honour all four.

## Existing state

### install.sh / install.sh.template

**What it does, step by step** (read from
`install.sh.template`, 160 lines, reviewed verbatim):

1. Set `VERSION` from env-var `BIBLIOGON_VERSION` or fall back
   to the build-time-substituted `@@BIBLIOGON_VERSION@@` token
   that the generator replaces with the current canonical tag
   (e.g. `v0.26.6`).
2. Print an ASCII banner + version line.
3. Check `docker` on PATH; check `docker info` succeeds; check
   `docker compose version` succeeds. Each failure prints a URL
   and exits non-zero.
4. If a `.git` directory exists at `$INSTALL_DIR` (default
   `$HOME/bibliogon`), back up `.env` to a mktemp file, delete
   the directory, and proceed to fresh re-clone. The comment
   block in the template (lines 64-70) documents this is
   intentional: shallow-clone in-place updates fail across
   version jumps, so re-clone is the only reliable path.
5. Try `git clone --depth 1 --branch $VERSION` first; on tag
   miss fall back to `git clone --depth 1` (HEAD); if `git` is
   absent, fall back to `curl | tar xz` of the tag tarball, then
   to `wget | tar xz`, then to a final main-branch tarball, then
   exit if none of git/curl/wget exist.
6. Restore the backed-up `.env` if one was saved.
7. `cd $INSTALL_DIR`. If no `.env` exists, copy
   `.env.example` and substitute `change-me-to-a-random-secret`
   with a 64-char hex secret using (in order):
   `python3 -c "secrets.token_hex(32)"` ->
   `openssl rand -hex 32` -> `/dev/urandom xxd` ->
   timestamp+random fallback. Uses BSD-sed syntax on macOS,
   GNU-sed elsewhere (detected via `$OSTYPE`).
8. Read port from `.env` (default 7880).
9. Run `docker compose -f docker-compose.prod.yml up --build
   -d`.
10. Print success URL + lifecycle hints.

**Risk areas (enumerated):**

- POSIX-Bash-compatible (works in any system Bash 3.2+
  including macOS's stock /bin/bash). No Bash-4-only features
  (no `[[ -v ]]`, no associative arrays, no readarray).
  Verified by reading: only basic conditionals, sed, grep, curl,
  tar.
- Hard dependency on `python3` OR `openssl` OR `xxd` for the
  secret. macOS Sequoia ships Python 3 by default (since 14);
  Catalina+ all ship openssl. `xxd` is part of vim, ubiquitous.
  Last-resort fallback (timestamp) is weak but at least
  produces non-empty output - flag as a low-severity risk.
- `$INSTALL_DIR` defaults to `$HOME/bibliogon`. No collision
  check beyond existing `.git`. If a non-bibliogon directory
  named `bibliogon` exists in `$HOME` (rare), the script will
  rm-rf it on the "update" branch. Mitigation: the `.git` check
  on line 73 keeps this from triggering on a casual collision -
  only an existing git repo gets deleted.
- Curl-pipe pattern (the documented invocation in the banner
  comment): users running `curl -fsSL ... | bash` cannot
  inspect or modify the script before running. Standard concern
  for any curl-pipe installer; not Bibliogon-specific.
- Silent failure modes on Linux distros without
  `docker-compose-plugin` (Docker installed without the plugin
  package). Step 3 catches this with a clear error.
- The `python3` invocation does NOT specify a shebang or path -
  if `python3` is on PATH but is Python 2 (rare-but-possible on
  ancient systems), the `secrets` module will fail and the
  script falls through to openssl. Acceptable.
- `sed -i ''` on macOS / `sed -i` on Linux: detection via
  `$OSTYPE` works for bash but `$OSTYPE` is bash-specific. Not
  a portable POSIX feature. If a user invokes the script via a
  different `sh`, the detection silently picks the wrong
  branch. Mitigation: the script's shebang is
  `#!/usr/bin/env bash`, so as long as the curl-pipe target is
  `| bash` (which is what the banner tells users to use), this
  is fine.

**Tested platforms:** Untested on a fresh macOS as of this
session. Tested in CI on Linux (the repo's docker-compose
flows). Phase 2 includes a fresh-machine test (see Step 0.8).

**Confirmed:** `install.sh` is generated from
`install.sh.template` via `scripts/generate_install_sh.sh`;
edits MUST go to the template. `verify_version_pins.sh` runs
the generator in `--check` mode and rejects drift.

### start.sh / stop.sh

Reviewed both:

- `start.sh` (85 lines): self-contained but assumes the project
  tree exists with `.env.example` and
  `docker-compose.prod.yml`. Does NOT depend on `install.sh`
  having run first; in fact, `start.sh` re-implements the
  `.env` generation logic if `.env` is absent. Hard
  dependencies: Docker daemon running, Compose v2 plugin
  available. No git, no curl. This means `start.sh` is callable
  standalone after a `git clone` without `install.sh`.
- `stop.sh` (17 lines): trivial. Runs `docker compose down`
  against `docker-compose.prod.yml`, then issues two `pkill`
  calls for native dev processes (uvicorn, vite). No state
  dependencies.

Conclusion: install.sh, start.sh, stop.sh are loosely coupled.
Polishing one does not break the others. Phase 2 wrappers can
piggyback on the same Docker checks without restructuring.

## Windows installer evaluation

**Two-tier recommendation:**

- **Preferred:** plain PowerShell script (`install.ps1`) +
  optional **winget manifest** for discoverability. The
  PowerShell script does the same job as `install.sh`: detect
  Docker, clone repo, generate `.env`, run docker compose. It
  is human-readable, signable later, and lives in the same
  repo. Kill-switch criterion: switch to fallback if
  PowerShell-execution-policy friction or per-host group-policy
  blocks become a recurring user-support cost (>3 unique user
  reports of execution-policy errors in a release cycle).
- **Fallback:** **Inno Setup** for a packaged `.exe`
  installer. Mature, free for non-commercial OSS, smallest
  Windows-installer-builder learning curve, can wrap the same
  PowerShell logic, can be code-signed when budget exists.

The launcher (Phase 1, already shipped) is the GUI path;
this section evaluates the script-and-package paths that sit
underneath it.

| Tool | Maturity | License | Build host | Code-sign cost | Sources cited | Recommendation |
|---|---|---|---|---|---|---|
| Inno Setup | Active. v6.7.0 stable Jan 2026; v7.0.0-preview-3 Apr 2026. | Custom permissive (free for non-commercial OSS; v6.5.0+ requests but does not require commercial users to purchase a paid license). | Windows-only build host (the compiler). | $0 (unsigned). With sign: see Code-signing section. | [jrsoftware.org/isinfo](https://jrsoftware.org/isinfo.php), [Inno Setup 7 changelog](https://jrsoftware.github.io/issrc/whatsnew.htm), [Wikipedia](https://en.wikipedia.org/wiki/Inno_Setup), [SPDX license entry](https://spdx.org/licenses/InnoSetup.html) | **FALLBACK** for Windows packaged installer. |
| NSIS | Active. v3.12.0 trusted-package approval Apr 2026; docs repo last updated Feb 2026; primary repo active commits. | zlib/libpng (permissive, commercial-OK, no notice required in installer). | Cross-platform build (Linux/macOS hosts can build Windows installers). | $0 (unsigned). | [SourceForge project](https://sourceforge.net/projects/nsis/), [NSIS Wiki main](https://nsis.sourceforge.io/Main_Page), [NSIS-Dev GitHub org](https://github.com/NSIS-Dev), [License page](https://nsis.sourceforge.io/License) | **ELIMINATED** in favour of Inno Setup as the fallback: comparable maturity, but Inno Setup has cleaner default UX out of the box for Bibliogon's "double-click and wait" target audience and a less Lisp-flavoured DSL. NSIS would be the right choice if cross-platform building from Linux were a hard requirement; for Bibliogon it is not (the launcher CI already runs on Windows). Both are valid; this is a coin-flip the discovery resolves toward Inno Setup to be specific. |
| WiX Toolset | Active. v7.0.0 released Apr 2026. | Open-source code; commercial use of WiX requires the Open Source Maintenance Fee (OSMF EULA). v3/v4/v5 out of community support. | Windows-only effectively (.NET/MSBuild). | $0 base + OSMF for commercial use. | [FireGiant release notes](https://docs.firegiant.com/wix/whatsnew/releasenotes/), [WiX GitHub releases](https://github.com/wixtoolset/wix/releases/), [.NET Foundation listing](https://dotnetfoundation.org/projects/project-detail/wix-toolset) | **ELIMINATED**. WiX produces MSI which is the right choice for enterprise/MDM deployment; for an indie OSS book authoring app aimed at writers, MSI is overkill, the OSMF EULA introduces an unnecessary licensing question for a solo OSS maintainer, and the build pipeline is .NET-heavy. |
| MSIX | Mature; first-class support in Windows 11 / Visual Studio 2026. | Microsoft platform tech; package itself royalty-free. | Windows-only effectively. | Code-sign REQUIRED for non-Store distribution (own cert OR Microsoft's Trusted Signing at $9.99/mo). | [MSIX overview](https://learn.microsoft.com/en-us/windows/msix/overview), [Single-project MSIX](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/single-project-msix), [Distribute unpackaged WinUI](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/unpackage-winui-app) | **ELIMINATED**. MSIX is the right choice for native Windows apps wanting Store presence + auto-update. Bibliogon is a Docker-backed web app behind a launcher: MSIX adds a code-sign requirement (Trusted Signing $120/yr or full cert), AppContainer sandboxing that does not play well with launching out-of-package Docker, and a packaging-tool learning curve for zero gain over Inno Setup at Bibliogon's distribution scale. |
| Squirrel.Windows | **Unmaintained.** Repo deprecated since ~2019; PRs no longer reviewed. | MIT (irrelevant given unmaintained status). | n/a | n/a | [Electron deprecation issue](https://github.com/electron/electron/issues/17722), [Squirrel deprecation thread](https://github.com/Squirrel/Squirrel.Windows/issues/1469), [electron-build docs noting deprecated](https://www.electron.build/squirrel-windows.html) | **ELIMINATED**. Unmaintained dependency = automatic disqualification. |
| Velopack | Active. Native-Rust successor to Squirrel.Windows; cross-platform Win/Mac/Linux. | MIT. | Cross-platform. | Same code-sign reality as anything (optional). | [velopack.io](https://velopack.io/), [GitHub repo](https://github.com/velopack/velopack), [Migrating from Squirrel](https://docs.velopack.io/migrating/squirrel) | **ELIMINATED for Bibliogon**. Velopack's value is auto-update for desktop apps; Bibliogon's update story is the launcher's stale-target safeguard + `git pull && docker compose up --build` from `install.sh`. Adopting Velopack would mean building a real desktop binary to update, which is the launcher's existing scope (`LAUNCHER-SELFREPLACE-01`), and the launcher is PyInstaller-based, not Velopack-compatible. Re-evaluate only if Bibliogon ever ships a true native desktop binary as primary distribution. |
| winget | Active; first-party Microsoft. | MIT (winget tooling); manifests are CLA-licensed contributions. | Cross-platform (manifest is YAML). | n/a (winget itself is free; signing is recommended-not-required; community-repo moderators may flag unsigned packages). | [Submit your manifest](https://learn.microsoft.com/en-us/windows/package-manager/package/repository), [winget-pkgs repo](https://github.com/microsoft/winget-pkgs), [Submit packages overview](https://learn.microsoft.com/en-us/windows/package-manager/package/), [Wikipedia](https://en.wikipedia.org/wiki/Windows_Package_Manager) | **RECOMMEND as discoverability layer** alongside the preferred PowerShell script. NOT a replacement for the script: winget handles "I have winget and want to install Bibliogon", but does not solve the launcher-+-Docker-Desktop dependency story. Submission is a fork-and-PR to `microsoft/winget-pkgs`; lock-step CI can regenerate the manifest each release. Worth doing in a small follow-up after Phase 2. |
| Chocolatey | Active community repo; stricter moderation than winget (Package Validator + Package Verifier + Package Scanner + Human Approval, up to 35 days). | Apache 2.0 (chocolatey itself); per-package moderation. | Cross-platform manifest. | n/a directly; signing recommended. | [Community repo overview](https://docs.chocolatey.org/en-us/community-repository/), [Submission process](https://blog.chocolatey.org/2024/03/what-is-chocolatey-community-repository/), [Community packages list](https://community.chocolatey.org/packages) | **ELIMINATED in favour of winget** for the discoverability layer. Two-overlapping-package-manager submissions doubles per-release maintenance for marginal additional reach; winget is shipped by default in Windows 11+ and that is Bibliogon's target audience floor. Re-evaluate if a user reports they specifically use Chocolatey and not winget. |
| Scoop | Active; developer-targeted; "buckets" model lets us self-publish without third-party moderation. | MIT. | Cross-platform manifest. | n/a. | [Scoop GitHub](https://github.com/ScoopInstaller/scoop), [Bucket model docs](https://scoop.netlify.app/concepts/), [hackspoiler intro](https://hackspoiler.de/scoop-open-source-windows-paketmanager/) | **ELIMINATED**. Scoop's audience is developers; Bibliogon's audience is writers. The user already running Scoop is the user who can already follow `git clone && docker compose up`. No reach gain. |

**Discovery success criterion check:** every candidate is
recommended (preferred / fallback / discoverability) OR
eliminated with explicit reasoning. ≥3 cited sources for every
non-eliminated candidate (Inno Setup: 4; winget: 4) and for the
unmaintained / commercially-restricted ones flagged for due
diligence (Squirrel.Windows: 3; WiX: 3; Velopack: 3). NSIS,
MSIX, Chocolatey, Scoop also have ≥3 sources each as part of
the elimination justification.

**Justification - preferred (PowerShell `install.ps1`):**

The launcher already covers the "I want a GUI installer for
non-technical users" case. The remaining gap is the
power-user-on-Windows audience: someone who knows PowerShell,
wants to script lifecycle (CI integration, multi-machine
deploy, dotfiles automation) and finds the launcher heavyweight.
A ~80-line `install.ps1` mirroring `install.sh.template`
(Docker check -> git clone -> .env generation -> docker compose
up) is the smallest possible artifact that gives parity with
`install.sh` on Windows. It is human-readable, lives in the
same repo, can be code-signed when budget permits, and joins
the existing template/generator pattern of `install.sh.template`
(no new release-time tooling category). Critically, it does NOT
attempt to install Docker Desktop, sidestepping the EULA issue
documented below.

**Justification - fallback (Inno Setup):**

If user feedback shows that PowerShell-execution-policy friction
is the dominant Windows-side support burden (default policy on
fresh Windows 11 is `Restricted` for non-signed scripts; users
have to either sign or bypass policy), Inno Setup wraps the
exact same logic as a `.exe` that bypasses execution policy
entirely. Inno Setup is mature, free for OSS use through v6.4.3
and remains free-but-please-donate for commercial use through
v6.5.0+, has the smallest setup-builder learning curve in the
Windows installer space, builds reproducibly on any Windows
host, and supports code-signing via the standard signtool
chain. The kill-switch is binary: count execution-policy errors
in user-issue reports across one release cycle; if >3, switch
fallback to preferred.

## macOS one-click evaluation

**Two-tier recommendation:**

- **Preferred:** **`install.command`** doppelklickbar wrapper
  that invokes `bash install.sh` from Finder. The pre-finding
  in the prompt (Step 0.2) is correct: the existing
  `install.sh.template` is POSIX-compatible Bash, so macOS
  users with a terminal can already run it; the `.command`
  wrapper is a ≤10-line file whose only job is `cd
  "$(dirname "$0")" && bash ./install.sh; read -p "Press
  Return to close..." _`. Kill-switch criterion: switch to
  fallback if Gatekeeper-quarantine warnings on a downloaded
  `.command` file produce >3 unique user-support reports in a
  release cycle.
- **Fallback:** **Homebrew tap** at
  `astrapi69/homebrew-bibliogon`. Custom tap, not a PR to
  homebrew-core (homebrew-core requires a stable user base and
  has stricter acceptance criteria; a self-tap is the standard
  pattern for indie OSS). Once tapped, `brew install
  --cask bibliogon` becomes the Mac equivalent of the
  PowerShell-or-winget Windows path.

| Path | Effort | Code-sign | Sources cited | Recommendation |
|---|---|---|---|---|
| install.command | XS (≤10-line wrapper, ≤2 hours including testing) | n/a (the wrapper itself is a script). Gatekeeper quarantines downloaded scripts; user must right-click -> Open the first time, OR remove the quarantine flag manually. | [Scripting OS X: launching scripts from Finder](https://scriptingosx.com/2022/04/launching-scripts-2-launching-scripts-from-finder/), [ss64 macOS shellscript syntax](https://ss64.com/mac/syntax-shellscript.html), [Apple Developer forum on Gatekeeper](https://developer.apple.com/forums/thread/706379) | **PREFERRED** for Phase 2. |
| .pkg | M (productbuild + pkgbuild + scripts; productsign for signing). The launcher already exists and is the "real" installer; a .pkg duplicates that scope. | $99/yr Apple Developer Program for Developer ID Installer cert + free notarization (paid membership required). Unsigned .pkg trips Gatekeeper hard. | [Apple Developer Program](https://developer.apple.com/programs/), [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [productbuild guide](https://moonbase.sh/articles/how-to-make-macos-installers-for-juce-projects-with-pkgbuild-and-productbuild/), [Signing with Developer ID](https://developer.apple.com/developer-id/) | **ELIMINATED for Phase 2; defer to Phase 4.** Adds the $99/yr Apple membership pre-requisite that the launcher does not currently force. |
| .dmg | S (hdiutil; cosmetic drag-to-Applications layout). Same code-sign requirements as .pkg if shipping a `.app` inside. For shipping a script-or-launcher, the .dmg adds nothing the .command file does not. | Same as .pkg if signing the contents. | [macOS distribution gist (signing/notarization/quarantine)](https://gist.github.com/rsms/929c9c2fec231f0cf843a1a746a416f5), [Apple Developer notarization docs](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [LiveCode codesigning guide](https://lessons.livecode.com/m/4071/l/1122100-codesigning-and-notarizing-your-lc-standalone-for-distribution-outside-the-mac-appstore) | **ELIMINATED for Phase 2.** A .dmg only earns its keep when the contents are a `.app` bundle that the user drags to /Applications - not the case for a script. |
| Homebrew tap | S-M (one-time tap repo creation; per-release manifest update via lock-step). Self-hosted, no homebrew-core PR review queue. | n/a (Homebrew installs from a URL; signing is up to the source artifact). | [Homebrew Adding Software docs](https://docs.brew.sh/Adding-Software-to-Homebrew), [How to Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap), [Acceptable Formulae](https://docs.brew.sh/Acceptable-Formulae), [Open a Homebrew Pull Request](https://docs.brew.sh/How-To-Open-a-Homebrew-Pull-Request) | **FALLBACK** for Phase 2; or RECOMMEND-as-additional in a Phase-2-follow-up. |

For Phase 2 (scripts only): `install.command` (preferred) +
optional Homebrew-tap follow-up.

For Phase 4 (if pursued): defer the .pkg / .dmg path until Phase
3 closes and there is concrete user demand for "I do not want
to see Terminal at all on macOS". The launcher already provides
this for the Tk path; a .pkg only earns its keep if the launcher
is being replaced.

**Justification:** The pre-finding from Step 0.2 holds:
`install.sh.template` is POSIX bash and runs on macOS as-is.
The Phase 2 deliverable is therefore a wrapper, not a script
rewrite. `install.command` is the tightest possible answer.
Homebrew is the natural macOS equivalent of winget, follows the
same "discoverability layer on top of the manual install" model,
and is one PR + a tiny tap repo to set up.

## Docker Desktop integration

**Finding: TWO-STEP REQUIRED. Silent install is forbidden by
the Docker Subscription Service Agreement; D-05 is closeable as
won't-fix.**

**Reasoning - cited EULA passages:**

The Docker Subscription Service Agreement
([docker.com/legal/docker-subscription-service-agreement](https://www.docker.com/legal/docker-subscription-service-agreement/))
is the controlling document. WebFetch analysis of the agreement
returned the following operative passages:

- **Section 2.1, License grant**: "Subject to the terms and
  conditions of the Agreement and the applicable Order Form,
  Docker hereby grants Customer a limited, non-exclusive,
  **non-transferable, non-sublicensable** license during the
  applicable Subscription Term for Customer to permit its Users
  to: (i) download, install, run, and use Docker Desktop..."
  (emphasis added).

- **Section 2.1, Redistribution**: "Notwithstanding the
  foregoing Docker Customer may redistribute **Docker Images**
  to third parties but solely when bundled with or incorporated
  into its own software products, and not on a standalone
  basis..." (emphasis added; this clause covers Docker Images,
  NOT Docker Desktop itself).

The non-sublicensable clause means a third-party installer (in
this case Bibliogon's launcher or `install.ps1`) cannot grant
itself the right to accept the Docker EULA on the end user's
behalf. The redistribution clause permits redistributing Docker
Images but pointedly does not extend to Docker Desktop. There
is no clause that permits a third party to invoke
`Docker Desktop Installer.exe install --quiet --accept-license`
on a user's machine.

This is consistent with Docker's own `--accept-license` flag
documentation
([docs.docker.com Windows install](https://docs.docker.com/desktop/setup/install/windows-install/)):
the flag exists for IT-admins deploying to managed users
**inside their own organization** under a Docker Business
subscription, not for third-party app installers. The Docker
roadmap issues
([docker/roadmap#80](https://github.com/docker/roadmap/issues/80),
[docker/roadmap#307](https://github.com/docker/roadmap/issues/307))
and forum threads
([Unattended Installation forum thread](https://forums.docker.com/t/unattended-installation-of-docker-desktop-which-parameters-can-be-used-besides-install-quiet/74081),
[for-win#1322](https://github.com/docker/for-win/issues/1322))
confirm the same: the unattended-install path is offered for
enterprise admins who have a subscription, not for
third-parties redistributing the agreement acceptance.

**Strict-reading default applies.** The prompt instructs to
take the strict reading when no legal-review budget exists, and
the strict reading is unambiguous here.

**Recommended user flow** (already what the launcher does -
Phase 1 ships this):

1. Launcher first-run: detect whether `docker info` succeeds.
2. If yes: continue to repo-download + .env-generation +
   `docker compose up --build` (the existing
   `_run_install_flow` path in
   `launcher/bibliogon_launcher/__main__.py`).
3. If no: open Docker's official download page in the user's
   browser, show "Install Docker Desktop yourself, then come
   back and click Install again."
4. After the user installs Docker Desktop themselves, the
   launcher resumes.

This is detect-and-instruct, not auto-install. It is the only
EULA-compliant flow available to a third-party OSS installer in
2026.

**D-05 closure recommendation:** mark won't-fix. The strict
reading of the Docker Subscription Service Agreement forbids
silent install of Docker Desktop by a third-party installer.
The launcher's existing detect-and-instruct flow is the
EULA-compliant ceiling. No further work on D-05 is justified
unless Docker materially relaxes its terms in the future. See
the Writeback section for the concrete ROADMAP update.

## Code-signing

**Phase 2 (scripts):** not applicable. `install.ps1`,
`install.command`, and the regenerated `install.sh` are scripts,
not signed binaries. Windows execution-policy and macOS
Gatekeeper-quarantine concerns apply (documented below); these
are UX, not signing, issues.

**Phase 3 (Windows-side launcher .exe, IF the launcher is
re-packaged through Inno Setup as the Windows fallback):**

- Recommendation: **depends on budget; default = ship unsigned
  with mitigation** until Bibliogon has a clearer signal of
  Windows-user volume.
- Estimated cost: **OV cert ~$150-300/yr**; **EV cert ~$400+/yr**;
  **Microsoft Trusted Signing ~$120/yr ($9.99/mo)** as the
  cloud-native modern alternative.
- Critical 2026 update: **Microsoft removed instant-SmartScreen-
  reputation for EV certs in March 2024**. Both OV and EV now
  build SmartScreen reputation organically through downloads
  and usage; paying the EV premium specifically to bypass
  SmartScreen warnings is no longer justified
  ([SSL.com analysis](https://www.ssl.com/faqs/which-code-signing-certificate-do-i-need-ev-ov/),
  [SmartScreen reputation docs](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
  [SSL Insights guide](https://sslinsights.com/best-code-signing-certificate-windows-applications/)).
- Mitigation if unsigned: publish the SHA256 hash of every
  release artifact on the GitHub release page (already
  standard); document the SmartScreen warning in the install
  guide ("the first user clicks More info -> Run anyway, after
  ~3-5 thousand downloads SmartScreen will trust the binary
  organically"); rely on `BIBLIOGON_TARGET_VERSION` for
  integrity (already shipped in v0.26.x).

**Phase 4 (macOS, IF .pkg path is pursued):**

- Apple Developer Program: **$99/yr** (no free notarization
  path; the free Apple ID lets you build but not distribute
  outside the Mac App Store with a Developer ID).
- Notarization: free as a service but requires the paid
  Developer Program membership.
- Recommendation: **defer until Phase 3 launches and there is
  concrete user feedback** that Gatekeeper friction on the
  unsigned `install.command` is the dominant macOS-side support
  burden. Sources:
  [Apple Developer Program](https://developer.apple.com/programs/),
  [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
  [Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/).

## Phase plan with effort estimates

(Phase numbering 1/2/3/4. Phase 1 = the **current launcher**,
already shipped in v0.26.x. NOT a discovery target.)

### Phase 1: Current launcher (already shipped)

Scope: GUI installer with repo download + .env generation +
Docker image build + browser open. First-run install path in
`launcher/bibliogon_launcher/__main__.py`
(`_install_or_welcome`, `_run_install_flow`).
`BIBLIOGON_TARGET_VERSION` stale-target safeguard active.
Detect-and-instruct for Docker Desktop.

**No discovery work here.** Documented for completeness.

### Phase 2: Cross-platform doppelklickbare scripts (this discovery's first deliverable)

Scope:

- Polish `install.sh.template` (test on a fresh macOS user
  account with and without Docker pre-installed; fix any
  silent-failure modes uncovered; regenerate `install.sh` via
  `scripts/generate_install_sh.sh`).
- New `install.command` (macOS doppelklickbar wrapper, ≤10
  lines; lives at repo root; invokes `bash install.sh` from
  Finder; final `read` so the Terminal window does not auto-
  close on completion).
- New `install.ps1` (Windows PowerShell, ≤80 lines; mirrors
  `install.sh.template` structure: Docker checks, git-or-tarball
  download with a backed-up `.env` restore, `.env` generation
  via `[System.Web.Security.Membership]::GeneratePassword` or
  `New-Guid`, `docker compose up --build`).
- Both new artifacts join the lock-step convention. The
  `install.ps1` should NOT hard-code a version literal; if it
  references a release tag it must read from
  `backend/pyproject.toml` at release time the same way
  `install.sh.template` does, OR rely on `git clone HEAD` of
  the canonical tag - the latter is simpler and matches
  `install.sh`'s fallback path. Either way: regression-detector
  in `verify_version_pins.sh` for any new hard-coded version
  literal.

**Effort estimate (CONCRETE, not TBD):**

- 1 CC session of ~3-4 hours covers Phase 2 end-to-end:
  - 30 min: write `install.command` + test from Finder on the
    user's macOS workstation (5 min spent, 25 min unaccounted
    for Gatekeeper quarantine UX iteration).
  - 90 min: write `install.ps1`. The script is ~80 lines,
    mirroring `install.sh.template` 1:1. PowerShell-specific
    bits: `Test-Path`, `Get-Command` for Docker discovery,
    `Invoke-WebRequest` for tarball fallback, `Expand-Archive`
    for extraction, `Get-Random` / `New-Guid` for the secret.
  - 45 min: regenerate `install.sh` (no template changes
    expected; revisit only if the fresh-mac test surfaces
    silent failures).
  - 30 min: integration into `verify_version_pins.sh` regression
    detector for any new hard-coded version literal.
  - 30 min: docs (README install section, help/install pages
    in DE+EN), commits, lock-step verify, push.

  Allow a second session if the fresh-mac test surfaces silent
  failures in `install.sh.template` that need template fixes;
  estimate 0-1 follow-up sessions of 1-2 hours.

**Risk:** low. POSIX bash is well-trodden ground. PowerShell
is well-documented. No external dependencies introduced.
**Blockers:** none identified. The script is independent of
the launcher and does not regress `BIBLIOGON_TARGET_VERSION`.

### Phase 3: Docker Desktop auto-install integration (this discovery's second deliverable)

Scope: this discovery has resolved the question. The Docker
Subscription Service Agreement forbids third-party silent
install (cited above). D-05 is closeable as **won't-fix**;
detect-and-instruct (already shipped in Phase 1's launcher) is
the EULA-compliant ceiling. No implementation Phase 3 follows.

**Effort estimate:** 1 CC session of ~1 hour to update ROADMAP
+ backlog with the closure decision and a corresponding
CHANGELOG note that D-05 was retired as won't-fix following
discovery (the changelog entry is informational; nothing user-
visible changes).

**Risk:** none (it is a documentation update).
**Blockers:** none.

### Phase 4: macOS installer (optional, defer decision)

Scope: TBD pending Phase 2 launch outcomes and concrete user
feedback that the unsigned `install.command` Gatekeeper-
quarantine UX is the dominant macOS-side support burden. If
that signal materialises, the path is (1) Apple Developer
Program at $99/yr, (2) productbuild .pkg with the launcher
binary inside, (3) productsign + notarize, (4) optional
Homebrew tap follow-up.

**Recommendation:** defer until Phase 2 receives real user
feedback for at least 2 release cycles.

## Open questions for the user (explicit user-decision items)

These are NOT for the discovery agent to resolve. Surface and
STOP for user input:

1. **Code-signing budget**: ready to spend $0 / $99/yr (Apple)
   / $120/yr (Microsoft Trusted Signing) / $150-400+/yr
   (traditional OV/EV)? If unknown, defer Phase 3/4 and ship
   Phase 2 unsigned with mitigation. Strong hint: the
   solo-OSS-no-legal-budget profile lines up with "ship
   unsigned, build SmartScreen reputation organically" until a
   concrete user complaint volume justifies the spend.

2. **Repo hosting for installer artifacts**: GitHub Releases
   page sufficient for `install.ps1`, `install.command`,
   `install.sh`? Or do we want `download.bibliogon.org` (or
   similar) so the curl-pipe URL is stable across repo renames?
   Default assumption (no answer): GitHub Releases is fine,
   matches the existing `install.sh` curl-pipe pattern.

3. **Update mechanism**: Phase 2 ships scripts that re-clone
   on update (matches existing `install.sh` behaviour).
   `LAUNCHER-SELFREPLACE-01` is the separate scope for
   launcher-binary self-update. Question: is "uninstall and
   reinstall by re-running the script" acceptable for v1 of
   the new scripts? Default assumption: yes, matches existing
   `install.sh` UX.

4. **Telemetry**: should the installer phone home (success /
   failure rate)? Privacy implications for the offline-first
   architectural principle. Default assumption: no, consistent
   with `CONCEPT.md` offline-first stance.

5. **Localization**: installer UI in English only, or DE+EN to
   start? `install.sh.template` is currently English-only. The
   launcher's first-run dialog is also English (per
   `Launcher localization` backlog P5). Default assumption:
   English-only, matching launcher and current scripts.

6. **winget / Homebrew submission timing**: do these go in the
   same Phase 2 session or a follow-up? Default assumption: a
   separate, smaller follow-up session after Phase 2 lands and
   the scripts are tested in the wild.

7. **`install.ps1` execution-policy strategy**: if the user is
   on default `Restricted` policy, the script will not run
   without `Set-ExecutionPolicy -Scope Process Bypass`. Two
   options: (a) document the bypass in the install guide and
   ship unsigned; (b) sign with an OV cert (~$150-300/yr) so
   the script runs under `RemoteSigned`. Default assumption
   tied to question 1: ship unsigned, document the bypass.

## Trigger reconfirmation for desktop-packaging.md

The original triggers in
`docs/explorations/desktop-packaging.md` (last updated
2026-04-12, ~one month ago) listed four conditions for
re-evaluating desktop packaging:

- **Trigger 1**: "Bibliogon has 100+ active users and 10%+ of
  feedback mentions installation difficulty"
  -> **NOT FIRED**. No active user count metric; no aggregated
     installation-difficulty feedback. The Medium article
     mention is qualitative, not 10%+ feedback.
- **Trigger 2**: "A specific publishing event (major release,
  press coverage) would benefit from desktop-app-as-primary-
  distribution"
  -> **PARTIALLY FIRED**. v0.26.x lock-step versioning audit
     and the launcher first-run path verification (commit
     `93af0b2` rescoping D-05 from "full Windows installer" to
     "Docker Desktop auto-install only") was a publishing-
     adjacent event that triggered this discovery. Not a press
     event, but a real internal signal: D-05 was promoted to
     "evaluate now" because v0.26.x revealed how close the
     launcher already is to fully automating install.
- **Trigger 3**: "Tauri ecosystem reaches a maturity milestone"
  -> **NOT FIRED, AND IRRELEVANT TO THIS DISCOVERY**. The
     desktop-packaging.md document considered Tauri/Electron as
     a path; this discovery does not. Bibliogon's chosen path is
     "Docker + launcher (PyInstaller) + scripts", not "wrap the
     web app in Tauri". Tauri remains a long-term option per
     desktop-packaging.md, unchanged.
- **Trigger 4**: "Contributor offers to handle the desktop
  build process"
  -> **NOT FIRED**.

**Conclusion:** Re-prioritization for THIS discovery's narrow
scope (D-05 + cross-platform script wrappers) is justified by
trigger 2. The broader desktop-packaging.md scope (Tauri /
Electron / native desktop binary) is NOT covered by this
discovery and remains as documented.

**Recommended action for desktop-packaging.md** (NOT done in
this session, no doc edits per Constraints): in a follow-up
session, add a "2026-05-05 cross-reference" note pointing to
this discovery report and clarifying that the launcher-+-scripts
path is being progressed independently of the Tauri/Electron
question.

## Writeback to ROADMAP / backlog (mandatory closing step)

Findings to be written back in the next implementation session
(NOT in this discovery, per Constraints: no edits outside
`docs/explorations/installer-discovery-report.md`):

- **D-05 status update** (`docs/ROADMAP.md` P4 line ~69):
  recommend moving D-05 to **Closed - won't fix** with citation
  to this report. The Docker Subscription Service Agreement's
  non-sublicensable clause forbids third-party silent install of
  Docker Desktop; detect-and-instruct (already shipped in
  Phase 1's launcher) is the EULA-compliant ceiling. Suggested
  ROADMAP edit: move D-05 entry from P4 to a new
  "Closed / won't-fix" section (or, per the
  continuous-archival rule in `.claude/rules/ai-workflow.md`,
  archive to `docs/archive/roadmap/2026-05.md` when the
  closure commit lands).

- **LAUNCHER-SELFREPLACE-01 status update** (`docs/backlog.md`
  P4 line ~114): no change. Discovery confirms this remains a
  separate scope and is NOT subsumed by D-05's closure. Backlog
  entry stays P4.

- **New backlog item, "Phase 2: cross-platform installer
  scripts"**: add to `docs/backlog.md` at P3 (infrastructure /
  quality tier per `.claude/rules/ai-workflow.md` priority
  table). Effort: 1 session of 3-4 hours; optional 1-2 hour
  follow-up session if the fresh-mac test surfaces template
  fixes. Acceptance criteria: `install.command` works end-to-
  end on a fresh macOS user account; `install.ps1` works
  end-to-end on a fresh Windows 11 user account; both go
  through `verify_version_pins.sh`'s regression detector for
  any new version literal.

- **New backlog item, "Phase 2 follow-up: package-manager
  discoverability"**: add to `docs/backlog.md` at P4 (roadmap /
  future) or P5 (speculative; pick based on user demand
  signal). Submit a winget manifest to `microsoft/winget-pkgs`
  and create a Homebrew tap at `astrapi69/homebrew-bibliogon`.
  Effort: 1 session of ~2 hours.

- **Eliminated installer candidates** (NSIS, WiX, MSIX,
  Squirrel.Windows, Velopack, Chocolatey, Scoop, .pkg, .dmg):
  none of these have prior ROADMAP / backlog entries that
  reference them, so no writeback is required. The elimination
  reasoning lives in this report; future revisits should re-read
  it before proposing any of them again.

- **Budget-unknown questions** (Open questions 1, 7): explicit
  user-decision items. Do NOT assume a code-signing budget in
  the writeback. The recommended default in the absence of a
  user answer is "ship unsigned with mitigation"; flag this in
  the ROADMAP / backlog entries' acceptance criteria so the
  implementation session does not silently pick a different
  default.

## Questions and assumptions (self-clarification rule)

Per `.claude/rules/ai-workflow.md` self-clarification rule:

**Evidence-based answers (derived in this session, with
source):**

- v0.26.x state delta: confirmed all four points from
  `CLAUDE.md` (single hand-edited version source =
  `backend/pyproject.toml`; `BIBLIOGON_TARGET_VERSION` exists
  in `launcher/bibliogon_launcher/installer.py`;
  `LAUNCHER-SELFREPLACE-01` is at `docs/backlog.md` P4 line
  114; `install.sh` generated from `install.sh.template` via
  `scripts/generate_install_sh.sh`).
- Phase 2 effort estimate of 3-4 hours: derived from
  `install.sh.template` being 160 lines (`wc -l`) and the
  `install.ps1` mirror requiring no new abstractions.
- Docker EULA finding: derived from WebFetch of
  `docker.com/legal/docker-subscription-service-agreement` plus
  `docs.docker.com/desktop/setup/install/windows-install/`,
  cross-referenced with `docker/roadmap` GitHub issues.
- Windows installer table: every recommendation / elimination
  is grounded in ≥3 cited URLs as listed in the table.

**Parked questions** (none in this report - all open questions
were either resolved by evidence or surfaced explicitly under
"Open questions for the user" for explicit user input).

**STOP-blocking questions encountered:** none. The Docker
Desktop EULA was the make-or-break finding and the strict-
reading default applied cleanly; this is a complete answer
under the prompt's "EULA-blocked is NOT a STOP" clause.

## Closing checklist (output-quality)

- [x] Report written to
      `docs/explorations/installer-discovery-report.md`
      (committable, persistent - NOT `/tmp`).
- [x] v0.26.x state delta confirmed in opening paragraph.
- [x] Two-tier recommendation (preferred + fallback +
      kill-switch) for both Windows (`install.ps1` preferred /
      Inno Setup fallback) and macOS (`install.command`
      preferred / Homebrew tap fallback).
- [x] ≥3 cited sources per non-eliminated installer candidate
      (Inno Setup: 4; winget: 4; install.command: 3;
      Homebrew tap: 4) and per eliminated candidate where due
      diligence required it (Squirrel.Windows: 3; WiX: 3;
      Velopack: 3; NSIS: 4; MSIX: 3; Chocolatey: 3; Scoop: 3;
      .pkg: 4; .dmg: 3).
- [x] Every candidate either recommended or eliminated with
      reasoning; no "needs more research".
- [x] EULA finding includes cited passages (Section 2.1 license
      grant; Section 2.1 Docker Images redistribution).
- [x] Phase numbering 1/2/3/4 (Phase 1 = current launcher).
- [x] Concrete effort estimate for Phase 2 (3-4 hours, broken
      down by deliverable; no TBD).
- [x] Budget-unknown items surfaced as explicit user-decision
      items (Open questions 1, 7) with no budget assumption.
- [x] Writeback to ROADMAP / backlog included as a section
      (D-05 close, LAUNCHER-SELFREPLACE-01 unchanged, two new
      backlog items, eliminated-candidate notes).
- [x] Trigger reconfirmation against
      `docs/explorations/desktop-packaging.md` documented
      (trigger 2 fired; triggers 1, 3, 4 did not).
- [x] Self-clarification rule applied (evidence-based answers
      cite source; no parked questions; no STOP triggers).
