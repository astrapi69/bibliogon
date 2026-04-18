## ROADMAP.md integration

Two changes to `docs/ROADMAP.md`:

---

### Change 1: Add new theme in "Themes for Phase 2"

Insert after section `### 4. Git-based backup` (before the
`---` separator that precedes `Maintenance and tech debt`):

```markdown
### 5. Donation integration (priority: after stability)

Users can support the project. Prompts are subtle, respectful,
without dark patterns. Donation state stored locally, no tracking.

See [docs/explorations/donations-ux.md](explorations/donations-ux.md)
for the full strategy document.

- [ ] S-01: Settings section "Support Bibliogon" with project
      context and external link
- [ ] S-02: One-time onboarding hint after first book creation or
      export, with "Understood" / "Support" buttons and
      localStorage flag
- [ ] S-03: 90-day reminder banner on Dashboard with three
      dismiss paths (Support: +180 days, Not now: +90 days,
      Close: +90 days)

### Pending decisions before implementation

- Landing page URL (own domain vs. GitHub vs. both)
- Initial active donation channels (proposal: GitHub Sponsors +
  Liberapay + bank transfer)
- Landing page language (German, English, or both)
```

---

### Change 2: Add cross-reference in monetization.md

At the end of `docs/explorations/monetization.md`, update the
`## Related` section to include the new document:

```markdown
## Related

- Donation UX and implementation plan:
  `docs/explorations/donations-ux.md`
- Licensing infrastructure: `backend/app/licensing.py`
- License API endpoints (dormant): `backend/app/routers/licenses.py`
- License tests: `backend/tests/test_license_api.py`, `backend/tests/test_license_tiers.py`
- Similar exploration: `docs/explorations/desktop-packaging.md`
```

---

## Commit plan

Single commit (pure documentation, no code changes):

`docs(explorations): add donation UX strategy and S-series roadmap`

Co-Authored-By: Claude <noreply@anthropic.com>

## Closing checklist

- [ ] `docs/explorations/donations-ux.md` added
- [ ] ROADMAP.md section 5 added with S-01, S-02, S-03
- [ ] ROADMAP.md pending decisions block added
- [ ] monetization.md Related section updated with cross-reference
- [ ] No implementation code changes
- [ ] `make test` green (docs-only change, should not affect tests)
