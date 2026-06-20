import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import RecentDocuments from "../RecentDocuments";
import type { RecentDocument } from "../../hooks/content/useRecentDocuments";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

const recentMock = vi.fn<() => RecentDocument[]>();
vi.mock("../../hooks/content/useRecentDocuments", () => ({
  useRecentDocuments: () => recentMock(),
}));

function renderIt() {
  return render(
    <MemoryRouter>
      <RecentDocuments kind="books" />
    </MemoryRouter>,
  );
}

function makeDocs(count: number): RecentDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    title: `Book ${i}`,
    kind: "book" as const,
    updatedAt: "",
  }));
}

/** The chip strip is the immediate sibling div under the section. */
function chipStrip() {
  return screen.getByTestId("recent-documents").querySelector("div")!;
}

describe("RecentDocuments", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    recentMock.mockReset();
  });

  it("renders nothing when there are no recent documents", () => {
    recentMock.mockReturnValue([]);
    renderIt();
    expect(screen.queryByTestId("recent-documents")).toBeNull();
  });

  it("renders a chip per document with title and relative time", () => {
    recentMock.mockReturnValue([
      {
        id: "b1",
        title: "My Book",
        kind: "book",
        updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      },
    ]);
    renderIt();
    const chip = screen.getByTestId("recent-doc-b1");
    expect(chip.textContent).toContain("My Book");
    expect(chip.textContent).toContain("hours ago");
  });

  it("wraps chips (no horizontal scroll container) with a single item (#393)", () => {
    recentMock.mockReturnValue(makeDocs(1));
    renderIt();
    const strip = chipStrip();
    expect(strip.className).toContain("flex-wrap");
    expect(strip.className).not.toContain("overflow-x-auto");
  });

  it("wraps chips (no horizontal scroll) with a few items", () => {
    recentMock.mockReturnValue(makeDocs(3));
    renderIt();
    const strip = chipStrip();
    expect(strip.className).toContain("flex-wrap");
    expect(strip.className).not.toContain("overflow-x-auto");
    expect(screen.getAllByTestId(/^recent-doc-/)).toHaveLength(3);
  });

  it("still wraps chips with many items (never an x-scrollbar)", () => {
    recentMock.mockReturnValue(makeDocs(5));
    renderIt();
    const strip = chipStrip();
    expect(strip.className).toContain("flex-wrap");
    expect(strip.className).not.toContain("overflow-x-auto");
    expect(screen.getAllByTestId(/^recent-doc-/)).toHaveLength(5);
  });

  it("navigates to the editor on click", () => {
    recentMock.mockReturnValue([
      { id: "b1", title: "My Book", kind: "book", updatedAt: "" },
    ]);
    renderIt();
    fireEvent.click(screen.getByTestId("recent-doc-b1"));
    expect(navigateMock).toHaveBeenCalledWith("/book/b1");
  });
});
