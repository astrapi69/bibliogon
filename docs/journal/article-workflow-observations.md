# Article Workflow Observations

Validation log for [docs/explorations/article-authoring.md](../explorations/article-authoring.md), Section 12.

**Purpose.** Capture real manual workflow data across 3-5 articles before committing to Option A/B/C (Section 8 of the exploration). Without this log, architecture choice is a guess about a use case not yet understood.

**How to use.** Add one entry per article you publish. Fill in during or immediately after the cross-posting work; retroactive reconstruction loses the detail that matters (exact friction, workaround used, time per step).

**Review cadence.** End of each month. Classify pain points as tool- or workflow-solvable (Section 11 of the exploration). Count platforms actually used. Look for patterns that repeat across three-plus articles.

**Decision point.** After 3-5 articles OR after one of the Section 13 triggers fires, revisit the exploration with the accumulated data. Pick Option A, B, C, or archive the exploration as "investigated and deferred".

---

## Entry template

Copy this block for each article. Leave fields you did not encounter blank rather than fabricating.

```markdown
## {N}. {Article title} ({YYYY-MM-DD})

**Content type:** article | blogpost | tweet | thread | other
**Platforms published to:** Medium, Substack, X, LinkedIn, dev.to, ...
**Total time (cross-post work only, excluding drafting):** HH:MM
**Primary canonical URL:** https://...

### Per-step time log

| Step | Platform | Time (mm:ss) | Friction notes |
|------|----------|--------------|----------------|
| Draft in AI chat | - | | |
| Iterate on feedback | - | | |
| Copy to local Markdown | - | | |
| Generate featured image | - | | Aspect ratios used: |
| Publish: Medium | Medium | | SEO fields filled: |
| Publish: Substack | Substack | | Section, preview text: |
| Publish: LinkedIn | LinkedIn | | Inline body vs link: |
| Publish: X announcement | X | | Single / thread: |
| Track URLs somewhere | - | | Where: |

### Metadata fields that mattered

List fields you actually filled per platform (not the full schema the platform offers, only what you used).

- Medium: title, subtitle, tags (count), SEO title, SEO description, canonical URL, featured image
- Substack: title, subtitle, preview text, section, featured image
- X: body, hashtags (count), media, reply-to
- LinkedIn: body, tags, media

### Pain points encountered

- Specific friction in concrete terms. Not "SEO is annoying", but "had to reverse-engineer Medium's meta description preview because the UI truncates differently than the live page".
- Workarounds used (copy-paste X, re-edited Y, gave up on Z).
- What broke (stale friend-link, outdated Substack mirror, tweet-thread limit hit).

### Pattern candidates (things that felt repetitive)

- Content / template reused from a previous article (preamble, CTA, author bio, tag set).
- Per-platform adaptation that followed a rule (e.g. "drop the technical appendix for LinkedIn", "add a TL;DR for X thread").

### Tool-solvable vs workflow-solvable classification

After the fact, for each pain point: is this a tool problem (would a feature help?) or a workflow problem (would the same feature help, or would discipline fix it without code)?

```

---

## Observation log

<!-- Add entries below this line in reverse chronological order (newest first). -->

---

## Monthly review

Append a short review block at the end of each calendar month. Triggers for the review:

- **Count articles shipped this month.** If fewer than 2/month sustained over 3 months, Section 13 trigger #1 does NOT fire.
- **Sum total time.** If consistently over 2h cross-posting per article, Section 13 trigger #2 fires.
- **Classify pain points by frequency.** A pain point that appeared in 3-plus articles is a signal; a one-off is not.
- **Platform count reality check.** If MVP assumed four platforms and log shows only two, shrink the MVP. If log shows six, the MVP assumption was too narrow.
- **Architecture implication.** Do the observations push toward A (lightweight content_type on Book), B (separate Article entity/plugin), or C (sister project)?

### Template for the monthly review block

```markdown
### Review {YYYY-MM}

- Articles shipped: N
- Total cross-post time: HH:MM (avg HH:MM per article)
- Platforms actually used: Medium, Substack, X (3 of 4 MVP)
- Top 3 repeated pain points:
  1.
  2.
  3.
- Pattern observations:
  -
- Architecture implication this month:
  - Leaning toward Option {A/B/C}; reason: ...
  - Or: not enough data yet; continue logging.
```
