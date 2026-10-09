import type { AplusFinding } from "../../../api/platform";
import type { TFunc } from "../tabTypes";

/**
 * Validator findings of the last AI fill (#887): errors must be fixed before
 * the text goes to Amazon, warnings are recommendations.
 *
 * Each finding is rendered from its `code` through `ui.aplus.finding.<code>`
 * (#889), so a German, French or Spanish reader gets a sentence in their own
 * language instead of the validator's English `message`. The message remains
 * the fallback, which covers two real cases: a package cached before codes
 * existed, and a rule added in a newer backend than this frontend knows.
 *
 * @example
 * <AplusFindings findings={pkg.validation} t={t} />
 */
export default function AplusFindings({ findings, t }: { findings: AplusFinding[]; t: TFunc }) {
    if (findings.length === 0) return null;
    return (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="aplus-findings">
            {findings.map((finding, i) => (
                <li
                    key={`${finding.field}-${i}`}
                    className={`text-sm ${finding.severity === "error" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}
                >
                    <strong>
                        {finding.severity === "error"
                            ? t("ui.aplus.finding_error", "Fehler")
                            : t("ui.aplus.finding_warning", "Hinweis")}
                    </strong>{" "}
                    <code>{finding.field}</code>: {findingText(finding, t)}
                </li>
            ))}
        </ul>
    );
}

/**
 * The finding's sentence in the UI language, with its params filled in.
 *
 * Interpolation happens here rather than in `t`, which takes only a key and
 * a fallback - the same split every other placeholder in this codebase uses.
 */
function findingText(finding: AplusFinding, t: TFunc): string {
    const template = finding.code
        ? t(`ui.aplus.finding.${finding.code}`, finding.message)
        : finding.message;
    return Object.entries(finding.params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, value),
        template,
    );
}
