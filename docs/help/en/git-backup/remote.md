# Git Backup: Remote

With a remote (GitHub, GitLab, Gitea, Codeberg, self-hosted) you can push local commits to a server and pull commits from it. This is how you sync a book across devices or keep an off-site backup.

Bibliogon speaks git over HTTPS with a Personal Access Token (PAT) by default. SSH is described in **Git Backup > SSH Keys**.

## Create a private repository

Before configuring Bibliogon, create an empty repository at your host.

### GitHub

1. Go to [github.com/new](https://github.com/new).
2. **Repository name**: anything (e.g. `my-book`).
3. Select **Private**. A public repo means your unpublished manuscript is world-readable.
4. **Uncheck** "Add a README file" — the repo must be empty, otherwise it collides with the first push.
5. Click **Create repository**.

The HTTPS URL is shown next (e.g. `https://github.com/your-user/my-book.git`).

### GitLab

1. [gitlab.com/projects/new](https://gitlab.com/projects/new) → **Create blank project**.
2. Enter a **Project name**, set **Visibility** to **Private**.
3. **Uncheck** "Initialize repository with a README".
4. **Create project**.

### Gitea / self-hosted

Works the same as GitHub/GitLab. Key requirement: empty repo, save the HTTPS URL.

## Create a Personal Access Token

A PAT replaces your password. It grants Bibliogon only the permissions needed for push/pull.

### GitHub

1. [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token** → **Fine-grained token**.
2. **Repository access** → **Only select repositories** → pick your book repo.
3. **Repository permissions** → **Contents: Read and write**. Nothing else.
4. Set an **Expiration** (90 days recommended).
5. Copy the token and keep it somewhere safe — it's shown only once.

### GitLab

1. **Preferences** → **Access Tokens** → new token.
2. **Scopes**: `read_repository`, `write_repository`.
3. Set an expiration.
4. Copy the token.

## Configure the remote in Bibliogon

1. Open **Git Backup** (book sidebar).
2. If no remote is configured yet: **Configure remote**.
3. **Remote URL**: the HTTPS URL from the host (e.g. `https://github.com/your-user/my-book.git`).
4. **Personal Access Token**: the token you just created.
5. **Save**.

Bibliogon encrypts the PAT with Fernet and stores it locally at `config/git_credentials/<book-id>.enc`. The token never appears in git config, commits, or API responses.

## Push and pull

**Push** uploads your local commits to the remote:

1. Open **Git Backup**.
2. Click **Push**.
3. Success toast: **Push successful**.

**Pull** fetches remote commits:

1. Open **Git Backup**.
2. Click **Pull**.
3. Three possible outcomes:
   - **Pull successful** — new remote commits are now local.
   - **Already up to date** — nothing new on the remote.
   - **Conflicts** — local and remote diverged. See **Resolving conflicts** below.

The **sync badge** (inside the dialog + dot on the sidebar button) shows the last known state: **in sync**, **ahead** (local has unpushed commits), **behind** (remote has unpulled commits), **diverged**.

## Resolving conflicts

When a push is rejected (remote has newer commits) or pull diverges, the resolution panel opens with three options:

- **Merge** — attempt a 3-way merge. Disjoint file changes on each side → automatic merge commit. Overlapping changes to the same file → per-file picker.
- **Force push (Accept Local)** — local history overwrites remote. Requires confirmation. Remote commits are lost.
- **Cancel** — no-op.

In the per-file picker, choose **Mine** or **Theirs** for each conflicted file, then **Apply resolution**. Or **Abort merge** to restore the pre-merge state.

## Best practices

- **Always use a private repo.** Public repos expose every commit to the world.
- **Never commit secrets.** `.gitignore` excludes audiobooks and exports, not API keys or passwords pasted into chapter content.
- **Rotate PATs regularly.** 90-day expiry is a good middle ground between security and convenience.
- **Think twice before force push.** If the remote is shared with others, force push destroys their work.
- **Pull before push.** Especially when working across multiple devices.

## Troubleshooting

**Authentication failed. Check the PAT.**
The PAT is wrong, expired, or lacks write permission. Create a fresh PAT, **Edit** the remote in Bibliogon, enter the new token.

**Push rejected.**
The remote has commits you don't. Either **Merge** (clean resolution) or **Force push** (only if you're sure the remote can be overwritten).

**Network error.**
No internet or host unreachable. Bibliogon keeps working locally — commit as usual, push when the connection returns.
