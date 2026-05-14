# Medium comment-detection heuristic audit (v0.32.0)

Captures the data-validation behind the v2 (two-tier) classifier
shipped in v0.32.0. Source-of-truth for the
``_classify_as_comment`` docstring in
[walker.py](../../plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/walker.py).

## Context

v0.31.0 shipped the original (tier 1) heuristic:

> ``body_text < 500 chars AND no structural TipTap nodes
> (heading / codeBlock / bulletList / orderedList / imageFigure)``

A user smoke-test of the 209-file production Medium export
surfaced a misclassified comment:

- File: `2025-12-13_This-is-a-powerful-and-unsettling-reframing-of-longevity-and-youth-despair-as-a-class-struggle--{448f2db762ea,b94f27361bbf}.html`
- Body length: 941 chars
- Shape: single paragraph, opens with "This is a powerful and
  unsettling reframing...", contains "Your contrast between
  billionaire 'immortality projects' and young people choosing
  exits...", ends with "...is the most honest politics today
  about organizing around shared refusal rather than shared
  hope?"
- Unambiguously a comment on another author's piece.
- Tier 1 missed it because body_len >= 500.

The original spec for MEDIUM-COMMENTS-IMPORT-01 noted that
the 500-char gate was deliberately conservative ("a false
negative is acceptable; a false positive would be confusing").
The v0.32.0 refinement targets the false-negative class
*without* introducing new false positives.

## Methodology

Full corpus pulled from
``tmp/medium-export-2b0d2a60a17096f8a5eda39b89fe9722e92245fab55862dc870ab3754baeaaf4.zip``
(209 HTML files under ``posts/``). Each file parsed via the
existing walker; the classifier under test was run against the
resulting TipTap doc.

Two refined heuristics were compared:

- **v1 — multi-signal scoring**: count positive signals
  (second-person opener, opening question, closing question,
  no_headings, conv_range, no_images, few_paragraphs). Promote
  to comment when >= 3 signals fire AND no code blocks.
- **v2 — conversational-marker gate**: require at least one
  HARD conversational signal (second-person opener, opening
  question, OR closing question) AND no article-shape
  disqualifiers (no headings, no code blocks, no images,
  body_len < 2000). Lists are *not* disqualifiers — comment
  replies do sometimes contain enumerated points.

Tier 1 is unchanged in both proposals; both v1 and v2 are
*extensions* that only fire when tier 1 fails to match.

## Results

Counts on the 209-file corpus:

| Heuristic | Articles | Comments | New (vs tier 1) | Lost | False positives |
|---|---:|---:|---:|---:|---:|
| Tier 1 (v0.31.0) | 201 | 8 | – | – | 0 |
| Refined v1 (rejected) | 197 | 12 | 4 | 0 | 1 (Vollmond poem) |
| **Refined v2 (shipped)** | **198** | **11** | **3** | **0** | **0** |

(Tier 1 contributes 8 comments; tier 2 adds 3 clean new
detections for a total of 11. v1's 12 included one false
positive — the Vollmond poem — which v2 correctly excludes.)

### v2 new-detection list

| File | body_len | Why it matched |
|---|---:|---|
| `2025-02-01_Vielen-Dank-für-deine-inspirierenden-Gedanken--Heike--…7939ab483e4b.html` | 1160 | closing question, German |
| `2025-12-13_This-is-a-powerful-…--448f2db762ea.html` | 943 | closing question, English (the user's reported edge case) |
| `2025-12-13_This-is-a-powerful-…--b94f27361bbf.html` | 943 | closing question, English (duplicate file) |

All three manually verified as genuine reply-comments. The
closing-question signal is doing most of the work — opening
questions and second-person openers are documented as signals
but did not fire in any of the three.

### Why v1 was rejected

v1's multi-signal scoring at >= 3 promoted ``Vollmond über
Ludwigsburg`` to comment. The post is a short German poem
about a moonlit Ludwigsburg railway scene, 707 chars, no
headings, 4 paragraphs, 1 image. The signals it fired were
``no_headings + conv_range + few_paragraphs`` — three
weak structural signals with NO conversational marker.

v2 fixes this by requiring at least one *conversational*
signal as a hard prerequisite. The Vollmond poem has no
question marks, no second-person opener; v2 correctly leaves
it as Article.

## Disqualifiers comparison

| Node type | Tier 1 disqualifier? | Tier 2 disqualifier? |
|---|:---:|:---:|
| heading | ✓ | ✓ |
| codeBlock | ✓ | ✓ |
| imageFigure | ✓ | ✓ |
| bulletList | ✓ | ✗ |
| orderedList | ✓ | ✗ |
| body_len ≥ 2000 | n/a (gated by < 500) | ✓ |

Tier 2 deliberately allows lists. The original user-reported
edge case (mis-remembered as containing a numbered list)
exposed the concern that an enumerated reply ("1. ... 2. ...
3. ...") should still classify as a comment if the
conversational marker is present. Tier 2 makes that case
work.

## Reproducibility

Re-run the audit any time the heuristic changes or the
corpus is updated:

```bash
cd plugins/bibliogon-plugin-medium-import
poetry run python /path/to/audit_heuristic_v2.py
```

(The audit script lives in the session workspace and is
regenerated as needed; it is not committed because it is
session-scoped tooling, not a CI artefact. The data the
script needs — full Medium export ZIP — also varies per
session.)

## Future maintainer notes

- The 500-char tier-1 threshold is a strict `<` gate.
  Touching it is a behavior change for the whole heuristic;
  re-run the audit.
- The 2000-char tier-2 cap is a soft heuristic. Bumping it
  upward without re-validating risks false positives from
  longer articles that happen to end with a question.
- The conversational-marker prefixes
  (``_COMMENT_SECOND_PERSON_PREFIXES``) are English + German.
  When the corpus broadens to a new language with different
  pronoun conventions, add prefixes here and re-validate.
- Tier 2 is "comment evidence beats absence of evidence".
  The conversational signal is the load-bearing piece —
  removing it (or weakening it to "any of 3 structural
  signals") reintroduces the Vollmond false positive class.

## Cross-references

- v0.31.0 walker shipping commit: see
  `git log --oneline --grep="MEDIUM-COMMENTS-IMPORT-01"`
- Pre-inspection chat transcript: chat journal entry
  ``docs/journal/chat-journal-session-2026-05-14.md``
  (v0.32.0 UX-Polish session, F2a phase).
- Lessons-learned rule covering this class of data-validation
  refinement:
  ``.claude/rules/lessons-learned.md`` →
  "Real-world data audit BEFORE implementation prevents
  spec-vs-reality drift".
