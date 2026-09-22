import type { AplusFinding } from "../../../api/platform";
import type { TFunc } from "../tabTypes";

/**
 * Validator findings of the last AI fill (#887): errors must be fixed before
 * the text goes to Amazon, warnings are recommendations.
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
                    <code>{finding.field}</code>: {finding.message}
                </li>
            ))}
        </ul>
    );
}
