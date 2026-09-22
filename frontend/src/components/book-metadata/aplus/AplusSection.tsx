import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useFeature } from "@astrapi69/feature-strategy-react";

import { api, type BookDetail } from "../../../api/client";
import {
    APLUS_LANGUAGES,
    isAplusMissingFields,
    type AplusMissingField,
    type AplusPackage,
} from "../../../api/platform";
import { FEATURES } from "../../../features/featureConfig";
import { FeatureNotice } from "../../../features/FeatureNotice";
import { copyToClipboard } from "../../../utils/platform/clipboard";
import { notify } from "../../../utils/platform/notify";
import { RadixSelect } from "../../shared/RadixSelect";
import type { TFunc } from "../tabTypes";
import AplusPackageView from "./AplusPackageView";

/** Metadata section that holds each field the generator requires. */
const FIELD_SECTION: Record<string, string> = {
    author: "general",
    description: "general",
};

interface AplusSectionProps {
    book: BookDetail;
    /** The backend AI is enabled and configured (desktop plugin status). */
    aiAvailable: boolean;
    t: TFunc;
    /** Jump to another metadata section, e.g. to fill a missing field. */
    onSelectSection?: (sectionId: string) => void;
}

function initialLanguage(bookLanguage: string | null | undefined): string {
    const base = (bookLanguage || "").slice(0, 2).toLowerCase();
    return (APLUS_LANGUAGES as readonly string[]).includes(base) ? base : "en";
}

function languageLabel(code: string): string {
    try {
        const locale = typeof document !== "undefined" ? document.documentElement.lang || code : code;
        const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
        return name ? `${name} (${code})` : code;
    } catch {
        return code;
    }
}

function MissingFieldsList({
    fields,
    t,
    onSelectSection,
}: {
    fields: AplusMissingField[];
    t: TFunc;
    onSelectSection?: (sectionId: string) => void;
}) {
    return (
        <div
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--warning)] p-3"
            data-testid="aplus-missing"
            role="status"
        >
            <strong className="text-sm">
                {t("ui.aplus.missing_title", "Für A+ Content fehlen noch Angaben:")}
            </strong>
            {fields.map((field) => (
                <div key={field.field} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{t(`ui.aplus.missing_${field.field}`, field.reason)}</span>
                    {onSelectSection && FIELD_SECTION[field.field] && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm min-h-[44px]"
                            data-testid={`aplus-missing-goto-${field.field}`}
                            onClick={() => onSelectSection(FIELD_SECTION[field.field])}
                        >
                            {t("ui.aplus.missing_goto", "Zum Feld")}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * A+ Content section of the book metadata (#887): the UI for the
 * backend-only A+ generator (#825). Loads the cached package for the
 * chosen language, generates or regenerates one, lists missing required
 * fields, and shows the package with copy buttons. Gated off in the web
 * app through `FEATURES.APLUS_CONTENT` (generation and validation run in
 * the backend), so offline it renders a notice and makes no request.
 *
 * @example
 * <AplusSection book={book} aiAvailable={ai.aiAvailable} t={t} onSelectSection={setActiveTab} />
 */
export default function AplusSection({ book, aiAvailable, t, onSelectSection }: AplusSectionProps) {
    const feature = useFeature(FEATURES.APLUS_CONTENT);
    const [language, setLanguage] = useState(() => initialLanguage(book.language));
    const [pkg, setPkg] = useState<AplusPackage | null>(null);
    const [missing, setMissing] = useState<AplusMissingField[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (!feature.isActive) return;
        let cancelled = false;
        setLoading(true);
        setMissing(null);
        api.aplus
            .get(book.id, language)
            .then((cached) => {
                if (!cancelled) setPkg(cached);
            })
            .catch((err: unknown) => {
                if (!cancelled) notify.error(t("ui.aplus.load_error", "A+ Content konnte nicht geladen werden"), err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, language, feature.isActive]);

    if (!feature.isActive) {
        return (
            <div className="flex flex-col gap-3">
                <h3 className="m-0 text-base">{t("ui.aplus.title", "A+ Content")}</h3>
                <FeatureNotice reason={feature.reason} testId="aplus-feature-notice" />
            </div>
        );
    }

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const result = await api.aplus.generate(book.id, { language, force: pkg !== null });
            if (isAplusMissingFields(result)) {
                setMissing(result.missing_fields);
                return;
            }
            setMissing(null);
            setPkg(result);
            notify.success(t("ui.aplus.generated", "A+ Content erzeugt"));
        } catch (err) {
            notify.error(t("ui.aplus.generate_error", "A+ Content konnte nicht erzeugt werden"), err);
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = async (text: string) => {
        const ok = await copyToClipboard(text);
        if (ok) notify.success(t("ui.aplus.copied", "In die Zwischenablage kopiert"));
        else notify.error(t("ui.aplus.copy_failed", "Kopieren nicht möglich"), new Error("clipboard unavailable"));
    };

    return (
        <div className="flex flex-col gap-4" data-testid="aplus-section">
            <div className="flex flex-col gap-1">
                <h3 className="m-0 text-base">{t("ui.aplus.title", "A+ Content")}</h3>
                <p className="m-0 text-sm text-[var(--text-muted)]">
                    {t(
                        "ui.aplus.intro",
                        "Erzeugt aus den Buchdaten ein Amazon-A+-Content-Paket: Kurzbeschreibung, drei Bulletpoints sowie Kopf- und Drei-Bilder-Modul mit Bild-Prompts. Jedes Feld wird gegen das Regelwerk geprüft.",
                    )}
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                    {t("ui.aplus.language", "Sprache")}
                    <RadixSelect
                        value={language}
                        onValueChange={setLanguage}
                        options={APLUS_LANGUAGES.map((code) => ({ value: code, label: languageLabel(code) }))}
                        testId="aplus-language"
                        ariaLabel={t("ui.aplus.language", "Sprache")}
                        disabled={generating}
                    />
                </label>
                <button
                    type="button"
                    className="btn btn-primary btn-sm min-h-[44px]"
                    data-testid="aplus-generate"
                    disabled={!aiAvailable || generating || loading}
                    onClick={() => void handleGenerate()}
                >
                    <Sparkles size={14} />{" "}
                    {generating
                        ? t("ui.aplus.generating", "Erzeugt ...")
                        : pkg
                          ? t("ui.aplus.regenerate", "Neu generieren")
                          : t("ui.aplus.generate", "Generieren")}
                </button>
            </div>
            {!aiAvailable && (
                <p className="m-0 text-sm text-[var(--text-muted)]" data-testid="aplus-ai-unavailable">
                    {t(
                        "ui.aplus.ai_unavailable",
                        "Die KI ist nicht eingerichtet. Aktiviere sie unter Einstellungen > KI-Assistent, um A+ Content zu erzeugen.",
                    )}
                </p>
            )}
            {missing && missing.length > 0 && (
                <MissingFieldsList fields={missing} t={t} onSelectSection={onSelectSection} />
            )}
            {pkg ? (
                <AplusPackageView pkg={pkg} t={t} onCopy={(text) => void handleCopy(text)} />
            ) : (
                !loading && (
                    <p className="m-0 text-sm text-[var(--text-muted)]" data-testid="aplus-empty">
                        {t("ui.aplus.empty", "Für diese Sprache wurde noch kein A+ Content erzeugt.")}
                    </p>
                )
            )}
        </div>
    );
}
