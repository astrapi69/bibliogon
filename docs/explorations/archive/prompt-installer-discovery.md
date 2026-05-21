# One-Click Installer: Discovery Session

## Context

D-05 has been rescoped (2026-05-04 audit; see `docs/ROADMAP.md`
P4). The original framing was "Full Windows installer (downloads
Docker Desktop + Bibliogon repo + generates `.env`, no terminal
required at any step)". Audit of the existing launcher in
`launcher/bibliogon_launcher/` revealed it already handles three
of those four steps on first run: it downloads the Bibliogon
release ZIP, extracts it to a folder the user picks, generates
`.env` with a random secret, builds the Docker images, and opens
the browser - via the first-run install path in
`launcher/bibliogon_launcher/__main__.py` (current symbols
`_install_or_welcome` and `_run_install_flow`; if these have been
renamed since this prompt was written, anchor on the file +
"first-run install path" instead of symbol name). The only
remaining gap is Docker Desktop itself, which the launcher
currently detects and instructs the user to install manually
(it cannot install Docker silently because Docker's licensing
terms appear to prohibit third-party silent install of Docker
Desktop; this is one of the things to confirm in this session).

This discovery session therefore narrows to two parallel
deliverables:

1. **Cross-platform doppelklickbare wrappers**: improve existing
   `install.sh` (which is already POSIX-compatible and
   consequently runs on macOS as-is from a terminal), add
   `install.command` (macOS doppelklickbar wrapper - typically a
   five-line wrapper that invokes `install.sh` from Finder, NOT
   a script rewrite) and `install.ps1` (Windows PowerShell
   equivalent). Power-user audience. Independent of the
   launcher; useful for users who want to script lifecycle
   without the GUI.

2. **Docker Desktop auto-install** (the rescoped D-05): figure
   out whether silent or near-silent Docker Desktop install is
   feasible at all. If yes, integrate into the launcher's first-
   run flow. If no, document the EULA blocker and close D-05.

Linux is explicitly out of scope. Existing `install.sh` plus
`git clone` are sufficient for Linux users.

This session is **Discovery only**. No code is written. The
output is a written recommendation document at
`docs/explorations/installer-discovery-report.md` (committable,
persistent - NOT `/tmp`) with concrete tooling choices, risk
assessment, and effort estimates that will drive the next two
implementation sessions.

## Why discovery first

- `docs/explorations/desktop-packaging.md` exists from ~12 months
  ago. Triggers and ecosystem state may have shifted.
- Existing `install.sh` may already work on macOS or may have
  silent failures. We do not know without testing.
- Windows installer ecosystem (NSIS, Inno Setup, WiX, MSIX,
  Tauri, Electron-builder, package managers, others) needs
  current evaluation, not memory.
- Docker Desktop detection and auto-installation has platform-
  specific gotchas (admin rights, EULA acceptance, WSL2 on
  Windows). These need surfacing before commitment.

Skipping discovery and writing an implementation prompt would
likely waste 2-5 days on a sub-optimal stack. Discovery is hours.

## Pre-Inspection (mandatory)

Output as a single markdown report at
`docs/explorations/installer-discovery-report.md`, then STOP and
wait for confirmation.

### Step 0.0: v0.26.x state delta (ground state for discovery)

Before evaluating anything, internalise these v0.26.x deltas;
recommendations that ignore them will be wrong:

- **`install.sh` is a generated artifact, NOT an edit-target.**
  Source of truth: `install.sh.template` + `backend/pyproject.toml`,
  rendered by `scripts/generate_install_sh.sh` at release time
  (release-workflow.md Step 4). Polishing `install.sh` means
  editing the template AND the generator script, not the
  committed output. The committed output stays in git only
  because users curl-pipe it directly from the raw GitHub URL.

- **`BIBLIOGON_TARGET_VERSION` stale-target safeguard exists in
  the launcher** (`launcher/bibliogon_launcher/installer.py`
  consumes it; injected at PyInstaller build time via
  `bibliogon-launcher.spec`). Any installer-discovery
  recommendation MUST NOT regress this safeguard - the launcher
  refuses to install if the embedded target version is older
  than the latest GitHub release.

- **`LAUNCHER-SELFREPLACE-01` is a separate P4 backlog item**,
  not subsumed by this discovery. The launcher self-replace
  problem (atomic binary swap on Windows, etc.) is its own
  scope. This discovery references it where relevant but does
  not solve it.

