# Adopt git history from an imported ZIP

When you import a write-book-template ZIP that contains a
`.git/` directory, Bibliogon can adopt its full commit history
into the book's git backup. Three modes in the wizard's Step 3:

- **Start fresh** (default): ignore the `.git/`. Book starts
  without git; you can always init one later via the
  Git-Backup dialog.
- **Adopt without remote**: copy the `.git/` (with history)
  into the book's uploads directory. No remote URL is
  carried over; you configure one manually if needed.
- **Adopt with remote**: copy `.git/` AND preserve the
  `origin` remote URL from the source. You re-enter the PAT
  via the Git-Backup dialog after import (the source PAT, if
  present in `.git/`, is stripped for security).

## Security guarantees on adoption

Every adopt path runs a sanitization pass before copying:

1. `http.*.extraheader` (Basic/Bearer auth) stripped from
   `.git/config`.
2. `[credential]` section removed in full — all helpers.
3. Reflog cleared via `git reflog expire --expire=now --all`,
   followed by `git gc --prune=now` to drop unreachable
   objects (which may contain credential fragments).
4. Custom hooks are **not** adopted. Only the default
   `*.sample` files travel through.
5. Non-standard refs in `packed-refs` (outside
   `refs/heads/`, `refs/tags/`, `refs/remotes/`) are pruned.

The wizard's Step 3 lists findings before you commit, so you
can see exactly what will be stripped.

## What happens after adoption

The adopted book has `uploads/<book_id>/.git/` on disk. All
git-backup endpoints (`commit`, `push`, `pull`, `status`,
`log`, `merge`) work immediately.

**Important**: your first Bibliogon commit after adoption
will overwrite the adopted working-tree files. Bibliogon
writes `manuscript/*.json` (canonical TipTap) and
`config/metadata.yaml`. The adopted commits stay in history
exactly as they were; only the working tree changes shape.

## Post-import adoption (for books imported before this feature)

If you have a book that imported before the adoption feature
shipped, you can still adopt its history from the source ZIP:

```
POST /api/books/{book_id}/git-import/adopt
```

Multipart upload: `file` (the ZIP) + `preserve_remote` form
field. The endpoint refuses if the book already has a `.git/`
— delete the existing repo via the Git-Backup dialog first.

## When to pick which mode

- **Start fresh**: Most imports. Bibliogon tracks the book
  from scratch in git-backup.
- **Adopt without remote**: You want the history but the
  source's remote is private, dead, or you'll re-point to a
  new remote yourself.
- **Adopt with remote**: You import a book straight from
  GitHub/GitLab and want Bibliogon to keep pushing there.
  You'll need a PAT (re-entered via Git-Backup dialog).

## Edge cases

- **Shallow clone**: adopted as-is. Push may be rejected by
  some remotes; unshallow via `git fetch --unshallow` in the
  repo if needed.
- **Git LFS pointers**: `.gitattributes` with `filter=lfs` is
  flagged in the security warnings. LFS content is NOT
  fetched; pointer files appear as broken image references
  in chapters.
- **Submodules**: `.gitmodules` is flagged. Submodule content
  is not fetched in this MVP.
- **Corrupted source**: `git fsck` runs after sanitization.
  A corrupted source is rejected with a clear error; nothing
  is written to your book's uploads directory.
