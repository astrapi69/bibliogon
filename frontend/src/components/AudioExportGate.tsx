import {Headphones, Loader} from "lucide-react";

import {useAudiobookJob} from "../contexts/AudiobookJobContext";
import {useI18n} from "../hooks/useI18n";
import AudioExportProgress from "./AudioExportProgress";

/**
 * Mounted at the App root. Reads the active audiobook job from
 * AudiobookJobContext and renders either the full progress modal or
 * a small floating badge in the bottom-left corner when the user has
 * minimized the modal. Clicking the badge re-opens the modal.
 */
export default function AudioExportGate() {
    const {jobId, bookTitle, modalOpen, expand, minimize, clear} = useAudiobookJob();
    const {t} = useI18n();

    if (!jobId) return null;

    if (modalOpen) {
        return (
            <AudioExportProgress
                jobId={jobId}
                bookTitle={bookTitle}
                onClose={clear}
                onMinimize={minimize}
            />
        );
    }

    return (
        <button
            type="button"
            onClick={expand}
            title={t("ui.audio_progress.expand_hint", "Audiobook-Export anzeigen")}
            style={{
                position: "fixed",
                bottom: 16,
                left: 16,
                zIndex: 9000,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                background: "var(--accent)",
                color: "var(--text-inverse, #fff)",
                border: "none",
                borderRadius: 999,
                boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                fontWeight: 500,
            }}
        >
            <Loader size={16} style={{animation: "spin 1s linear infinite"}} />
            <Headphones size={16} />
            <span>{t("ui.audio_progress.badge_label", "Audiobook laeuft")}</span>
        </button>
    );
}
