/**
 * Render-based structural assertions for ChapterSidebar.
 *
 * These tests exist specifically to pin the flexbox scroll fix
 * for the chapter list container. Without ``min-height: 0`` on a
 * flex child, ``overflow-y: auto`` is silently defeated because
 * flex children default to ``min-height: auto`` and expand to
 * their intrinsic content size - so the whole page scrolls
 * instead of the inner list.
 *
 * jsdom does not run a layout pass, so we cannot assert on the
 * dropdown's runtime ``max-height`` (Radix only resolves its
 * ``--radix-dropdown-menu-content-available-height`` variable
 * after the popper positions the element). That part is
 * asserted by reading the global.css source in the
 * ``.chapter-dropdown-content`` test further down, which is a
 * structural check that the rule exists - not a rendered value.
 */

import React from "react";
import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import ChapterSidebar from "./ChapterSidebar";
import type {Chapter} from "../api/client";

// Radix DropdownMenu + Tooltip lean on ResizeObserver which jsdom
// does not ship. Provide a no-op stub so the component mounts.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as unknown as {ResizeObserver: typeof ResizeObserverStub}).ResizeObserver = ResizeObserverStub;

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
    return {
        id: "c1",
        book_id: "b1",
        title: "Chapter 1",
        content: "{}",
        position: 0,
        chapter_type: "chapter",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        ...overrides,
    };
}

function renderSidebar(chapters: Chapter[] = [makeChapter()]) {
    return render(
        <ChapterSidebar
            bookTitle="Test Book"
            chapters={chapters}
            activeChapterId={null}
            onSelect={vi.fn()}
            onAdd={vi.fn()}
            onDelete={vi.fn()}
            onRename={vi.fn()}
            onBack={vi.fn()}
            onExport={vi.fn()}
            onReorder={vi.fn()}
            onMetadata={vi.fn()}
            showMetadata={false}
            hasToc={false}
        />,
    );
}

describe("ChapterSidebar - flexbox scroll container", () => {
    it("renders the list container with the data-testid", () => {
        renderSidebar();
        expect(screen.getByTestId("chapter-sidebar-list")).toBeTruthy();
    });

    it("list container has overflow-y: auto so it can scroll", () => {
        renderSidebar();
        const list = screen.getByTestId("chapter-sidebar-list") as HTMLDivElement;
        // React normalizes inline styles onto the element; happy-dom
        // reports them through style.getPropertyValue.
        expect(list.style.overflowY).toBe("auto");
    });

    it("list container has min-height: 0 so overflow-y actually works in a flex column", () => {
        // This is the regression pin. Removing min-height: 0 silently
        // breaks the scroll container because flex children default
        // to min-height: auto and expand to content height.
        renderSidebar();
        const list = screen.getByTestId("chapter-sidebar-list") as HTMLDivElement;
        // React serializes a plain numeric ``minHeight: 0`` as "0"
        // rather than "0px". Match either so the test is stable if
        // somebody later writes ``minHeight: "0px"`` as a string.
        expect(["0", "0px"]).toContain(list.style.minHeight);
    });

    it("list container has flex: 1 so it consumes remaining vertical space", () => {
        renderSidebar();
        const list = screen.getByTestId("chapter-sidebar-list") as HTMLDivElement;
        // React serializes numeric flex to the short form "1 1 0%"
        // in happy-dom. Checking flexGrow is the stable substring.
        expect(list.style.flex || list.style.flexGrow).toBeTruthy();
    });
});

describe("ChapterSidebar - dropdown CSS contract", () => {
    it("global.css caps the chapter dropdown to the Radix available height", () => {
        // Structural check: the CSS rule must exist and reference the
        // Radix CSS variable. jsdom cannot compute the actual pixel
        // value because the Popper runs no layout pass, so we verify
        // the source contract instead. This is the regression pin
        // that prevents the rule from being accidentally deleted or
        // reverted in a theme refactor.
        const cssPath = path.resolve(__dirname, "../styles/global.css");
        const css = fs.readFileSync(cssPath, "utf8");

        // Find the .chapter-dropdown-content block and check every
        // critical declaration is present inside it.
        const blockMatch = css.match(
            /\.chapter-dropdown-content\s*\{[^}]*\}/,
        );
        expect(blockMatch).not.toBeNull();
        const block = blockMatch![0];
        expect(block).toContain("max-height: var(--radix-dropdown-menu-content-available-height)");
        expect(block).toContain("overflow-y: auto");
    });
});
