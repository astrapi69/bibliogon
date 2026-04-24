# E2E fixtures

Binary/text fixtures consumed by the Playwright smoke specs.
Keep this directory small; reviewers need to understand each
byte on disk.

## minimal-book.bgb

Minimum valid Bibliogon backup archive: one book with one
chapter, no assets. Used by `smoke/import-wizard-bgb.spec.ts`.

Regenerate with:

```bash
python3 e2e/fixtures/regen_minimal_bgb.py
```

The generator script is committed alongside so the fixture is
reproducible without a Bibliogon backend running.
