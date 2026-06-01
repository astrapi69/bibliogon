import {Editor} from "@tiptap/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {copyToClipboard} from "../utils/clipboard";
import {
    editorToMarkdown,
    editorToPlainText,
    type DocumentMetadata,
} from "../utils/tiptap-markdown";
import styles from "./Toolbar.module.css";
import {
    Bold,
    Italic,
    Strikethrough,
    Underline as UnderlineIcon,
    Code,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    ListChecks,
    Quote,
    Minus,
    Undo,
    Redo,
    Code2,
    FileCode,
    FileText,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Highlighter,
    Subscript,
    Superscript,
    Table as TableIcon,
    FootprintsIcon,
    Search,
    Focus,
    Feather,
    SpellCheck,
    Headphones,
    Sparkles,
    Wrench,
    Copy,
    ChevronDown,
    Maximize2,
    Minimize2,
} from "lucide-react";

interface Props {
    editor: Editor | null;
    markdownMode: boolean;
    onToggleMarkdown: () => void;
    onToggleSearch?: () => void;
    focusMode?: boolean;
    onToggleFocus?: () => void;
    /** COMPOSITION-DISTRACTION-FREE-MODE-01: umbrella distraction-
     *  free toggle. Hides the app chrome (chapter sidebar + this
     *  toolbar), paints a composition backdrop with a centered paper
     *  column, turns on paragraph dimming and (when enabled)
     *  typewriter scrolling. Distinct from focusMode (dimming only)
     *  and fullscreen (browser chrome only); composition composes
     *  both. Omitted -> button not rendered. */
    compositionMode?: boolean;
    onToggleComposition?: () => void;
    /** EDITOR-FULLSCREEN-NATIVE-01: when defined, renders a
     *  browser-native fullscreen toggle in the toolbar.
     *  ``isFullscreen`` syncs with document.fullscreenElement
     *  via the useFullscreenToggle hook in the parent.
     *  Omitted (undefined) -> button is not rendered, e.g. when
     *  the browser doesn't support the Fullscreen API. */
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    spellcheckActive?: boolean;
    onToggleSpellcheck?: () => void;
    onPreviewAudio?: () => void;
    previewLoading?: boolean;
    /** Reason why preview is disabled (plugin not active/licensed). */
    previewDisabledReason?: string;
    aiPanelActive?: boolean;
    onToggleAi?: () => void;
    /** Reason why AI button is disabled. */
    aiDisabledReason?: string;
    /** Reason why spellcheck is disabled. */
    spellcheckDisabledReason?: string;
    styleCheckActive?: boolean;
    styleCheckLoading?: boolean;
    onToggleStyleCheck?: () => void;
    /** Document title prepended to the Copy action's output. When
     *  set, Markdown copies emit ``# Title\n\n{body}``; plain-text
     *  copies emit ``Title\n\n{body}``. Empty / undefined skips the
     *  prepend so the user copies the body alone. */
    documentTitle?: string;
    /** Optional subtitle, rendered beneath the title in both
     *  modes. ArticleEditor passes ``article.subtitle``;
     *  BookEditor leaves it unset. */
    documentSubtitle?: string;
}

