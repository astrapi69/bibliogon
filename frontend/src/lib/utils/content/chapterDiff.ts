/**
 * Line-oriented diff between a stored chapter snapshot and the chapter's
 * current content, plus the plain-text flattening both sides go through
 * first.
 *
 * Mirrors the backend `app/services/chapter_snapshots.py`
 * (`snapshot_plain_text` + `line_diff`) so the offline (Dexie) version
 * history renders the same shape the `/versions/{id}/diff` endpoint
 * returns and {@link ChapterVersionDiff} consumers need no branch (#728).
 *
 * Library-grade: no app imports, no i18n, no storage. Built in-house
 * (stage 4) because no diff library is installed and the two things a
 * library would add — word-level intra-line diffing and patch output —
 * are not what this surface renders; it needs exactly `difflib.ndiff`'s
 * line classification, in under 50 lines.
 *
 * @example
 * lineDiff(snapshotPlainText(version.content), snapshotPlainText(chapter.content))
 * // => [{type: "unchanged", text: "Kapitel 1"}, {type: "added", text: "Neuer Absatz"}]
 */

/** How a line relates the snapshot to the current text. */
export type DiffLineType = "unchanged" | "added" | "removed";

/** One classified line of a {@link lineDiff} result. */
export interface DiffLine {
    type: DiffLineType;
    text: string;
}

/**
 * Above this many `before x after` line pairs the LCS table is skipped and
 * the remaining block degrades to removed-then-added. A 1000x1000 table is
 * already 1M cells; beyond that the cost is not worth a prettier diff of a
 * chapter nobody reads line-by-line. Common-prefix/suffix trimming means a
 * normal edit never reaches the cap regardless of chapter length.
 */
const LCS_CELL_CAP = 1_000_000;

/**
 * Flatten a TipTap node tree to plain text, one line per block node.
 *
 * Mirrors the backend `_flatten_tiptap`: block nodes (`doc`, `paragraph`,
 * any `heading*`) join their children with a newline, inline siblings with
 * a space. Deliberately a private copy rather than a shared export — the
 * two Storyboard preview flatteners disagree on the inline join char
 * (`" "` vs `""`), so unifying all three is a behaviour adjudication, not
 * a mechanical extraction, and belongs in its own change.
 */
function flattenTipTapText(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const record = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof record.text === "string") return record.text;
    if (!Array.isArray(record.content)) return "";
    const parts = record.content.map(flattenTipTapText);
    const isBlock =
        record.type === "doc" ||
        record.type === "paragraph" ||
        (typeof record.type === "string" && record.type.startsWith("heading"));
    return parts.join(isBlock ? "\n" : " ");
}

/**
 * Flatten a chapter's stored content to line-broken plain text.
 *
 * TipTap JSON (a string starting with `{`) is flattened; legacy plain text
 * passes through. Blank lines are dropped so the diff is line-oriented over
 * real content only.
 *
 * Note: like the backend helper this mirrors, HTML content (an imported,
 * never-opened chapter — #787) is NOT unwrapped and diffs as raw markup.
 * Both sides do it identically, so a diff stays correct; fixing it is a
 * backend-side change to `snapshot_plain_text`.
 */
export function snapshotPlainText(content: string | null | undefined): string {
    const raw = (content ?? "").trim();
    if (!raw) return "";
    let plain = raw;
    if (raw.startsWith("{")) {
        try {
            plain = flattenTipTapText(JSON.parse(raw));
        } catch {
            plain = raw;
        }
    }
    return plain
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line)
        .join("\n");
}

/** Longest-common-subsequence walk over two line arrays. */
function lcsDiff(before: readonly string[], after: readonly string[]): DiffLine[] {
    const n = before.length;
    const m = after.length;
    if (!n) return after.map((text) => ({ type: "added" as const, text }));
    if (!m) return before.map((text) => ({ type: "removed" as const, text }));
    if (n * m > LCS_CELL_CAP) {
        return [
            ...before.map((text) => ({ type: "removed" as const, text })),
            ...after.map((text) => ({ type: "added" as const, text })),
        ];
    }
    // dp[i][j] = LCS length of before[i..] and after[j..].
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] =
                before[i] === after[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const result: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && before[i] === after[j]) {
            result.push({ type: "unchanged", text: before[i] });
            i++;
            j++;
        } else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) {
            // Removal wins ties so a replaced line reads "- alt" then
            // "+ neu", the order difflib.ndiff produces.
            result.push({ type: "removed", text: before[i] });
            i++;
        } else {
            result.push({ type: "added", text: after[j] });
            j++;
        }
    }
    return result;
}

/**
 * Line diff from `textA` (the snapshot) to `textB` (current).
 *
 * `added` lines exist now but not in the snapshot; `removed` lines were in
 * the snapshot and are gone. The common prefix and suffix are matched
 * directly so only the changed middle needs the LCS table.
 *
 * The classification matches `difflib.ndiff` for the shapes this surface
 * renders. It is not byte-identical in every pathological case: ndiff's
 * SequenceMatcher maximises contiguous blocks rather than the LCS, so a
 * heavily-rewritten passage can group its removed/added runs differently.
 * Both remain valid line diffs of the same two texts.
 */
export function lineDiff(textA: string, textB: string): DiffLine[] {
    const before = textA ? textA.split("\n") : [];
    const after = textB ? textB.split("\n") : [];
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (
        tail < before.length - head &&
        tail < after.length - head &&
        before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
        tail++;
    }
    return [
        ...before.slice(0, head).map((text) => ({ type: "unchanged" as const, text })),
        ...lcsDiff(
            before.slice(head, before.length - tail),
            after.slice(head, after.length - tail),
        ),
        ...before.slice(before.length - tail).map((text) => ({ type: "unchanged" as const, text })),
    ];
}
