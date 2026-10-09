/**
 * Static source-scan guard: a catch block must not gate the ONLY handling
 * of a failure on ``err instanceof ApiError`` (#1021).
 *
 * Why this shape is a bug rather than a style nit: in API mode essentially
 * every failure IS an ``ApiError``, so the guard looks complete and the
 * tests pass. Through the storage seam it is not - ``DexieStorage`` throws
 * plain ``Error``s (``notFound``, ``DataError``, ``QuotaExceededError``,
 * ``ConstraintError`` out of the serialized write queue). Those land in the
 * ``if``, get dropped, and the user is told nothing.
 *
 * The damaging instance (#1021, found by #747's offline E2E):
 * ``useArticlePersistence.persistContent`` set ``saving`` before the write
 * and only left that state inside the ``if``, so a dropped failure left the
 * spinner running with no toast - which the user reads as "still saving".
 * Seven more sat in the article dashboard's delete and load paths.
 *
 * Passing shapes:
 * - an unconditional handler (``notify.error(msg, err)`` - ``notify``
 *   narrows its second argument itself, so the rich ApiError toast is kept),
 * - ``if (err instanceof ApiError) { ... } else { ... }`` - both branches
 *   handled, which is what ``ArticleCommentsPanel`` does,
 * - a listed exception below.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "..");

/**
 * Audited call sites where the else-less guard is deliberate.
 *
 * Keep this list short and justified. "The endpoint is backend-only" is
 * NOT sufficient on its own: a backend-only surface still wants to report
 * a programmer error rather than hide it. What qualifies is a handler
 * whose body is a no-op by design, where adding the non-ApiError case
 * would change nothing.
 */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
    [
        "components/articles/PublicationsPanel.tsx",
        "Being rewritten on the #747 branch (PR #1017), which removes four " +
            "of its five guards; editing the same file here would conflict. " +
            "Remove this entry once #1017 merges and the fifth (the refresh " +
            "catch) is unwrapped.",
    ],
    [
        "components/import/GitSyncDiffDialog.tsx",
        "Status-code classifier: the chain reads err.status / err.detailBody, " +
            "so it needs the narrowing plus an OUTER else - not an unwrap, " +
            "which drops the narrowing and fails tsc. Git-sync is " +
            "DESKTOP_ONLY and its controls never mount in Dexie mode, so the " +
            "plain-Error path is unreachable today. Tracked on #1021.",
    ],
    [
        "pages/GitSyncPage.tsx",
        "Same shape and same reason as GitSyncDiffDialog above.",
    ],
    [
        "hooks/ui/usePagedList.ts",
        "Empty by design: an unpersisted page-size preference is accepted " +
            "for the session. The if body is a comment, so unwrapping it " +
            "changes no behaviour.",
    ],
]);

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectSourceFiles(full));
            continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.(ts|tsx)$|\.d\.ts$/.test(entry.name)) continue;
        out.push(full);
    }
    return out;
}

/** Line numbers of else-less ``if (err instanceof ApiError) {`` blocks. */
function elselessGuards(source: string): number[] {
    const lines = source.split("\n");
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
        const open = /^(\s*)if \((?:err|e|error) instanceof ApiError\) \{\s*$/.exec(lines[i]);
        if (!open) continue;
        // The closer sits at the `if`'s own indentation. It is either a
        // bare `}` or the `} else {` that makes this shape correct, so
        // match the brace and read what follows it on that line.
        const closer = `${open[1]}}`;
        let j = i + 1;
        while (j < lines.length && !lines[j].startsWith(closer)) j += 1;
        if (j >= lines.length) continue; // unbalanced; not ours to judge
        const rest = lines[j].trim().slice(1).trim();
        const next = (lines[j + 1] ?? "").trim();
        if (rest.startsWith("else") || next.startsWith("else")) continue;
        // A body that returns or throws is a classifier, not a swallow:
        // the code after the block is the else. `toWizardError` is the
        // canonical one - `if (ApiError) return …; if (Error) return …;`
        // with a final fallback, every path covered.
        const body = lines.slice(i + 1, j).map((l) => l.trim());
        const last = body.filter((l) => l && !l.startsWith("//")).pop() ?? "";
        if (/^(return|throw)\b/.test(last) || last === "};" || last === ");") {
            const joined = body.join(" ");
            if (/\b(return|throw)\b/.test(joined)) continue;
        }
        hits.push(i + 1);
    }
    return hits;
}

describe("ApiError-guard scan (#1021)", () => {
    it("no catch handles only ApiError outside the audited allowlist", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
            if (ALLOWLIST.has(rel)) continue;
            const hits = elselessGuards(fs.readFileSync(file, "utf-8"));
            for (const line of hits) offenders.push(`${rel}:${line}`);
        }
        expect(
            offenders,
            "These catch blocks drop every failure that is not an ApiError, " +
                "which offline is all of them. Handle the error " +
                "unconditionally (notify.error narrows err itself), add an " +
                "else branch, or justify it in ALLOWLIST:\n  " +
                offenders.join("\n  "),
        ).toEqual([]);
    });

    it("recognises the shapes it must not flag", () => {
        expect(
            elselessGuards(
                ["try {", "} catch (err) {", "    notify.error(msg, err);", "}"].join("\n"),
            ),
        ).toEqual([]);
        expect(
            elselessGuards(
                [
                    "        if (err instanceof ApiError) {",
                    "            setError(err.detail);",
                    "        } else {",
                    "            setError(fallback);",
                    "        }",
                ].join("\n"),
            ),
        ).toEqual([]);
    });

    it("flags the shape it exists for", () => {
        expect(
            elselessGuards(
                [
                    "        } catch (err) {",
                    "            if (err instanceof ApiError) {",
                    "                notify.error(msg, err);",
                    "            }",
                    "        }",
                ].join("\n"),
            ),
        ).toEqual([2]);
    });
});
