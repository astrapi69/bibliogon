# One-Click Installer: Discovery Session

## Context

D-05 has been rescoped (2026-05-04 audit). The original framing
was "Full Windows installer (downloads Docker Desktop + Bibliogon
repo + generates `.env`, no terminal required at any step)".
Audit of the existing launcher in `launcher/bibliogon_launcher/`
revealed it already handles three of those four steps on first
run: it downloads the Bibliogon release ZIP, extracts it to a
folder the user picks, generates `.env` with a random secret,
builds the Docker images, and opens the browser - via
`_install_or_welcome` and `_run_install_flow` in
`__main__.py`. The only remaining gap is Docker Desktop itself,
which the launcher currently detects and instructs the user to
install manually (it cannot install Docker silently because
Docker's licensing terms prohibit third-party silent install of
Docker Desktop).

This discovery session therefore narrows to two parallel
deliverables:

1. **Cross-platform doppelklickbare Scripts**: improve existing
   `install.sh`, add `install.command` (macOS) and `install.ps1`
   (Windows). Power-user audience. Independent of the launcher;
   useful for users who want to script lifecycle without the GUI.

2. **Docker Desktop auto-install** (the rescoped D-05): figure
   out whether silent or near-silent Docker Desktop install is
   feasible at all. If yes, integrate into the launcher's first-
   run flow. If no, document the EULA blocker and close D-05.

Linux is explicitly out of scope. Existing `install.sh` plus
`git clone` are sufficient for Linux users.

This session is **Discovery only**. No code is written. The output
is a written recommendation document with concrete tooling choices,
risk assessment, and effort estimates that will drive the next two
implementation sessions.

## Why discovery first

- `docs/explorations/desktop-packaging.md` exists from ~12 months
  ago. Triggers and ecosystem state may have shifted.
- Existing `install.sh` may already work on macOS or may have
  silent failures. We do not know without testing.
- Windows installer ecosystem (NSIS, Inno Setup, WiX, MSIX, Tauri,
  Electron-builder, others) needs current evaluation, not memory.
- Docker Desktop detection and auto-installation has platform-
  specific gotchas (admin rights, EULA acceptance, WSL2 on
  Windows). These need surfacing before commitment.

Skipping discovery and writing an implementation prompt would
likely waste 2-5 days on a sub-optimal stack. Discovery is hours.

## Pre-Inspection (mandatory)

Output as a single markdown report, then STOP and wait for
confirmation.

### Step 0.1: Read the existing exploration document

```bash
cat docs/explorations/desktop-packaging.md
```

Identify:
- Original triggers listed for reconsidering
- Original recommendation (probably "Docker plus Launcher")
- Which triggers have now fired (launch preparation = a real trigger)
- Which assumptions are testable now

### Step 0.2: Audit existing install.sh

```bash
cat install.sh

# What does it actually do, step by step?
# What assumptions does it make about the host?
# - Bash version?
# - curl present?
# - Docker present?
# - Internet access?
# - Write permission to ~/?

# Where could it silently fail on a fresh macOS?
# Where could it silently fail on Linux distros that are not
# Ubuntu/Debian?
```

### Step 0.3: Audit start.sh and stop.sh

```bash
cat start.sh stop.sh

# Are they self-contained or do they rely on install.sh setup?
# What state must exist for start.sh to work?
# - .env file?
# - Docker images built?
# - Network created?
```

### Step 0.4: Survey current Windows installer landscape (2026)

This is the most important section. Use web search for current
information; do NOT rely on memory.

For each candidate, gather:
- Active maintenance status (last release, GitHub activity)
- License compatibility with Bibliogon (MIT)
- Code-signing requirements and cost
- Build host requirements (Windows-only? Cross-platform?)
- Docker Desktop integration patterns
- Community examples of similar Docker-based apps

Candidates to evaluate (not exhaustive; add others if discovery
reveals them):
- **Inno Setup** (free, Windows-only build, mature)
- **NSIS** (free, scriptable, mature)
- **WiX Toolset** (Microsoft-backed, MSI output)
- **MSIX** (Microsoft modern format, Store-distributable)
- **Tauri bundler** (would require Tauri-wrapping Bibliogon, big
  scope expansion)
