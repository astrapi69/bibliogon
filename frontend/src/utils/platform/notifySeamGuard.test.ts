/**
 * Static source-scan guard for #769: no component/hook/page may call
 * react-toastify's ``toast.error`` / ``toast.warning`` / ``toast.info``
 * directly — error and status feedback goes through the ``notify``
 * wrapper in ``utils/platform/notify.ts``.
 *
 * Background: ``notify.error`` carries three behaviours a raw
 * ``toast.error`` cannot. It downgrades the backendless-offline guard's
 * expected rejection to a console warning (#78), it suppresses
 * per-call red toasts while the backend-unreachable banner is up
 * (#765) — the banner is the ONE surface during an outage — and it
 * renders the "Issue melden" button that opens ``ErrorReportDialog``
 * prefilled with endpoint, status and stacktrace
 * (``.claude/rules/code-hygiene.md`` "Error reporting").
 *
 * A direct ``toast.error`` bypasses all three: during an outage it
 * still raises a red toast next to the banner, and for a real fault it
 * drops the issue-report affordance. #769 migrated the four remaining
 * call sites; this scan keeps new ones from reappearing.
 *
 * ``toast.success`` is NOT guarded: it has no offline/outage semantics
 * and no report button, so a direct call loses nothing.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "../..");

/** Guarded levels — every one has notify-only behaviour behind it. */
const GUARDED = /\btoast\s*\.\s*(error|warning|warn|info)\s*\(/;

/** Audited call sites (paths relative to ``src/``). */
const ALLOWLIST = new Set([
    // The notify wrapper itself — it IS the seam.
    "utils/platform/notify.ts",
    // A controlled, self-dismissing progress toast whose id is captured
    // for a later toast.update(); notify exposes no equivalent handle.
    "components/book/KeywordInput.tsx",
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

/** Strip comment-only lines so prose mentioning the rule never trips it. */
function stripCommentLines(source: string): string {
    return source
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
}

describe("notify seam guard (#769)", () => {
    it("no direct toast.error/warning/info callers outside the allowlist", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
            if (ALLOWLIST.has(rel)) continue;
            if (GUARDED.test(stripCommentLines(fs.readFileSync(file, "utf-8")))) {
                offenders.push(rel);
            }
        }
        expect(
            offenders,
            `direct react-toastify caller(s) outside the notify seam: ${offenders.join(", ")} — ` +
                "use notify.error / notify.warning / notify.info (see #765/#769) " +
                "so the offline + backend-unreachable downgrades and the " +
                "Issue-melden button apply, or allowlist with a justification",
        ).toEqual([]);
    });

    it("detects a guarded call in a synthetic source string", () => {
        expect(GUARDED.test('toast.error("boom")')).toBe(true);
        expect(GUARDED.test("toast.warning(msg)")).toBe(true);
        expect(GUARDED.test("toast .info( msg )")).toBe(true);
    });

    it("does not flag toast.success or the notify wrapper's own calls", () => {
        expect(GUARDED.test('toast.success("saved")')).toBe(false);
        expect(GUARDED.test("notify.error(detail, err)")).toBe(false);
    });

    it("ignores comment lines that merely mention toast.error", () => {
        const source = [
            " * Consumers pass the instance to `toast.error(...)` and, on 5xx,",
            "// toast.error stays behind the notify seam",
            'notify.error("real call");',
        ].join("\n");
        expect(GUARDED.test(stripCommentLines(source))).toBe(false);
    });
});
