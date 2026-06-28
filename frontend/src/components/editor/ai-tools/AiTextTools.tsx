import { useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { WandSparkles, Languages, Loader2, Check, Copy, X } from "lucide-react";

import { useI18n } from "../../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES, FEATURE_REASON } from "../../../features/featureConfig";
import { useStorageMode } from "../../../storage/useStorageMode";
import { aiCorrectGrammar, aiTranslate } from "../../../ai/text-tools/aiTextTools";
import { classifyAiClientError } from "../../../ai/llmClient";
import { notify } from "../../../utils/platform/notify";
import { copyToClipboard } from "../../../utils/platform/clipboard";
import { RadixSelect } from "../../shared/RadixSelect";

type ToolKind = "grammar" | "translate";

/** Target languages for AI translation. Mirrors the 8 UI languages Bibliogon
 *  ships (backend/config/i18n/), shown as endonyms. */
const LANGUAGES: { code: string; label: string }[] = [
    { code: "de", label: "Deutsch" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "pt", label: "Português" },
    { code: "el", label: "Ελληνικά" },
    { code: "tr", label: "Türkçe" },
    { code: "ja", label: "日本語" },
];

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** Turn the model's plain-text answer into TipTap-insertable HTML: one
 *  paragraph per line (inline marks of the original are not recovered — same
 *  caveat the backend translate path carries). */
function textToParagraphsHtml(text: string): string {
    const html = text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");
    return html || "<p></p>";
}

/**
 * Offline AI text tools for the editor (#661): grammar correction + translation
 * of the current selection, run browser-direct against the user's own provider
 * key. Rendered only in Dexie (offline / PWA) mode — online the backend
 * LanguageTool spellcheck + DeepL article translation remain the path. Each
 * action is gated by its key-dependent feature (`ai-grammar` / `ai-translate`):
 * active with a configured key, disabled + explained without (policy #78).
 */
export default function AiTextTools({
    editor,
    markdownMode,
}: {
    editor: TiptapEditor | null;
    markdownMode?: boolean;
}) {
    const { t } = useI18n();
    const { mode } = useStorageMode();
    const grammar = useFeature(FEATURES.AI_GRAMMAR);
    const translate = useFeature(FEATURES.AI_TRANSLATE);

    const [tool, setTool] = useState<ToolKind | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [targetLang, setTargetLang] = useState("en");
    const selectionRef = useRef<{ from: number; to: number; hasSelection: boolean } | null>(null);

    // Offline-only: in API mode the backend tools cover grammar/translation and
    // the browser has no provider key (the backend strips it from settings).
    if (mode !== "dexie" || !editor || markdownMode) return null;

    function captureSelection(): { text: string; hasSelection: boolean } {
        const { from, to } = editor!.state.selection;
        const hasSelection = from !== to;
        const text = hasSelection
            ? editor!.state.doc.textBetween(from, to, "\n")
            : editor!.getText();
        selectionRef.current = { from, to, hasSelection };
        return { text, hasSelection };
    }

    function reportError(err: unknown) {
        const kind = classifyAiClientError(err);
        const message =
            kind === "auth_error"
                ? t("ui.editor.ai_tools_error_key", "Ungültiger oder fehlender API-Schlüssel.")
                : t("ui.editor.ai_tools_error", "KI-Aktion fehlgeschlagen.");
        notify.error(message, err);
    }

    async function runGrammar() {
        const { text } = captureSelection();
        if (!text.trim()) {
            notify.info(t("ui.editor.ai_tools_no_text", "Kein Text ausgewählt."));
            return;
        }
        setTool("grammar");
        setResult(null);
        setLoading(true);
        try {
            const { text: corrected } = await aiCorrectGrammar(text);
            setResult(corrected);
        } catch (err) {
            reportError(err);
            setTool(null);
        }
        setLoading(false);
    }

    function openTranslate() {
        captureSelection();
        setTool("translate");
        setResult(null);
    }

    async function runTranslate() {
        const { text } = captureSelection();
        if (!text.trim()) {
            notify.info(t("ui.editor.ai_tools_no_text", "Kein Text ausgewählt."));
            return;
        }
        setResult(null);
        setLoading(true);
        try {
            const label = LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;
            const { text: translated } = await aiTranslate(text, label);
            setResult(translated);
        } catch (err) {
            reportError(err);
        }
        setLoading(false);
    }

    function close() {
        setTool(null);
        setResult(null);
        setLoading(false);
    }

    function applyResult() {
        if (result == null) return;
        const sel = selectionRef.current;
        const html = textToParagraphsHtml(result);
        if (sel && sel.hasSelection) {
            editor!.chain().focus().insertContentAt({ from: sel.from, to: sel.to }, html).run();
        } else {
            editor!.chain().focus().setContent(html).run();
        }
        notify.success(t("ui.editor.ai_tools_applied", "Übernommen."));
        close();
    }

    async function copyResult() {
        if (result == null) return;
        const ok = await copyToClipboard(result);
        if (ok) notify.success(t("ui.editor.ai_tools_copied", "In die Zwischenablage kopiert."));
        else notify.error(t("ui.toolbar.copy_failed", "Konnte nicht kopieren."));
    }

    const hasSelection = selectionRef.current?.hasSelection ?? false;

    return (
        <div
            data-testid="editor-ai-tools"
            style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 12px" }}
        >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="editor-ai-grammar"
                    onClick={() => void runGrammar()}
                    disabled={grammar.isDisabled || loading}
                    title={
                        grammar.isDisabled
                            ? t(
                                  grammar.reason ?? FEATURE_REASON.REQUIRES_AI_KEY,
                                  "Konfiguriere deinen API-Schlüssel unter Einstellungen > KI.",
                              )
                            : t("ui.editor.ai_grammar_title", "Grammatik der Auswahl mit KI korrigieren")
                    }
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                    <WandSparkles size={14} />
                    {t("ui.editor.ai_grammar", "Grammatik (KI)")}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="editor-ai-translate"
                    onClick={openTranslate}
                    disabled={translate.isDisabled || loading}
                    title={
                        translate.isDisabled
                            ? t(
                                  translate.reason ?? FEATURE_REASON.REQUIRES_AI_KEY,
                                  "Konfiguriere deinen API-Schlüssel unter Einstellungen > KI.",
                              )
                            : t("ui.editor.ai_translate_title", "Auswahl mit KI übersetzen")
                    }
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                    <Languages size={14} />
                    {t("ui.editor.ai_translate", "Übersetzen (KI)")}
                </button>
            </div>

            {tool && (
                <div
                    data-testid="editor-ai-panel"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: 8,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-secondary)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: "0.8125rem" }}>
                            {tool === "grammar"
                                ? t("ui.editor.ai_grammar", "Grammatik (KI)")
                                : t("ui.editor.ai_translate", "Übersetzen (KI)")}
                        </strong>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: "auto" }}
                            data-testid="editor-ai-close"
                            onClick={close}
                            aria-label={t("ui.common.close", "Schließen")}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {tool === "translate" && result == null && !loading && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <RadixSelect
                                testId="editor-ai-lang"
                                value={targetLang}
                                onValueChange={setTargetLang}
                                className="is-block"
                                ariaLabel={t("ui.editor.ai_target_lang", "Zielsprache")}
                                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                            />
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                data-testid="editor-ai-run"
                                onClick={() => void runTranslate()}
                            >
                                {t("ui.editor.ai_translate_run", "Übersetzen")}
                            </button>
                        </div>
                    )}

                    {loading && (
                        <span
                            data-testid="editor-ai-loading"
                            style={{ color: "var(--text-muted)", display: "inline-flex", gap: 4 }}
                        >
                            <Loader2 size={14} className="spin" />
                            {t("ui.editor.ai_tools_running", "KI arbeitet…")}
                        </span>
                    )}

                    {result != null && !loading && (
                        <>
                            <div
                                data-testid="editor-ai-result"
                                style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: "0.8125rem",
                                    color: "var(--text-primary)",
                                    maxHeight: 220,
                                    overflowY: "auto",
                                    padding: 6,
                                    background: "var(--bg-primary)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                }}
                            >
                                {result}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                                {hasSelection ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        data-testid="editor-ai-apply"
                                        onClick={applyResult}
                                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                                    >
                                        <Check size={14} />
                                        {t("ui.editor.ai_tools_apply", "Auswahl ersetzen")}
                                    </button>
                                ) : (
                                    <span
                                        data-testid="editor-ai-no-selection"
                                        style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                                    >
                                        {t(
                                            "ui.editor.ai_tools_select_hint",
                                            "Markiere Text, um ihn direkt zu ersetzen.",
                                        )}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    data-testid="editor-ai-copy"
                                    onClick={() => void copyResult()}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                    <Copy size={14} />
                                    {t("ui.editor.ai_tools_copy", "Kopieren")}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
