# Dev-database isolation for agents

Aster runs a live dev instance (`make dev`) against a real library: 43
imported books, their chapters, assets and import history. An agent working
on a feature branch must not change that database.

## The failure this rule exists for

While #782 was being built, the live dev database was migrated to a revision
that only existed on the feature branch. Nobody ran alembic. The sequence was:

1. The agent edited `backend/app/models/__init__.py` on its branch.
2. Aster's `make dev` server shared that working tree, so uvicorn's reloader
   picked up the change.
3. The FastAPI lifespan calls `init_db()`, which runs `alembic upgrade head`.
4. The branch migration applied to the live database.

No data was lost, but a restart on plain `develop` would have failed with
"Can't locate revision". **A schema edit in a shared checkout migrates the
running instance whether or not you invoke a migration tool.**

## The rules

1. **Schema work happens in a git worktree.** A separate checkout is the only
   thing that stops the shared reloader from seeing your models. Parallel
   sessions already use `.claude/worktrees/`; schema-touching work belongs
   there for this reason too.

2. **Agent-run commands target an agent copy, never the live directory.**

   ```bash
   make agent-db            # clone the live database into .agent-data/
   make agent-db FORCE=1    # refresh it
   ```

   The tool prints the env line to use. `BIBLIOGON_DATA_DIR` overrides both the
   database path and the upload directory:

   ```bash
   BIBLIOGON_DATA_DIR=<repo>/.agent-data poetry run alembic upgrade head
   BIBLIOGON_DATA_DIR=<repo>/.agent-data poetry run python ../scripts/<script>.py
   ```

   The copy goes through SQLite's backup API, so it is safe to take while the
   server holds the file open with a WAL. Copying the `.db` file alone loses
   every committed-but-uncheckpointed row - that is how a "backup" ended up
   three books short during the #762 work.

3. **Migrations reach the live database only after the branch is merged to
   `develop`.** Then Aster's next restart applies a revision that exists in the
   history everyone shares.

4. **A repair or import script that writes user data runs against the copy
   first**, and against the live instance only after Aster says so. Report the
   dry-run numbers from the copy before asking.

## Which directory is live?

Not necessarily `~/.local/share/bibliogon`. A snap-confined editor sets
`XDG_DATA_HOME`, so a dev server started from it writes to
`~/snap/code/<rev>/.local/share/bibliogon` instead. Resolve it rather than
assume it:

```bash
python3 -c "import sys; sys.path.insert(0, 'backend'); from app.paths import get_data_dir; print(get_data_dir())"
```

`scripts/agent_db_snapshot.py` resolves it the same way and refuses to write
anywhere inside it.

## Test runs are already isolated

`backend/tests/conftest.py` sets `BIBLIOGON_TEST=1` plus a tmp
`BIBLIOGON_DATA_DIR` before any `app.*` import, and a production marker file
aborts the run if a test ever sees real data. That covers pytest. It does NOT
cover a reloading dev server, a hand-run script, or a bare `python -c` - which
is what this rule is for. See the lessons-learned entry "Test-isolation
discipline: never run integration smoke-tests outside pytest".
