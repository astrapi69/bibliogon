import { type NavigateFunction } from "react-router-dom";
import {
    CircleHelp,
    Download,
    Hash,
    Home,
    Keyboard,
    List,
    Sparkles,
    Trash2,
} from "lucide-react";

import { type EditorMenuGroup } from "../lib/components/EditorMenu";

type TranslateFn = (key: string, fallback?: string) => string;

/** The article export formats wired into the Datei submenu. Mirrors the
 *  `ExportFormat` union the ArticleEditor's `handleExport` accepts. */
export type ArticleExportFormat = "markdown" | "html" | "pdf" | "docx" | "latex";

/** AI-generated metadata fields the Werkzeuge group can trigger. Mirrors the
 *  ArticleEditor's `AiMetaField`. */
export type ArticleAiField = "seo_title" | "seo_description" | "tags";

/**
 * Everything the structured article-editor menu needs. The ArticleEditor owns
 * the underlying handlers and passes them in; this keeps the menu definition
 * out of the editor component, mirroring `buildBookEditorMenu`.
 */
export interface ArticleEditorMenuDeps {
    t: TranslateFn;
    navigate: NavigateFunction;
    onExport: (format: ArticleExportFormat) => void;
    onDelete: () => void;
    onAiGenerate: (field: ArticleAiField) => void;
}

/** The built menu, consumed by `<EditorMenu groups disabled onAction />`. */
export interface BuiltEditorMenu {
    groups: EditorMenuGroup[];
    disabled: Record<string, string>;
    onAction: (actionId: string) => void;
}

const EXPORT_FORMATS: readonly ArticleExportFormat[] = [
    "markdown",
    "html",
    "pdf",
    "docx",
    "latex",
];

/** Format names are brand/loanwords kept verbatim across all locales. */
const EXPORT_FORMAT_LABEL: Record<ArticleExportFormat, string> = {
    markdown: "Markdown",
    html: "HTML",
    pdf: "PDF",
    docx: "DOCX",
    latex: "LaTeX",
};

/**
 * Build the article editor's structured menu (groups + dispatcher).
 *
 * Articles are single documents, so there is no Kapitel group (per the
 * feature spec). The groups are Datei (Export submenu + Löschen), Ansicht
 * (navigation), Werkzeuge (AI metadata generation), and Hilfe. The same
 * generic `EditorMenu` renders it; only the items differ from the book menu.
 */
export function buildArticleEditorMenu(deps: ArticleEditorMenuDeps): BuiltEditorMenu {
    const { t, navigate, onExport, onDelete, onAiGenerate } = deps;

    const groups: EditorMenuGroup[] = [
        {
            label: t("ui.editor_menu.file", "Datei"),
            items: [
                {
                    id: "export",
                    label: t("ui.editor_menu.export", "Exportieren"),
                    icon: <Download size={16} />,
                    submenu: EXPORT_FORMATS.map((format) => ({
                        id: `export-${format}`,
                        label: EXPORT_FORMAT_LABEL[format],
                    })),
                },
                { separator: true },
                {
                    id: "delete",
                    label: t("ui.editor_menu.delete_article", "Artikel löschen"),
                    icon: <Trash2 size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.view", "Ansicht"),
            items: [
                {
                    id: "article-list",
                    label: t("ui.editor_menu.article_list", "Zur Artikelliste"),
                    icon: <List size={16} />,
                },
                {
                    id: "dashboard",
                    label: t("ui.editor_menu.dashboard", "Dashboard"),
                    icon: <Home size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.tools", "Werkzeuge"),
            items: [
                {
                    id: "ai-seo-title",
                    label: t("ui.editor_menu.gen_seo_title", "SEO-Titel generieren"),
                    icon: <Sparkles size={16} />,
                },
                {
                    id: "ai-seo-description",
                    label: t("ui.editor_menu.gen_seo_description", "SEO-Beschreibung generieren"),
                    icon: <Sparkles size={16} />,
                },
                {
                    id: "ai-tags",
                    label: t("ui.editor_menu.gen_tags", "Tags generieren"),
                    icon: <Hash size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.help", "Hilfe"),
            items: [
                {
                    id: "shortcuts",
                    label: t("ui.editor_menu.shortcuts", "Tastaturkürzel"),
                    icon: <Keyboard size={16} />,
                    shortcut: "Ctrl+?",
                },
                {
                    id: "help",
                    label: t("ui.editor_menu.help_page", "Hilfe"),
                    icon: <CircleHelp size={16} />,
                },
            ],
        },
    ];

    const onAction = (actionId: string) => {
        if (actionId.startsWith("export-")) {
            onExport(actionId.slice("export-".length) as ArticleExportFormat);
            return;
        }
        switch (actionId) {
            case "delete":
                onDelete();
                break;
            case "article-list":
                navigate("/articles");
                break;
            case "dashboard":
                navigate("/");
                break;
            case "ai-seo-title":
                onAiGenerate("seo_title");
                break;
            case "ai-seo-description":
                onAiGenerate("seo_description");
                break;
            case "ai-tags":
                onAiGenerate("tags");
                break;
            case "shortcuts":
                navigate("/help/shortcuts");
                break;
            case "help":
                navigate("/help");
                break;
        }
    };

    return { groups, disabled: {}, onAction };
}
