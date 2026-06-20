/**
 * PluginSettings tests pin the testid surface and the lifecycle
 * callbacks (toggle on/off, activate, install trigger, remove via
 * AppDialog confirm). Extracted from Settings.tsx in
 * PLUGIN-SETTINGS-TESTID-COVERAGE-01.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {PluginSettings} from "./PluginSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback, lang: "en"}),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

const discoveredPlugins = vi.fn(async () => [
    // V060 C5: filter_reason + load_error_message are part of the
    // DiscoveredPlugin contract. Set to null for happy-path fixtures
    // so the existing assertions still hold; PluginCard.test.tsx
    // exercises the populated-status branches separately.
    {name: "export", loaded: true, filter_reason: null, load_error_message: null},
    {name: "audiobook", loaded: true, filter_reason: null, load_error_message: null},
    {name: "newone", loaded: true, filter_reason: null, load_error_message: null},
]);

vi.mock("../../api/client", () => ({
    api: {
        settings: {
            discoveredPlugins: () => discoveredPlugins(),
        },
        pluginInstall: {
            install: vi.fn(),
        },
    },
}));

// useDialog needs a DialogProvider; mock it as a deterministic stub
// instead of pulling the full provider into the test render tree.
const confirmMock = vi.fn(async () => true);
vi.mock("../shared/AppDialog", () => ({
    useDialog: () => ({
        confirm: confirmMock,
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

function renderTree(props: Partial<React.ComponentProps<typeof PluginSettings>> = {}) {
    const fullProps: React.ComponentProps<typeof PluginSettings> = {
        configs: {},
        appConfig: {plugins: {enabled: [], disabled: []}},
        onReload: vi.fn(),
        onSavePlugin: vi.fn(),
        onTogglePlugin: vi.fn(),
        onAddPlugin: vi.fn(),
        onRemovePlugin: vi.fn(),
        ...props,
    };
    return render(
        <MemoryRouter>
            <PluginSettings {...fullProps}/>
        </MemoryRouter>,
    );
}

describe("PluginSettings", () => {
    beforeEach(() => {
        confirmMock.mockClear();
        confirmMock.mockResolvedValue(true);
    });

    it("renders the root testid + install trigger", () => {
        renderTree();
        expect(screen.getByTestId("plugin-settings")).toBeTruthy();
        expect(screen.getByTestId("plugin-install-trigger")).toBeTruthy();
    });

    it("shows empty-state when no plugins are active", () => {
        renderTree();
        expect(screen.getByTestId("plugin-empty-state")).toBeTruthy();
    });

    it("renders an active plugin row with toggle button", () => {
        const configs = {
            audiobook: {
                plugin: {display_name: "Audiobook", version: "1.0.0", description: "TTS export"},
                settings: {},
            },
        };
        const appConfig = {plugins: {enabled: ["audiobook"], disabled: []}};
        renderTree({configs, appConfig});
        expect(screen.getByTestId("plugin-row-audiobook")).toBeTruthy();
        expect(screen.getByTestId("plugin-toggle-audiobook")).toBeTruthy();
    });

    it("does NOT render toggle/remove for core plugins", () => {
        const configs = {
            export: {
                plugin: {display_name: "Export", version: "1.0.0"},
                settings: {},
            },
        };
        const appConfig = {plugins: {enabled: ["export"], disabled: []}};
        renderTree({configs, appConfig});
        expect(screen.getByTestId("plugin-row-export")).toBeTruthy();
        expect(screen.queryByTestId("plugin-toggle-export")).toBeNull();
        expect(screen.queryByTestId("plugin-remove-export")).toBeNull();
    });

    it("toggling an active plugin calls onTogglePlugin(name, false)", () => {
        const onTogglePlugin = vi.fn();
        const configs = {
            audiobook: {plugin: {display_name: "Audiobook", version: "1.0.0"}, settings: {}},
        };
        const appConfig = {plugins: {enabled: ["audiobook"], disabled: []}};
        renderTree({configs, appConfig, onTogglePlugin});
        fireEvent.click(screen.getByTestId("plugin-toggle-audiobook"));
        expect(onTogglePlugin).toHaveBeenCalledWith("audiobook", false);
    });

    it("remove calls onRemovePlugin only after confirm resolves true", async () => {
        const onRemovePlugin = vi.fn();
        const configs = {
            audiobook: {plugin: {display_name: "Audiobook", version: "1.0.0"}, settings: {}},
        };
        const appConfig = {plugins: {enabled: ["audiobook"], disabled: []}};
        renderTree({configs, appConfig, onRemovePlugin});
        fireEvent.click(screen.getByTestId("plugin-remove-audiobook"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() => expect(onRemovePlugin).toHaveBeenCalledWith("audiobook"));
    });

    it("remove does NOT call onRemovePlugin when confirm resolves false", async () => {
        confirmMock.mockResolvedValueOnce(false);
        const onRemovePlugin = vi.fn();
        const configs = {
            audiobook: {plugin: {display_name: "Audiobook", version: "1.0.0"}, settings: {}},
        };
        const appConfig = {plugins: {enabled: ["audiobook"], disabled: []}};
        renderTree({configs, appConfig, onRemovePlugin});
        fireEvent.click(screen.getByTestId("plugin-remove-audiobook"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        // Give the rejection branch a tick to run, then assert the negation.
        await new Promise((r) => setTimeout(r, 10));
        expect(onRemovePlugin).not.toHaveBeenCalled();
    });

    it("inactive (loaded but disabled) plugins show only after Add-Plugin clicked", async () => {
        const configs = {
            newone: {plugin: {display_name: "New One", version: "1.0.0"}, settings: {}},
        };
        const appConfig = {plugins: {enabled: [], disabled: []}};
        renderTree({configs, appConfig});
        // Wait for discoveredPlugins to resolve so the add button mounts.
        await waitFor(() => expect(screen.getByTestId("plugin-add-trigger")).toBeTruthy());
        // List is hidden until trigger clicked.
        expect(screen.queryByTestId("plugin-available-list")).toBeNull();
        fireEvent.click(screen.getByTestId("plugin-add-trigger"));
        expect(screen.getByTestId("plugin-available-list")).toBeTruthy();
        expect(screen.getByTestId("plugin-available-row-newone")).toBeTruthy();
        expect(screen.getByTestId("plugin-activate-newone")).toBeTruthy();
    });

    it("activating an inactive plugin calls onTogglePlugin(name, true)", async () => {
        const onTogglePlugin = vi.fn();
        const configs = {
            newone: {plugin: {display_name: "New One", version: "1.0.0"}, settings: {}},
        };
        const appConfig = {plugins: {enabled: [], disabled: []}};
        renderTree({configs, appConfig, onTogglePlugin});
        await waitFor(() => expect(screen.getByTestId("plugin-add-trigger")).toBeTruthy());
        fireEvent.click(screen.getByTestId("plugin-add-trigger"));
        fireEvent.click(screen.getByTestId("plugin-activate-newone"));
        expect(onTogglePlugin).toHaveBeenCalledWith("newone", true);
    });
});
