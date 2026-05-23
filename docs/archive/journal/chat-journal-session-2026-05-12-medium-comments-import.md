# Session journal - 2026-05-12 - MEDIUM-COMMENTS-IMPORT-01

10-commit backend-focused session implementing comment
detection + storage for Medium imports. Frontend integration
deferred to a follow-up (MEDIUM-COMMENTS-UI-01).

## Context

Real-world report: among 209 imported articles in the
production export, at least one ("Thanks for pointing that
out — you're right, the link was missing.") is a comment that
shouldn't be a top-level Article. User's spec proposed a new
`article_comments` table + heuristic-based routing, with the
existing 209 imports preserved as-is (no retro-fix script).

## Pre-inspection

Audit ran the spec's three-criteria heuristic
(body < 500 AND empty subtitle AND no struct) against the
209-file production export at
`/home/astrapi69/Downloads/medium-export-…/posts/`. Two
findings:

1. Original heuristic: 6 / 209 classified as comments.
2. The user's own reference comment was a false negative.
   Investigation: Medium auto-fills `data-field="subtitle"`
   with the second paragraph of the reply body when the
   author wrote no explicit subtitle.

Recommended refinement: drop the empty-subtitle criterion.
Audit confirmed 8 / 209 classified under the refined
heuristic, zero new false positives. User confirmed
recommendations A-E (heuristic refinement, store-orphans
default, core endpoints, hardcoded "medium" string,
backend-only scope).

## Commits (10)

| # | SHA | Description | Tests Δ |
|---|---|---|---|
| 1 | 76d7cf0 | feat(db): article_comments table + ArticleComment model | +6 backend |
| 2 | 8d52015 | feat(medium-import): comment-detection heuristic in walker | +8 plugin |
| 3+4 | f0df93b | feat(medium-import): import_comments_mode + orphan_comment_handling settings | +7 plugin |
| 5 | f37581a | feat(medium-import): route detected comments by mode | 0 (3 fixtures patched) |
| 6 | 9358805 | feat(api): GET /api/articles/{id}/comments | +4 backend |
| 7 | aa36c8c | feat(api): /api/comments admin router (list + soft-delete) | +8 backend |
| 8 | 579f1c0 | test(medium-import): end-to-end coverage for all 3 modes + orphan handling | +12 backend |
| 9 | 740f448 | docs(help): comments-vs-articles section for medium import | 0 |
| 10 | (this) | chore(close): archive + backlog + journal + lessons-learned + UI-01 follow-up | 0 |

Totals: 10 commits, **+30 backend tests** (target was +15;
landed at 2x), **+15 plugin tests**, +45 across the feature.

## Key design decisions

1. **Heuristic refinement (audit-driven)**: drop the empty-subtitle
   criterion. body < 500 AND no structural elements is enough;
   8/209 classification with zero new false positives.
2. **`ondelete=SET NULL`, NOT cascade**: deleting an article
   doesn't destroy its comments. They survive as orphans with
   `responds_to_url` preserved for later re-linkage. Mirrors
   the orphan-handling default decision.
3. **Two endpoints in core, not the plugin**:
   `/api/articles/{id}/comments` lives in articles.py;
   `/api/comments` admin in a new comments.py. Future
   importers (WordPress, Hashnode) will write to the same
   table — they must not have to go through a
   Medium-plugin-prefixed route.
4. **`imported_from = String(50)` hardcoded to "medium" for
   v1**. Enum table is overengineering at one value; migrate
   when 3-4 importer sources exist.
5. **Settings normalization with safe fallback**: invalid
   YAML values fall back to the default with no crash, per
   the "Config migration (bool -> enum)" lessons-learned
   rule.
6. **Backend-only scope**: no editor section, no count
   badge, no UI strings in this session. Comments are
   invisible to users until MEDIUM-COMMENTS-UI-01 ships.

## What's invisible to users today

The schema, importer wiring, and API endpoints all work, but
the editor surface is deliberately empty. Users importing a
Medium archive today see:

- The article dashboard contains only article-shaped posts
  (the comment-shaped ones are routed away by default).
- The response payload counts go to standout 0-imported
  cases if every post in their export was a comment.
- Comments are accessible via the two API endpoints but no
  UI surfaces them.

The follow-up MEDIUM-COMMENTS-UI-01 (filed in this session)
builds the editor surface + dashboard count badge + admin
view in a separate frontend-focused session.

## Lessons-learned addition

New entry: "Real-world data audit BEFORE implementation
prevents spec-vs-reality drift." Captures the audit-vs-spec
discrepancy that drove the heuristic refinement, with the
generalization that any heuristic / threshold / data-shape
prediction should be validated against real data before
landing as code.

## Questions and assumptions

- **Assumption**: the pre-inspection's audit-driven heuristic
  change (drop empty-subtitle) was the right call. Basis: the
  audit found 2/8 cases where the original would silently
  miss real comments, including the user's own reference
  case. Recorded with the audit numbers in the archive entry.
- **Assumption**: `responds_to_url` stays NULL for v1 Medium
  imports rather than being populated from the comment's own
  canonical URL. Basis: the field's semantic is "URL the
  comment claims to respond to", not "the comment's own URL".
  Medium doesn't carry the responds-to URL anywhere in the
  HTML, so leaving the field NULL avoids misleading future
  re-linkage attempts. The comment's own URL is already in
  the `canonical_url` field. Re-linkage code in a future v2
  can use whatever heuristic emerges then.
- **Decision point parked for v2**: the comment editor surface
  + count badge + admin view. Filed as MEDIUM-COMMENTS-UI-01.
- **Decision point parked for future importers**: actual
  parent-link parsing for WordPress / Hashnode HTML.
  v1 schema supports it (`responds_to_article_id` +
  `responds_to_url`), but no parser code exists yet.
