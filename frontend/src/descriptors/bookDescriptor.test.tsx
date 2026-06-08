import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {
  EntityTrashView,
  RESTORE_ACTION_ID,
  PERMANENT_DELETE_ACTION_ID,
  descriptorRegistry,
} from "@astrapi69/entity-kit";
import {bookDescriptor} from "./bookDescriptor";
import type {Book} from "../api/client";

function makeBook(over: Partial<Book>): Book {
  return {id: "x", title: "Untitled", author: null, subtitle: null, ...over} as Book;
}

describe("bookDescriptor", () => {
  it("reports identity, display name and short description", () => {
    const book = makeBook({id: "b1", title: "Dune", author: "Frank Herbert"});
    expect(bookDescriptor.getId(book)).toBe("b1");
    expect(bookDescriptor.displayName(book)).toBe("Dune");
    expect(bookDescriptor.shortDescription(book)).toBe("Frank Herbert");
  });

  it("falls back to subtitle then empty string for the short description", () => {
    expect(bookDescriptor.shortDescription(makeBook({author: null, subtitle: "A Saga"}))).toBe(
      "A Saga",
    );
    expect(bookDescriptor.shortDescription(makeBook({author: null, subtitle: null}))).toBe("");
  });

  it("treats every fetched trash item as deleted (host pre-filters)", () => {
    expect(bookDescriptor.isDeleted(makeBook({}))).toBe(true);
  });

  it("is registered in the shared descriptor registry under its name", () => {
    expect(descriptorRegistry.has("book")).toBe(true);
    expect(descriptorRegistry.get<Book>("book")).toBe(bookDescriptor);
  });
});

describe("EntityTrashView + bookDescriptor integration", () => {
  const books = [
    makeBook({id: "b1", title: "Dune", author: "Frank Herbert"}),
    makeBook({id: "b2", title: "Hyperion", author: "Dan Simmons"}),
  ];

  it("renders a row per soft-deleted book with its title", () => {
    render(<EntityTrashView items={books} descriptor={bookDescriptor} />);
    expect(screen.getByText("Dune")).toBeTruthy();
    expect(screen.getByText("Hyperion")).toBeTruthy();
  });

  it("emits the restore action id with the activated book", () => {
    const onAction = vi.fn();
    render(
      <EntityTrashView
        items={books}
        descriptor={bookDescriptor}
        onAction={onAction}
        restoreLabel="Restore"
        permanentDeleteLabel="Delete"
      />,
    );
    fireEvent.click(screen.getAllByText("Restore")[0]);
    expect(onAction).toHaveBeenCalledWith(RESTORE_ACTION_ID, books[0]);
  });

  it("emits the permanent-delete action id with the activated book", () => {
    const onAction = vi.fn();
    render(
      <EntityTrashView
        items={books}
        descriptor={bookDescriptor}
        onAction={onAction}
        restoreLabel="Restore"
        permanentDeleteLabel="Delete"
      />,
    );
    fireEvent.click(screen.getAllByText("Delete")[0]);
    expect(onAction).toHaveBeenCalledWith(PERMANENT_DELETE_ACTION_ID, books[0]);
  });
});
