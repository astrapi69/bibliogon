import {createElement} from "react";
import {BookOpen} from "lucide-react";
import {
  type EntityDescriptor,
  descriptorRegistry,
} from "@astrapi69/entity-kit";
import type {Book} from "../api/client";

/**
 * entity-kit BeanInfo descriptor for the {@link Book} entity. Drives the
 * generic `EntityTrashView` in the dashboard trash surface (PoC for
 * `@astrapi69/entity-kit`).
 *
 * Notes for this codebase:
 * - `isDeleted` returns `true` unconditionally because the host fetches a
 *   pre-filtered trash-only list via `api.books.listTrash()`; Bibliogon's
 *   `Book` shape (backend `BookOut`) carries no `deleted_at` / `is_deleted`
 *   field, so a value-based predicate would hide every row.
 * - `deletedAt` reads a `deleted_at` that `BookOut` does not currently emit
 *   (kept for forward-compatibility); the deletion-timestamp column renders
 *   empty until the backend exposes it.
 * - `listFields` labels are English literals: the library renders `label`
 *   verbatim and exposes no i18n hook, so the action labels (which ARE
 *   localized) are passed to `EntityTrashView` as props instead. A fully
 *   localized integration would build the descriptor from a translator factory.
 */
export const bookDescriptor: EntityDescriptor<Book> = {
  entityName: "book",
  getId: (book) => book.id,
  displayName: (book) => book.title,
  shortDescription: (book) => book.author ?? book.subtitle ?? "",
  icon: createElement(BookOpen, {size: 16}),

  listFields: [
    {key: "title", label: "Title", sortable: true},
    {key: "author", label: "Author", sortable: true},
  ],

  detailFields: [
    {key: "title", label: "Title"},
    {key: "author", label: "Author"},
    {key: "book_type", label: "Type"},
  ],

  searchableFields: ["title"],

  isDeleted: () => true,
  deletedAt: (book) =>
    (book as Book & {deleted_at?: string | null}).deleted_at ?? null,

  actions: [],
};

descriptorRegistry.register(bookDescriptor);
