# Library-First + Library-Grade

Two things: a **4-stage dependency hierarchy** that decides *whether* to write
code at all, and the **Library-Grade** rule that governs *how* the code you do
write is shaped.

Full context: `docs/MODULE-ARCHITECTURE.md` ("Dependency hierarchy +
Library-Grade") and `docs/VIBE-CODING-POLICY.md` Principle 4. First audit:
`docs/audits/library-first-audit-2026-06-17.md`.

## The 4-stage hierarchy — search before you build

Walk it **top to bottom**. Only drop to the next stage when the current one
genuinely cannot do the job. Most utilities never reach stage 4.

1. **LANGUAGE FIRST — native platform APIs.**
   - JS: `Intl`, `crypto.subtle` / Web Crypto, `URL`, `fetch`,
     `structuredClone`, `Array`/`Set`/`Map` methods, `IntersectionObserver`.
   - Python: `pathlib`, `dataclasses`, `json`, `hashlib`, `functools`.
2. **FRAMEWORK — what is already wired in.**
   - React: `useState`, `useEffect`, `useRef`, `useMemo`, Context.
   - Vite: `define`, `import.meta.env`, plugins.
   - FastAPI: `Depends`, `BackgroundTasks`, `HTTPException`.
3. **LIBRARY — npm / PyPI, only when 1 + 2 fall short.** Prefer a library
   already in the project (`react-markdown`, `marked`, `dexie`, `recharts`,
   `lucide-react`, `tailwind`, `PyYAML`, …). A *new* dependency must clear:
   - **>1000 weekly downloads**,
   - **last update <6 months**,
   - **bundle size <100 kB** for anything we could write in <50 LOC ourselves.

   Compare the top 2–3 candidates on size, maintenance, parity, and transitive
   deps. Do NOT adopt a library that would *change* behaviour we deliberately
   want (e.g. a slug helper that transliterates umlauts we keep on purpose).
4. **BUILD IT YOURSELF — only when 1–3 don't fit.** Then, under these
   restrictions:
   - **Library-Grade** (below) — no app imports, own types, TSDoc, single-use
     viable.
   - **Cohesion:** <500 lines, one concern.
   - **Complexity:** cyclomatic complexity <20.
   - **Tests:** its own colocated test file.
   - **The PR documents WHY** it was built in-house rather than using stages
     1–3.

This is the same "use what already exists" principle as the architecture
rule "before writing custom code, ALWAYS check whether an official TipTap
extension exists", generalised across the whole stack.

## Library-Grade (write stage-4 code as a library)

Every module in `frontend/src/lib/` (and `shared/`) MUST:

- have **no app-specific imports** — no `getStorage()`, no `useI18n()`/`t()`,
  no `api.*`, no reach-back into pages/components (app-bound *types* like
  `PageLayout`/`ChapterType` are allowed, and mark a util as `lib/utils/`
  rather than the cross-app `shared/`);
- export **its own TypeScript types**;
- carry **TSDoc with a usage `@example`**;
- ship **its own colocated test file**, not folded into a page's tests;
- be **usable in isolation** — importable without dragging the rest of the app
  in.

## Model cases vs anti-pattern

- **Stage 1 (language)**: `lib/utils/relativeTime.ts` (thin wrapper over the
  platform `Intl.RelativeTimeFormat`, zero bundle cost).
- **Stage 3 (library)**: `lib/utils.ts` `cn` (wraps the installed `clsx` +
  `tailwind-merge`).
- **Deliberate divergence — KEEP, not an anti-pattern**:
  `lib/utils/markdownToHtml.ts` *looks* like it reimplements the installed
  `marked`, but its output is deliberately tuned for the TipTap round-trip:
  `<s>` for strikethrough (not `marked`'s `<del>`), a bare top-level `<img>`
  and the standalone-image→`<figure>`/`<figcaption>` promotion that the
  editor's `imageFigure` node needs (see lessons-learned "TipTap image node
  ... is imageFigure"), and tight whitespace. `marked` changes every one of
  those, so adopting it would either **regress editor content** (images
  dropped / wrong strike node on Markdown→WYSIWYG) or require a heavier
  post-processing wrapper than the original — exactly the stage-3 caveat
  *"do NOT adopt a library that would change behaviour we deliberately
  want."* Re-evaluated and **closed by-design (#387, 2026-06-17)**; the
  first audit's "reimplements `marked`" framing missed the TipTap coupling.
- **Anti-pattern (stage 4 where stage 3 fits)**: a util that re-implements an
  already-installed library *with no behavioural reason to diverge* — e.g. a
  hand-rolled date formatter when `Intl` (stage 1) or an installed library
  (stage 3) already does the job. The test is whether the divergence is
  load-bearing (keep, like `markdownToHtml`) or incidental (replace).