- **Lock-step versioning across all subsystems.** The single-
  edit canonical source is `backend/pyproject.toml`;
  `make sync-versions` propagates everywhere else. Any installer
  output that hard-codes a version literal violates the
  convention. CI gate (`release-gate.yml`) blocks artifact
  attachment on drift. Recommendations that produce installer
  artifacts must read from the existing canonical sources or
  participate in the sync-versions chain.

- **Filesystem isolation** (`~/.local/share/bibliogon/` etc. via
  platformdirs, Docker `/app/data` volume). Installer flows on
  fresh machines must NOT recreate the pre-v0.26.x project-tree
  data layout.

### Step 0.1: Read the existing exploration document

```bash
cat docs/explorations/desktop-packaging.md
```

Identify:
- Original triggers listed for reconsidering
- Original recommendation (probably "Docker plus Launcher")
- Which triggers have now fired (launch preparation = a real
  trigger)
- Which assumptions are testable now

### Step 0.2: Audit existing install.sh / install.sh.template

```bash
cat install.sh.template
cat scripts/generate_install_sh.sh
```

Pre-finding (carry into the report, do NOT re-discover): the
template is POSIX-compatible Bash. macOS users with a terminal
can already run it as-is; the doppelklickbar wrapper for Finder
is a trivial `.command` file that `cd`s to its directory and
invokes `bash install.sh`. Phase 2 effort estimate must reflect
this: it is mostly the `.command` wrapper plus an `install.ps1`
PowerShell equivalent for Windows, NOT a script rewrite. Concrete
size targets: ≤10 lines for `install.command`, ≤80 lines for
`install.ps1`.

What does it actually do, step by step? What assumptions does it
make about the host?
- Bash version?
- curl present?
- Docker present?
- Internet access?
- Write permission to `~/`?

Where could it silently fail on a fresh macOS? Where could it
silently fail on Linux distros that are not Ubuntu/Debian?
(Linux is out of scope as a deliverable, but silent failures on
Linux still matter because `install.sh` is the same artifact
across Linux + macOS.)

### Step 0.3: Audit start.sh and stop.sh

```bash
cat start.sh stop.sh
```

- Are they self-contained or do they rely on `install.sh` setup?
- What state must exist for `start.sh` to work?
  - `.env` file?
  - Docker images built?
  - Network created?

### Step 0.4: Survey current Windows installer landscape (2026)

This is the most important section. Use web search for current
information; do NOT rely on memory.

**Web access fallback rule: if web tools are unavailable, STOP
and surface immediately. Do NOT evaluate 2026-current tool
maturity from training memory; the entire purpose of this step
is to avoid that.**

For each candidate, gather:
- Active maintenance status (last release, GitHub activity)
- License compatibility with Bibliogon (MIT)
- Code-signing requirements and cost
- Build host requirements (Windows-only? Cross-platform?)
- Docker Desktop integration patterns
- Community examples of similar Docker-based apps

Candidates to evaluate (not exhaustive; add others if discovery
reveals them). At least three cited sources per candidate are
required:

**Installer-builders:**
- **Inno Setup** (free, Windows-only build, mature)
- **NSIS** (free, scriptable, mature)
- **WiX Toolset** (Microsoft-backed, MSI output)
- **MSIX** (Microsoft modern format, Store-distributable)
- **Squirrel.Windows** (used by Slack, Discord)
- **Velopack** (newer, simpler successor to Squirrel)

**Package-manager channels (may eliminate the need for a custom
installer entirely):**
- **winget** (Microsoft's official package manager; manifest
  submission process)
- **Chocolatey** (community-driven; package submission process)
- **Scoop** (developer-targeted; bucket model)

**App-wrappers (eliminate unless discovery reveals an
unforeseen advantage):**
- **Tauri bundler** (would require Tauri-wrapping Bibliogon, big
  scope expansion - eliminate by default)
- **Electron-builder** (similar issue, big scope - eliminate by
  default)

If a package-manager channel (winget / chocolatey / scoop)
satisfies the requirements, recommend that path and mark all
installer-builders as "fallback if package-manager submission is
rejected or maintenance burden is too high".

### Step 0.5: Survey macOS one-click options

- **install.command files** (doppelklickbar Bash, no installer
  needed - the trivial path; pre-finding from Step 0.2)
