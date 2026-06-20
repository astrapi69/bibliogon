/**
 * Right-click context menu for TipTap editor surfaces
 * (EDITOR-CONTEXT-MENU-01 + EDITOR-CONTEXT-MENU-ALL-TOOLBAR-01, #370).
 * Wraps the editor content; on right-click it shows an OS-style menu
 * that mirrors the full editor toolbar - clipboard, history, formatting,
 * insert, heading, alignment, list groups, Story Bible and document
 * actions - with the same icons as the toolbar and active formats
 * highlighted. Submenus group the formatting families.
 *
 * Behaviour lives in ``editorContextMenuActions`` + ``editorMathPrompt``
 * (unit-tested); this file is the Radix presentation layer (E2E-covered,
 * since the Radix ContextMenu portal is happy-dom-brittle).
 */
import { useContext, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { Editor } from "@tiptap/react";
import {
  Undo,
  Redo,
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Subscript,
  Superscript,
  Type,
  Plus,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Sigma,
  Minus,
  AtSign,
  Code2,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Search,
  Camera,
  Check,
} from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { DialogContext } from "../AppDialog";
import * as actions from "../editorContextMenuActions";
import { promptAndInsertMath } from "../editorMathPrompt";
import styles from "../EditorContextMenu.module.css";

interface Props {
  editor: Editor | null;
  children: React.ReactNode;
  /** Story Bible plugin active: enables @-mention insert + search. */
  mentionActive?: boolean;
  /** Search the selected text in the Story Bible (opens a match). */
  onSearchStoryBible?: (text: string) => void;
  /** This surface supports images: enables "Insert image". */
  onInsertImage?: () => void;
  /** Chapter editor: enables "Take snapshot". */
  onTakeSnapshot?: () => void;
}

const EMPTY_FORMATS: actions.ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  subscript: false,
  superscript: false,
  link: false,
  heading1: false,
  heading2: false,
  heading3: false,
  paragraph: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
  codeBlock: false,
};

