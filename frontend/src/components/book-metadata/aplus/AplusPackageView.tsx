import { Copy } from "lucide-react";

import type { AplusFinding, AplusModule, AplusPackage } from "../../../api/platform";
import type { TFunc } from "../tabTypes";

interface AplusPackageViewProps {
    pkg: AplusPackage;
    t: TFunc;
    onCopy: (text: string) => void;
}

interface CopyBlockProps {
    label: string;
    text: string;
    testId: string;
    t: TFunc;
    onCopy: (text: string) => void;
    mono?: boolean;
    /** Text the copy button puts on the clipboard when it differs from the shown text. */
    copyText?: string;
}

/** One labelled text block with a copy button; empty text renders nothing. */
function CopyBlock({ label, text, testId, t, onCopy, mono, copyText }: CopyBlockProps) {
    if (!text) return null;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm min-h-[44px]"
                    data-testid={testId}
                    title={t("ui.aplus.copy", "Kopieren")}
                    aria-label={`${t("ui.aplus.copy", "Kopieren")}: ${label}`}
                    onClick={() => onCopy(copyText ?? text)}
                >
                    <Copy size={14} />
                </button>
            </div>
            <p className={`m-0 whitespace-pre-wrap text-sm ${mono ? "font-mono" : ""}`}>{text}</p>
        </div>
    );
}

/** One image module: title, text, the ready-to-paste image prompt, alt text. */
function ModuleBlock({
    module,
    index,
    t,
    onCopy,
}: {
    module: AplusModule;
    index: string;
    t: TFunc;
    onCopy: (text: string) => void;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            <CopyBlock label={t("ui.aplus.module_title", "Titel")} text={module.title} testId={`aplus-copy-${index}-title`} t={t} onCopy={onCopy} />
            <CopyBlock label={t("ui.aplus.module_text", "Text")} text={module.text} testId={`aplus-copy-${index}-text`} t={t} onCopy={onCopy} />
            <CopyBlock
                label={t("ui.aplus.image_prompt", "Bild-Prompt")}
                text={module.image.rendered || module.image.prompt}
                testId={`aplus-copy-${index}-prompt`}
                t={t}
                onCopy={onCopy}
                mono
            />
            <CopyBlock label={t("ui.aplus.alt_text", "Alt-Text")} text={module.alt_text} testId={`aplus-copy-${index}-alt`} t={t} onCopy={onCopy} />
        </div>
    );
}

function FindingsList({ findings, t }: { findings: AplusFinding[]; t: TFunc }) {
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

/**
 * Read-only view of a generated A+ Content package (#887): validator
 * findings first, then every text block and image module with a copy
 * button, and the generation meta at the end.
 *
 * @example
 * <AplusPackageView pkg={pkg} t={t} onCopy={copy} />
 */
export default function AplusPackageView({ pkg, t, onCopy }: AplusPackageViewProps) {
    return (
        <div className="flex flex-col gap-4" data-testid="aplus-package">
            <FindingsList findings={pkg.validation} t={t} />
            <CopyBlock
                label={t("ui.aplus.short_description", "Kurzbeschreibung")}
                text={pkg.short_description}
                testId="aplus-copy-short-description"
                t={t}
                onCopy={onCopy}
            />
            <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {t("ui.aplus.bullets", "Bulletpoints")}
                </span>
                {pkg.bullets.map((bullet, i) => (
                    <CopyBlock
                        key={i}
                        label={bullet.heading}
                        text={bullet.body || bullet.heading}
                        copyText={bullet.body ? `${bullet.heading}: ${bullet.body}` : bullet.heading}
                        testId={`aplus-copy-bullet-${i}`}
                        t={t}
                        onCopy={onCopy}
                    />
                ))}
            </div>
            <span className="text-xs font-semibold text-[var(--text-muted)]">
                {t("ui.aplus.module_header", "Kopfmodul")}
            </span>
            <ModuleBlock module={pkg.module_header} index="header" t={t} onCopy={onCopy} />
            {pkg.module_three_images.length > 0 && (
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {t("ui.aplus.module_three_images", "Drei-Bilder-Modul")}
                </span>
            )}
            {pkg.module_three_images.map((module, i) => (
                <ModuleBlock key={i} module={module} index={`image-${i}`} t={t} onCopy={onCopy} />
            ))}
            <p className="m-0 text-xs text-[var(--text-muted)]" data-testid="aplus-meta">
                {t("ui.aplus.meta", "Modell {model}, Regelwerk {ruleset}, erzeugt {date}")
                    .replace("{model}", pkg.meta.model || "-")
                    .replace("{ruleset}", pkg.meta.ruleset_version)
                    .replace("{date}", new Date(pkg.meta.generated_at).toLocaleString())}
            </p>
        </div>
    );
}