- **.pkg installer** (productbuild, native macOS, code-signing
  required for distribution)
- **.dmg with drag-to-Applications** (cosmetic, still needs the
  app to install Docker etc.)
- **Homebrew tap** (`brew install bibliogon`, requires Homebrew;
  may eliminate the need for a custom installer entirely)

Same package-manager logic as Windows: if Homebrew tap satisfies
requirements, recommend that path and mark `.pkg` / `.dmg` as
fallback.

### Step 0.6: Docker Desktop auto-install: feasibility check

This is the make-or-break for one-click on Windows.

**EULA default rule: assume the strict reading.** If Docker's
EULA can plausibly be read as forbidding third-party silent
install, treat it as forbidden. Solo open-source maintainer with
no legal-review budget = strict reading is the only safe stance.

Research:
- Docker Desktop EULA: can a third-party installer accept on
  user's behalf? (Almost certainly NO; confirm in writing with a
  cited source)
- Silent install flags for Docker Desktop installer
- WSL2 prerequisite handling on Windows
- Detection methods: how to check if Docker Desktop is installed,
  running, configured for the user's WSL distro
- Same for macOS: silent install of Docker Desktop dmg, accept
  EULA, etc.

**Likely finding (build the report around this assumption unless
discovery yields hard evidence otherwise):** full silent install
of Docker Desktop is NOT allowed by Docker's EULA. The realistic
best case is:
- Detect if Docker is installed
- If not, open the Docker download page and instruct the user
- After Docker is installed, the Bibliogon installer continues

**If discovery confirms the EULA blocker:**
- Recommend closing D-05 as **won't-fix** (not "deferred")
- Fall back to **detect-and-instruct**, which is what the
  current launcher already does in
  `launcher/bibliogon_launcher/__main__.py` first-run path
- Document the cited EULA passage in the report

Document this clearly. "One-click" may have to be "two-click"
(one for Docker, one for Bibliogon). This is a key input to the
user-facing flow design.

### Step 0.7: Code-signing landscape

For both Windows and macOS distributions:
- Cost of certificates (Windows EV/OV, Apple Developer Program)
- SmartScreen reputation building (Windows)
- Notarization process (macOS)
- Consequences of skipping signing (warning dialogs, blocked
  installs)
- Open-source projects that ship unsigned and how they manage UX

**Budget rule: if user budget for code-signing is unknown,
surface it as an explicit user-decision item in the "Open
questions for the user" section. Do NOT make assumptions about
willingness to spend.**

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

Produce `docs/explorations/installer-discovery-report.md` with
this structure (committable, persistent - NOT `/tmp`):

