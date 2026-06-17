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
import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
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

describe("ChapterSidebar - Story Bible action button (BOOK-EDITOR-STORY-BIBLE-BUTTON-01)", () => {
    // The tools-Collapsible persists its open state in localStorage; clear it
    // so each test starts from the collapsed default.
    beforeEach(() => {
        localStorage.clear();
    });

    function renderWithStoryBible(onStoryBible?: () => void) {
        return render(
            <ChapterSidebar
                bookTitle="Test Book"
                chapters={[makeChapter()]}
                activeChapterId={null}
                onSelect={vi.fn()}
                onAdd={vi.fn()}
                onDelete={vi.fn()}
                onRename={vi.fn()}
                onBack={vi.fn()}
                onExport={vi.fn()}
                onReorder={vi.fn()}
                onMetadata={vi.fn()}
                onStoryBible={onStoryBible}
                showMetadata={false}
                hasToc={false}
            />,
        );
    }

    it("renders the Story-Bibel button in the Actions footer when onStoryBible is provided", () => {
        renderWithStoryBible(vi.fn());
        // Secondary tools live in a collapsed Collapsible; expand it first.
        fireEvent.click(screen.getByTestId("chapter-sidebar-tools-toggle"));
        expect(screen.getByTestId("story-bible-toggle")).toBeTruthy();
    });

    it("hides the Story-Bibel button when onStoryBible is omitted (plugin inactive)", () => {
        renderWithStoryBible(undefined);
        fireEvent.click(screen.getByTestId("chapter-sidebar-tools-toggle"));
        expect(screen.queryByTestId("story-bible-toggle")).toBeNull();
    });

    it("calls onStoryBible when the button is clicked", () => {
        const onStoryBible = vi.fn();
        renderWithStoryBible(onStoryBible);
        fireEvent.click(screen.getByTestId("chapter-sidebar-tools-toggle"));
        fireEvent.click(screen.getByTestId("story-bible-toggle"));
        expect(onStoryBible).toHaveBeenCalledTimes(1);
    });

    it("collapses the tools by default on a narrow viewport and expands on toggle", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 800,
        });
        renderWithStoryBible(vi.fn());
        // Collapsed by default: the secondary tool buttons are not in the DOM.
        expect(screen.queryByTestId("story-bible-toggle")).toBeNull();
        expect(screen.queryByTestId("chapter-sidebar-storyboard")).toBeNull();
        // Metadaten + Exportieren stay outside the Collapsible (always visible).
        expect(screen.getByTestId("chapter-sidebar-tools-toggle")).toBeTruthy();
        // Expand -> secondary tools appear.
        fireEvent.click(screen.getByTestId("chapter-sidebar-tools-toggle"));
        expect(screen.getByTestId("story-bible-toggle")).toBeTruthy();
    });

    it("expands the tools by default on a desktop viewport (Issue #42)", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 1400,
        });
        renderWithStoryBible(vi.fn());
        // No stored preference + desktop width -> tools open from the start.
        expect(screen.getByTestId("story-bible-toggle")).toBeTruthy();
    });

    it("an explicit collapse preference wins over the desktop default", () => {
        localStorage.setItem("bibliogon.sidebar_tools_open", "0");
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 1400,
        });
        renderWithStoryBible(vi.fn());
        expect(screen.queryByTestId("story-bible-toggle")).toBeNull();
    });
});

describe("ChapterSidebar - flexbox scroll container", () => {
    it("renders the list container with the data-testid", () => {
        renderSidebar();
        expect(screen.getByTestId("chapter-sidebar-list")).toBeTruthy();
    });

    // Post T-01 migration: the inline-style regression pins moved
    // from the rendered DOM (jsdom can't compute layout, only inline
    // values) to the CSS-Module source. The .list rule must keep the
    // three flex-scroll declarations or scrolling silently breaks.
    it("ChapterSidebar.module.css .list rule has the flex-scroll trio", () => {
        const cssPath = path.resolve(
            __dirname,
            "./ChapterSidebar.module.css",
        );
        const css = fs.readFileSync(cssPath, "utf8");
        // Match the .list block and assert all three declarations
        // are present inside it.
        const blockMatch = css.match(/\.list\s*\{[^}]*\}/);
        expect(blockMatch).not.toBeNull();
        const block = blockMatch![0];
        expect(block).toContain("overflow-y: auto");
        expect(block).toContain("min-height: 0");
        expect(block).toContain("flex: 1");
    });
});

describe("ChapterSidebar - mobile overlay reachability", () => {
    it("renders the footer Metadaten + Exportieren controls with testids", () => {
        renderSidebar();
        expect(screen.getByTestId("chapter-sidebar-metadata")).toBeTruthy();
        expect(screen.getByTestId("chapter-sidebar-export")).toBeTruthy();
    });

    // The mobile overlay fix lives in a media query that jsdom cannot
    // evaluate (no layout pass), so pin it at the CSS-Module source:
    // below the menu breakpoint the WHOLE sidebar scrolls (100dvh +
    // overflow-y: auto + safe-area) and the list grows naturally, so the
    // pinned footer can no longer fall below the fold.
    it("ChapterSidebar.module.css uses dvh and a mobile full-scroll fallback", () => {
        const cssPath = path.resolve(__dirname, "./ChapterSidebar.module.css");
        const css = fs.readFileSync(cssPath, "utf8");

        const sidebarBlock = css.match(/\.sidebar\s*\{[^}]*\}/);
        expect(sidebarBlock).not.toBeNull();
        expect(sidebarBlock![0]).toContain("100dvh");

        // The overlay media query (below 75rem / 1200px) must make the
        // whole sidebar scrollable and clear the iOS safe area.
        const mediaMatch = css.match(/@media\s*\(max-width:\s*74\.99rem\)\s*\{[\s\S]*?\n\}/);
        expect(mediaMatch).not.toBeNull();
        const media = mediaMatch![0];
        expect(media).toContain("overflow-y: auto");
        expect(media).toContain("env(safe-area-inset-bottom)");
        expect(media).toContain("flex: 0 0 auto");
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
