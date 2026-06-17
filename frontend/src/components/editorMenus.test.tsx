/**
 * Tests for the per-editor menu builders (#382) reusing the generic
 * {@link EditorMenu} in the Article, Comic and Picture-book editors. The
 * builders are pure (groups + disabled map + dispatcher), so each menu is
 * rendered through the real EditorMenu and asserted via its testid namespace.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EditorMenu, type EditorMenuGroup } from "../lib/components/EditorMenu";
import { buildArticleEditorMenu } from "../pages/buildArticleEditorMenu";
import { buildComicEditorMenu } from "./buildComicEditorMenu";
import { buildPictureBookEditorMenu } from "./buildPictureBookEditorMenu";

const t = (_key: string, fallback?: string) => fallback ?? _key;

interface BuiltMenu {
    groups: EditorMenuGroup[];
    disabled: Record<string, string>;
    onAction: (id: string) => void;
}

function renderMenu(menu: BuiltMenu, prefix: string) {
    render(
        <EditorMenu
            groups={menu.groups}
            onAction={menu.onAction}
            disabled={menu.disabled}
            triggerLabel="Menü"
            testIdPrefix={prefix}
        />,
    );
}

function open(prefix: string) {
    fireEvent.click(screen.getByTestId(`${prefix}-trigger`));
}

function groupLabels(prefix: string): string[] {
    return Array.from(document.querySelectorAll(`[data-testid^="${prefix}-group-"]`)).map(
        (node) => node.textContent ?? "",
    );
}

const articleMenu = () =>
    buildArticleEditorMenu({
        t,
        navigate: vi.fn(),
        onExport: vi.fn(),
        onDelete: vi.fn(),
        onAiGenerate: vi.fn(),
    });

const comicMenu = (over: Partial<Parameters<typeof buildComicEditorMenu>[0]> = {}) =>
    buildComicEditorMenu({
        t,
        navigate: vi.fn(),
        onShowMetadata: vi.fn(),
        onShowStoryboard: vi.fn(),
        onAddPage: vi.fn(),
        onDeletePage: vi.fn(),
        onAddPanel: vi.fn(),
        onDeletePanel: vi.fn(),
        hasActivePage: true,
        canAddPanel: true,
        hasSelectedPanel: true,
        ...over,
    });

const pictureMenu = (over: Partial<Parameters<typeof buildPictureBookEditorMenu>[0]> = {}) =>
    buildPictureBookEditorMenu({
        t,
        navigate: vi.fn(),
        onShowMetadata: vi.fn(),
        onShowStoryboard: vi.fn(),
        onAddPage: vi.fn(),
        onDeletePage: vi.fn(),
        hasActivePage: true,
        ...over,
    });

describe("per-editor EditorMenu (reproduction: renders in each editor)", () => {
    it("renders a hamburger trigger for the article, comic and picture-book editors", () => {
        renderMenu(articleMenu(), "article-menu");
        renderMenu(comicMenu(), "comic-menu");
        renderMenu(pictureMenu(), "picture-menu");
        expect(screen.getByTestId("article-menu-trigger")).toBeInTheDocument();
        expect(screen.getByTestId("comic-menu-trigger")).toBeInTheDocument();
        expect(screen.getByTestId("picture-menu-trigger")).toBeInTheDocument();
    });
});

describe("per-editor EditorMenu (happy path: groups per editor type)", () => {
    it("article menu = Datei/Ansicht/Werkzeuge/Hilfe, no Kapitel group", () => {
        renderMenu(articleMenu(), "article-menu");
        open("article-menu");
        expect(groupLabels("article-menu")).toEqual(["Datei", "Ansicht", "Werkzeuge", "Hilfe"]);
        expect(screen.getByTestId("article-menu-item-delete")).toBeInTheDocument();
        expect(screen.queryByText("Kapitel")).not.toBeInTheDocument();
    });

    it("comic menu has the Panel + Seite groups and dispatches add-panel", () => {
        const onAddPanel = vi.fn();
        renderMenu(comicMenu({ onAddPanel }), "comic-menu");
        open("comic-menu");
        expect(groupLabels("comic-menu")).toEqual(["Ansicht", "Seite", "Panel", "Hilfe"]);
        fireEvent.click(screen.getByTestId("comic-menu-item-add-panel"));
        expect(onAddPanel).toHaveBeenCalledTimes(1);
    });

    it("picture-book menu has the Seite group (no Panel) and dispatches add-page", () => {
        const onAddPage = vi.fn();
        renderMenu(pictureMenu({ onAddPage }), "picture-menu");
        open("picture-menu");
        expect(groupLabels("picture-menu")).toEqual(["Ansicht", "Seite", "Hilfe"]);
        expect(screen.queryByText("Panel")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("picture-menu-item-add-page"));
        expect(onAddPage).toHaveBeenCalledTimes(1);
    });
});

describe("per-editor EditorMenu (edge: empty/disabled groups)", () => {
    it("comic editor without an active page / selected panel disables the dependent items", () => {
        renderMenu(
            comicMenu({ hasActivePage: false, canAddPanel: false, hasSelectedPanel: false }),
            "comic-menu",
        );
        open("comic-menu");
        expect(screen.getByTestId("comic-menu-item-delete-page")).toBeDisabled();
        expect(screen.getByTestId("comic-menu-item-add-panel")).toBeDisabled();
        expect(screen.getByTestId("comic-menu-item-delete-panel")).toBeDisabled();
        // The add-page action stays enabled (it needs no target).
        expect(screen.getByTestId("comic-menu-item-add-page")).not.toBeDisabled();
    });

    it("comic editor hides the Ansicht group when no view callbacks are provided", () => {
        renderMenu(
            comicMenu({ onShowMetadata: undefined, onShowStoryboard: undefined }),
            "comic-menu",
        );
        open("comic-menu");
        expect(groupLabels("comic-menu")).toEqual(["Seite", "Panel", "Hilfe"]);
    });
});

describe("per-editor EditorMenu (edge: mobile hamburger toggle)", () => {
    it("opens the portaled menu panel on trigger click and closes on Escape", () => {
        renderMenu(pictureMenu(), "picture-menu");
        expect(screen.queryByTestId("picture-menu-panel")).not.toBeInTheDocument();
        open("picture-menu");
        expect(screen.getByTestId("picture-menu-panel")).toBeInTheDocument();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByTestId("picture-menu-panel")).not.toBeInTheDocument();
    });
});