- **Electron-builder** (similar issue, big scope)
- **Squirrel.Windows** (used by Slack, Discord)
- **Velopack** (newer, simpler successor to Squirrel)

Eliminate Tauri and Electron-builder unless discovery reveals an
unforeseen advantage; they require restructuring Bibliogon as a
desktop app, which is an explicitly different scope decision.

### Step 0.5: Survey macOS one-click options

- `install.command` files (doppelklickbar Bash, no installer needed)
- `.pkg` installer (productbuild, native macOS, code-signing
  required for distribution)
- `.dmg` with drag-to-Applications (cosmetic, still needs the
  app to install Docker etc.)
- Homebrew tap (`brew install bibliogon`, requires Homebrew)

### Step 0.6: Docker Desktop auto-install: feasibility check

This is the make-or-break for one-click on Windows.

Research:
- Docker Desktop EULA: can a third-party installer accept on
  user's behalf? (Almost certainly NO)
- Silent install flags for Docker Desktop installer
- WSL2 prerequisite handling on Windows
- Detection methods: how to check if Docker Desktop is installed,
  running, configured for the user's WSL distro
- Same for macOS: silent install of Docker Desktop dmg, accept
  EULA, etc.

Likely finding: full silent install of Docker Desktop is NOT
allowed by Docker's EULA. The realistic best case is:
- Detect if Docker is installed
- If not, open the Docker download page and instruct the user
- After Docker is installed, the Bibliogon installer continues

Document this finding clearly. "One-click" may have to be
"two-click" (one for Docker, one for Bibliogon). This is a key
input to the user-facing flow design.

### Step 0.7: Code-signing landscape

For both Windows and macOS distributions:
- Cost of certificates (Windows EV/OV, Apple Developer Program)
- SmartScreen reputation building (Windows)
- Notarization process (macOS)
- Consequences of skipping signing (warning dialogs, blocked
  installs)
- Open-source projects that ship unsigned and how they manage UX

### Step 0.8: Fresh-machine test plan

Document what needs testing before either implementation session
starts:
- macOS fresh user account: does `install.sh` work? With and
  without Docker pre-installed?
- Windows fresh VM: how does the user currently install? What
  is the actual workflow today?

This is a plan, not the test itself. The test happens before
Phase 2 implementation, with the user.

### Step 0.9: Report

Produce `/tmp/installer-discovery-report.md` with this structure:

