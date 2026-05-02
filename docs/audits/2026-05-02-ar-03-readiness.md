# AR-03+ Readiness Audit

**Date:** 2026-05-02
**Scope:** Article authoring → platform-API commitment readiness
**Outcome:** Archived as "investigated and deferred". Re-open when cross-posting cadence justifies a fresh audit.

## Context

AR-02 architecture decision resolved as Option B (separate `Article`
entity). Phases 1 + 2 shipped (CRUD + Publications + drift detection
+ editor parity). AR-03+ Phase 3 candidates: OAuth, scheduled
publish, analytics, automated cross-posting for Medium / Substack /
X / LinkedIn / dev.to / Mastodon / Bluesky.

The exploration document
([docs/explorations/article-authoring.md](../explorations/article-authoring.md))
gates AR-03+ on the AR-01 validation log
([docs/journal/article-workflow-observations.md](../journal/article-workflow-observations.md))
reaching 3-5 real cross-posting entries. Without this data the
scoping decision (which 1-2 platforms to ship first) is a guess
about a use case not yet understood.

## State at audit time

- AR-01 validation log: **0 real entries.** Template fixture +
  section markers only.
- An earlier "UNBLOCKED 2026-05-02" reading came from a buggy
  `make check-blockers` heuristic that counted template fixtures and
  section headers as observations. Heuristic fixed in `9da4f94`
  same session.
- Platform schemas (8 entries) all pin `publishing_method: "manual"`
  per AR-02 scope. No `"api"` entry. No OAuth scaffolding. No
  platform SDKs in `backend/pyproject.toml`.
- Existing infrastructure that AR-03+ would build on:
  `app/services/platform_schema.py` (lru-cached YAML loader),
  `app/job_store.py` (SSE + scheduled jobs already used by
  audiobook + AI review), `app/credential_store.py` (Fernet-encrypted
  per-key store, used for git PATs).

## Verification commands

```bash
poetry run pytest tests/test_articles.py tests/test_publications.py tests/test_backup_articles.py --collect-only -q
grep -rn "OAuth\|access_token\|client_id" backend/app/ frontend/src
bash scripts/check-blockers.sh
```

## Findings

### 1. Test Validity

| File:Line | Type | Reason | Recommended action | Priority |
|-----------|------|--------|--------------------|----------|
| `backend/tests/test_articles.py` + `test_publications.py` + `test_backup_articles.py` | Info | 63 tests collected. Article CRUD, Publication mark-published / verify-live / drift, backup-article roundtrip, platform schema endpoint + permissive fall-through. | Keep. | P3 |
| Frontend `Publication*` Vitest | [TBD] | Coverage location not surveyed in this audit. | When next AR-03+ scoping happens, run `find frontend/src -name "*Publication*"` to confirm `AddPublicationModal` + `PublicationsPanel` Vitest exists. | P2 |
| Platform schema permissiveness | Info | `test_platform_schemas_unknown_platform_falls_through_to_permissive` covers the catch-all. Important regression pin once new platforms get added. | Keep. | P3 |
| AR-03 platform-API integration tests | [TBD] | None exist (AR-03+ not started). | Defer until scoping picks 1-2 platforms. | P3 |

### 2. Code Quality and Technical Debt

| File:Line | Type | Reason | Recommended action | Priority |
|-----------|------|--------|--------------------|----------|
| `backend/app/data/platform_schemas.yaml:19` | Info | `publishing_method: "manual"` hardcoded for all 8 platforms per AR-02 scope. Schema field is enum-ready (`"manual" or "api"`). | Keep. AR-03+ first-platform implementation flips ONE entry to `"api"` + defines the auth shape inline. No premature abstraction. | P3 |
| `backend/app/services/platform_schema.py` | Info | Compliant with code-hygiene patterns. | None. | P3 |
| `backend/app/routers/publications.py` | [TBD] | Not read in this audit. | Spot-check that it raises typed `BibliogonError` subclasses (post-`543d9eb` migration), not `HTTPException`. | P2 |
| OAuth credential storage | Improvement | No `oauth\|access_token\|client_id` references in `backend/app/` or `frontend/src/`. AR-03+ requires per-platform OAuth tokens. | Defer until first-platform pick. Extend `credential_store.py` (the same module that hosts git PATs per PGS-02 follow-up) rather than creating a new module. | P3 (deferred) |
| Background job infrastructure | Improvement | `backend/app/job_store.py` + `/api/export/jobs/*` SSE pipeline already exists. AR-03+ scheduled-publish jobs can reuse it. | Document in scoping doc: scheduled publishing piggybacks on `JobStore`, NOT a new APScheduler / Celery dependency. | P3 (deferred) |

