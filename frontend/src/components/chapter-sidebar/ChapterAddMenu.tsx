import { useState } from "react";
import { Plus } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ChapterType } from "../../api/client";
import {
  FRONT_MATTER_TYPES,
  BACK_MATTER_TYPES,
  STRUCTURE_TYPES,
} from "../../lib/utils/chapterGroups";
import Tooltip from "../Tooltip";

/**
 * Add-chapter dropdown for the chapter sidebar's "Inhalt" section header.
 *
 * Extracted from `ChapterSidebar.tsx` (god-file burn-down). Owns its own
 * open/close state; the parent passes the add + add-from-template
 * handlers, the localized type labels, and the `t` helper. All
 * `data-testid`s and i18n keys are unchanged.
 */
export default function ChapterAddMenu({
  onAdd,
  onAddFromTemplate,
  typeLabels,
  t,
}: {
  onAdd: (chapterType?: ChapterType) => void;
  onAddFromTemplate?: () => void;
  typeLabels: Record<ChapterType, string>;
  t: (key: string, fallback: string) => string;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  return (
    <DropdownMenu.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
      <Tooltip content={t("ui.sidebar.add_chapter", "Kapitel hinzufügen")}>
        <DropdownMenu.Trigger asChild>
          <button
            className="btn-sidebar-icon"
            data-testid="chapter-add-trigger"
            aria-label={t("ui.sidebar.add_chapter", "Kapitel hinzufügen")}
          >
            <Plus size={14} />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="chapter-dropdown-content"
          align="end"
          sideOffset={4}
          collisionPadding={{ top: 16, bottom: 280, left: 16, right: 16 }}
          data-testid="chapter-add-dropdown"
        >
          <DropdownMenu.Label className="chapter-dropdown-label">
            {t("ui.sidebar.front_matter", "Front Matter")}
          </DropdownMenu.Label>
          {FRONT_MATTER_TYPES.map((type) => (
            <DropdownMenu.Item
              key={type}
              className="chapter-dropdown-item"
              data-testid="chapter-dropdown-item"
              onSelect={() => onAdd(type)}
            >
              {typeLabels[type]}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="chapter-dropdown-separator" />
          <DropdownMenu.Label className="chapter-dropdown-label">
            {t("ui.sidebar.chapters", "Kapitel")}
          </DropdownMenu.Label>
          <DropdownMenu.Item
            className="chapter-dropdown-item"
            data-testid="chapter-dropdown-item"
            onSelect={() => onAdd("chapter")}
          >
            {t("ui.editor.new_chapter", "Neues Kapitel")}
          </DropdownMenu.Item>
          {onAddFromTemplate && (
            <DropdownMenu.Item
              className="chapter-dropdown-item"
              data-testid="chapter-dropdown-from-template"
              onSelect={onAddFromTemplate}
            >
              {t("ui.editor.new_chapter_from_template", "Aus Vorlage...")}
            </DropdownMenu.Item>
          )}
          {STRUCTURE_TYPES.map((type) => (
            <DropdownMenu.Item
              key={type}
              className="chapter-dropdown-item"
              data-testid="chapter-dropdown-item"
              onSelect={() => onAdd(type)}
            >
              {typeLabels[type]}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="chapter-dropdown-separator" />
          <DropdownMenu.Label className="chapter-dropdown-label">
            {t("ui.sidebar.back_matter", "Back Matter")}
          </DropdownMenu.Label>
          {BACK_MATTER_TYPES.map((type) => (
            <DropdownMenu.Item
              key={type}
              className="chapter-dropdown-item"
              data-testid="chapter-dropdown-item"
              onSelect={() => onAdd(type)}
            >
              {typeLabels[type]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
