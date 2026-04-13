# Multi-User and SaaS Deployment

Status: Long-term exploration, not committed.
Last updated: 2026-04-13

## Context

Bibliogon is currently single-user, offline-first, self-hosted.
This exploration considers whether and how multi-user capability
and SaaS deployment could eventually fit.

This is not a near-term plan. The offline-first single-user
commitment is real and takes precedence.

## Original roadmap items (preserved for reference)

- P-12: user registration and authentication
- P-13: PostgreSQL instead of SQLite
- P-14: pen-name management per user (not global)
- P-15: plugin marketplace
- P-16: Stripe integration

## Tension with current positioning

Bibliogon's core value propositions:
- Offline-first (no cloud dependency)
- Data sovereignty (your manuscripts on your machine)
- No accounts, no logins, no tracking
- Donation-based, not subscription-based
- Free plugins, no paywalls

SaaS fundamentally contradicts most of these. Any SaaS deployment
must preserve the self-hosted path as equal-tier, not relegate it
to "community edition" status.

## What would be required

Technical work:
- Authentication and authorization system (users, sessions, tokens)
- Tenant isolation in the data model (multi-tenancy in SQLite is
  awkward; likely needs PostgreSQL migration)
- Permission model (owners, collaborators, readers)
- Collaboration features (who's editing what, real-time sync or
  lock-based)
- Billing integration if monetized (Stripe, Paddle, or similar)
- GDPR compliance at scale (data deletion, export, consent)
- Incident response and SLA commitments
- Backup and disaster recovery infrastructure
- Support infrastructure (ticketing, documentation, SLAs)

Operational work:
- Server infrastructure (likely 3x production redundancy minimum)
- Monitoring and alerting
- 24/7 incident response or paid third-party support
- Legal framework (Terms of Service, Privacy Policy, DPA)
- Customer service capacity

This is larger than all work done to date combined.

## Alternative paths that preserve values

Before jumping to SaaS, consider:

1. **Enhanced self-hosting.** Make Bibliogon trivially easy to
   self-host for a small team (family members, writing partners).
   Docker Compose with clear multi-user setup instructions. No
   central SaaS, but multi-user within a household or writing group.

2. **Sync layer that respects sovereignty.** Optional encrypted
   sync between user's own devices (laptop + desktop + phone).
   No third-party server needed, maybe using Syncthing or similar.
   Multi-device without multi-user.

3. **Collaboration via federation.** If multi-user is needed,
   consider federated model rather than centralized SaaS. Users
   run their own instances that can communicate. Harder to build
   but preserves sovereignty.

4. **Publishing-only SaaS.** Instead of full collaborative SaaS,
   offer a minimal service for publishing: upload finished book,
   service generates publishing-ready artifacts for multiple
   platforms (KDP, Apple Books, Kobo). No writing, no manuscripts
   on the server, just publishing automation.

## Triggers for reconsidering

Revisit SaaS planning when:

- User base exceeds 5000 active users consistently
- Multiple specific users have requested multi-user features with
  clear use cases (not just "it would be nice")
- A sustainable funding model is in place that doesn't rely on
  SaaS subscription revenue
- The Bibliogon single-user product is feature-complete and stable
  enough that SaaS wouldn't distract from core development

Without several of these conditions, stay on single-user
self-hosted.

## What v1.0.0 should mean

v1.0.0 should be reached when:
- Feature set for single-user case is complete (desktop packaging,
  plugin ecosystem, full export pipeline, comprehensive docs)
- Test coverage is at or near the 85-95% target across the pyramid
- Documentation is accessible to non-technical writers
- At least one year of community use with no major stability issues

v1.0.0 does NOT require multi-user or SaaS.

## Related

- docs/explorations/monetization.md (similar "not now" pattern)
- docs/explorations/desktop-packaging.md (enables better
  self-hosting without SaaS)
- CONCEPT.md (current single-user architecture)
