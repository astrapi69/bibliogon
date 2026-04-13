# Monetization Strategy

Status: Deferred. Currently donations-based only.
Last updated: 2026-04-13

## Current state

All plugins are free. Licensing infrastructure exists in the backend
but is disabled via `LICENSING_ENABLED = False` in `backend/app/licensing.py`.
The Licenses tab in Settings has been removed. Premium badges and upgrade
prompts are gone from the UI. The `/api/licenses` endpoints return HTTP 410.

Donations are the only active monetization path.

## Why donations first

For a project in early adoption phase, donations are a better fit
than freemium:

- User-friendly: "I pay because I want to support this" is a
  healthier dynamic than "I pay because I can't access features
  otherwise"
- Lower friction for early adopters who are evaluating the tool
- Appropriate for a German-speaking audience that tends to be
  skeptical of subscription and freemium models
- Simple to implement and manage without billing infrastructure

Donations are not a long-term solution for sustainable development
funding, but they cover a relevant development phase.

## Triggers for reconsidering paid plugins

Reactivate plugin licensing when all of these conditions are met:

1. Active user base exceeds 500 users
2. At least one premium-worthy feature has stabilized
3. Support infrastructure exists to handle paying customers
4. Donation income clearly insufficient to sustain development

Without all four, stay on donations.

## Technical steps for reactivation

When reactivation time comes, the following work is needed:

### Backend
- Set `LICENSING_ENABLED = True` in `backend/app/licensing.py`
- Verify `/api/licenses/*` endpoints return real data instead of 410

### Plugin configs
- Change premium plugins (audiobook, translation, grammar, kdp,
  kinderbuch) back to `license_tier = "premium"` in plugin.py
- Update plugin YAML configs and manifests to reflect premium status

### Frontend
- Restore Licenses tab in Settings (revert the removal from Settings.tsx)
- Re-enable premium badges in PluginCard
- Restore "license required" buttons and upgrade prompts for
  premium plugins
- Add license activation flow UI

### Documentation
- Recreate `docs/help/de/plugins/lizenzen.md`
- Recreate `docs/help/en/plugins/lizenzen.md`
- Update `_meta.yaml` navigation to include the Licenses entry
- Update CLAUDE.md to reference the active licensing system
- Update CONCEPT.md with freemium architecture section

### Testing
- Adjust tests that currently assume free access
- Verify license enforcement blocks unlicensed premium plugins
- Run full license API test suite with `LICENSING_ENABLED = True`

This is a multi-session reactivation, not a one-commit change.

## Open questions

Before committing to the paid plugins path:

- Which specific plugins would be premium? Same list as before,
  or different?
- Pricing model: one-time purchase, yearly subscription, or
  something else?
- Trial period: how long, and what features included?
- Payment processing: which provider, given DSGVO constraints?
- Refund policy and support expectations

## Related

- Licensing infrastructure: `backend/app/licensing.py`
- License API endpoints (dormant): `backend/app/routers/licenses.py`
- License tests: `backend/tests/test_license_api.py`, `backend/tests/test_license_tiers.py`
- Similar exploration: `docs/explorations/desktop-packaging.md`
