import type { BookDetail } from "../../api/client";
import QualityTab, { NavigableFindingType } from "../quality/QualityTab";
import AITemplatePanel from "../shared/AITemplatePanel";
import AudiobookBookConfig from "./AudiobookConfig";
import AudiobookDownloads from "./AudiobookDownloads";
import type { BookMetadataState } from "./tabTypes";
import styles from "../BookMetadataEditor.module.css";

interface ProductionTabsProps {
    activeTab: string;
    book: BookDetail;
    meta: BookMetadataState;
    isChapterBased: boolean;
    onNavigateToIssue?: (chapterId: string, findingType: NavigableFindingType) => void;
    onRefresh?: () => void;
}

/**
 * The "Produktion" + "Erweitert" sections of the book metadata editor: the
 * Audiobook, Quality, and KI-Vorlage tabs. Audiobook + Quality only render
 * for chapter-based books (the conditional-presence pattern). Renders the
 * tab matching ``activeTab`` (or ``null`` otherwise).
 *
 * Extracted from BookMetadataEditor.tsx (god-file split, #207) as a pure
 * structural move — same JSX, same testids.
 *
 * @example
 * <ProductionTabs activeTab={effectiveTab} book={book} meta={meta}
 *   isChapterBased={isChapterBased} onNavigateToIssue={onNavigateToIssue}
 *   onRefresh={onRefresh} />
 */
export default function ProductionTabs({
    activeTab,
    book,
    meta,
    isChapterBased,
    onNavigateToIssue,
    onRefresh,
}: ProductionTabsProps) {
    const {
        form,
        set,
        audiobookOverwrite,
        setAudiobookOverwrite,
        audiobookSkipTypes,
        setAudiobookSkipTypes,
    } = meta;

    if (isChapterBased && activeTab === "audiobook") {
        return (
            <div className={styles.tabContent}>
                <AudiobookBookConfig
                    bookLanguage={book.language}
                    bookTitle={book.title}
                    bookChapters={book.chapters || []}
                    engine={form.tts_engine || ""}
                    voice={form.tts_voice || ""}
                    speed={form.tts_speed || "1.0"}
                    merge={form.audiobook_merge || "merged"}
                    customFilename={form.audiobook_filename || ""}
                    overwriteExisting={audiobookOverwrite}
                    skipChapterTypes={audiobookSkipTypes}
                    onEngineChange={(v: string) => {
                        set("tts_engine", v);
                        set("tts_voice", "");
                    }}
                    onVoiceChange={(v: string) => set("tts_voice", v)}
                    onSpeedChange={(v: string) => set("tts_speed", v)}
                    onMergeChange={(v: string) => set("audiobook_merge", v)}
                    onCustomFilenameChange={(v: string) => set("audiobook_filename", v)}
                    onOverwriteExistingChange={setAudiobookOverwrite}
                    onSkipChapterTypesChange={setAudiobookSkipTypes}
                />
                <AudiobookDownloads
                    bookId={book.id}
                    bookTitle={book.title}
                    bookChapters={book.chapters || []}
                />
            </div>
        );
    }

    if (isChapterBased && activeTab === "quality") {
        return (
            <div className={styles.tabContent}>
                <QualityTab
                    bookId={book.id}
                    bookTitle={book.title}
                    onNavigateToIssue={onNavigateToIssue}
                />
            </div>
        );
    }

    if (activeTab === "ai_template") {
        return (
            <div className={styles.tabContent}>
                <AITemplatePanel kind="book" id={book.id} onApplied={onRefresh} />
            </div>
        );
    }

    return null;
}
