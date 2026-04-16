# Add Windows uninstall documentation

## Context

User has successfully tested install.sh on Windows. Now needs a 
clean uninstall procedure for:
1. Repeat smoke testing (fresh environment each time)
2. Users who want to remove Bibliogon from their system

## Create: docs/help/en/uninstall.md

Complete uninstall guide covering:
- Stopping the running stack
- Removing Docker volumes (with explicit user data warning)
- Removing Docker images (optional, for full cleanup)
- Removing the repo directory
- Removing launcher config at `%APPDATA%\Bibliogon`
- Verification that cleanup is complete

Match the DE version `docs/help/de/uninstall.md` with same content. 
Content must mention that this removes all books and chapters, so 
users should export important data first.

### Suggested uninstall steps content

**Step 1: Stop Bibliogon**

Open Git Bash, navigate to the Bibliogon directory:

```bash
cd ~/bibliogon
```

Stop the stack and remove containers:

```bash
docker compose -f docker-compose.prod.yml down
```

**Step 2: Delete Docker volumes (user data)**

Bibliogon stores books and settings in Docker volumes. These 
must be deleted separately, otherwise they persist across 
installations.

List all Bibliogon volumes:

```bash
docker volume ls | grep bibliogon
```

Delete them explicitly:

```bash
docker volume rm bibliogon_postgres_data
docker volume rm bibliogon_uploads
```

The exact volume names vary based on docker-compose configuration. 
If these don't exist, check the list from the previous command.

**Step 3: Delete Docker images (optional)**

For a fully clean test with complete rebuild:

```bash
docker images | grep bibliogon
docker image rm bibliogon-backend bibliogon-frontend
```

**Step 4: Delete Bibliogon directory**

```bash
rm -rf ~/bibliogon
```

In Git Bash, this corresponds to the Windows path 
`C:\Users\[YourName]\bibliogon`.

**Step 5: Delete launcher config (if used)**

If you used the launcher, also delete its configuration. In 
Git Bash:

```bash
rm -rf "$APPDATA/Bibliogon"
```

Or in PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\Bibliogon"
```

**Step 6: Verification**

Verify everything is gone:

```bash
# No directory
ls ~/bibliogon
# Should say: No such file or directory

# No containers
docker ps -a | grep bibliogon
# Should be empty

# No volumes
docker volume ls | grep bibliogon
# Should be empty

# No images (if deleted in step 3)
docker images | grep bibliogon
# Should be empty
```

When everything is empty, Bibliogon is cleanly uninstalled.

**Step 7: Test reinstallation**

For fresh install:

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

## Create: docs/manual-tests/windows-clean-uninstall.md

Short reference document for smoke test prerequisites. Links to 
the user uninstall guide but focuses on the testing use case:

- Why clean uninstall matters for tests (no leftover state)
- Exact sequence for reproducible test environment
- Verification commands to confirm clean state
- Link to the user-facing uninstall guide for detailed steps

## Update: docs/manual-tests/d01-launcher-smoke-test.md

Add a "Prerequisites" section that references the clean uninstall 
document. Make it clear that smoke tests should start from a 
clean state.

## Content requirements

Uninstall steps must cover:

1. `docker compose down` (stop stack)
2. `docker volume rm` for bibliogon volumes (remove user data)
3. `docker image rm` (optional, full cleanup)
4. `rm -rf ~/bibliogon` (remove code)
5. `rm -rf $APPDATA/Bibliogon` (remove launcher config)
6. Verification commands

For the user help version (`docs/help/en/uninstall.md`):
- Warning about data loss
- Recommendation to export books first
- Non-technical language where possible
- Both Git Bash and PowerShell variants for commands

For the smoke test version (`docs/manual-tests/`):
- Technical language acceptable
- Emphasis on reproducible state
- Why each step matters for tests

## Optional: alternative test strategy

Also document the "parallel instance" approach for tests that 
don't require full clean state:

Multiple Bibliogon instances can run in parallel by using 
different directories and ports:

```bash
# Test instance in separate directory
cd ~/bibliogon-test
# .env with BIBLIOGON_PORT=7881 (not 7880 for production)
docker compose -f docker-compose.prod.yml up -d
```

This runs alongside a production Bibliogon instance on port 7880. 
Useful for testing without risking production data.

But for true smoke tests from zero state, full uninstall is the 
more honest option. Then you know you're really testing the "nothing 
installed, install from scratch" user path.

Note this in the smoke test doc as an alternative but recommend 
full uninstall for release-blocking smoke tests.

## i18n

`docs/help/en/uninstall.md` and `docs/help/de/uninstall.md` must 
be in sync. German uses real umlauts (ä, ö, ü, ß).

## Update navigation

Add `uninstall.md` to `docs/help/_meta.yaml` in both languages so 
it's accessible from the help site.

## Commit plan

1. `docs(help): add Windows uninstall guide (EN + DE)`
2. `docs(manual-tests): add clean uninstall reference for smoke tests`
3. `docs(manual-tests): update d01 smoke test with prerequisites 
    section`

Each commit individually focused. No implementation code changes, 
purely documentation.

## Scope

Windows only for this iteration. macOS and Linux uninstall guides 
come later when D-02 and D-03 launchers exist. For now, install.sh 
is the primary Linux/Mac path and its uninstall is different 
(simpler: just `docker compose down` plus `rm -rf directory`).

## Closing checklist

- [ ] docs/help/en/uninstall.md created with all 7 steps
- [ ] docs/help/de/uninstall.md matches EN content with real umlauts
- [ ] docs/manual-tests/windows-clean-uninstall.md created as 
      test reference
- [ ] docs/manual-tests/d01-launcher-smoke-test.md updated with 
      prerequisites section pointing to uninstall reference
- [ ] docs/help/_meta.yaml updated in EN and DE to include 
      uninstall entry
- [ ] No dead links or missing cross-references
- [ ] Alternative "parallel instance" approach mentioned where 
      appropriate
