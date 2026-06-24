import { useEffect, useMemo, useState } from "react";
import { Book, BookDetail } from "../../api/client";
import { getStorage } from "../../storage";
import { useStorageMode } from "../../storage/useStorageMode";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { Save, Copy, ChevronLeft, Rocket } from "lucide-react";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../../hooks/useI18n";
import { useBookTypes } from "../../hooks/book/useBookTypes";
import { useEditorPluginStatus } from "../../hooks/editor/useEditorPluginStatus";
import { useBookMetadata } from "../../hooks/book/useBookMetadata";
import { useBookMetadataAi } from "../../hooks/book/useBookMetadataAi";
import {
    NavigationSidebar,
    type NavigationSidebarGroup,
} from "../../lib/components/NavigationSidebar";
import type { NavigableFindingType } from "../quality/QualityTab";
import KdpPublishingWizard from "../kdp-wizard/KdpPublishingWizard";
import { HtmlFieldWithPreview } from "../book-metadata/HtmlField";
import { AuthorAssetsPanel } from "../book-metadata/AuthorAssetsPanel";
import ContentTabs from "../book-metadata/ContentTabs";
import PublishingTabs from "../book-metadata/PublishingTabs";
import ProductionTabs from "../book-metadata/ProductionTabs";
import styles from "../BookMetadataEditor.module.css";

interface Props {
    book: BookDetail;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onBack: () => void;
    allBooks?: Book[];
    onNavigateToIssue?: (chapterId: string, findingType: NavigableFindingType) => void;
    /** Optional refresh callback. Invoked by the AI-template panel
     *  after a successful Fill or Import so the parent can re-fetch
     *  the book and re-pass it via the ``book`` prop. The form's
     *  ``useEffect`` on ``book`` resets state when a fresh book
     *  lands. */
    onRefresh?: () => void;
}

