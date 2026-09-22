import { useState } from "react";
import { ClipboardCopy, Sparkles } from "lucide-react";
import { useFeature } from "@astrapi69/feature-strategy-react";

import { api, type BookDetail } from "../../../api/client";
import {
    APLUS_LANGUAGES,
    isAplusMissingFields,
    type AplusFinding,
    type AplusMissingField,
} from "../../../api/platform";
import { FEATURES } from "../../../features/featureConfig";
import { useAplusDocument, type AplusSaveState } from "../../../hooks/book/useAplusDocument";
import {
    hasContent,
    newModuleId,
    packageToDocument,
    type AplusDocumentDraft,
    type GeneratedAplusPackage,
} from "../../../lib/utils/aplus/aplusDocument";
import { documentToText, type AplusTextLabels } from "../../../lib/utils/aplus/aplusText";
import { copyToClipboard } from "../../../utils/platform/clipboard";
import { notify } from "../../../utils/platform/notify";
import { useDialog } from "../../shared/AppDialog";
import { RadixSelect } from "../../shared/RadixSelect";
import type { TFunc } from "../tabTypes";
import AplusDocumentEditor from "./AplusDocumentEditor";
import AplusFindings from "./AplusFindings";
import { templateLabel } from "./AplusModuleCard";

/** Metadata section that holds each field the AI generator requires. */
const FIELD_SECTION: Record<string, string> = {
    author: "general",
    description: "general",
};

/** A plain language tag (`de`, `pt-BR`), the same shape the backend accepts. */
function isLanguageTag(code: string): boolean {
    const [base, region, ...rest] = code.split("-");
    if (rest.length > 0 || !/^[a-z]{2,3}$/.test(base)) return false;
    return region === undefined || /^[A-Za-z0-9]{2,8}$/.test(region);
}

interface AplusSectionProps {
    book: BookDetail;
    /** The backend AI is enabled and configured (desktop plugin status). */
    aiAvailable: boolean;
    t: TFunc;
    /** Jump to another metadata section, e.g. to fill a missing field. */
    onSelectSection?: (sectionId: string) => void;
}

const isAiLanguage = (code: string) => (APLUS_LANGUAGES as readonly string[]).includes(code);

/** The AI languages plus the book's own language, which a manual document may use. */
function languageOptions(bookLanguage: string): string[] {
    const own = isLanguageTag(bookLanguage) && !isAiLanguage(bookLanguage) ? [bookLanguage] : [];
    return [...own, ...APLUS_LANGUAGES];
}

