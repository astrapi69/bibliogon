import {Editor} from "@tiptap/react";
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
    SpellCheck,
} from "lucide-react";

interface Props {
    editor: Editor | null;
    markdownMode: boolean;
    onToggleMarkdown: () => void;
    onToggleSearch?: () => void;
    focusMode?: boolean;
    onToggleFocus?: () => void;
    spellcheckActive?: boolean;
    onToggleSpellcheck?: () => void;
}

export default function Toolbar({editor, markdownMode, onToggleMarkdown, onToggleSearch, focusMode, onToggleFocus, spellcheckActive, onToggleSpellcheck}: Props) {
    if (!editor) return null;

    const items = [
        // Text formatting
        {
            icon: <Bold size={16}/>,
            action: () => editor.chain().focus().toggleBold().run(),
            active: editor.isActive("bold"),
            title: "Fett (Ctrl+B)",
            hidden: markdownMode,
        },
        {
            icon: <Italic size={16}/>,
            action: () => editor.chain().focus().toggleItalic().run(),
            active: editor.isActive("italic"),
            title: "Kursiv (Ctrl+I)",
            hidden: markdownMode,
        },
        {
            icon: <UnderlineIcon size={16}/>,
            action: () => editor.chain().focus().toggleUnderline().run(),
            active: editor.isActive("underline"),
            title: "Unterstrichen (Ctrl+U)",
            hidden: markdownMode,
        },
        {
            icon: <Strikethrough size={16}/>,
            action: () => editor.chain().focus().toggleStrike().run(),
            active: editor.isActive("strike"),
            title: "Durchgestrichen",
            hidden: markdownMode,
        },
        {
            icon: <Code size={16}/>,
            action: () => editor.chain().focus().toggleCode().run(),
            active: editor.isActive("code"),
            title: "Code",
            hidden: markdownMode,
        },
        {
            icon: <Highlighter size={16}/>,
            action: () => editor.chain().focus().toggleHighlight().run(),
            active: editor.isActive("highlight"),
            title: "Hervorheben",
            hidden: markdownMode,
        },
        {
            icon: <Subscript size={16}/>,
            action: () => editor.chain().focus().toggleSubscript().run(),
            active: editor.isActive("subscript"),
            title: "Tiefgestellt",
            hidden: markdownMode,
        },
        {
            icon: <Superscript size={16}/>,
            action: () => editor.chain().focus().toggleSuperscript().run(),
            active: editor.isActive("superscript"),
            title: "Hochgestellt",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Headings
        {
            icon: <Heading1 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 1}).run(),
            active: editor.isActive("heading", {level: 1}),
            title: "Überschrift 1",
            hidden: markdownMode,
        },
        {
            icon: <Heading2 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 2}).run(),
            active: editor.isActive("heading", {level: 2}),
            title: "Überschrift 2",
            hidden: markdownMode,
        },
        {
            icon: <Heading3 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 3}).run(),
            active: editor.isActive("heading", {level: 3}),
            title: "Überschrift 3",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Alignment
        {
            icon: <AlignLeft size={16}/>,
            action: () => editor.chain().focus().setTextAlign("left").run(),
            active: editor.isActive({textAlign: "left"}),
            title: "Linksbündig",
            hidden: markdownMode,
        },
        {
            icon: <AlignCenter size={16}/>,
            action: () => editor.chain().focus().setTextAlign("center").run(),
            active: editor.isActive({textAlign: "center"}),
            title: "Zentriert",
            hidden: markdownMode,
        },
        {
            icon: <AlignRight size={16}/>,
            action: () => editor.chain().focus().setTextAlign("right").run(),
            active: editor.isActive({textAlign: "right"}),
            title: "Rechtsbündig",
            hidden: markdownMode,
        },
        {
            icon: <AlignJustify size={16}/>,
            action: () => editor.chain().focus().setTextAlign("justify").run(),
            active: editor.isActive({textAlign: "justify"}),
            title: "Blocksatz",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // Lists & blocks
        {
            icon: <List size={16}/>,
            action: () => editor.chain().focus().toggleBulletList().run(),
            active: editor.isActive("bulletList"),
            title: "Aufzählung",
            hidden: markdownMode,
        },
        {
            icon: <ListOrdered size={16}/>,
            action: () => editor.chain().focus().toggleOrderedList().run(),
            active: editor.isActive("orderedList"),
            title: "Nummerierung",
            hidden: markdownMode,
        },
        {
            icon: <ListChecks size={16}/>,
            action: () => editor.chain().focus().toggleTaskList().run(),
            active: editor.isActive("taskList"),
            title: "Checkliste",
            hidden: markdownMode,
        },
        {
            icon: <Quote size={16}/>,
            action: () => editor.chain().focus().toggleBlockquote().run(),
            active: editor.isActive("blockquote"),
            title: "Zitat",
            hidden: markdownMode,
        },
        {
            icon: <TableIcon size={16}/>,
            action: () => editor.chain().focus().insertTable({rows: 3, cols: 3, withHeaderRow: true}).run(),
            active: editor.isActive("table"),
            title: "Tabelle einfügen",
            hidden: markdownMode,
        },
        {
            icon: <FootprintsIcon size={16}/>,
            action: () => editor.chain().focus().addFootnote().run(),
            active: false,
            title: "Fussnote",
            hidden: markdownMode,
        },
        {
            icon: <Code2 size={16}/>,
            action: () => editor.chain().focus().toggleCodeBlock().run(),
            active: editor.isActive("codeBlock"),
            title: "Codeblock",
            hidden: markdownMode,
        },
        {
            icon: <Minus size={16}/>,
            action: () => editor.chain().focus().setHorizontalRule().run(),
            active: false,
            title: "Trennlinie",
            hidden: markdownMode,
        },
        {type: "separator" as const, hidden: markdownMode},

        // History
        {
            icon: <Undo size={16}/>,
            action: () => editor.chain().focus().undo().run(),
            active: false,
            title: "Rückgängig (Ctrl+Z)",
            hidden: markdownMode,
        },
        {
            icon: <Redo size={16}/>,
            action: () => editor.chain().focus().redo().run(),
            active: false,
            title: "Wiederholen (Ctrl+Y)",
            hidden: markdownMode,
        },
    ];

    return (
        <div style={styles.toolbar}>
            {items.map((item, i) => {
                if ("hidden" in item && item.hidden) return null;
                if ("type" in item && item.type === "separator") {
                    return <div key={i} style={styles.separator}/>;
                }
                const btn = item as {
                    icon: React.ReactNode;
                    action: () => void;
                    active: boolean;
                    title: string;
                };
                return (
                    <button
                        key={i}
                        onClick={btn.action}
                        title={btn.title}
                        style={{
                            ...styles.button,
                            ...(btn.active ? styles.buttonActive : {}),
                        }}
                    >
                        {btn.icon}
                    </button>
                );
            })}

            {/* Spacer */}
            <div style={{flex: 1}}/>

            {/* Search toggle */}
            {onToggleSearch && !markdownMode && (
                <button
                    onClick={onToggleSearch}
                    title="Suchen & Ersetzen (Ctrl+H)"
                    style={styles.button}
                >
                    <Search size={16}/>
                </button>
            )}

            {/* Focus mode toggle */}
            {onToggleFocus && !markdownMode && (
                <button
                    onClick={onToggleFocus}
                    title="Focus Mode"
                    style={{
                        ...styles.button,
                        ...(focusMode ? styles.buttonActive : {}),
                    }}
                >
                    <Focus size={16}/>
                </button>
            )}

            {/* Spellcheck toggle */}
            {onToggleSpellcheck && !markdownMode && (
                <button
                    onClick={onToggleSpellcheck}
                    title="Spellcheck (LanguageTool)"
                    style={{
                        ...styles.button,
                        ...(spellcheckActive ? styles.buttonActive : {}),
                    }}
                >
                    <SpellCheck size={16}/>
                </button>
            )}

            {/* Markdown toggle */}
            <button
                onClick={onToggleMarkdown}
                title={markdownMode ? "WYSIWYG-Modus" : "Markdown-Modus"}
                style={{
                    ...styles.modeToggle,
                    ...(markdownMode ? styles.modeToggleActive : {}),
                }}
            >
                {markdownMode ? <FileText size={14}/> : <FileCode size={14}/>}
                {markdownMode ? "WYSIWYG" : "Markdown"}
            </button>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    toolbar: {
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "8px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        flexWrap: "wrap",
    },
    button: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        border: "none",
        background: "transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        color: "var(--text-secondary)",
        transition: "all 150ms",
    },
    buttonActive: {
        background: "var(--accent-light)",
        color: "var(--accent)",
    },
    separator: {
        width: 1,
        height: 20,
        background: "var(--border)",
        margin: "0 4px",
    },
    modeToggle: {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        border: "1px solid var(--border)",
        background: "transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        color: "var(--text-secondary)",
        fontSize: "0.75rem",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        transition: "all 150ms",
    },
    modeToggleActive: {
        background: "var(--accent-light)",
        color: "var(--accent)",
        borderColor: "var(--accent)",
    },
};