### 3. Infrastructure and Dependencies

| File:Line | Type | Reason | Recommended action | Priority |
|-----------|------|--------|--------------------|----------|
| Platform-API SDKs in `backend/pyproject.toml` | Info | None present. Medium API deprecated for new apps; Substack publishing API requires paid partner approval. Mastodon + Bluesky have public APIs. | Add the SDK only when the first platform is picked. Stability filter per `release-workflow.md` Step 4b: minimum 2 weeks since release for any new pin. | P3 (deferred) |
| OAuth env vars in `.env.example` | Improvement | No `BIBLIOGON_*_CLIENT_ID` / `_CLIENT_SECRET` placeholders. | Add stubs alongside the first-platform implementation. Three-layer secrets chain. NEVER commit a real client secret. | P3 (deferred) |
| Rate-limit infrastructure | [TBD] | No rate-limiting middleware visible in `backend/app/main.py`. | Audit `main.py` middleware stack during AR-03+ scoping. Likely needs `slowapi` or in-process token bucket. | P3 (deferred) |
| Test fixtures for paid APIs | Info | Existing pattern for paid APIs (ElevenLabs DEP-05) is "real-API-only verification, deferred". Same applies to Medium/Substack APIs. | Document in scoping doc: paid platform APIs follow the DEP-05 deferred-session pattern. | P3 |

### 4. Documentation and Structure

| File:Line | Type | Reason | Recommended action | Priority |
|-----------|------|--------|--------------------|----------|
| `docs/journal/article-workflow-observations.md` | **Blocker** | **0 real article entries.** AR-03+ cannot proceed without this data per the exploration's Section 13 triggers. | Not actionable by code. User must publish articles + log per-step time + friction. Alternative: archive AR-03+. | **P0** |
| `docs/explorations/article-authoring.md` Section 13 triggers | Info | Three triggers gate the commitment: #1 (>= 2 articles/month sustained 3 months), #2 (> 2h cross-post per article), #3 [TBD - not fully read in this audit]. | Re-read Section 13 before declaring AR-03+ unblocked. The 3-5-entry threshold is necessary but possibly NOT sufficient. | P1 |
| Platform priority signals | Outdated | Section 8 lists 7 platforms without ranking. AR-03+ MUST ship 1-2 first, not all. | Once log fills: write "Top 2 platforms by per-article time spent in the log." | P3 (deferred) |

## Decision

**AR-03+ archived as "investigated and deferred"** per the
exploration's Section 11 escape hatch.

Reason: the validation log shows zero cross-posting activity at the
audit point. Without that data the scoping is a guess. Holding
AR-03+ open as "next priority" pretends the gate is about to lift
when it isn't.

## Re-open conditions

Re-open AR-03+ and re-run this audit when **any** of:

1. **AR-01 log threshold met.**
   `bash scripts/check-blockers.sh` reports
   `[UNBLOCKED] AR-01 log has N entries (>= 3 needed)` (with the
   bugfixed counter from `9da4f94` — numeric-prefixed entries inside
   the "Observation log" section only).
2. **Cross-posting cadence trigger.** Per Section 13 of the
   exploration: >= 2 articles/month sustained over 3 months.
3. **External demand.** A user / contributor opens a GitHub issue
   asking for cross-post automation and provides their own
   per-article time data.

## Halt list (no auto-action)

| Item | Reason |
|------|--------|
| AR-03+ scoping session | AR-01 log empty. |
| Platform-API SDK pinning | Premature until first platform picked. |
| OAuth credential-store extension | Same. |
| `slowapi` or scheduler dependencies | Wait. |

## References

- Exploration: [docs/explorations/article-authoring.md](../explorations/article-authoring.md)
- Editor-parity audit: [docs/explorations/article-editor-parity.md](../explorations/article-editor-parity.md)
- Validation log: [docs/journal/article-workflow-observations.md](../journal/article-workflow-observations.md)
- Block-status script: [scripts/check-blockers.sh](../../scripts/check-blockers.sh)
- Audit prompt template: [.claude/prompts/audit.md](../../.claude/prompts/audit.md)