```markdown
# One-Click Installer Discovery Report

Date: <today>
Author: CC discovery session
Status: Ready for review

## v0.26.x state delta (ground state)

<one paragraph confirming the four v0.26.x deltas were
internalised and that no recommendation regresses them>

## Existing state

### install.sh / install.sh.template
- What it does: <step-by-step>
- Risk areas: <enumerated>
- Tested platforms: <documented evidence or "untested">
- Confirmed: install.sh is generated from the template; do not
  edit the committed output

### start.sh / stop.sh
- Dependencies on install.sh: <yes/no, what>

## Windows installer evaluation

**Two-tier recommendation:**
- **Preferred:** <ONE tool> with kill-switch criterion <when
  preferred fails, switch to fallback>
- **Fallback:** <ONE tool>

| Tool | Maturity | License | Build host | Code-sign cost | Sources cited | Recommendation |
|------|----------|---------|------------|----------------|---------------|----------------|
| Inno Setup   | ... | ... | Windows | $... | <≥3 URLs> | recommend / fallback / eliminate-with-reasoning |
| NSIS         | ... | ... | Cross   | $... | <≥3 URLs> | ... |
| WiX          | ... | ... | ...     | $... | <≥3 URLs> | ... |
| MSIX         | ... | ... | ...     | $... | <≥3 URLs> | ... |
| Squirrel.Windows | ... | ... | ... | $... | <≥3 URLs> | ... |
| Velopack     | ... | ... | ...     | $... | <≥3 URLs> | ... |
| winget       | ... | ... | ...     | $... | <≥3 URLs> | ... |
| Chocolatey   | ... | ... | ...     | $... | <≥3 URLs> | ... |
| Scoop        | ... | ... | ...     | $... | <≥3 URLs> | ... |

**Discovery success criterion (must be met before report is
shippable):** every candidate is either recommended (preferred
or fallback) OR eliminated with explicit reasoning. Vague "needs
more research" is NOT acceptable. ≥3 cited sources per
non-eliminated candidate.

Justification for preferred and fallback picks: <2-3 paragraphs
each>

## macOS one-click evaluation

**Two-tier recommendation:**
- **Preferred:** <ONE primary path> with kill-switch criterion
- **Fallback:** <ONE secondary path>

| Path | Effort | Code-sign | Sources cited | Recommendation |
|------|--------|-----------|---------------|----------------|
| install.command  | ... | n/a   | <≥3> | ... |
| .pkg             | ... | $99/y | <≥3> | ... |
| .dmg             | ... | ...   | <≥3> | ... |
| Homebrew tap     | ... | n/a   | <≥3> | ... |

For Phase 2 (scripts only): `install.command`
For Phase 3 (if pursued): <pkg / dmg / homebrew recommendation>

Justification: <1-2 paragraphs>

## Docker Desktop integration

Finding: <one-click feasible OR two-step required>
Reasoning: <EULA cited passage, technical evidence, or both>

Recommended user flow:
1. <step>
2. <step>
3. <step>

If EULA confirmed blocking: D-05 closure recommendation =
won't-fix, fall back to detect-and-instruct.

## Code-signing

Phase 2 (scripts): not applicable (scripts are not signed
binaries)

Phase 3 (Windows .exe):
- Recommendation: <sign / skip-with-mitigation / depends-on-
  budget>
- Estimated cost: $<X>/year (Windows EV/OV)
- Mitigation if unsigned: <SmartScreen reputation, hash
  documentation on the release page, etc.>

Phase 4 (macOS, if pursued):
- Apple Developer Program: $99/year
- Notarization: free but requires Apple ID
- Recommendation: <sign / skip / defer / depends-on-budget>

## Phase plan with effort estimates

(Renumbered from prior version: prior used 2/3/4. Phase 1 is
the **current launcher**, already shipped, NOT a discovery
target.)

### Phase 1: Current launcher (already shipped)
Scope: GUI installer with repo download + .env generation +
Docker image build + browser open. First-run install path in
`launcher/bibliogon_launcher/__main__.py`. Detect-and-instruct
for Docker Desktop. **No discovery work here.**

### Phase 2: Cross-platform scripts (this discovery's first
deliverable)
Scope:
- Polish install.sh.template (test on fresh macOS, fix silent
  failures); regenerate install.sh via
  `scripts/generate_install_sh.sh`
- New install.command (macOS doppelklickbar wrapper, ≤10 lines
  invoking install.sh from Finder)
- New install.ps1 (Windows PowerShell, ≤80 lines)
Effort: <X CC sessions of Y hours each - CONCRETE estimate
based on the file sizes above; do NOT leave as TBD>
Risk: low
Blockers: none identified

### Phase 3: Docker Desktop auto-install integration (this
discovery's second deliverable)
Scope:
- Confirm whether Docker Desktop installer supports silent /
  unattended installs without violating EULA (assume strict
  reading; cite the EULA passage)
- If yes (unlikely): integrate into the launcher's first-run
  flow as a fourth path (Install Docker for me / Open Docker
  download page / Continue without Docker / Close)
- If no (expected): document the EULA blocker, recommend D-05
  as won't-fix, fall back to "detect + instruct" which is what
  the launcher already does
Effort: discovery + 0-1 implementation sessions
Risk: high (EULA interpretation; default = strict)
Blockers: Docker EULA review needed first; if results are
ambiguous and no legal-review budget exists, take the strict
reading

### Phase 4: macOS installer (optional, defer decision)
Scope: TBD pending Phase 3 launch outcomes
Recommendation: defer until Phase 3 receives real user feedback

## Open questions for the user (explicit user-decision items)

These are NOT for the discovery agent to resolve. Surface and
STOP for user input:

1. **Code-signing budget**: ready to spend $X/year on Windows
   EV cert and $99/year on Apple Dev Program? If unknown,
   defer Phase 3/4 and ship Phase 2 unsigned with mitigation.
2. **Repo hosting for installer artifacts**: GitHub Releases
   page sufficient, or do we need a download.bibliogon.* domain?
3. **Update mechanism**: should the installer support
   self-update, or is "uninstall and reinstall" acceptable for
   v1? (Note: launcher self-replace is a separate scope -
   `LAUNCHER-SELFREPLACE-01`.)
4. **Telemetry**: should the installer phone home (success /
   failure rate)? Privacy implications.
5. **Localization**: installer UI in English only, or DE+EN to
   start?

## Trigger reconfirmation for desktop-packaging.md

The original triggers in `docs/explorations/desktop-packaging.md`
were: <list from the doc>.

Status of each:
- <trigger 1>: <fired / not fired / partially fired>
- ...

Conclusion: <re-prioritization is justified / not justified>.
If justified, update desktop-packaging.md as part of the next
session to reflect new state.

## Writeback to ROADMAP / backlog (mandatory closing step)

Findings must be written back, not left isolated:

- **D-05 status update**: outcome of Docker auto-install
  feasibility check. If EULA blocked: recommend ROADMAP move
  D-05 to "Closed - won't fix" with citation. If feasible:
  ROADMAP entry stays P4 with concrete next-step prompt.
- **LAUNCHER-SELFREPLACE-01 status update**: discovery confirms
  this remains a separate scope; no merge into D-05. Backlog
  entry stays P4.
- **Eliminated installer candidates**: each candidate marked
  "eliminated" in the table above must be reflected in
  ROADMAP/backlog if any prior entry referenced it.
- **Budget-unknown questions**: explicit user-decision items
  (above) - do NOT make budget assumptions in the writeback.
```

