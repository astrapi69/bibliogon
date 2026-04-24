# Import from a git URL

Bibliogon can clone a public git repository that follows the
[write-book-template](https://github.com/astrapi69/write-book-template)
structure and import it as a new book.

## How to use it

1. Open the import wizard from the dashboard.
2. Paste the repository URL in the "Import from a git URL"
   field at the top of Step 1.
3. Click **Clone + Import**.

Bibliogon clones the repository into a temporary staging
directory, runs the usual format detection, shows you a
preview panel, and imports on confirm.

## Accepted URL shapes

- `https://github.com/user/repo`
- `https://github.com/user/repo.git`
- `git@github.com:user/repo.git`
- `ssh://git@host/user/repo.git`

## What is out of scope today

The first release of plugin-git-sync covers import-only for
**public** repositories. The following are deferred:

- Authentication for private repositories (basic HTTPS, SSH
  keys, GitHub tokens).
- Selecting a branch or tag — the default branch is cloned.
- Shallow clones for large repositories.
- Git LFS handling.
- Pushing Bibliogon edits back to the repository ("sync-back").
- Smart-merge when re-importing a repository that has changed
  since the last import.

## What happens if the clone fails

The wizard stops on the error step and shows the git error
message. Typical causes:

- Typo in the URL.
- The repository does not exist or is private.
- Network is unreachable.
- The remote took longer than 120 seconds (timeout).

Fix the cause and click **Retry**.

## What happens if the cloned repository is not a book

If the repository exists but does not match the
write-book-template structure (no `config/metadata.yaml`, no
`manuscript/` directory), the import proceeds via the generic
folder importer. The resulting book may be empty. Delete it
from the trash and try a different URL.

## Related

- [Git backup](../git-backup/) — the core feature that versions
  a book you are editing in Bibliogon. Orthogonal to git URL
  import: one pulls a book in, the other tracks changes to one
  that is already in Bibliogon.
