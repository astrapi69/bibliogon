import { describe, it, expect, vi } from "vitest";

import { buildBookEditorMenu, type BookEditorMenuDeps } from "./buildBookEditorMenu";

/**
 * The translator echoes its key, so an assertion names the i18n key the menu
 * asked for rather than a localized string that a catalog edit would move.
 */
const echoKey = (key: string) => key;

function deps(overrides: Partial<BookEditorMenuDeps> = {}): BookEditorMenuDeps {
    return {
        t: echoKey,
        navigate: vi.fn(),
        bookId: "book-1",
        gitDisabledReason: null,
        storyBibleAvailable: false,
        setSelectedStoryEntityId: vi.fn(),
        closeSidebarOnNarrow: vi.fn(),
        setShowMetadata: vi.fn(),
        setShowStoryboard: vi.fn(),
        setShowOutline: vi.fn(),
        setShowRelationships: vi.fn(),
        openStoryBible: vi.fn(),
        onExport: vi.fn(),
        onValidateToc: vi.fn(),
        onAddChapter: vi.fn(),
        onAddFromTemplate: vi.fn(),
        onSaveAsTemplate: vi.fn(),
        ...overrides,
    };
}

describe("buildBookEditorMenu git gating (#1100)", () => {
    it("carries the caller's reason key for both git actions", () => {
        // #880 decided pull-only in the browser; the user has to be able to
        // read WHY push is absent, which is the registry's reason - not a
        // second copy of "lives in the desktop app" hardcoded here.
        const { disabled } = buildBookEditorMenu(
            deps({ gitDisabledReason: "ui.feature.write_requires_desktop_app" }),
        );
        expect(disabled["git-sync"]).toBe("ui.feature.write_requires_desktop_app");
        expect(disabled["git-backup"]).toBe("ui.feature.write_requires_desktop_app");
    });

    it("does not substitute the generic desktop-app reason", () => {
        // The regression this pins: the file used to ignore the registry and
        // always ask for ui.feature.requires_desktop_app.
        const { disabled } = buildBookEditorMenu(
            deps({ gitDisabledReason: "ui.feature.write_requires_desktop_app" }),
        );
        expect(disabled["git-sync"]).not.toBe("ui.feature.requires_desktop_app");
        expect(disabled["git-backup"]).not.toBe("ui.feature.requires_desktop_app");
    });

    it("passes a future reason through unchanged", () => {
        // Boundary: the builder must not know which reasons exist. When #755
        // splits pull from push, the caller changes and this file does not.
        const { disabled } = buildBookEditorMenu(
            deps({ gitDisabledReason: "ui.feature.requires_network" }),
        );
        expect(disabled["git-sync"]).toBe("ui.feature.requires_network");
    });

    it("disables nothing when the git features are active", () => {
        const { disabled } = buildBookEditorMenu(deps({ gitDisabledReason: null }));
        expect(disabled).toEqual({});
    });

    it("still offers both git items while they are disabled (policy #78)", () => {
        // Disabled with a reason, never hidden: the entries must exist for
        // the reason to be readable at all.
        const { groups } = buildBookEditorMenu(
            deps({ gitDisabledReason: "ui.feature.write_requires_desktop_app" }),
        );
        const ids = groups.flatMap((group) => group.items.map((item) => item.id));
        expect(ids).toContain("git-sync");
        expect(ids).toContain("git-backup");
    });
});