```markdown
# One-Click Installer Discovery Report

Date: <today>
Author: CC discovery session
Status: Ready for review

## Existing state

### install.sh
- What it does: <step-by-step>
- Risk areas: <enumerated>
- Tested platforms: <documented evidence or "untested">

### start.sh / stop.sh
- Dependencies on install.sh: <yes/no, what>

## Windows installer evaluation

Recommendation: <ONE tool>

| Tool | Maturity | License | Build host | Code-sign cost | Recommendation |
|------|----------|---------|------------|----------------|----------------|
| Inno Setup | ... | ... | Windows | $... | ... |
| NSIS | ... | ... | Cross | $... | ... |
| ... | | | | | |

Justification for pick: <2-3 paragraphs>

## macOS one-click evaluation

Recommendation: <ONE primary path, optional secondary>

For Phase 2 (scripts only): `install.command`
For Phase 4 (if pursued): <pkg or dmg recommendation>

Justification: <1-2 paragraphs>

## Docker Desktop integration

Finding: <one-click feasible or two-step required>
Reasoning: <EULA, technical, both>

Recommended user flow:
1. <step>
2. <step>
3. <step>

## Code-signing

Phase 2 (scripts): not applicable (scripts are not signed binaries)

Phase 3 (Windows .exe):
- Recommendation: <sign / skip-with-mitigation>
- Estimated cost: $<X>/year
- Mitigation if unsigned: <SmartScreen reputation, Pages-served
  hash documentation, etc.>

Phase 4 (macOS, if pursued):
- Apple Developer Program: $99/year
- Notarization: free but requires Apple ID
- Recommendation: <sign / skip / defer>

## Phase plan with effort estimates

### Phase 2: Cross-platform scripts
Scope:
- Polish install.sh (test on fresh macOS, fix silent failures)
- New install.command (macOS doppelklickbar wrapper)
- New install.ps1 (Windows PowerShell)
Effort: <X> CC sessions of <Y> hours each
Risk: low
Blockers: none identified

### Phase 3: Docker Desktop auto-install integration
Scope:
- Confirm whether Docker Desktop installer supports silent/
  unattended installs without violating EULA
- If yes: integrate into the launcher's `_install_or_welcome`
  flow as a fourth path (Install Docker for me / Open Docker
  download page / Continue without Docker / Close)
- If no: document the EULA blocker, close D-05 as "won't fix",
  fall back to "detect + instruct" which is what the launcher
  already does
Effort: discovery + 0-1 implementation sessions
Risk: <medium / high - depends on EULA interpretation>
Blockers: <Docker EULA review needed first; possibly legal
review if results are ambiguous>

(NOTE: the original Phase 3 scope listed "Repo download (git
clone or HTTPS zip) + .env generation + Start Bibliogon +
Uninstaller". All four are already in the launcher today; no
new installer work needed for them.)

### Phase 4: macOS installer (optional, defer decision)
Scope: TBD pending Phase 3 launch outcomes
Recommendation: defer until Phase 3 receives real user feedback

## Open questions for the user

1. Code-signing budget: ready to spend $X/year on Windows EV cert
   and $99/year on Apple Dev Program?
2. Repo hosting for installer: GitHub Releases page sufficient,
   or do we need a download.bibliogon.* domain?
3. Update mechanism: should the installer support self-update,
   or is "uninstall and reinstall" acceptable for v1?
4. Telemetry: should the installer phone home (success/failure
   rate)? Privacy implications.
5. Localization: installer UI in English only, or DE+EN to start?

## Trigger reconfirmation for desktop-packaging.md

The original triggers in docs/explorations/desktop-packaging.md
were: <list from the doc>.

Status of each:
- <trigger 1>: <fired / not fired / partially fired>
- ...

Conclusion: <re-prioritization is justified / not justified>.
If justified, update desktop-packaging.md as part of the next
session to reflect new state.
```

STOP HERE. Wait for the user to read the report and approve the
recommendation before any implementation prompt is written.

## Constraints

- **No code changes.** This is research only.
- **No edits to install.sh, start.sh, stop.sh, README, docs.**
  Findings inform the next session; they do not produce changes
  here.
- **Web search is allowed and encouraged.** Use it for current
  Windows installer state. Do not trust memory for tool maturity
  or 2026-current best practices.
- **Cite sources.** Each tool recommendation must reference the
  source URL where the maturity / license / build-host info came
  from. The user must be able to verify.

## Stop conditions

- If existing `install.sh` is fundamentally broken (not just
  improvable): STOP, surface, recommend fix-first session before
  any installer work.
- If `desktop-packaging.md` triggers have NOT meaningfully fired:
  STOP, ask the user to confirm re-prioritization with explicit
  reasoning.
- If Docker Desktop EULA / silent-install research yields a
  blocker that makes one-click impossible: STOP, surface, propose
  fallback flow for user approval before continuing the
  evaluation.

## Closing checklist

- [ ] desktop-packaging.md read and triggers re-evaluated
- [ ] install.sh / start.sh / stop.sh audited
- [ ] Windows installer landscape surveyed with current data
- [ ] macOS one-click options surveyed
- [ ] Docker Desktop integration feasibility documented
- [ ] Code-signing landscape with costs documented
- [ ] Fresh-machine test plan written (not executed)
- [ ] Discovery report written to
      /tmp/installer-discovery-report.md
- [ ] Self-clarification rule applied: any parked questions
      surfaced in the report
- [ ] Recommendations are specific (one tool, not "consider
      these three")
- [ ] User confirms recommendation before next session

## Self-clarification rule

This session continues to follow the self-clarification rule:
parked questions go in the report under "Open questions for the
user", evidence-based answers note their source, blocking
questions trigger STOP.