export default function EditorContextMenu({
  editor,
  children,
  mentionActive,
  onSearchStoryBible,
  onInsertImage,
  onTakeSnapshot,
}: Props) {
  const { t } = useI18n();
  // Non-throwing: the app is always wrapped in DialogProvider in
  // production, but some component tests render the editor surface
  // without one. Link/formula prompts no-op when the context is absent.
  const dialog = useContext(DialogContext);
  const [sel, setSel] = useState(false);
  const [selText, setSelText] = useState("");
  const [fmt, setFmt] = useState<actions.ActiveFormats>(EMPTY_FORMATS);
  const [wc, setWc] = useState<{ selection: number; total: number }>({
    selection: 0,
    total: 0,
  });

  const handleOpenChange = (open: boolean) => {
    if (open && editor) {
      setSel(actions.hasSelection(editor));
      setSelText(actions.selectedText(editor));
      setFmt(actions.activeFormats(editor));
      setWc(actions.wordCounts(editor));
    }
  };

  const handleInsertLink = async () => {
    if (!editor || !dialog) return;
    const url = await dialog.prompt(
      t("ui.editor_menu.link", "Link"),
      t("ui.editor_menu.link_prompt", "URL eingeben (leer lassen zum Entfernen):"),
      "https://",
      fmt.link
        ? ((editor.getAttributes("link").href as string | undefined) ?? "")
        : "",
    );
    if (url === null) return;
    actions.setLink(editor, url);
  };

  const handleInsertFormula = () => {
    if (!editor || !dialog) return;
    void promptAndInsertMath(editor, dialog, t, "inline");
  };

  const Item = ({
    label,
    icon,
    onSelect,
    shortcut,
    active,
    testId,
  }: {
    label: string;
    icon: React.ReactNode;
    onSelect: () => void;
    shortcut?: string;
    active?: boolean;
    testId?: string;
  }) => (
    <ContextMenu.Item
      className={`${styles.item} ${active ? styles.itemActive : ""}`}
      onSelect={onSelect}
      data-testid={testId}
      data-active={active ? "true" : undefined}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      {shortcut ? <span className={styles.shortcut}>{shortcut}</span> : null}
      {active ? (
        <Check size={14} className={styles.check} aria-hidden="true" />
      ) : null}
    </ContextMenu.Item>
  );

  const SubMenu = ({
    label,
    icon,
    testId,
    children: subChildren,
  }: {
    label: string;
    icon: React.ReactNode;
    testId?: string;
    children: React.ReactNode;
  }) => (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={styles.item} data-testid={testId}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.label}>{label}</span>
        <span className={styles.shortcut}>▶</span>
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent className={styles.content}>
          {subChildren}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );

  // The Trigger (and the editor surface it wraps) renders identically
  // whether or not ``editor`` is ready yet, so the TipTap editor inside
  // never remounts when ``useEditor`` resolves null -> instance. Only
  // the menu Content is gated on a ready editor.
  // ``asChild``: the caller passes the editor surface's own container
  // as the single child, so the contextmenu handler is attached to that
  // existing element and the EditorContent inside keeps its exact DOM
  // position (nesting the editor deeper inside extra Radix-managed wrap
  // divs breaks the TipTap mount under happy-dom).
  return (
    <ContextMenu.Root onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      {editor ? (
        <ContextMenu.Portal>
          <ContextMenu.Content
            className={styles.content}
            data-testid="editor-context-menu"
          >
            <Item
              label={t("ui.editor_menu.undo", "Rückgängig")}
              icon={<Undo size={16} />}
              shortcut="Ctrl+Z"
              onSelect={() => actions.undo(editor)}
              testId="ecm-undo"
            />
            <Item
              label={t("ui.editor_menu.redo", "Wiederherstellen")}
              icon={<Redo size={16} />}
              shortcut="Ctrl+Y"
              onSelect={() => actions.redo(editor)}
              testId="ecm-redo"
            />

            <ContextMenu.Separator className={styles.separator} />
            <Item
              label={t("ui.editor_menu.cut", "Ausschneiden")}
              icon={<Scissors size={16} />}
              shortcut="Ctrl+X"
              onSelect={() => actions.cutSelection()}
            />
            <Item
              label={t("ui.editor_menu.copy", "Kopieren")}
              icon={<Copy size={16} />}
              shortcut="Ctrl+C"
              onSelect={() => actions.copySelection()}
            />
            <Item
              label={t("ui.editor_menu.paste", "Einfügen")}
              icon={<ClipboardPaste size={16} />}
              shortcut="Ctrl+V"
              onSelect={() => void actions.paste(editor)}
            />
            <Item
              label={t("ui.editor_menu.select_all", "Alles auswählen")}
              icon={<TextSelect size={16} />}
              shortcut="Ctrl+A"
              onSelect={() => actions.selectAll(editor)}
              testId="ecm-select-all"
            />

            <ContextMenu.Separator className={styles.separator} />
            <SubMenu
              label={t("ui.editor_menu.formatting", "Formatierung")}
              icon={<Type size={16} />}
              testId="ecm-formatting-sub"
            >
              <Item
                label={t("ui.editor_menu.bold", "Fett")}
                icon={<Bold size={16} />}
                shortcut="Ctrl+B"
                active={fmt.bold}
                onSelect={() => actions.toggleBold(editor)}
                testId="ecm-bold"
              />
              <Item
                label={t("ui.editor_menu.italic", "Kursiv")}
                icon={<Italic size={16} />}
                shortcut="Ctrl+I"
                active={fmt.italic}
                onSelect={() => actions.toggleItalic(editor)}
              />
              <Item
                label={t("ui.editor_menu.underline", "Unterstrichen")}
                icon={<UnderlineIcon size={16} />}
                shortcut="Ctrl+U"
                active={fmt.underline}
                onSelect={() => actions.toggleUnderline(editor)}
              />
              <Item
                label={t("ui.editor_menu.strikethrough", "Durchgestrichen")}
                icon={<Strikethrough size={16} />}
                active={fmt.strike}
                onSelect={() => actions.toggleStrike(editor)}
              />
              <Item
                label={t("ui.editor_menu.inline_code", "Code")}
                icon={<Code size={16} />}
                active={fmt.code}
                onSelect={() => actions.toggleCode(editor)}
              />
              <Item
                label={t("ui.editor_menu.subscript", "Tiefgestellt")}
                icon={<Subscript size={16} />}
                active={fmt.subscript}
                onSelect={() => actions.toggleSubscript(editor)}
              />
              <Item
                label={t("ui.editor_menu.superscript", "Hochgestellt")}
                icon={<Superscript size={16} />}
                active={fmt.superscript}
                onSelect={() => actions.toggleSuperscript(editor)}
              />
            </SubMenu>

            <SubMenu
              label={t("ui.editor_menu.insert_submenu", "Einfügen")}
              icon={<Plus size={16} />}
              testId="ecm-insert-sub"
            >
              <Item
                label={t("ui.editor_menu.link", "Link")}
                icon={<LinkIcon size={16} />}
                shortcut="Ctrl+K"
                active={fmt.link}
                onSelect={() => void handleInsertLink()}
                testId="ecm-link"
              />
              {onInsertImage ? (
                <Item
                  label={t("ui.editor_menu.insert_image", "Bild einfügen")}
                  icon={<ImageIcon size={16} />}
                  onSelect={() => onInsertImage()}
                  testId="ecm-image"
                />
              ) : null}
              <Item
                label={t("ui.editor_menu.table", "Tabelle")}
                icon={<TableIcon size={16} />}
                onSelect={() => actions.insertTable(editor)}
              />
              <Item
                label={t("ui.editor_menu.formula", "Formel")}
                icon={<Sigma size={16} />}
                onSelect={() => handleInsertFormula()}
                testId="ecm-formula"
              />
              <Item
                label={t("ui.editor_menu.horizontal_rule", "Horizontale Linie")}
                icon={<Minus size={16} />}
                onSelect={() => actions.insertHorizontalRule(editor)}
              />
              {mentionActive ? (
                <Item
                  label={t("ui.editor_menu.mention", "@-Erwähnung einfügen")}
                  icon={<AtSign size={16} />}
                  onSelect={() => actions.insertMentionTrigger(editor)}
                  testId="ecm-mention"
                />
              ) : null}
              <Item
                label={t("ui.editor_menu.code_block", "Codeblock")}
                icon={<Code2 size={16} />}
                active={fmt.codeBlock}
                onSelect={() => actions.toggleCodeBlock(editor)}
              />
            </SubMenu>

            <SubMenu
              label={t("ui.editor_menu.heading_group", "Überschrift")}
              icon={<Heading size={16} />}
              testId="ecm-heading-sub"
            >
              <Item
                label={t("ui.editor_menu.h1", "Überschrift 1")}
                icon={<Heading1 size={16} />}
                active={fmt.heading1}
                onSelect={() => actions.setHeading(editor, 1)}
              />
              <Item
                label={t("ui.editor_menu.h2", "Überschrift 2")}
                icon={<Heading2 size={16} />}
                active={fmt.heading2}
                onSelect={() => actions.setHeading(editor, 2)}
              />
              <Item
                label={t("ui.editor_menu.h3", "Überschrift 3")}
                icon={<Heading3 size={16} />}
                active={fmt.heading3}
                onSelect={() => actions.setHeading(editor, 3)}
              />
              <Item
                label={t("ui.editor_menu.normal_text", "Normal")}
                icon={<Pilcrow size={16} />}
                active={fmt.paragraph}
                onSelect={() => actions.setParagraph(editor)}
              />
            </SubMenu>

            <SubMenu
              label={t("ui.editor_menu.alignment", "Ausrichtung")}
              icon={<AlignCenter size={16} />}
              testId="ecm-alignment-sub"
            >
              <Item
                label={t("ui.editor_menu.align_left", "Links")}
                icon={<AlignLeft size={16} />}
                active={fmt.alignLeft}
                onSelect={() => actions.setTextAlign(editor, "left")}
              />
              <Item
                label={t("ui.editor_menu.align_center", "Zentriert")}
                icon={<AlignCenter size={16} />}
                active={fmt.alignCenter}
                onSelect={() => actions.setTextAlign(editor, "center")}
              />
              <Item
                label={t("ui.editor_menu.align_right", "Rechts")}
                icon={<AlignRight size={16} />}
                active={fmt.alignRight}
                onSelect={() => actions.setTextAlign(editor, "right")}
              />
              <Item
                label={t("ui.editor_menu.align_justify", "Blocksatz")}
                icon={<AlignJustify size={16} />}
                active={fmt.alignJustify}
                onSelect={() => actions.setTextAlign(editor, "justify")}
              />
            </SubMenu>

            <SubMenu
              label={t("ui.editor_menu.list_group", "Liste")}
              icon={<List size={16} />}
              testId="ecm-list-sub"
            >
              <Item
                label={t("ui.editor_menu.bullet_list", "Aufzählung")}
                icon={<List size={16} />}
                active={fmt.bulletList}
                onSelect={() => actions.toggleBulletList(editor)}
              />
              <Item
                label={t("ui.editor_menu.ordered_list", "Nummerierung")}
                icon={<ListOrdered size={16} />}
                active={fmt.orderedList}
                onSelect={() => actions.toggleOrderedList(editor)}
              />
              <Item
                label={t("ui.editor_menu.task_list", "Checkliste")}
                icon={<ListChecks size={16} />}
                active={fmt.taskList}
                onSelect={() => actions.toggleTaskList(editor)}
              />
            </SubMenu>

            <ContextMenu.Separator className={styles.separator} />
            <Item
              label={t("ui.editor_menu.blockquote", "Als Zitat")}
              icon={<Quote size={16} />}
              active={fmt.blockquote}
              onSelect={() => actions.toggleBlockquote(editor)}
              testId="ecm-blockquote"
            />
            {mentionActive && sel && onSearchStoryBible ? (
              <Item
                label={t("ui.editor_menu.search_story_bible", "In Story-Bibel suchen")}
                icon={<Search size={16} />}
                onSelect={() => onSearchStoryBible(selText)}
                testId="ecm-search-story-bible"
              />
            ) : null}
            {onTakeSnapshot ? (
              <Item
                label={t("ui.editor_menu.take_snapshot", "Snapshot erstellen")}
                icon={<Camera size={16} />}
                onSelect={() => onTakeSnapshot()}
                testId="ecm-take-snapshot"
              />
            ) : null}

            <ContextMenu.Separator className={styles.separator} />
            <ContextMenu.Item
              className={`${styles.item} ${styles.info}`}
              disabled
              data-testid="ecm-word-count"
            >
              <span className={styles.label}>
                {t("ui.editor_menu.word_count", "Wörter")}: {wc.selection}/
                {wc.total}
              </span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  );
}