export default function BookMetadataEditor({
    book,
    onSave,
    onBack,
    allBooks,
    onNavigateToIssue,
    onRefresh,
}: Props) {
    const { t } = useI18n();
    // BOOK-TYPES-SSOT-YAML-01 C7: chapter-based vs page-based gate
    // now driven by the registry's ``content_model`` field. The
    // Audiobook + Quality tabs read from ``book.chapters``
    // (AudiobookBookConfig + AudiobookDownloads pass it through;
    // QualityTab runs grammar/style on chapter text). Page-based
    // book types carry no chapters by design, so exposing those
    // tabs ships a write-surface without a consumer (the
    // half-wired-feature-lifecycle anti-pattern). Both tabs hide
    // for content_model="pages". Unknown book_type (e.g. loading
    // state) defaults to chapter-based — same fallback as the
    // pre-migration helper.
    const bookTypesSnapshot = useBookTypes();
    const isChapterBased =
        book.book_type === undefined ||
        bookTypesSnapshot.types[book.book_type]?.content_model === "chapters" ||
        // Fallback: if the registry hasn't loaded yet, assume
        // chapter-based (matches the legacy helper's
        // ``undefined → true`` branch).
        bookTypesSnapshot.types[book.book_type] === undefined;
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [showKdpWizard, setShowKdpWizard] = useState(false);
    // Section navigation: replaces the Radix Tabs bar with the
    // responsive sidebar+hamburger pattern (NavigationSidebar). Plain
    // local state — the editor's chapter view already uses ?view=, so a
    // second ?tab= param is deliberately avoided.
    const [activeTab, setActiveTab] = useState("general");
    // Guard: if a now-hidden conditional section (audiobook/quality for
    // page-based books) is somehow active, fall back to "general". The
    // nav can't surface a hidden item, but the deps could flip after a
    // book_type/registry update.
    const effectiveTab =
        !isChapterBased && (activeTab === "audiobook" || activeTab === "quality")
            ? "general"
            : activeTab;
    // User-defined book languages from ui.custom_languages, merged with
    // the 8 fixed defaults for the language combobox. Silent fallback to
    // [] when the config has no custom languages.
    const [customLanguages, setCustomLanguages] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .settings.getApp()
            .then((config) => {
                if (cancelled) return;
                const uiConfig = (config.ui || {}) as Record<string, unknown>;
                const custom = Array.isArray(uiConfig.custom_languages)
                    ? (uiConfig.custom_languages as string[]).filter(Boolean)
                    : [];
                setCustomLanguages(custom);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);
    const { status: pluginStatus } = useEditorPluginStatus();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    // Backend-only convenience probes resolve through the central feature
    // registry instead of a raw mode check. Both are DESKTOP_ONLY, so
    // isActive is false exactly when offline — behaviour-equivalent to the
    // former mode==="dexie" guard, without the architecture violation.
    const gitSyncActive = useFeature(FEATURES.GIT_SYNC).isActive;
    const kdpCatalogActive = useFeature(FEATURES.KDP_CATEGORY_CATALOG).isActive;

    const meta = useBookMetadata({ book, onSave, kdpCatalogActive, gitSyncActive });
    const { setForm, saving, handleSave } = meta;

    const ai = useBookMetadataAi({
        book,
        form: meta.form,
        offline,
        pluginStatus,
        set: meta.set,
        setKeywords: meta.setKeywords,
    });

    // PDF-BLEED-MARKS-01 C2: the Design-tab Export-PDF button +
    // its state were the half-wired surface that PDF-KDP-FORMATS-01
    // silently left behind (the button ignored the format dropdown
    // selection because the dropdown only lived in PageEditor).
    // Replaced with PdfExportControls (mounted in the
    // Design tab JSX below); state ownership + handler + format +
    // bleed all live in the shared component now.

    const handleCopyFrom = (sourceBook: Book) => {
        setForm((prev) => ({
            ...prev,
            publisher: sourceBook.publisher || prev.publisher || "",
            publisher_city: sourceBook.publisher_city || prev.publisher_city || "",
            backpage_author_bio: sourceBook.backpage_author_bio || prev.backpage_author_bio || "",
            custom_css: sourceBook.custom_css || prev.custom_css || "",
        }));
        setShowCopyDialog(false);
        notify.success(t("ui.metadata.copy_success", "Verlag und Autoren-Info übernommen"));
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    // Section nav groups. Reuses the existing per-tab i18n labels +
    // ``metadata-tab-*`` testids verbatim so current tests + E2E
    // selectors still resolve. Audiobook + Quality are present only for
    // chapter-based books (the conditional-presence pattern).
    const navGroups: NavigationSidebarGroup[] = useMemo(
        () => [
            {
                label: t("ui.metadata.group_content", "Inhalt"),
                items: [
                    {
                        id: "general",
                        label: t("ui.metadata.tab_general", "Allgemein"),
                        testId: "metadata-tab-general",
                    },
                    {
                        id: "story",
                        label: t("ui.metadata.tab_story", "Story"),
                        testId: "metadata-tab-story",
                    },
                    {
                        id: "design",
                        label: t("ui.metadata.tab_design", "Design"),
                        testId: "metadata-tab-design",
                    },
                ],
            },
            {
                label: t("ui.metadata.group_publishing", "Veröffentlichung"),
                items: [
                    {
                        id: "publisher",
                        label: t("ui.metadata.tab_publisher", "Verlag"),
                        testId: "metadata-tab-publisher",
                    },
                    {
                        id: "isbn",
                        label: t("ui.metadata.tab_isbn", "ISBN"),
                        testId: "metadata-tab-isbn",
                    },
                    {
                        id: "marketing",
                        label: t("ui.metadata.tab_marketing", "Marketing"),
                        testId: "metadata-tab-marketing",
                    },
                ],
            },
            {
                label: t("ui.metadata.group_production", "Produktion"),
                items: isChapterBased
                    ? [
                          {
                              id: "audiobook",
                              label: t("ui.metadata.tab_audiobook", "Audiobook"),
                              testId: "metadata-tab-audiobook",
                          },
                          {
                              id: "quality",
                              label: t("ui.metadata.tab_quality", "Qualitaet"),
                              testId: "metadata-tab-quality",
                          },
                      ]
                    : [],
            },
            {
                label: t("ui.metadata.group_advanced", "Erweitert"),
                items: [
                    {
                        id: "ai_template",
                        label: t("ui.metadata.tab_ai_template", "KI-Vorlage"),
                        testId: "metadata-tab-ai-template",
                    },
                ],
            },
        ],
        [t, isChapterBased],
    );

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={`${styles.header} flex-wrap gap-2`}>
                <div className="icon-row">
                    <button
                        className="btn-icon"
                        onClick={onBack}
                        data-testid="metadata-back"
                        title={t("ui.sidebar.back_to_dashboard", "Zurück")}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <h2 className={styles.title}>{t("ui.sidebar.metadata", "Buch-Metadaten")}</h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    {otherBooks.length > 0 && (
                        <button
                            className="btn btn-secondary btn-sm min-h-[44px]"
                            onClick={() => setShowCopyDialog(!showCopyDialog)}
                        >
                            <Copy size={14} /> {t("ui.metadata.copy_from", "Von Buch übernehmen")}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        onClick={() => setShowKdpWizard(true)}
                        data-testid="metadata-open-kdp-wizard"
                        title={t(
                            "ui.kdp_publishing_wizard.open_tooltip",
                            "KDP-Veröffentlichungs-Assistenten öffnen",
                        )}
                    >
                        <Rocket size={14} />{" "}
                        {t("ui.kdp_publishing_wizard.open_button", "Für KDP veröffentlichen")}
                    </button>
                    <button
                        className="btn btn-primary btn-sm min-h-[44px]"
                        onClick={handleSave}
                        disabled={saving}
                        data-testid="metadata-save"
                    >
                        <Save size={14} />{" "}
                        {saving
                            ? t("ui.editor.saving", "Speichert...")
                            : t("ui.common.save", "Speichern")}
                    </button>
                </div>
            </div>

            {showCopyDialog && (
                <div className={styles.copyDialog}>
                    <p
                        style={{
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                            marginBottom: 8,
                        }}
                    >
                        {t(
                            "ui.metadata.copy_hint",
                            "Übernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:",
                        )}
                    </p>
                    {otherBooks.map((b) => (
                        <button
                            key={b.id}
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleCopyFrom(b)}
                            style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                marginBottom: 4,
                            }}
                        >
                            {b.title} <span className="muted">- {b.author}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Section navigation (responsive sidebar + hamburger) */}
            <div className={styles.layout}>
                <div className={styles.sidebarColumn}>
                    <NavigationSidebar
                        groups={navGroups}
                        activeId={effectiveTab}
                        onSelect={setActiveTab}
                        ariaLabel={t(
                            "ui.sidebar.metadata",
                            "Buch-Metadaten",
                        )}
                    />
                </div>

                <div className={styles.contentColumn}>
                    <ContentTabs
                        activeTab={effectiveTab}
                        book={book}
                        meta={meta}
                        t={t}
                        customLanguages={customLanguages}
                        setCustomLanguages={setCustomLanguages}
                    />
                    <PublishingTabs
                        activeTab={effectiveTab}
                        book={book}
                        meta={meta}
                        ai={ai}
                        t={t}
                    />
                    <ProductionTabs
                        activeTab={effectiveTab}
                        book={book}
                        meta={meta}
                        isChapterBased={isChapterBased}
                        onNavigateToIssue={onNavigateToIssue}
                        onRefresh={onRefresh}
                    />
                </div>
            </div>

            <KdpPublishingWizard
                open={showKdpWizard}
                book={book}
                onClose={() => setShowKdpWizard(false)}
            />
        </div>
    );
}

// Re-exported for back-compat with existing import sites (tests import
// these named exports from "./BookMetadataEditor"). The implementations
// live in the co-located ./book-metadata/* modules.
export { sanitizeAmazonHtml } from "../book-metadata/HtmlField";
export { HtmlFieldWithPreview };
export { AuthorAssetsPanel };