export default function Toolbar({editor, markdownMode, onToggleMarkdown, onToggleSearch, focusMode, onToggleFocus, compositionMode, onToggleComposition, isFullscreen, onToggleFullscreen, spellcheckActive, onToggleSpellcheck, onPreviewAudio, previewLoading, previewDisabledReason, aiPanelActive, onToggleAi, aiDisabledReason, spellcheckDisabledReason, styleCheckActive, styleCheckLoading, onToggleStyleCheck, documentTitle, documentSubtitle}: Props) {
    const {t} = useI18n();
    if (!editor) return null;

    const handleCopy = async (mode: "markdown" | "plain") => {
        const metadata: DocumentMetadata = {
            title: documentTitle,
            subtitle: documentSubtitle,
        };
        const text =
            mode === "markdown"
                ? editorToMarkdown(editor, metadata)
                : editorToPlainText(editor, metadata);
        const ok = await copyToClipboard(text);
        if (ok) {
            const message =
                mode === "markdown"
                    ? t("ui.toolbar.copy_success_markdown", "Copied as Markdown.")
                    : t("ui.toolbar.copy_success_plain", "Copied as plain text.");
            notify.success(message);
        } else {
            // The native clipboard API needs a secure context (HTTPS
            // / localhost) and explicit permission. Both are normal in
            // production; surface the failure rather than silently
            // swallow it.
            notify.error(
                t(
                    "ui.toolbar.copy_failed",
                    "Could not copy to clipboard.",
                ),
            );
        }
    };

    const items = [
        // Text formatting
        {
            icon: <Bold size={16}/>,
            action: () => editor.chain().focus().toggleBold().run(),
            active: editor.isActive("bold"),
            title: t("ui.toolbar.bold", "Fett") + " (Ctrl+B)",
            testId: "toolbar-bold",
            hidden: markdownMode,
        },
        {
            icon: <Italic size={16}/>,
            action: () => editor.chain().focus().toggleItalic().run(),
            active: editor.isActive("italic"),
            title: t("ui.toolbar.italic", "Kursiv") + " (Ctrl+I)",
            testId: "toolbar-italic",
            hidden: markdownMode,
        },
        {
            icon: <UnderlineIcon size={16}/>,
            action: () => editor.chain().focus().toggleUnderline().run(),
            active: editor.isActive("underline"),
            title: t("ui.toolbar.underline", "Unterstrichen") + " (Ctrl+U)",
            testId: "toolbar-underline",
            hidden: markdownMode,
        },
        {
            icon: <Strikethrough size={16}/>,
            action: () => editor.chain().focus().toggleStrike().run(),
            active: editor.isActive("strike"),
            title: t("ui.toolbar.strikethrough", "Durchgestrichen"),
            testId: "toolbar-strikethrough",
            hidden: markdownMode,
        },
        {
            icon: <Code size={16}/>,
            action: () => editor.chain().focus().toggleCode().run(),
            active: editor.isActive("code"),
            title: t("ui.toolbar.inline_code", "Code"),
            testId: "toolbar-code",
            hidden: markdownMode,
        },
        {
            icon: <Highlighter size={16}/>,
            action: () => editor.chain().focus().toggleHighlight().run(),
            active: editor.isActive("highlight"),
            title: t("ui.toolbar.highlight", "Hervorheben"),
            testId: "toolbar-highlight",
            hidden: markdownMode,
        },
        {
            icon: <Subscript size={16}/>,
            action: () => editor.chain().focus().toggleSubscript().run(),
            active: editor.isActive("subscript"),
            title: t("ui.toolbar.subscript", "Tiefgestellt"),
            testId: "toolbar-subscript",
            hidden: markdownMode,
        },
        {
            icon: <Superscript size={16}/>,
            action: () => editor.chain().focus().toggleSuperscript().run(),
            active: editor.isActive("superscript"),
            title: t("ui.toolbar.superscript", "Hochgestellt"),
            testId: "toolbar-superscript",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Headings
        {
            icon: <Heading1 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 1}).run(),
            active: editor.isActive("heading", {level: 1}),
            title: t("ui.toolbar.heading1", "Überschrift 1"),
            testId: "toolbar-h1",
            hidden: markdownMode,
        },
        {
            icon: <Heading2 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 2}).run(),
            active: editor.isActive("heading", {level: 2}),
            title: t("ui.toolbar.heading2", "Überschrift 2"),
            testId: "toolbar-h2",
            hidden: markdownMode,
        },
        {
            icon: <Heading3 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 3}).run(),
            active: editor.isActive("heading", {level: 3}),
            title: t("ui.toolbar.heading3", "Überschrift 3"),
            testId: "toolbar-h3",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Alignment
        {
            icon: <AlignLeft size={16}/>,
            action: () => editor.chain().focus().setTextAlign("left").run(),
            active: editor.isActive({textAlign: "left"}),
            title: t("ui.toolbar.align_left", "Linksbuendig"),
            testId: "toolbar-align-left",
            hidden: markdownMode,
        },
        {
            icon: <AlignCenter size={16}/>,
            action: () => editor.chain().focus().setTextAlign("center").run(),
            active: editor.isActive({textAlign: "center"}),
            title: t("ui.toolbar.align_center", "Zentriert"),
            testId: "toolbar-align-center",
            hidden: markdownMode,
        },
        {
            icon: <AlignRight size={16}/>,
            action: () => editor.chain().focus().setTextAlign("right").run(),
            active: editor.isActive({textAlign: "right"}),
            title: t("ui.toolbar.align_right", "Rechtsbuendig"),
            testId: "toolbar-align-right",
            hidden: markdownMode,
        },
        {
            icon: <AlignJustify size={16}/>,
            action: () => editor.chain().focus().setTextAlign("justify").run(),
            active: editor.isActive({textAlign: "justify"}),
            title: t("ui.toolbar.align_justify", "Blocksatz"),
            testId: "toolbar-align-justify",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Lists & blocks
        {
            icon: <List size={16}/>,
            action: () => editor.chain().focus().toggleBulletList().run(),
            active: editor.isActive("bulletList"),
            title: t("ui.toolbar.bullet_list", "Aufzaehlung"),
            testId: "toolbar-bullet-list",
            hidden: markdownMode,
        },
        {
            icon: <ListOrdered size={16}/>,
            action: () => editor.chain().focus().toggleOrderedList().run(),
            active: editor.isActive("orderedList"),
            title: t("ui.toolbar.ordered_list", "Nummerierung"),
            testId: "toolbar-ordered-list",
            hidden: markdownMode,
        },
        {
            icon: <ListChecks size={16}/>,
            action: () => editor.chain().focus().toggleTaskList().run(),
            active: editor.isActive("taskList"),
            title: t("ui.toolbar.task_list", "Checkliste"),
            testId: "toolbar-task-list",
            hidden: markdownMode,
        },
        {
            icon: <Quote size={16}/>,
            action: () => editor.chain().focus().toggleBlockquote().run(),
            active: editor.isActive("blockquote"),
            title: t("ui.toolbar.blockquote", "Zitat"),
            testId: "toolbar-blockquote",
            hidden: markdownMode,
        },
        {
            icon: <TableIcon size={16}/>,
            action: () => editor.chain().focus().insertTable({rows: 3, cols: 3, withHeaderRow: true}).run(),
            active: editor.isActive("table"),
            title: t("ui.toolbar.insert_table", "Tabelle einfügen"),
            testId: "toolbar-table",
            hidden: markdownMode,
        },
        {
            icon: <FootprintsIcon size={16}/>,
            action: () => editor.chain().focus().addFootnote().run(),
            active: false,
            title: t("ui.toolbar.footnote", "Fussnote"),
            testId: "toolbar-footnote",
            hidden: markdownMode,
        },
        {
            icon: <Code2 size={16}/>,
            action: () => editor.chain().focus().toggleCodeBlock().run(),
            active: editor.isActive("codeBlock"),
            title: t("ui.toolbar.code_block", "Codeblock"),
            testId: "toolbar-code-block",
            hidden: markdownMode,
        },
        {
            icon: <Minus size={16}/>,
            action: () => editor.chain().focus().setHorizontalRule().run(),
            active: false,
            title: t("ui.toolbar.horizontal_rule", "Trennlinie"),
            testId: "toolbar-horizontal-rule",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // History
        {
            icon: <Undo size={16}/>,
            action: () => editor.chain().focus().undo().run(),
            active: false,
            title: t("ui.toolbar.undo", "Rückgaengig") + " (Ctrl+Z)",
            testId: "toolbar-undo",
            hidden: markdownMode,
        },
        {
            icon: <Redo size={16}/>,
            action: () => editor.chain().focus().redo().run(),
            active: false,
            title: t("ui.toolbar.redo", "Wiederholen") + " (Ctrl+Y)",
            testId: "toolbar-redo",
            hidden: markdownMode,
        },
    ];

    const cx = (...names: (string | false | undefined | null)[]) =>
        names.filter(Boolean).join(" ");

    return (
        <div className={styles.toolbar}>
            {items.map((item, i) => {
                if ("hidden" in item && item.hidden) return null;
                if ("type" in item && item.type === "separator") {
                    return <div key={i} className={styles.separator}/>;
                }
                const btn = item as {
                    icon: React.ReactNode;
                    action: () => void;
                    active: boolean;
                    title: string;
                    testId?: string;
                };
                return (
                    <button
                        key={i}
                        onClick={btn.action}
                        title={btn.title}
                        aria-label={btn.title}
                        aria-pressed={btn.active}
                        data-testid={btn.testId}
                        className={cx(styles.button, btn.active && styles.buttonActive)}
                    >
                        {btn.icon}
                    </button>
                );
            })}

            {/* Spacer */}
            <div className={styles.spacer}/>

            {/* Copy split-button: default action copies as Markdown;
             *  the chevron exposes "Copy as plain text" for paste-
             *  targets that mangle Markdown (email, notes, chat).
             *  Hidden in markdown-edit mode — the textarea already
             *  shows Markdown and the user can select-all + Ctrl-C. */}
            {!markdownMode && (
                <div className={styles.copyGroup} data-testid="toolbar-copy-group">
                    <button
                        type="button"
                        onClick={() => {
                            void handleCopy("markdown");
                        }}
                        title={t(
                            "ui.toolbar.copy_markdown_tooltip",
                            "Copy as Markdown",
                        )}
                        aria-label={t(
                            "ui.toolbar.copy_markdown_tooltip",
                            "Copy as Markdown",
                        )}
                        data-testid="toolbar-copy-markdown"
                        className={styles.button}
                    >
                        <Copy size={16}/>
                    </button>
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button
                                type="button"
                                title={t(
                                    "ui.toolbar.copy_more_tooltip",
                                    "Copy options",
                                )}
                                aria-label={t(
                                    "ui.toolbar.copy_more_tooltip",
                                    "Copy options",
                                )}
                                data-testid="toolbar-copy-chevron"
                                className={styles.copyChevron}
                            >
                                <ChevronDown size={12}/>
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
                                    data-testid="toolbar-copy-markdown-item"
                                    onSelect={() => void handleCopy("markdown")}
                                >
                                    {t(
                                        "ui.toolbar.copy_as_markdown",
                                        "Copy as Markdown",
                                    )}
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                    className="hamburger-menu-item"
                                    data-testid="toolbar-copy-plain-item"
                                    onSelect={() => void handleCopy("plain")}
                                >
                                    {t(
                                        "ui.toolbar.copy_as_plain",
                                        "Copy as plain text",
                                    )}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>
            )}

            {/* Search toggle */}
            {onToggleSearch && !markdownMode && (
                <button
                    onClick={onToggleSearch}
                    title={t("ui.toolbar.search", "Suchen & Ersetzen") + " (Ctrl+H)"}
                    aria-label={t("ui.toolbar.search", "Suchen & Ersetzen")}
                    data-testid="toolbar-search"
                    className={styles.button}
                >
                    <Search size={16}/>
                </button>
            )}

            {/* Focus mode toggle */}
            {onToggleFocus && !markdownMode && (
                <button
                    onClick={onToggleFocus}
                    title={t("ui.toolbar.focus_mode", "Focus Mode")}
                    aria-label={t("ui.toolbar.focus_mode", "Focus Mode")}
                    data-testid="toolbar-focus"
                    className={cx(styles.button, focusMode && styles.buttonActive)}
                >
                    <Focus size={16}/>
                </button>
            )}

            {/* Composition / distraction-free mode toggle
                (COMPOSITION-DISTRACTION-FREE-MODE-01). Umbrella mode:
                hides chrome + paper backdrop + dimming + typewriter
                scroll. Ctrl+Shift+D shortcut; Esc exits. */}
            {onToggleComposition && !markdownMode && (
                <button
                    onClick={onToggleComposition}
                    title={t("ui.toolbar.composition_mode", "Composition mode") + " (Ctrl+Shift+D)"}
                    aria-label={t("ui.toolbar.composition_mode", "Composition mode")}
                    aria-pressed={compositionMode ? "true" : "false"}
                    aria-keyshortcuts="Control+Shift+D"
                    data-testid="toolbar-composition"
                    className={cx(styles.button, compositionMode && styles.buttonActive)}
                >
                    <Feather size={16}/>
                </button>
            )}

            {/* Browser-native fullscreen toggle
                (EDITOR-FULLSCREEN-NATIVE-01). Hidden when the
                parent doesn't pass onToggleFullscreen (e.g.
                browser lacks Fullscreen API support). F11 is
                browser-default; the JS shortcut is Ctrl+Shift+F.
                aria-keyshortcuts declares both per W3C ARIA. */}
            {onToggleFullscreen && (
                <button
                    onClick={onToggleFullscreen}
                    title={
                        isFullscreen
                            ? t("ui.toolbar.exit_fullscreen", "Vollbild verlassen") + " (F11 / Ctrl+Shift+F)"
                            : t("ui.toolbar.fullscreen", "Vollbild") + " (F11 / Ctrl+Shift+F)"
                    }
                    aria-label={
                        isFullscreen
                            ? t("ui.toolbar.exit_fullscreen", "Vollbild verlassen")
                            : t("ui.toolbar.fullscreen", "Vollbild")
                    }
                    aria-pressed={isFullscreen ? "true" : "false"}
                    aria-keyshortcuts="F11 Control+Shift+F"
                    data-testid="toolbar-fullscreen"
                    className={cx(styles.button, isFullscreen && styles.buttonActive)}
                >
                    {isFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                </button>
            )}

            {/* Style check toggle (ms-tools) */}
            {onToggleStyleCheck && !markdownMode && (
                <button
                    onClick={onToggleStyleCheck}
                    disabled={styleCheckLoading}
                    title={t("ui.toolbar.style_check", "Stilprüfung")}
                    aria-label={t("ui.toolbar.style_check", "Stilprüfung")}
                    data-testid="toolbar-style-check"
                    className={cx(
                        styles.button,
                        styleCheckActive && styles.buttonActive,
                        styleCheckLoading && styles.buttonLoading,
                    )}
                >
                    <Wrench size={16}/>
                </button>
            )}

            {/* Spellcheck toggle */}
            {!markdownMode && (
                <button
                    onClick={onToggleSpellcheck || undefined}
                    disabled={!onToggleSpellcheck || !!spellcheckDisabledReason}
                    title={spellcheckDisabledReason || t("ui.toolbar.spellcheck", "Rechtschreibprüfung (LanguageTool)")}
                    aria-label={t("ui.toolbar.spellcheck", "Rechtschreibprüfung")}
                    data-testid="toolbar-spellcheck"
                    className={cx(
                        styles.button,
                        spellcheckActive && styles.buttonActive,
                        (!onToggleSpellcheck || spellcheckDisabledReason) && styles.buttonDisabled,
                    )}
                >
                    <SpellCheck size={16}/>
                </button>
            )}

            {/* Audio preview */}
            {!markdownMode && (
                <button
                    onClick={onPreviewAudio || undefined}
                    disabled={!onPreviewAudio || previewLoading || !!previewDisabledReason}
                    title={previewDisabledReason || t("ui.toolbar.tts_preview", "Vorhören (TTS)")}
                    aria-label={t("ui.toolbar.tts_preview", "Vorhören")}
                    data-testid="toolbar-tts-preview"
                    className={cx(
                        styles.button,
                        previewLoading && styles.buttonLoading,
                        (!onPreviewAudio || previewDisabledReason) && styles.buttonDisabled,
                    )}
                >
                    <Headphones size={16}/>
                </button>
            )}

            {/* AI assistant */}
            {!markdownMode && (
                <button
                    onClick={onToggleAi || undefined}
                    disabled={!onToggleAi || !!aiDisabledReason}
                    title={aiDisabledReason || t("ui.toolbar.ai_assistant", "KI-Assistent")}
                    aria-label={t("ui.toolbar.ai_assistant", "KI-Assistent")}
                    data-testid="toolbar-ai"
                    className={cx(
                        styles.button,
                        aiPanelActive && styles.buttonActive,
                        (!onToggleAi || aiDisabledReason) && styles.buttonDisabled,
                    )}
                >
                    <Sparkles size={16}/>
                </button>
            )}

            {/* Markdown toggle */}
            <button
                onClick={onToggleMarkdown}
                title={markdownMode ? t("ui.toolbar.wysiwyg_mode", "WYSIWYG-Modus") : t("ui.toolbar.markdown_mode", "Markdown-Modus")}
                data-testid="toolbar-markdown-toggle"
                className={cx(styles.modeToggle, markdownMode && styles.modeToggleActive)}
            >
                {markdownMode ? <FileText size={14}/> : <FileCode size={14}/>}
                {markdownMode ? "WYSIWYG" : "Markdown"}
            </button>
        </div>
    );
}
