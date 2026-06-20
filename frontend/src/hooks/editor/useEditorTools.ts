import { useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { api, ApiError } from "../../api/client";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../useI18n";
import type { SpellcheckMatch } from "../../components/editor/EditorPanels";

/**
 * Bundle the editor's three review-tool toggles (grammar spellcheck,
 * ms-tools style check, TTS audio preview). Each owns its own loading +
 * result state and reads the live editor text; none of them touch the
 * autosave refs, so the cut is clean.
 *
 * The style-check toggle writes StyleCheckExtension decorations onto
 * the passed editor (``setStyleFindings`` / ``clearStyleFindings``);
 * the navigate-to-issue effect in the host still sets findings
 * directly, which is why ``styleCheckActive`` is also exposed via a
 * setter.
 */
export function useEditorTools(args: {
    editor: TiptapEditor | null;
    bookId?: string;
    chapterTitle?: string;
    aiContextChars: number;
}) {
    const { editor, bookId, chapterTitle, aiContextChars } = args;
    const { t } = useI18n();

    const [showSpellcheck, setShowSpellcheck] = useState(false);
    const [spellcheckResults, setSpellcheckResults] = useState<SpellcheckMatch[]>([]);
    const [spellcheckLoading, setSpellcheckLoading] = useState(false);
    const [styleCheckActive, setStyleCheckActive] = useState(false);
    const [styleCheckLoading, setStyleCheckLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

    const toggleSpellcheck = async () => {
        if (showSpellcheck) {
            setShowSpellcheck(false);
            setSpellcheckResults([]);
            return;
        }
        if (!editor) return;
        setShowSpellcheck(true);
        setSpellcheckLoading(true);
        try {
            const text = editor.getText();
            const data = await api.grammar.check(text);
            setSpellcheckResults(data.matches || []);
            if ((data.matches || []).length === 0) {
                notify.success(t("ui.editor.spellcheck_ok", "Keine Fehler gefunden"));
            }
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(
                detail || t("ui.editor.spellcheck_error", "Rechtschreibprüfung fehlgeschlagen"),
                err,
            );
            setSpellcheckResults([]);
        }
        setSpellcheckLoading(false);
    };

    const toggleStyleCheck = async () => {
        if (!editor) return;
        if (styleCheckActive) {
            editor.commands.clearStyleFindings();
            setStyleCheckActive(false);
            return;
        }
        setStyleCheckLoading(true);
        setStyleCheckActive(true);
        try {
            const text = editor.getText();
            if (!text.trim()) {
                setStyleCheckActive(false);
                setStyleCheckLoading(false);
                return;
            }
            const result = await api.msTools.check(text, "de", bookId);
            editor.commands.setStyleFindings(result.findings);
        } catch {
            notify.error(t("ui.editor.spellcheck_error", "Stilprüfung fehlgeschlagen"));
            setStyleCheckActive(false);
        }
        setStyleCheckLoading(false);
    };

    const previewAudio = async () => {
        if (!editor) return;
        setPreviewLoading(true);
        try {
            const { from, to } = editor.state.selection;
            let text =
                from !== to ? editor.state.doc.textBetween(from, to, "\n") : editor.getText();
            if (text.length > aiContextChars) text = text.slice(0, aiContextChars);
            if (!text.trim()) {
                notify.info(t("ui.editor.preview_no_text", "Kein Text zum Vorlesen"));
                setPreviewLoading(false);
                return;
            }

            try {
                const blob = await api.audiobook.preview(text, bookId || "", chapterTitle || "");
                if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
                setPreviewAudioUrl(URL.createObjectURL(blob));
            } catch (err) {
                const detail = err instanceof ApiError ? err.detail : null;
                notify.error(detail || t("ui.editor.preview_error", "Vorschau fehlgeschlagen"), err);
                setPreviewLoading(false);
                return;
            }
        } catch {
            notify.error(t("ui.editor.preview_error", "Vorschau fehlgeschlagen"));
        }
        setPreviewLoading(false);
    };

    return {
        showSpellcheck,
        spellcheckResults,
        spellcheckLoading,
        toggleSpellcheck,
        styleCheckActive,
        setStyleCheckActive,
        styleCheckLoading,
        toggleStyleCheck,
        previewLoading,
        previewAudio,
        previewAudioUrl,
        setPreviewAudioUrl,
    };
}