STOP HERE. Wait for the user to read the report and approve the
recommendation before any implementation prompt is written.

## Constraints

- **No code changes.** This is research only.
- **No edits to install.sh, install.sh.template, start.sh,
  stop.sh, README, docs/.** Findings inform the next session;
  they do not produce changes here.
- **Web search is allowed and encouraged.** Use it for current
  Windows installer state. Do not trust memory for tool maturity
  or 2026-current best practices. **If web access is
  unavailable, STOP - cannot reliably evaluate 2026-current tool
  maturity from memory.**
- **Cite sources.** Each tool recommendation must reference ≥3
  source URLs where the maturity / license / build-host info
  came from. The user must be able to verify.

## Stop conditions

- If existing `install.sh.template` is fundamentally broken (not
  just improvable): STOP, surface, recommend fix-first session
  before any installer work.
- If `desktop-packaging.md` triggers have NOT meaningfully fired:
  STOP, ask the user to confirm re-prioritization with explicit
  reasoning.
- If Docker Desktop EULA / silent-install research yields a
  blocker that makes one-click impossible: continue under the
  "EULA confirmed blocking" branch (D-05 won't-fix); do NOT
  STOP - the EULA-blocked branch is a complete answer, not an
  abort signal.
- If web access is unavailable: STOP. Cannot evaluate
  2026-current tool maturity from training memory.

## Closing checklist (output-quality, not work coverage)

The Pre-Inspection sections above enumerate the work. This
checklist verifies the report's quality before submission:

- [ ] Report written to
      `docs/explorations/installer-discovery-report.md`
      (committable, persistent - NOT `/tmp`)
- [ ] v0.26.x state delta confirmed in opening paragraph
- [ ] Two-tier recommendation (preferred + fallback + kill-
      switch) for both Windows and macOS sections
- [ ] ≥3 cited sources per non-eliminated installer candidate
- [ ] Every candidate either recommended or eliminated with
      reasoning - no "needs more research"
- [ ] EULA finding includes a cited passage if blocking
- [ ] Phase numbering is 1/2/3/4 (Phase 1 = current launcher)
- [ ] Concrete effort estimates for Phase 2 (no TBD
      placeholders)
- [ ] Budget-unknown items surfaced as explicit user-decision
      items, no budget assumption
- [ ] Writeback to ROADMAP / backlog included as a section
      (D-05 status, LAUNCHER-SELFREPLACE-01 status)
- [ ] Trigger reconfirmation against
      `docs/explorations/desktop-packaging.md` documented
- [ ] Self-clarification rule applied: parked questions in
      "Open questions for the user", evidence-based answers
      cite their source

## Self-clarification rule

This session continues to follow the self-clarification rule
from `.claude/rules/ai-workflow.md`: parked questions go in the
report under "Open questions for the user", evidence-based
answers note their source, blocking questions trigger the STOP
conditions above. (Mentioned once; do not repeat.)
