import React, { useState, useRef, useEffect } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { GripVertical, Trash2, Pencil, BookmarkPlus, History } from "lucide-react";
import type { Chapter, ChapterType } from "../../api/client";
import {
  SortableList,
  type SortableItemRenderProps,
} from "../../lib/components/SortableList";
import Tooltip from "../../lib/components/Tooltip";
import styles from "../ChapterSidebar.module.css";

/**
 * Drag-sortable chapter list pieces for the chapter sidebar.
 *
 * Extracted from `ChapterSidebar.tsx` (Batch 4 god-file burn-down).
 * `SortableChapterItem` is the per-chapter row (rename + context menu +
 * drag handle); `SortableGroup` wraps a chapter group in the shared
 * `SortableList` and rebuilds the full chapter order on reorder
 * (preserving chapters outside the group). Both are props-driven.
 */

// --- Sortable Chapter Item ---

const SortableChapterItem = React.memo(function SortableChapterItem({
  chapter,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onSaveAsChapterTemplate,
  onShowVersions,
  typeLabels,
  deleteLabel,
  renameLabel,
  saveTemplateLabel,
  historyLabel,
  dnd,
}: {
  chapter: Chapter;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onSaveAsChapterTemplate?: (id: string) => void;
  onShowVersions?: (id: string) => void;
  typeLabels: Record<ChapterType, string>;
  deleteLabel: string;
  renameLabel: string;
  saveTemplateLabel: string;
  historyLabel: string;
  dnd: SortableItemRenderProps;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chapter.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== chapter.title) {
      onRename(chapter.id, trimmed);
    }
    setEditing(false);
  };

  const { attributes, listeners, setNodeRef, style, isDragging } = dnd;

  const className = [
    styles.item,
    isActive ? styles.itemActive : "",
    isDragging ? styles.itemDragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  const itemContent = (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      data-testid={`chapter-item-${chapter.id}`}
      role="button"
      tabIndex={0}
      onClick={() => !editing && onSelect(chapter.id)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !editing) {
          e.preventDefault();
          onSelect(chapter.id);
        }
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ display: "flex", cursor: "grab" }}
        data-testid={`drag-handle-${chapter.id}`}
      >
        <GripVertical size={14} style={{ flexShrink: 0, opacity: 0.3 }} />
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setEditValue(chapter.title);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={styles.renameInput}
        />
      ) : (
        <span
          className={styles.itemTitle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditValue(chapter.title);
            setEditing(true);
          }}
        >
          {chapter.chapter_type !== "chapter" && (
            <span className={styles.typeTag}>
              {typeLabels[chapter.chapter_type]}
            </span>
          )}
          {chapter.title}
        </span>
      )}
      {!editing && (
        <Tooltip content={deleteLabel} side="right">
          <button
            className={`btn-sidebar-icon ${styles.deleteReveal}`}
            data-testid={`chapter-delete-${chapter.id}`}
            aria-label={deleteLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(chapter.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{itemContent}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="chapter-dropdown-content">
          <ContextMenu.Item
            className="chapter-dropdown-item"
            onSelect={() => {
              setEditValue(chapter.title);
              setEditing(true);
            }}
          >
            <Pencil size={12} style={{ marginRight: 6 }} /> {renameLabel}
          </ContextMenu.Item>
          {onSaveAsChapterTemplate && (
            <ContextMenu.Item
              className="chapter-dropdown-item"
              data-testid={`chapter-context-save-template-${chapter.id}`}
              onSelect={() => onSaveAsChapterTemplate(chapter.id)}
            >
              <BookmarkPlus size={12} style={{ marginRight: 6 }} />{" "}
              {saveTemplateLabel}
            </ContextMenu.Item>
          )}
          {onShowVersions && (
            <ContextMenu.Item
              className="chapter-dropdown-item"
              data-testid={`chapter-context-history-${chapter.id}`}
              onSelect={() => onShowVersions(chapter.id)}
            >
              <History size={12} style={{ marginRight: 6 }} /> {historyLabel}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="chapter-dropdown-separator" />
          <ContextMenu.Item
            className="chapter-dropdown-item chapter-dropdown-item-danger"
            onSelect={() => onDelete(chapter.id)}
          >
            <Trash2 size={12} style={{ marginRight: 6 }} /> {deleteLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

// --- Sortable Group ---

export function SortableGroup({
  chapters,
  allChapters,
  activeChapterId,
  onSelect,
  onDelete,
  onRename,
  onSaveAsChapterTemplate,
  onShowVersions,
  onReorder,
  typeLabels,
  deleteLabel,
  renameLabel,
  saveTemplateLabel,
  historyLabel,
}: {
  chapters: Chapter[];
  allChapters: Chapter[];
  activeChapterId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onSaveAsChapterTemplate?: (id: string) => void;
  onShowVersions?: (id: string) => void;
  onReorder: (chapterIds: string[]) => void;
  typeLabels: Record<ChapterType, string>;
  deleteLabel: string;
  renameLabel: string;
  saveTemplateLabel: string;
  historyLabel: string;
}) {
  const groupIds = chapters.map((ch) => ch.id);

  const handleReorder = (newGroupOrder: string[]) => {
    // Rebuild full chapter order preserving non-group chapters
    const allIds = allChapters.map((ch) => ch.id);
    const result: string[] = [];
    let groupInserted = false;
    for (const id of allIds) {
      if (groupIds.includes(id)) {
        if (!groupInserted) {
          result.push(...newGroupOrder);
          groupInserted = true;
        }
      } else {
        result.push(id);
      }
    }
    onReorder(result);
  };

  return (
    <SortableList
      items={chapters}
      getId={(ch) => ch.id}
      onReorder={handleReorder}
      renderItem={(ch, dnd) => (
        <SortableChapterItem
          chapter={ch}
          isActive={ch.id === activeChapterId}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
          onSaveAsChapterTemplate={onSaveAsChapterTemplate}
          onShowVersions={onShowVersions}
          typeLabels={typeLabels}
          deleteLabel={deleteLabel}
          renameLabel={renameLabel}
          saveTemplateLabel={saveTemplateLabel}
          historyLabel={historyLabel}
          dnd={dnd}
        />
      )}
    />
  );
}
