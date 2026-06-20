/**
 * Article-list app-header chrome.
 *
 * Extracted from ``pages/ArticleList.tsx`` (issue #328) to keep that page
 * under the 1000-line cohesion gate. Pure presentational: the logo, the
 * "Neuer Artikel" SplitButton, the inline secondary-action cluster
 * (New-from-template, Books cross-nav, Import group + chevron, Get-started,
 * Help, Settings, Trash toggle, Fullscreen, Theme) shown at the ``menu:``
 * breakpoint, and the hamburger overflow menu shown below it.
 *
 * All testids, i18n keys, and data-flow are preserved verbatim from the
 * original inline header; the page passes its state + handlers through props.
 *
 * Note: the Books surface (Dashboard.tsx) renders an analogous header inline
 * with a different shape, so this is an ArticleList-local sub-component, not
 * an RCU shared extraction. A future RCU pass could unify the two headers.
 */

import type { Article } from "../../api/client";
import {
    BookOpen,
    ChevronDown,
    Download,
    HelpCircle,
    Menu,
    Plus,
    Rocket,
    Settings,
    Trash,
    Upload,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import type { useI18n } from "../../hooks/useI18n";
import type { useContentTypes } from "../../hooks/useContentTypes";
import { ContentTypeIcon } from "../../utils/icons/contentTypeIcon";
import SplitButton, { type SplitButtonDropdownItem } from "../SplitButton";
import FullscreenButton from "../shared/FullscreenButton";
import ThemeToggle from "../ThemeToggle";
import NewFromTemplateButton from "../book/NewFromTemplateButton";

type Translate = ReturnType<typeof useI18n>["t"];
type ContentTypesSnapshot = ReturnType<typeof useContentTypes>;

interface ArticleListHeaderProps {
    layout: Record<string, string>;
    navigate: (to: string) => void;
    t: Translate;
    newArticleLabel: string;
    newArticleHref: string;
    articleTypesSnapshot: ContentTypesSnapshot;
    onOpenImportWizard: () => void;
    offline: boolean;
    offlineHint: string;
    articles: Article[];
    onBackupExport: () => void;
    onOpenHelp: () => void;
    showTrash: boolean;
    onToggleTrash: () => void;
    trash: Article[];
}

/**
 * Renders the Article-list page header.
 *
 * @param props - State and handlers owned by the ArticleList page.
 */
export default function ArticleListHeader({
    layout,
    navigate,
    t,
    newArticleLabel,
    newArticleHref,
    articleTypesSnapshot,
    onOpenImportWizard,
    offline,
    offlineHint,
    articles,
    onBackupExport,
    onOpenHelp,
    showTrash,
    onToggleTrash,
    trash,
}: ArticleListHeaderProps) {
    return (
        <header className={layout.appHeader} data-testid="article-list-header">
            <div className={layout.appHeaderInner}>
                <div
                    className={layout.logo}
                    onClick={() => navigate("/")}
                    role="button"
                    title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                    data-testid="article-list-dashboard"
                >
                    <BookOpen size={28} strokeWidth={1.5} />
                    <h1 className={`${layout.logoText} hidden sm:inline`}>Bibliogon</h1>
                </div>
                <div className={layout.headerActions}>
                    {/* ARTICLE-TYPES-SSOT-01 C5 (2026-05-29):
                     *  shared SplitButton primitive (extracted in
                     *  C4) replaces the plain "Neuer Artikel"
                     *  button. Default action creates a blogpost
                     *  (the registry's ``default: true`` type);
                     *  chevron exposes the other 4 types.
                     *  Mirrors the Book Dashboard split-button
                     *  shape exactly. Testid pattern follows the
                     *  ``new-book-menu-item-*`` convention from
                     *  the Book Dashboard side. */}
                    <SplitButton
                        buttonClass="btn btn-primary"
                        variant="primary"
                        primaryContent={
                            <>
                                <Plus size={16} />
                                <span className="hide-mobile">{newArticleLabel}</span>
                            </>
                        }
                        onPrimaryClick={() => navigate(newArticleHref)}
                        chevronTooltip={t("ui.articles.new_more_tooltip", "Weitere Artikel-Arten")}
                        dropdownItems={articleTypesSnapshot.ordered
                            // Show ALL content types, including the
                            // default (Blogpost). It is deliberately
                            // NOT filtered out: the user must be able
                            // to see and explicitly pick every type
                            // from the menu. The bare primary button
                            // still creates the default generically
                            // (-> "Neuer Text"); picking Blogpost here
                            // is an explicit choice (-> "Neuer Blogpost").
                            .map(
                                (at): SplitButtonDropdownItem => ({
                                    id: at.id,
                                    content: (
                                        <>
                                            <ContentTypeIcon iconName={at.icon} size={14} />
                                            <span style={{ marginLeft: 6 }}>
                                                {t(at.label_key, at.id)}
                                            </span>
                                        </>
                                    ),
                                    onSelect: () => navigate(`/articles/new?type=${at.id}`),
                                }),
                            )}
                        groupTestId="new-article-group"
                        primaryTestId="article-list-new"
                        chevronTestId="new-article-chevron"
                        itemTestIdPrefix="new-article-menu-item"
                    />

                    {/* Secondary cluster. Fixed-breakpoint collapse via the
                     *  Tailwind `menu:` screen (1200px; see tailwind.css):
                     *  shown inline at >=1200px, hidden below where the
                     *  hamburger takes over. Viewport-only - language /
                     *  default-type changes never toggle it. Mirrors
                     *  Dashboard.tsx. */}
                    <div
                        className="hidden menu:flex items-center gap-[6px]"
                        data-testid="article-header-inline-actions"
                    >
                        <NewFromTemplateButton
                            kind="article"
                            defaultLanguage="de"
                            triggerClassName="btn btn-secondary btn-sm"
                            triggerTestId="article-list-new-from-template"
                            onCreated={(created) => navigate(`/articles/${created.id}`)}
                        />
                        {/* Symmetric cross-nav to Books dashboard. */}
                        <button
                            className="btn btn-secondary btn-sm"
                            data-testid="books-nav-btn"
                            onClick={() => navigate("/")}
                            title={t("ui.dashboard.books_nav_tooltip", "Bücher verwalten")}
                        >
                            {t("ui.dashboard.books_nav", "Bücher")}
                        </button>
                        {/* Symmetric separator before the action
                            cluster — Book Dashboard ships the same
                            separator at the same position. */}
                        <div className={layout.headerSeparator} />
                        {/* AD-HEADER-SINGLE-LINE-01 (2026-05-30):
                            the standalone "Backup" button was folded
                            into this Import-group chevron dropdown to
                            keep the Article-Dashboard header on a
                            single line at 900px+. The ARTICLE-TYPES-
                            SSOT-01 C5 "Neuer Artikel" SplitButton
                            (commit 76737700) had added a second
                            chevron to the cluster, pushing AD wider
                            than the Book Dashboard and re-triggering
                            the two-line wrap. The chevron now exposes
                            secondary data actions — other import
                            sources + Backup export — so the cluster is
                            ~one button narrower than the Book
                            Dashboard, with margin for future
                            additions. ``handleBackupExport`` +
                            ``article-backup-export-btn`` testid are
                            preserved on the dropdown item. */}
                        <div className={layout.importGroup} data-testid="article-import-group">
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="article-import-wizard-btn"
                                onClick={onOpenImportWizard}
                                title={t("ui.dashboard.import", "Importieren")}
                            >
                                <Upload size={14} /> {t("ui.dashboard.import", "Importieren")}
                            </button>
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        type="button"
                                        className={`btn btn-secondary btn-sm ${layout.importChevron}`}
                                        data-testid="article-import-chevron"
                                        title={t(
                                            "ui.articles.import_more_tooltip",
                                            "Import- und Backup-Optionen",
                                        )}
                                        aria-label={t(
                                            "ui.articles.import_more_tooltip",
                                            "Import- und Backup-Optionen",
                                        )}
                                    >
                                        <ChevronDown size={14} />
                                    </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content
                                        className="hamburger-menu-content"
                                        align="end"
                                        sideOffset={4}
                                    >
                                        <DropdownMenu.Item
                                            className="hamburger-menu-item"
                                            data-testid="article-medium-import-btn"
                                            onSelect={() => navigate("/articles/import/medium")}
                                        >
                                            <Upload size={14} />
                                            <span style={{ marginLeft: 6 }}>
                                                {t(
                                                    "ui.medium_import.nav_label",
                                                    "Aus Medium importieren",
                                                )}
                                            </span>
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Separator className="hamburger-menu-separator" />
                                        <DropdownMenu.Item
                                            className="hamburger-menu-item"
                                            data-testid="article-backup-export-btn"
                                            disabled={offline || articles.length === 0}
                                            title={offline ? offlineHint : undefined}
                                            onSelect={onBackupExport}
                                        >
                                            <Download size={14} />
                                            <span style={{ marginLeft: 6 }}>
                                                {t("ui.dashboard.backup", "Backup")}
                                            </span>
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        </div>
                        <div className={layout.headerSeparator} />
                        <button
                            className="btn-icon"
                            onClick={() => navigate("/get-started")}
                            title={t("ui.get_started.title", "Erste Schritte")}
                            data-testid="article-list-get-started"
                        >
                            <Rocket size={18} />
                        </button>
                        <button
                            className="btn-icon"
                            onClick={() => onOpenHelp()}
                            title={t("ui.dashboard.help", "Hilfe")}
                            data-testid="article-list-help"
                        >
                            <HelpCircle size={18} />
                        </button>
                        <button
                            className="btn-icon"
                            onClick={() => navigate("/settings")}
                            title={t("ui.settings.title", "Einstellungen")}
                            data-testid="article-list-settings"
                        >
                            <Settings size={18} />
                        </button>
                        <button
                            className="btn-icon"
                            data-testid="article-list-trash-toggle"
                            onClick={onToggleTrash}
                            style={
                                showTrash
                                    ? { color: "var(--accent)", position: "relative" }
                                    : { position: "relative" }
                            }
                            title={t("ui.articles.trash_title", "Papierkorb")}
                            aria-pressed={showTrash}
                        >
                            <Trash size={18} />
                            {trash.length > 0 && (
                                <span className={layout.trashBadge} data-testid="article-trash-badge">
                                    {trash.length}
                                </span>
                            )}
                        </button>
                        <FullscreenButton testidPrefix="article-list" />
                        <ThemeToggle />
                    </div>

                    {/* Overflow: hamburger menu, shown below the 1200px
                        breakpoint (Tailwind `menu:hidden`). Viewport-only,
                        so it never toggles on language / default-type. */}
                    <div className="menu:hidden">
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    className="btn-icon"
                                    data-testid="article-list-mobile-menu"
                                    aria-label={t("ui.dashboard.menu", "Menü")}
                                >
                                    <Menu size={20} />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    className="hamburger-menu-content"
                                    align="end"
                                    sideOffset={4}
                                >
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        data-testid="article-list-mobile-menu-books"
                                        onSelect={() => navigate("/")}
                                    >
                                        <BookOpen size={16} /> {t("ui.dashboard.books_nav", "Bücher")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={onBackupExport}
                                        disabled={offline}
                                        title={offline ? offlineHint : undefined}
                                    >
                                        <Download size={16} /> {t("ui.dashboard.backup", "Backup")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={onOpenImportWizard}
                                    >
                                        <Upload size={16} /> {t("ui.dashboard.import", "Importieren")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={onToggleTrash}
                                    >
                                        <Trash size={16} /> {t("ui.articles.trash_title", "Papierkorb")}
                                        {trash.length > 0 ? ` (${trash.length})` : ""}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => navigate("/get-started")}
                                    >
                                        <Rocket size={16} /> {t("ui.get_started.title", "Erste Schritte")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => onOpenHelp()}
                                    >
                                        <HelpCircle size={16} /> {t("ui.dashboard.help", "Hilfe")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        onSelect={() => navigate("/settings")}
                                    >
                                        <Settings size={16} /> {t("ui.settings.title", "Einstellungen")}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>
                </div>
            </div>
        </header>
    );
}
