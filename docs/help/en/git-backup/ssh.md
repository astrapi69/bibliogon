# Git Backup: SSH Keys

SSH is an alternative to HTTPS authentication for git. Instead of a Personal Access Token you use a cryptographic key you set up once.

Advantages over HTTPS+PAT:
- No token expiry, no regular renewal.
- No password prompt on every push/pull.
- Works with hosts that don't support HTTPS.

Disadvantages:
- One-time setup cost.
- The public key must be added to every host.
- The private key must never be shared.

Bibliogon generates **one keypair per install** (not per book). The same key serves every SSH remote.

## Generate a key in Bibliogon

1. Open **Settings > General**.
2. Find the **SSH Key for Git** section.
3. Optional: enter a **comment** (e.g. `bibliogon-aster-laptop`). It shows up in the host UI as the key label.
4. Click **Generate key**.

Bibliogon generates an Ed25519 keypair in OpenSSH format. The private half lives at `config/ssh/id_ed25519` with mode `0600`; the public at `config/ssh/id_ed25519.pub` with `0644`.

After generation the public key appears in a read-only textarea. It has the shape:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your-comment
```

Use **Copy public key** to put it on the clipboard.

## Add the public key at your host

### GitHub

1. [github.com/settings/keys](https://github.com/settings/keys) → **New SSH key**.
2. **Title**: something recognisable, e.g. "Bibliogon (work)".
3. **Key type**: `Authentication Key`.
4. **Key**: paste from clipboard.
5. **Add SSH key**.

### GitLab

1. **Preferences** → **SSH Keys** → new key.
2. **Key**: paste.
3. **Title**: e.g. "Bibliogon".
4. Optionally set **Expires at**.
5. **Add key**.

### Gitea / self-hosted

Account settings → SSH / GPG Keys → Add Key.

## Use the SSH URL

Instead of the HTTPS URL, configure the SSH variant in the book's remote:

- GitHub: `git@github.com:your-user/my-book.git`
- GitLab: `git@gitlab.com:your-user/my-book.git`
- Gitea: `git@gitea.example.com:your-user/my-book.git`

1. Open **Git Backup**, **Edit remote**.
2. Change the **Remote URL** to the SSH form.
3. **Leave the PAT field empty** — for SSH URLs the token is ignored. You can keep a stored PAT or clear it by saving with an empty field if you no longer plan to use HTTPS.
4. **Save**.

On the next push/pull Bibliogon uses the SSH key automatically — no extra input needed.

## Security

- **Private key stays local.** `config/ssh/id_ed25519` is never transmitted, copied, or shared. Whoever gets it can act as you on every repo that trusts the public key.
- **0600 permissions are mandatory.** OpenSSH refuses private keys with looser perms. Bibliogon sets the perms for you.
- **Regenerate rather than copy.** New machine? Prefer generating a fresh key per install and removing the old one.
- **Comments identify the key.** The comment isn't secret but makes cleanup easier: if your host UI shows ten keys and you can't tell which goes with which device, good comments help.

## Switch from HTTPS to SSH

1. Generate the key in Bibliogon (see above).
2. Add the public half at your host.
3. In the book's Git dialog, **Edit remote** → change the URL to SSH form.
4. Push — Bibliogon now uses SSH.

The old PAT stays stored encrypted in case you want to switch back. To remove: **Delete remote** in Bibliogon, then re-configure with the SSH URL only (no PAT).

## Troubleshooting

**"Permission denied (publickey)."**
The public key isn't registered at the host, or is registered to a different account. Check the host UI to verify the key is there and attached to the right user.

**"Host key verification failed."**
First contact with a host. Bibliogon accepts unknown hosts once (`StrictHostKeyChecking=accept-new`) and pins the fingerprint for subsequent connections. If this error appears for a known host, it could indicate a man-in-the-middle attack — don't ignore it.

**Lost SSH key.**
Private key missing (Bibliogon reinstalled, home directory deleted, etc.): open **Settings > SSH Key** in Bibliogon, generate a new key, confirm **overwrite**. Remove the old public key from the host, add the new one.
