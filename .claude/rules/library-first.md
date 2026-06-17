# Dependency hierarchy (Library-First) + Library-Grade

Two things: a **4-stage hierarchy** that decides *whether* to write code at
all (search before you build), and **Library-Grade** — write the code that
does land in `lib/`/`shared/` as if it were a standalone, publishable library.

Full context: `docs/MODULE-ARCHITECTURE.md` ("Dependency hierarchy +
Library-Grade") and `docs/VIBE-CODING-POLICY.md` Principle 4. First audit:
`docs/audits/library-first-audit-2026-06-17.md`.

## The 4-stage hierarchy (walk top to bottom)

Only drop to the next stage when the current one genuinely cannot do the job.

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
   **>1000 weekly downloads**, **last update <6 months**, **bundle <100 kB**
   for anything writable in <50 LOC. Compare the top 2–3 on size, maintenance,
   parity, transitive deps. Do NOT adopt a library that would *change*
   behaviour we deliberately want (e.g. a slug helper that transliterates
   umlauts we keep on purpose).
4. **BUILD IT YOURSELF — only when 1–3 don't fit.** Under these restrictions:
   - **Library-Grade** (below): no app imports, own types, TSDoc, single-use
     viable.
   - **Cohesion:** <500 lines, one concern.
   - **Complexity:** cyclomatic complexity <20.
   - **Tests:** its own colocated test file.
   - The PR documents **WHY** it was built in-house rather than using
     stages 1–3.

This is the same "use what already exists" principle as the architecture
rule "before writing custom code, ALWAYS check whether an official TipTap
extension exists", generalised across the whole stack.

## Library-Grade (write `lib/` code as a library)

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

- **Stage 1 (language)**: `lib/utils/relativeTime.ts` — platform
  `Intl.RelativeTimeFormat`, zero bundle cost.
- **Stage 3 (library)**: `lib/utils.ts` `cn` — wraps the installed `clsx` +
  `tailwind-merge`.
- **Anti-pattern (stage 4 where stage 3 fits)**: `lib/utils/markdownToHtml.ts`
  reimplementing the already-installed `marked` (caught by the first audit,
  tracked in #387).
