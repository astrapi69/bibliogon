import {createElement} from "react";
import {BookOpen, RotateCcw, Trash} from "lucide-react";
import {
  type EntityDescriptor,
  RESTORE_ACTION_ID,
  PERMANENT_DELETE_ACTION_ID,
  descriptorRegistry,
} from "@astrapi69/entity-kit";
import type {Book} from "../api/client";

/** Minimal translator shape (the `useI18n` `t`), so the descriptor's column +
 *  action labels localize without coupling this module to React/hooks. */
export type TranslateFn = (key: string, fallback: string) => string;

const identityTranslate: TranslateFn = (_key, fallback) => fallback;

/**
 * Build the entity-kit descriptor for {@link Book}, used by the dashboard trash
 * surface (`EntityTrashView` list + `EntityTileView` grid). Column and action
 * labels are i18n factories resolved at render time; pass the `useI18n` `t` for
 * localized labels.
 *
 * The trash list is pre-filtered by the storage seam (`getStorage().books.listTrash`
 * — ApiStorage online, DexieStorage offline), so
 * `isDeleted` returns `true` unconditionally and both views are rendered with
 * `prefiltered`. `deletedAt` is omitted: `BookOut` emits no deletion timestamp
 * and entity-kit auto-hides the column when the descriptor omits it. Restore +
 * permanent-delete are descriptor actions (rendered by the tile view; the trash
 * list uses its built-in equivalents) so a single `onAction` handler serves
 * both views via the shared {@link RESTORE_ACTION_ID} /
 * {@link PERMANENT_DELETE_ACTION_ID}.
 */
export function makeBookDescriptor(t: TranslateFn): EntityDescriptor<Book> {
  return {
    entityName: "book",
    getId: (book) => book.id,
    displayName: (book) => book.title,
    shortDescription: (book) => book.author ?? book.subtitle ?? "",
    icon: createElement(BookOpen, {size: 16}),
    listFields: [
      {key: "title", label: () => t("ui.dashboard.trash_col_title", "Titel"), sortable: true},
      {key: "author", label: () => t("ui.dashboard.trash_col_author", "Autor"), sortable: true},
    ],
    isDeleted: () => true,
    actions: [
      {
        id: RESTORE_ACTION_ID,
        label: () => t("ui.dashboard.restore_book", "Wiederherstellen"),
        icon: createElement(RotateCcw, {size: 14}),
      },
      {
        id: PERMANENT_DELETE_ACTION_ID,
        label: () => t("ui.dashboard.delete_permanent", "Endgültig löschen"),
        variant: "danger",
        icon: createElement(Trash, {size: 14}),
      },
    ],
  };
}

/** Default (un-translated) descriptor for the shared registry. UI surfaces
 *  build a localized instance via {@link makeBookDescriptor}. */
export const bookDescriptor: EntityDescriptor<Book> = makeBookDescriptor(identityTranslate);

descriptorRegistry.register(bookDescriptor);
