import {useEffect, useRef, useCallback} from "react";
import {useEditor, EditorContent} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Toolbar from "./Toolbar";

interface Props {
    content: string;
    onSave: (json: string) => void;
    placeholder?: string;
}

export default function Editor({content, onSave, placeholder}: Props) {
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef(content);

    const debouncedSave = useCallback(
        (json: string) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
                if (json !== lastSaved.current) {
                    lastSaved.current = json;
                    onSave(json);
                }
            }, 800);
        },
        [onSave]
    );

    const parseContent = (raw: string): Record<string, unknown> | string => {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.type === "doc") {
                return parsed;
            }
        } catch {
            // Not JSON, treat as HTML for backward compatibility
        }
        return raw;
    };

    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: placeholder || "Beginne zu schreiben...",
            }),
        ],
        content: parseContent(content),
        onUpdate: ({editor}) => {
            debouncedSave(JSON.stringify(editor.getJSON()));
        },
        editorProps: {
            attributes: {
                class: "tiptap-editor",
            },
        },
    });

    // Update content when switching chapters
    useEffect(() => {
        if (editor) {
            const currentJson = JSON.stringify(editor.getJSON());
            if (content !== currentJson) {
                editor.commands.setContent(parseContent(content));
                lastSaved.current = content;
            }
        }
    }, [content, editor]);

    // Cleanup timer
    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, []);

    return (
        <div style={styles.wrapper}>
            <Toolbar editor={editor}/>
            <div style={styles.editorArea}>
                <div style={styles.editorContainer}>
                    <EditorContent editor={editor}/>
                </div>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
    },
    editorArea: {
        flex: 1,
        overflow: "auto",
        background: "var(--bg-primary)",
        display: "flex",
        justifyContent: "center",
    },
    editorContainer: {
        width: "100%",
        maxWidth: 740,
        background: "var(--bg-editor)",
        minHeight: "100%",
        borderLeft: "1px solid var(--border)",
        borderRight: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
    },
};
