# Git-Based Backup Integration

Status: Shipped in v0.21.0 (2026-04-22). All 5 phases complete. Archived.
Last updated: 2026-04-22
Revived when: post-ship defects or extension proposals warrant a new round.

---

## 1. Header

[ROADMAP.md](../ROADMAP.md) tracks four items under "Git-based backup"
as low priority: **SI-01** (Accept Remote state), **SI-02** (merge help
for simple conflicts), **SI-03** (SSH key generation), **SI-04**
(sidebar indicator for remote-ahead). This document captures the
architectural decisions reached in discussion, ties the four SI items
into a coherent 5-phase plan, and records the reference layout from
[write-book-template](https://github.com/astrapi69/write-book-template)
(the user's prior project).

Exploration only. No code changes in this session.

---

## 2. Context and motivation

**Current backup stack:**
- `.bgb` export/import ([backup_export.py](../../backend/app/services/backup/backup_export.py),
  [backup_import.py](../../backend/app/services/backup/backup_import.py))
  — portable ZIP archives
- `BackupCompare` ([backup_compare.py](../../backend/app/services/backup/backup_compare.py))
  — upload two `.bgb` files, per-chapter diff. Docstring: "stop-gap
  for V-02 until the Git-based Sicherung feature lands."
- `BackupHistory` ([backup_history.py](../../backend/app/backup_history.py))
  — audit log only, no file persistence.

**Gaps today:** no versioning, no remote sync, no diff tools, no
collaboration foundation.

**Why git:** standard, portable, well-understood. Any GitHub user has
intuition for commit/push/pull. Prior project
[write-book-template](https://github.com/astrapi69/write-book-template)
is a direct precedent for git-as-book-canonical-source; Bibliogon
adapts the pattern with TipTap JSON as MVP storage.

**Relation to existing stack:** `.bgb` export/import **stays** for
distribution (git covers versioning + sync, not hand-off).
`BackupHistory` stays for now, could eventually draw from `git log`
(Phase 5+). `BackupCompare` (V-02 stop-gap) **deprecable post-Phase-2**
once `git diff` covers the compare use case.

---

## 3. Use cases (confirmed with user)

Four drivers justifying first-class integration rather than "git init
the uploads dir manually":

1. **Multi-device sync.** Different laptops, office vs. home. Today:
   no sync. Post-git: push on one machine, pull on the other.
2. **External backup with diff.** GitHub/GitLab as secondary off-site
   safety, with inspectable history.
3. **Versioning visible.** `git log` shows the history, `git diff`
   shows what changed, `git checkout` reverts. Standard tools.
4. **Collaboration-ready foundation.** Future co-authors, editors,
   beta readers can fork/branch/PR. Not MVP, but design shouldn't
   foreclose.

Any single driver could justify a manual workaround. Together they
justify first-class integration inside Bibliogon so the UX stays
coherent and the author never needs a terminal.

---

## 4. Resolved architectural decisions

### 4.1 Remote: agnostic

Bibliogon speaks standard git-over-HTTPS and git-over-SSH. No
provider-specific API, no OAuth flows per vendor, no GitHub-only
features. User configures a remote URL in book settings and Bibliogon
uses it via GitPython.

Works with GitHub, GitLab, Gitea, Bitbucket, Codeberg, self-hosted
git-daemon, anything that speaks the git protocol.

**Rationale:** lock-in avoidance. The user's data stays theirs and
their hosting choice stays theirs.

### 4.2 Versioning scope: TipTap JSON per chapter, MVP

Each chapter commits as a separate TipTap JSON file plus a `book.json`
(or `metadata.yaml`) with book-level metadata. File layout informed by
write-book-template — see Section 5 below.

Markdown export for more readable diffs is a Phase 5 enhancement. MVP
ships raw JSON. JSON stays the canonical source of truth; any Markdown
generated later is advisory (lossy export, not round-trippable).

**Rationale:** zero conversion cost, zero data loss, ships fast. Ugly
diffs are a real cost but acceptable for MVP — the user still gets
full versioning and sync.

### 4.3 Commit timing: user-controlled

A "Commit" button in the book UI. Author decides when. No autosave-
driven commits, no timer-based commits, no rule enforcement.

Documentation provides guidance ("commit after significant work
sessions", "commit before risky refactors", "commit before closing the
book for the day") but does not enforce.

**Rationale:** autosave already handles unsaved-changes protection via
drafts. Git is for milestones, not keystroke-level history. Hybrid
timer-based designs add complexity without clear user benefit at MVP
scope.

### 4.4 Auth: not in MVP

Phase 1 ships local-only repos. No push, no pull, no remote
configuration. User can still init, add, commit, log, diff through
Bibliogon, and inspect the `.git` directory with external tools.

Phase 2 introduces push/pull with the simplest auth that works:
HTTPS + Personal Access Token, stored Fernet-encrypted alongside other
credentials.

SSH keys (SI-03) deferred to Phase 3. Rationale: HTTPS+PAT is simpler
UX (paste a token, done) than SSH (generate key, add to GitHub,
configure agent). SSH becomes useful only when user wants passwordless
push across many repos.

### 4.5 Repo layout: per-book

Each book gets its own git repo at `uploads/{book_id}/.git`. Matches
existing `uploads/{book_id}/` pattern. Each book has independent
history, independent remote, independent branches.

**Rationale:** books evolve independently; one book's corruption/reset
doesn't touch others; each book can have its own remote (public
book-A on GitHub, private book-B on self-hosted Gitea).

File structure detailed in Section 5.

### 4.6 Offline-first: yes

Local operations (init, add, commit, log, diff, status, checkout)
work without network. Only push and pull require network.

Preserves Bibliogon's offline-first principle from
[CONCEPT.md](../CONCEPT.md).

Network-dependent operations are clearly labeled in UI — a push
button shows "requires internet", a status poll shows "offline,
last checked X ago" when offline.

### 4.7 Git library: GitPython

`GitPython` 3.x.

**Rationale:**
- BSD license (compatible with Bibliogon MIT)
- Python API over subprocess — no manual output parsing
- Widely used (~4000 stars), mature, well-documented
- Thin wrapper — easy to replace later if perf/license needs shift

**Requires:** `git` binary on host. Bibliogon's Docker base image
needs git installed. To verify at Phase 1 start: inspect
[backend/Dockerfile](../../backend/Dockerfile) (likely `python:3.12-slim`
which does NOT include git; `apt-get install git` line needed).

**Alternatives considered:**
- `pygit2` — native libgit2 bindings. Faster, no subprocess. Rejected:
  GPLv2 with linking exception adds license complexity for Bibliogon's
  MIT ecosystem and for potential downstream white-label forks.
- `dulwich` — pure Python. Rejected: slower on large repos; Bibliogon
  books with hundreds of chapters + image assets would notice.

### 4.8 Conflict strategy: Accept-Remote / Accept-Local MVP

When remote has changes that conflict with local, UI offers two
buttons:
- **Accept Remote** — overwrite local with remote version
- **Accept Local** — force-push local over remote

Each action is labeled with consequence and requires explicit
confirmation dialog. No auto-merge in MVP.

Simple per-chapter merge (SI-02) arrives in Phase 4. Complex
conflicts (overlapping edits in the same chapter) stay "open in
external git tool" with instructions through every phase.

---

## 5. Repo layout (reference: write-book-template)

Layout inspected from the live repository on 2026-04-21:

```
write-book-template/
├── manuscript/
│   ├── chapters/
│   │   ├── 01-introduction.md
│   │   ├── 02-chapter.md
│   ├── front-matter/
│   │   ├── toc.md, toc-print.md, preface.md, foreword.md
│   ├── back-matter/
│   │   ├── about-the-author.md, acknowledgments.md, appendix.md,
│   │   ├── bibliography.md, epilogue.md, glossary.md, imprint.md
├── assets/
│   ├── covers/, images/, fonts/, templates/
├── config/
│   ├── metadata.yaml, export-settings.yaml, voice-settings.yaml
├── output/                   (git-ignored in Bibliogon; build artifact)
├── pyproject.toml, Makefile, LICENSE, README.md  (not applicable to
│                                                   Bibliogon's in-repo
│                                                   use)
```

### Bibliogon-adapted layout (proposed)

MVP commits this structure inside `uploads/{book_id}/`:

```
uploads/{book_id}/
├── .git/                             (git internals)
├── manuscript/
│   ├── chapters/
│   │   ├── 01-{slug}.json            (TipTap JSON per chapter)
│   │   ├── 02-{slug}.json
│   ├── front-matter/
│   │   ├── toc.json, preface.json, foreword.json ...
│   ├── back-matter/
│   │   ├── about-the-author.json, acknowledgments.json ...
├── assets/
│   ├── covers/
│   ├── figures/
│   ├── images/
├── config/
│   ├── metadata.yaml                 (Book fields: title, author,
│                                      ISBN, language, etc.)
│   ├── export-settings.yaml          (optional, if set)
├── .gitignore                        (output/, audiobook/, temp/)
```

### What carries over from write-book-template

- Three-way manuscript split: `front-matter/` + `chapters/` +
  `back-matter/`
- `assets/` with subdirs by type
- `config/metadata.yaml` as the book-metadata carrier
- Numeric-prefix filenames for chapter ordering (`01-`, `02-`, ...)
  matching `Chapter.position`

### What differs from write-book-template

- **File format: JSON not Markdown.** write-book-template writes
  `.md`; Bibliogon commits TipTap JSON (`.json`). Phase 5 optionally
  adds `.md` alongside.
- **No `pyproject.toml`, `Makefile`, `output/` in repo root.** Those
  belong to the build tooling at export time, not to the book itself.
- **Assets persisted via Bibliogon's uploads pipeline** — git tracks
  the files that exist in the book's asset table; deletes propagate.
- **`chapter_versions` table has no write-book-template equivalent.**
  That's an internal Bibliogon draft-history mechanism, not for git.
  Not committed.

### Marked as "starting point, can extend later"

The proposed layout is a v1 target. As phases progress, structure may
evolve:
- ChapterType ordering across front/chapters/back matter might need a
  manifest file (write-book-template uses `export-settings.yaml`
  `section_order`; Bibliogon stores it in DB)
- Chapter content plus `content_html` or `content_md` side-files for
  readability vs fidelity trade-off
- Per-chapter frontmatter (YAML at top of each chapter file) to carry
  ChapterType and AI-assisted flag

These are explicit Phase N+1 design questions, not blockers.

---

## 6. Phased implementation plan

Five phases, ordered by user value and technical dependency.

### Phase 1: Local git per book (foundation)

**Scope:**
- Add `GitPython` to [backend/pyproject.toml](../../backend/pyproject.toml)
- Backend: `backend/app/services/git_backup.py` module
- `POST /api/books/{id}/git/init` — initialize repo + first commit
- `POST /api/books/{id}/git/commit` — take current book state, write
  files per layout, `git add .`, commit with user message
- `GET /api/books/{id}/git/log` — return commit history (hash, author,
  date, message)
- `GET /api/books/{id}/git/status` — clean / dirty, uncommitted file
  count
- Dockerfile: `apt-get install -y git` (verify not already present)
- Frontend: "Commit" button in BookEditor header, commit dialog with
  message input, toast on success
- Display commit log panel in book view or Settings
- i18n: new keys for commit UI in 8 languages

**Estimated effort:** 8-14 hours

**Out of Phase 1:** push, pull, auth, remotes, conflicts, SSH keys,
branches, revert UI

### Phase 2: Remote push/pull (sync)

**Scope:**
- Book model field: `git_remote_url` (nullable string)
- Book model field: `git_pat_credential_id` (FK to credentials)
- Reuse existing Fernet credential store (pattern from
  ElevenLabs key) for PAT storage
- `POST /api/books/{id}/git/remote` — configure remote URL + PAT
- `POST /api/books/{id}/git/push` — push current branch to remote;
  handles rejection with "remote has changes" flag
- `POST /api/books/{id}/git/pull` — fetch + merge (ff-only in MVP)
- `GET /api/books/{id}/git/sync-status` — local-ahead / remote-ahead /
  in-sync / diverged
- Frontend: Remote config form in book settings; Push button; Pull
  button; status badge
- SI-01 UI: "Accept Remote" prompt on push rejection
- SI-04 UI: sidebar indicator when `remote-ahead`
- Handle network errors gracefully (preserve local work, show clear
  error)

**Estimated effort:** 12-20 hours

**Out of Phase 2:** SSH keys, merge conflicts beyond
Accept-Remote/Local, credential rotation UI

### Phase 3: SSH key generation (SI-03)

**Scope:**
- Backend: `backend/app/services/ssh_keys.py`
- Generate Ed25519 keypair via `paramiko` or `ssh-keygen` subprocess
- Store private key at `config/ssh/id_ed25519` with 0600 perms; public
  at `id_ed25519.pub`
- `POST /api/ssh/generate` — generate new key
- `GET /api/ssh/public-key` — return public key (copy-paste to
  GitHub/GitLab)
- `DELETE /api/ssh/key` — remove keypair (with explicit confirm)
- Wire SSH auth path in `git_backup.py` — detect `git@...:` URL, use
  SSH agent or env-var `GIT_SSH_COMMAND` pointing at the stored key
- Help doc: step-by-step GitHub/GitLab public-key add

**Estimated effort:** 6-10 hours

**Out of Phase 3:** multiple keys per user, per-book keys, per-host
config, merge conflicts

### Phase 4: Simple conflict resolution (SI-02)

**Scope:**
- Detect conflicts during pull (non-ff-only merge)
- Classify conflicts: "simple" = each side changed different chapters
  with no overlap; "complex" = same chapter modified on both sides
- Simple-conflict UI: side-by-side or sequential preview per affected
  chapter; "Keep mine / Keep theirs / Skip" per chapter; batch accept
- Complex-conflict UI: banner "manual resolution required" with link
  to help doc on using external git tool
- Backend: `POST /api/books/{id}/git/resolve` accepting per-chapter
  resolution map
- Merge commit created with the chosen resolution

**Estimated effort:** 12-18 hours

**Out of Phase 4:** three-way visual merge, auto-merge inside JSON
structure, inline-diff editor, rebasing

### Phase 5: Markdown export for readable diffs (enhancement)

**Scope:**
- On commit, additionally write Markdown version of each chapter
  alongside JSON (`01-{slug}.md` next to `01-{slug}.json`)
- Reuse existing TipTap -> Markdown conversion from
  [plugin-export](../../plugins/bibliogon-plugin-export/bibliogon_export/tiptap_to_md.py)
- Git-level diff shows both files per chapter (JSON authoritative,
  MD advisory)
- Doc note: JSON is the source of truth; MD is lossy and regenerated
  from JSON on every commit

**Estimated effort:** 4-8 hours

**Total estimated across all phases:** 42-70 hours. Not a single
session. Each phase ships independently with user-visible value.

---

## 7. What the existing backup stack keeps doing

- **`.bgb` export/import**: portable archives, email attachments,
  upload-share, reviewer hand-off. Not replaced. Git is for versioning
  and sync, `.bgb` is for distribution.
- **`BackupHistory` audit log**: stays as internal "what happened"
  record. Could eventually draw from `git log` but Phase 5+
  consideration.
- **`backup_compare` (V-02 stop-gap)**: can be deprecated after
  Phase 2 when `git diff` + commit log cover the compare use case.
  Docstring already marks it as a stop-gap.

---

## 8. Documentation plan

Help docs written alongside implementation, not after. Phase-per-page
approach keeps each doc scoped to what the UI actually exposes.

### Phase 1 doc — `docs/help/{lang}/git-backup-basics.md`
- What is git and why it's useful for writing
- How to commit, when to commit (guidelines, not rules)
- How to read the commit log
- How to inspect commit contents via external tools
- Troubleshooting: commit fails, corrupted repo, huge assets

### Phase 2 doc — `docs/help/{lang}/git-backup-remote.md`
- What is a remote
- Creating a GitHub/GitLab private repo (step-by-step with
  screenshots)
- Creating and adding a Personal Access Token
- Push and pull: what each does, risks, best practices
- **Warnings:** use private repo by default, never commit secrets,
  never commit API keys, review `.gitignore`

### Phase 3 doc — `docs/help/{lang}/git-backup-ssh.md`
- What SSH auth is, how it differs from HTTPS+PAT
- How to generate key in Bibliogon
- How to add the public key to GitHub / GitLab / Gitea
- Switching an existing book from HTTPS to SSH

All three docs in 8 languages (DE, EN, ES, FR, EL, PT, TR, JA),
registered in `docs/help/_meta.yaml`, and indexed by the in-app help
plugin.

---

## 9. Open design questions (deferred)

Not blockers; each phase resolves the ones it needs.

- **Branching exposure.** UI expose branches or always `main`? MVP
  assumes main; experimental branches are Phase 6+.
- **Revert UX.** git revert vs hard-reset vs checkout specific commit.
  "Oops, go back to yesterday" is its own sub-design.
- **Binary assets.** Large images bloat git history. Git LFS?
  `.gitattributes`? Warn on new asset above a size threshold?
- **Author identity.** `user.name` / `user.email` per book, per
  install, or pulled from `author` config? Matters on shared repos.
- **Large books.** git performance at scale. Probably fine at
  typical sizes (50 chapters x 100 KB) but worth measuring Phase 1
  close.
- **Nested-repo hygiene.** Dev-checkout of Bibliogon plus per-book
  `.git` dirs = nested repos. Needs `.gitignore` entries in the
  outer repo.

---

## 10. Relation to existing ROADMAP items

| ROADMAP | Phase | Notes |
|---------|-------|-------|
| SI-01 (Accept Remote) | Phase 2 | Part of push/pull UX |
| SI-02 (simple conflict help) | Phase 4 | Per-chapter Accept Mine/Theirs |
| SI-03 (SSH keys) | Phase 3 | Standalone feature once Phase 2 is stable |
| SI-04 (sidebar remote indicator) | Phase 2 | Status badge |

ROADMAP entries will be updated at the start of each phase to reflect
active work and to link back to this exploration. Not in this
session.

---

## 11. Triggers for starting implementation

### Phase 1 can start when:
- User has 8-14 hour budget
- No higher-priority work actively blocking (current: TipTap 3
  migration unblock, article-authoring observation log,
  security/maintenance)
- User confirms local-first git is the right first step vs waiting
  for Phase 2 to ship together

### Phase 2 can start when:
- Phase 1 has shipped and been used for ≥1 week in practice
- 12-20 hour budget available
- A clear push-to-remote use case is actively driving (e.g.,
  multi-device setup imminent)

### Phase 3+ can start when:
- Prior phases stable
- User-facing demand or the user's own need for SSH / merge / MD

No phase is mandatory — any can be skipped or deferred indefinitely
without blocking Bibliogon's other work.

---

## 12. Out of scope

Explicitly NOT part of the 5-phase plan:

- Commit signing (GPG, SSH-signed commits)
- Hooks (pre-commit / post-commit / pre-receive automation)
- Submodules
- Distribution to external platforms (IPFS, dat, etc.)
- Built-in CI/CD for books
- Branching / merging workflows beyond Accept-Remote/Local and simple
  per-chapter pick
- Visual commit-graph browser
- Time-travel / checkout-by-date UI (beyond `git checkout {hash}`)
- Import from an existing git repo ("here's my write-book-template
  book, import it into Bibliogon")
- Bibliogon-as-git-server (accepting pushes from other Bibliogon
  installs)

Each is a reasonable future feature but not part of this plan.

---

## 13. Cross-references

- [children-book-plugin.md](children-book-plugin.md) — precedent for
  a deferred feature with a phased plan
- [tiptap-3-migration.md](tiptap-3-migration.md) — precedent for a
  migration blocked on upstream
- [article-authoring.md](article-authoring.md) — precedent for a
  feature gated on validation data
- [../../backend/app/services/backup/](../../backend/app/services/backup/)
  — existing backup stack
- [../../backend/app/backup_history.py](../../backend/app/backup_history.py)
  — audit log
- [../../frontend/src/components/BackupCompareDialog.tsx](../../frontend/src/components/BackupCompareDialog.tsx)
  — V-02 compare UI (deprecation target post-Phase-2)
- [../../backend/app/models/__init__.py](../../backend/app/models/__init__.py)
  — Book model (new fields: `git_remote_url`, `git_pat_credential_id`
  in Phase 2)
- [../../backend/Dockerfile](../../backend/Dockerfile) — needs git
  binary install in Phase 1
- [../ROADMAP.md](../ROADMAP.md) — SI-01 through SI-04 tracking
- https://github.com/astrapi69/write-book-template — reference layout
  (inspected 2026-04-21, Section 5 above)
- https://github.com/astrapi69/manuscripta — the export pipeline
  write-book-template uses; referenced for future Phase 5 MD export