function initialLanguage(bookLanguage: string): string {
    return isLanguageTag(bookLanguage) ? bookLanguage : "en";
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

function textLabels(t: TFunc): AplusTextLabels {
    return {
        contentName: t("ui.aplus.content_name", "Name des Inhalts"),
        shortDescription: t("ui.aplus.short_description", "Kurzbeschreibung"),
        characters: t("ui.aplus.characters", "Zeichen"),
        bullets: t("ui.aplus.bullets", "Bulletpoints"),
        module: t("ui.aplus.module", "Modul"),
        moduleTitle: t("ui.aplus.module_headline", "Modul-Überschrift"),
        image: t("ui.aplus.image", "Bild"),
        title: t("ui.aplus.module_title", "Titel"),
        text: t("ui.aplus.module_text", "Text"),
        imagePrompt: t("ui.aplus.image_prompt", "Bild-Prompt"),
        altText: t("ui.aplus.alt_text", "Alt-Text"),
        caption: t("ui.aplus.caption", "Bildunterschrift"),
        asin: t("ui.aplus.asin", "ASIN"),
        templateName: (id) => templateLabel(id, t),
        fieldLabel: (spec) => t(spec.labelKey, spec.labelFallback).replace("{n}", String(spec.n ?? "")),
        slotLabel: (spec) => (spec.labelKey ? t(spec.labelKey, spec.labelFallback ?? "") : ""),
    };
}

function saveStateLabel(state: AplusSaveState, t: TFunc): string {
    if (state === "saving") return t("ui.aplus.saving", "Speichert ...");
    if (state === "saved") return t("ui.aplus.saved", "Gespeichert");
    if (state === "error") return t("ui.aplus.save_failed", "Nicht gespeichert");
    return "";
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
            <strong className="text-sm">{t("ui.aplus.missing_title", "Für A+ Content fehlen noch Angaben:")}</strong>
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

/** Why AI fill is unavailable, or null when it can run. */
function aiBlocker(featureReason: string | undefined, aiAvailable: boolean, language: string, t: TFunc): string | null {
    if (featureReason) return t(featureReason, "Nur in der Desktop-App verfügbar.");
    if (!aiAvailable) {
        return t(
            "ui.aplus.ai_unavailable",
            "Die KI ist nicht eingerichtet. Aktiviere sie in den Einstellungen unter KI-Assistent, um A+ Content zu erzeugen.",
        );
    }
    if (!isAiLanguage(language)) {
        return t("ui.aplus.ai_language_unsupported", "KI-Vorschläge gibt es für Deutsch, Englisch, Französisch und Spanisch.");
    }
    return null;
}

/**
 * A+ Content section of the book metadata (#887, #891): the author's
 * editable A+ document for one language, built from module templates and
 * saved through the storage seam, so it works in the desktop app, the web app
 * and on a phone. "Fill with AI" is optional and desktop-only; it asks before
 * overwriting typed text and shows the validator findings afterwards.
 *
 * @example
 * <AplusSection book={book} aiAvailable={ai.aiAvailable} t={t} onSelectSection={setActiveTab} />
 */
export default function AplusSection({ book, aiAvailable, t, onSelectSection }: AplusSectionProps) {
    const aiFeature = useFeature(FEATURES.APLUS_AI);
    const dialog = useDialog();
    const bookLanguage = (book.language || "").toLowerCase();
    const [language, setLanguage] = useState(() => initialLanguage(bookLanguage));
    const [findings, setFindings] = useState<AplusFinding[]>([]);
    const [missing, setMissing] = useState<AplusMissingField[] | null>(null);
    const [filling, setFilling] = useState(false);
    const aplus = useAplusDocument({
        bookId: book.id,
        bookTitle: book.title,
        language,
        onError: (err) => notify.error(t("ui.aplus.save_error", "A+ Content konnte nicht gespeichert werden"), err),
    });
    const blocker = aiBlocker(aiFeature.isActive ? undefined : aiFeature.reason, aiAvailable, language, t);

    const changeLanguage = (next: string) => {
        setFindings([]);
        setMissing(null);
        setLanguage(next);
    };

    const fillWithAi = async (doc: AplusDocumentDraft) => {
        if (hasContent(doc)) {
            const ok = await dialog.confirm(
                t("ui.aplus.ai_fill_confirm_title", "Mit KI überschreiben?"),
                t(
                    "ui.aplus.ai_fill_confirm_message",
                    "Kurzbeschreibung, Bulletpoints und die Standard-Module werden durch den KI-Vorschlag ersetzt. Name des Inhalts und Modulnamen bleiben.",
                ),
                "danger",
            );
            if (!ok) return;
        }
        setFilling(true);
        try {
            const result = await api.aplus.generate(book.id, { language, force: true });
            if (isAplusMissingFields(result)) {
                setMissing(result.missing_fields);
                return;
            }
            setMissing(null);
            setFindings(result.validation);
            await aplus.replace(packageToDocument(result as GeneratedAplusPackage, doc, newModuleId));
            notify.success(t("ui.aplus.generated", "A+ Content erzeugt"));
        } catch (err) {
            notify.error(t("ui.aplus.generate_error", "A+ Content konnte nicht erzeugt werden"), err);
        } finally {
            setFilling(false);
        }
    };

    const copyAll = async (doc: AplusDocumentDraft) => {
        const ok = await copyToClipboard(documentToText(doc, textLabels(t)));
        if (ok) notify.success(t("ui.aplus.copied", "In die Zwischenablage kopiert"));
        else notify.error(t("ui.aplus.copy_failed", "Kopieren nicht möglich"), new Error("clipboard unavailable"));
    };

    const doc = aplus.document;
    return (
        <div className="flex flex-col gap-4" data-testid="aplus-section">
            <div className="flex flex-col gap-1">
                <h3 className="m-0 text-base">{t("ui.aplus.title", "A+ Content")}</h3>
                <p className="m-0 text-sm text-[var(--text-muted)]">
                    {t(
                        "ui.aplus.intro",
                        "Kurzbeschreibung, Bulletpoints und Module für Amazons A+ Manager. Von Hand ausfüllen oder mit KI vorschlagen lassen; jedes Feld lässt sich einzeln kopieren.",
                    )}
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                    {t("ui.aplus.language", "Sprache")}
                    <RadixSelect
                        value={language}
                        onValueChange={changeLanguage}
                        options={languageOptions(bookLanguage).map((code) => ({ value: code, label: languageLabel(code) }))}
                        testId="aplus-language"
                        ariaLabel={t("ui.aplus.language", "Sprache")}
                        disabled={filling}
                    />
                </label>
                <button
                    type="button"
                    className="btn btn-primary btn-sm min-h-[44px]"
                    data-testid="aplus-ai-fill"
                    disabled={!doc || blocker !== null || filling}
                    title={blocker ?? undefined}
                    onClick={() => doc && void fillWithAi(doc)}
                >
                    <Sparkles size={14} />{" "}
                    {filling ? t("ui.aplus.generating", "Erzeugt ...") : t("ui.aplus.ai_fill", "Mit KI füllen")}
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    data-testid="aplus-copy-all"
                    disabled={!doc}
                    onClick={() => doc && void copyAll(doc)}
                >
                    <ClipboardCopy size={14} /> {t("ui.aplus.copy_all", "Alles kopieren")}
                </button>
                <span className="min-h-[1.25rem] text-xs text-[var(--text-muted)]" data-testid="aplus-save-state" aria-live="polite">
                    {saveStateLabel(aplus.saveState, t)}
                </span>
            </div>
            {blocker && (
                <p className="m-0 text-sm text-[var(--text-muted)]" data-testid="aplus-ai-unavailable">
                    {blocker}
                </p>
            )}
            {missing && missing.length > 0 && (
                <MissingFieldsList fields={missing} t={t} onSelectSection={onSelectSection} />
            )}
            <AplusFindings findings={findings} t={t} />
            {doc && <AplusDocumentEditor document={doc} onChange={aplus.update} t={t} />}
        </div>
    );
}
