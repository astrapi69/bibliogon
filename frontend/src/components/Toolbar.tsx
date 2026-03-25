import {Editor} from "@tiptap/react";
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Minus,
    Undo,
    Redo,
    Code2,
} from "lucide-react";

interface Props {
    editor: Editor | null;
}

export default function Toolbar({editor}: Props) {
    if (!editor) return null;

    const items = [
        {
            icon: <Bold size={16}/>,
            action: () => editor.chain().focus().toggleBold().run(),
            active: editor.isActive("bold"),
            title: "Fett",
        },
        {
            icon: <Italic size={16}/>,
            action: () => editor.chain().focus().toggleItalic().run(),
            active: editor.isActive("italic"),
            title: "Kursiv",
        },
        {
            icon: <Strikethrough size={16}/>,
            action: () => editor.chain().focus().toggleStrike().run(),
            active: editor.isActive("strike"),
            title: "Durchgestrichen",
        },
        {
            icon: <Code size={16}/>,
            action: () => editor.chain().focus().toggleCode().run(),
            active: editor.isActive("code"),
            title: "Code",
        },
        {type: "separator" as const},
        {
            icon: <Heading1 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 1}).run(),
            active: editor.isActive("heading", {level: 1}),
            title: "Ueberschrift 1",
        },
        {
            icon: <Heading2 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 2}).run(),
            active: editor.isActive("heading", {level: 2}),
            title: "Ueberschrift 2",
        },
        {
            icon: <Heading3 size={16}/>,
            action: () => editor.chain().focus().toggleHeading({level: 3}).run(),
            active: editor.isActive("heading", {level: 3}),
            title: "Ueberschrift 3",
        },
        {type: "separator" as const},
        {
            icon: <List size={16}/>,
            action: () => editor.chain().focus().toggleBulletList().run(),
            active: editor.isActive("bulletList"),
            title: "Aufzaehlung",
        },
        {
            icon: <ListOrdered size={16}/>,
            action: () => editor.chain().focus().toggleOrderedList().run(),
            active: editor.isActive("orderedList"),
            title: "Nummerierung",
        },
        {
            icon: <Quote size={16}/>,
            action: () => editor.chain().focus().toggleBlockquote().run(),
            active: editor.isActive("blockquote"),
            title: "Zitat",
        },
        {
            icon: <Code2 size={16}/>,
            action: () => editor.chain().focus().toggleCodeBlock().run(),
            active: editor.isActive("codeBlock"),
            title: "Codeblock",
        },
        {
            icon: <Minus size={16}/>,
            action: () => editor.chain().focus().setHorizontalRule().run(),
            active: false,
            title: "Trennlinie",
        },
        {type: "separator" as const},
        {
            icon: <Undo size={16}/>,
            action: () => editor.chain().focus().undo().run(),
            active: false,
            title: "Rueckgaengig",
        },
        {
            icon: <Redo size={16}/>,
            action: () => editor.chain().focus().redo().run(),
            active: false,
            title: "Wiederholen",
        },
    ];

    return (
        <div style={styles.toolbar}>
            {items.map((item, i) => {
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
};
