/**
 * Right-click context menu for TipTap editor surfaces
 * (EDITOR-CONTEXT-MENU-01). Wraps the editor content; on right-click it
 * shows an OS-style menu of clipboard, formatting, structure, insert,
 * Story Bible and document actions. Sections are conditional on the
 * current selection + which capabilities the surface enables.
 *
 * Behaviour lives in ``editorContextMenuActions`` (unit-tested); this
 * file is the Radix presentation layer (E2E-covered, since the Radix
 * ContextMenu portal is happy-dom-brittle).
 */
import { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { Editor } from "@tiptap/react";

import { useI18n } from "../hooks/useI18n";
import * as actions from "./editorContextMenuActions";
import styles from "./EditorContextMenu.module.css";

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

export default function EditorContextMenu({
  editor,
  children,
  mentionActive,
  onSearchStoryBible,
  onInsertImage,
  onTakeSnapshot,
}: Props) {
  const { t } = useI18n();
  const [sel, setSel] = useState(false);
  const [selText, setSelText] = useState("");
  const [wc, setWc] = useState<{ selection: number; total: number }>({
    selection: 0,
    total: 0,
  });

  const handleOpenChange = (open: boolean) => {
    if (open && editor) {
      setSel(actions.hasSelection(editor));
      setSelText(actions.selectedText(editor));
      setWc(actions.wordCounts(editor));
    }
  };

  if (!editor) return <>{children}</>;

  const shortcut = (keys: string) => (
    <span className={styles.shortcut}>{keys}</span>
  );

  return (
    <ContextMenu.Root onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={styles.content}
          data-testid="editor-context-menu"
        >
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => actions.selectAll(editor)}
            data-testid="ecm-select-all"
          >
            {t("ui.editor_menu.select_all", "Alles auswählen")}
            {shortcut("Ctrl+A")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => actions.cutSelection()}
          >
            {t("ui.editor_menu.cut", "Ausschneiden")}
            {shortcut("Ctrl+X")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => actions.copySelection()}
          >
            {t("ui.editor_menu.copy", "Kopieren")}
            {shortcut("Ctrl+C")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => void actions.paste(editor)}
          >
            {t("ui.editor_menu.paste", "Einfügen")}
            {shortcut("Ctrl+V")}
          </ContextMenu.Item>

          {sel ? (
            <>
              <ContextMenu.Separator className={styles.separator} />
              <ContextMenu.Item
                className={styles.item}
                onSelect={() => actions.toggleBold(editor)}
                data-testid="ecm-bold"
              >
                {t("ui.editor_menu.bold", "Fett")}
                {shortcut("Ctrl+B")}
              </ContextMenu.Item>
              <ContextMenu.Item
                className={styles.item}
                onSelect={() => actions.toggleItalic(editor)}
              >
                {t("ui.editor_menu.italic", "Kursiv")}
                {shortcut("Ctrl+I")}
              </ContextMenu.Item>
              <ContextMenu.Item
                className={styles.item}
                onSelect={() => actions.toggleUnderline(editor)}
              >
                {t("ui.editor_menu.underline", "Unterstrichen")}
                {shortcut("Ctrl+U")}
              </ContextMenu.Item>

              <ContextMenu.Sub>
                <ContextMenu.SubTrigger
                  className={styles.item}
                  data-testid="ecm-heading-sub"
                >
                  {t("ui.editor_menu.as_heading", "Als Überschrift")}
                  <span className={styles.shortcut}>▶</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent className={styles.content}>
                    <ContextMenu.Item
                      className={styles.item}
                      onSelect={() => actions.setHeading(editor, 1)}
                    >
                      {t("ui.editor_menu.h1", "Überschrift 1")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={styles.item}
                      onSelect={() => actions.setHeading(editor, 2)}
                    >
                      {t("ui.editor_menu.h2", "Überschrift 2")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={styles.item}
                      onSelect={() => actions.setHeading(editor, 3)}
                    >
                      {t("ui.editor_menu.h3", "Überschrift 3")}
                    </ContextMenu.Item>
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>

              <ContextMenu.Sub>
                <ContextMenu.SubTrigger
                  className={styles.item}
                  data-testid="ecm-list-sub"
                >
                  {t("ui.editor_menu.as_list", "Als Liste")}
                  <span className={styles.shortcut}>▶</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent className={styles.content}>
                    <ContextMenu.Item
                      className={styles.item}
                      onSelect={() => actions.toggleBulletList(editor)}
                    >
                      {t("ui.editor_menu.bullet_list", "Aufzählung")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={styles.item}
                      onSelect={() => actions.toggleOrderedList(editor)}
                    >
                      {t("ui.editor_menu.ordered_list", "Nummerierung")}
                    </ContextMenu.Item>
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>

              <ContextMenu.Item
                className={styles.item}
                onSelect={() => actions.toggleBlockquote(editor)}
              >
                {t("ui.editor_menu.blockquote", "Als Zitat")}
              </ContextMenu.Item>
            </>
          ) : null}

          <ContextMenu.Separator className={styles.separator} />
          {mentionActive ? (
            <ContextMenu.Item
              className={styles.item}
              onSelect={() => actions.insertMentionTrigger(editor)}
              data-testid="ecm-mention"
            >
              {t("ui.editor_menu.mention", "@-Erwähnung einfügen")}
            </ContextMenu.Item>
          ) : null}
          {onInsertImage ? (
            <ContextMenu.Item
              className={styles.item}
              onSelect={() => onInsertImage()}
              data-testid="ecm-image"
            >
              {t("ui.editor_menu.insert_image", "Bild einfügen")}
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => actions.insertHorizontalRule(editor)}
          >
            {t("ui.editor_menu.horizontal_rule", "Horizontale Linie")}
          </ContextMenu.Item>

          {(mentionActive && sel && onSearchStoryBible) || onTakeSnapshot ? (
            <ContextMenu.Separator className={styles.separator} />
          ) : null}
          {mentionActive && sel && onSearchStoryBible ? (
            <ContextMenu.Item
              className={styles.item}
              onSelect={() => onSearchStoryBible(selText)}
              data-testid="ecm-search-story-bible"
            >
              {t("ui.editor_menu.search_story_bible", "In Story-Bibel suchen")}
            </ContextMenu.Item>
          ) : null}
          {onTakeSnapshot ? (
            <ContextMenu.Item
              className={styles.item}
              onSelect={() => onTakeSnapshot()}
              data-testid="ecm-take-snapshot"
            >
              {t("ui.editor_menu.take_snapshot", "Snapshot erstellen")}
            </ContextMenu.Item>
          ) : null}

          <ContextMenu.Separator className={styles.separator} />
          <ContextMenu.Item
            className={`${styles.item} ${styles.info}`}
            disabled
            data-testid="ecm-word-count"
          >
            {t("ui.editor_menu.word_count", "Wörter")}: {wc.selection}/
            {wc.total}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
