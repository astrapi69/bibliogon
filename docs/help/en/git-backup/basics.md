# Git Backup: Basics

Git is a distributed version control system. Bibliogon uses it to preserve every version of your book: each commit is a snapshot you can review, compare, or restore later.

This document covers local use only. Syncing with a remote (GitHub, GitLab, Gitea) is described in **Git Backup > Remote**; SSH authentication in **Git Backup > SSH Keys**.

## What is versioned

Bibliogon creates one git repository per book (`.git` inside the book directory). On every commit, the current state is written to disk:

- `manuscript/chapters/NN-<slug>.json` — each chapter as TipTap JSON
- `manuscript/front-matter/` and `back-matter/` — front and back matter (TOC, dedication, imprint, etc.)
- `config/metadata.yaml` — book metadata (title, author, ISBN, language)
- `NN-<slug>.md` next to each JSON — Markdown side-file (advisory, for readable git diffs)
- `.gitignore` — excludes audiobook files, exports, temp directories

JSON is the canonical source of truth. Markdown is regenerated on every commit and exists only to make `git log` / `git diff` easier to read.

## Initialize the repository

1. Open the book in the editor.
2. In the sidebar, click **Git Backup**.
3. In the dialog, click **Initialize repository**.

The first commit `Initial commit: <book title>` is created automatically. The commit button and history appear next.

Initialization is idempotent: clicking **Initialize** again is a no-op.

## Create a commit

1. Open **Git Backup**.
2. Type a **commit message** (e.g. "Revised chapter 3").
3. Click **Commit**.

Bibliogon writes the current book state to disk and creates a git commit. After the commit:

- HEAD shows the new hash.
- The entry appears at the top of the history list.
- The sidebar indicator (dot next to the Git button) refreshes after dialog close.

If nothing has changed since the last commit, Bibliogon rejects the attempt with **Nothing to commit**.

## When to commit

Git gives more flexibility than classic autosave. Guidelines, not rules:

- **After a completed work session.** For example, when a chapter is done or you stop for the day.
- **Before a risky change.** A major restructuring, a deleted paragraph, an experiment — a commit before gives a clear rollback point.
- **When you hit a milestone.** First draft, post-edit, pre-export.
- **Not too often.** Autosave + local drafts already cover keystroke-level safety. Git commits are for milestones, not every session.

Rule of thumb: "Can I describe this state in half a sentence?" Then it's worth a commit.

## Read the history

The **History** panel shows recent commits, newest first:

- **Short hash** (e.g. `a1b2c3d`) — unique identifier for each commit.
- **Message** — what you typed.
- **Author** — from the book's `author` metadata field.
- **Date** — local time of the commit.

For detailed diffs use an external git tool (git CLI, GitKraken, Sourcetree, VS Code Source Control) inside the book directory `uploads/<book-id>/`.

## Troubleshooting

**"No repository for this book yet."**
Initialization hasn't run. Click **Initialize repository** in the dialog.

**"Nothing to commit."**
The current book state matches the last commit. Either everything is already saved, or your change hasn't been autosaved yet — wait briefly and retry.

**Corrupted repository.**
Bibliogon tries to handle git operations gracefully. On unexpected errors: repair or delete `uploads/<book-id>/.git` manually and re-initialize. The TipTap JSON source lives in Bibliogon's database, not inside the git repo — it is not lost.
