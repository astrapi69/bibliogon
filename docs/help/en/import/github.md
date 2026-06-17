# Import from GitHub

Bibliogon can import files directly from a GitHub repository
without any Git install. The import runs entirely in the browser
through the public GitHub REST API, so it works the same way in
the backendless web app (GitHub Pages) and in the desktop app.

## How to use it

1. Open the import dialog (the **Import** button on the dashboard
   or in the article list).
2. Switch to the **From GitHub** tab.
3. Paste the repository URL, e.g.
   `https://github.com/user/my-book`, and click **Load**.
4. Browse the folders and tick the files you want to import.
5. Click **Import**.

## Accepted URL forms

- `https://github.com/user/repo`
- `https://github.com/user/repo/tree/main/subfolder`
- `user/repo` (shorthand)

## What gets imported

- A single Markdown file becomes a chapter (or a new book).
- Several selected Markdown files are grouped into one book with
  multiple chapters.
- `.bgb` and JSON backups run through the backup importer.
- A Medium ZIP runs through the Medium importer.

## Private repositories and the rate limit

Without a token GitHub allows 60 requests per hour. For private
repositories or a higher limit (5000 requests per hour), add a
GitHub personal access token under **Private repo? Add a token**.
The token is stored locally in the browser only and is sent only
to GitHub.

## Offline

GitHub import needs an internet connection. With no network the
tab is disabled and shows a notice.

## Related topics

- [Import from a Git URL](git-url.md) — the desktop variant via a
  real git clone.
- [Import from a URL](url.md) — a single file from any address.
