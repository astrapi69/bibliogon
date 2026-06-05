# Documentation deploy (cross-repo to bibliogondocs)

The Bibliogon **app** and the **documentation** are published to two
different GitHub Pages sites, because a GitHub Pages *project* site is
always served at `https://<user>.github.io/<repo-name>/` - the path
segment is the repo name and cannot be chosen independently.

| What | Repo | Pages source | URL |
|------|------|--------------|-----|
| Frontend app | `astrapi69/bibliogon` | GitHub Actions (`deploy-pages.yml`) | `https://astrapi69.github.io/bibliogon/` |
| Documentation | `astrapi69/bibliogondocs` | `gh-pages` branch | `https://astrapi69.github.io/bibliogondocs/` |

The documentation **content stays in `bibliogon`** (`docs/help/` is the
single source of truth, also read by the in-app Help plugin). The
`deploy-docs.yml` workflow builds the MkDocs site here and **pushes the
built output** to the `gh-pages` branch of `bibliogondocs`. The
`bibliogondocs` repo holds no source - only the generated site.

Authentication is an **SSH deploy key**: the private key lives as a
secret in `bibliogon`; the matching public key is a write-enabled deploy
key on `bibliogondocs`.

## One-time setup

### 1. Generate an SSH key pair

On any machine (the key never needs to leave it except as described):

```bash
ssh-keygen -t ed25519 -C "bibliogon-docs-deploy" -f bibliogondocs_deploy -N ""
```

This writes two files in the current directory:

- `bibliogondocs_deploy` - the **private** key
- `bibliogondocs_deploy.pub` - the **public** key

### 2. Add the PUBLIC key as a Deploy Key on `bibliogondocs`

1. Go to `https://github.com/astrapi69/bibliogondocs/settings/keys`.
2. Click **Add deploy key**.
3. Title: `bibliogon docs deploy`.
4. Key: paste the contents of `bibliogondocs_deploy.pub`.
5. **Check "Allow write access".** (Required - the workflow pushes.)
6. Click **Add key**.

### 3. Add the PRIVATE key as a secret on `bibliogon`

1. Go to `https://github.com/astrapi69/bibliogon/settings/secrets/actions`.
2. Click **New repository secret**.
3. Name: `DOCS_DEPLOY_KEY` (exact - the workflow reads this name).
4. Value: paste the **entire** contents of the private key file
   `bibliogondocs_deploy`, including the
   `-----BEGIN OPENSSH PRIVATE KEY-----` and
   `-----END OPENSSH PRIVATE KEY-----` lines.
5. Click **Add secret**.

Then delete the local key files - they are no longer needed:

```bash
rm bibliogondocs_deploy bibliogondocs_deploy.pub
```

### 4. First deploy

Trigger `deploy-docs.yml` once manually to create the `gh-pages` branch
on `bibliogondocs`:

- `https://github.com/astrapi69/bibliogon/actions/workflows/deploy-docs.yml`
  -> **Run workflow** -> branch `main` -> **Run workflow**.

(Or just push any change under `docs/help/` to `main`.)

### 5. Enable Pages on `bibliogondocs`

After the first successful deploy creates the `gh-pages` branch:

1. Go to `https://github.com/astrapi69/bibliogondocs/settings/pages`.
2. **Build and deployment -> Source: Deploy from a branch.**
3. Branch: `gh-pages`, folder `/ (root)`. Save.
4. After a minute the docs are live at
   `https://astrapi69.github.io/bibliogondocs/`.

### 6. Confirm Pages on `bibliogon` is "GitHub Actions"

The app deploy (`deploy-pages.yml`) needs this repo's Pages source set
to **GitHub Actions** (it already is, from the previous docs deploy):

1. `https://github.com/astrapi69/bibliogon/settings/pages`.
2. **Build and deployment -> Source: GitHub Actions.**

## How it runs after setup

- **`deploy-docs.yml`** (this repo) runs on pushes to `main` that touch
  `docs/help/**`, `mkdocs.yml`, or the nav generator, and on manual
  dispatch. It builds the MkDocs site and pushes it to
  `bibliogondocs:gh-pages`.
- **`deploy-pages.yml`** (this repo) runs on pushes to `main` that touch
  `frontend/**`, and on manual dispatch. It builds the SPA (base
  `/bibliogon/`, offline Dexie storage) and deploys it to this repo's
  Pages site.

The two are independent (distinct concurrency groups), so a docs change
and an app change never block each other.

## Ordering note (avoid an empty docs URL)

Before merging the deploy changes to `main`, make sure steps 1-5 above
are done so `https://astrapi69.github.io/bibliogondocs/` is already live.
That way the docs URL is never empty during the switch from the old
single-repo docs deploy to the new split layout.

## Merge order: mobile-sync storage first, then this deploy branch

The app deploy (`deploy-pages.yml`) builds the SPA with
`VITE_STORAGE_MODE=dexie` - a standalone offline PWA with no backend at
the GitHub Pages origin. That offline storage backend is provided by the
mobile-sync storage layer (`frontend/src/storage/`, branch
`feature/mobile-sync-phase2`). Until that layer is on `main`, the
GitHub-Pages app is a non-functional shell (no backend, no offline
store).

Therefore the merge order is fixed:

1. **mobile-sync storage layer reaches `main`** first.
2. **This deploy branch (`feature/ccw-ghpages-deploy`) is rebased onto
   `main`** afterwards, and the offline flow is validated end-to-end
   (the offline E2E smoke under `e2e/smoke/`) before/at merge.

Do NOT merge this deploy branch ahead of the storage layer. LAN sync
from the GitHub-Pages PWA to a desktop is deliberately out of scope here
(blocked by HTTPS->HTTP mixed content); it is tracked as
`MOBILE-LAN-SYNC-01` in the backlog.
