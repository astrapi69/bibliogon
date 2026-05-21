/**
 * Vitest coverage for the V060 C5 PluginCard status surface.
 *
 * Pins (consolidated into 2 tests per the V060 C5 stop-condition
 * "1-2 Vitest tests" budget):
 *
 * 1. Status badge: renders the localized i18n string for the
 *    FilterReason when set; renders nothing when null/omitted.
 *    Covers the three load-bearing mappings:
 *    - ``load_failed`` (the canonical failure surface)
 *    - ``wrong_application`` (v0.7.0 identity gating)
 *    - ``pre_activate_rejected`` -> Bibliogon's
 *      ``license_check_failed`` slot (intentional rename per
 *      PluginForge layer-agnostic naming).
 * 2. Detail line: renders the ``loadErrorMessage`` when set;
 *    omits when null. Closes the half-wired-surface gap that
 *    pre-V060 hid load errors from the user entirely.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {PluginCard} from "./PluginCard";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (key: string, fallback: string) => {
            const map: Record<string, string> = {
                "ui.settings.plugin_status_load_failed": "[i18n:load-failed]",
                "ui.settings.plugin_status_wrong_application": "[i18n:wrong-app]",
                "ui.settings.plugin_status_license_check_failed": "[i18n:license-failed]",
                "ui.settings.plugin_active_since": "[i18n:active-since]",
                "ui.settings.plugin_settings_applied": "[i18n:settings-applied]",
                "ui.settings.plugin_source_zip": "[i18n:via-zip]",
            };
            return map[key] ?? fallback;
        },
        lang: "en",
    }),
}));

const BASE_PROPS = {
    name: "test-plugin",
    displayName: "Test Plugin",
    description: "A plugin for testing",
    version: "1.0.0",
    enabled: true,
    settings: {},
    onSave: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
};

function renderCard(extra: Partial<typeof BASE_PROPS> & {
    filterReason?: string | null;
    loadErrorMessage?: string | null;
    activatedAt?: string | null;
    lastConfigChange?: string | null;
    source?: "entry_point" | "direct_register" | null;
}) {
    return render(
        <MemoryRouter>
            <PluginCard {...BASE_PROPS} {...extra} />
        </MemoryRouter>,
    );
}

describe("PluginCard V060 status surface", () => {
    it("renders the localized status badge for known FilterReasons, nothing when null", () => {
        // No filterReason -> no badge (both null and omitted cases).
        const {unmount: u1} = renderCard({filterReason: null});
        expect(screen.queryByTestId("plugin-status-test-plugin")).toBeNull();
        u1();
        const {unmount: u2} = renderCard({});
        expect(screen.queryByTestId("plugin-status-test-plugin")).toBeNull();
        u2();

        // load_failed -> canonical failure surface.
        const {unmount: u3} = renderCard({filterReason: "load_failed"});
        expect(screen.getByTestId("plugin-status-test-plugin").textContent).toBe(
            "[i18n:load-failed]",
        );
        u3();

        // wrong_application -> v0.7.0 identity gating.
        const {unmount: u4} = renderCard({filterReason: "wrong_application"});
        expect(screen.getByTestId("plugin-status-test-plugin").textContent).toBe(
            "[i18n:wrong-app]",
        );
        u4();

        // pre_activate_rejected -> Bibliogon's license_check_failed slot.
        const {unmount: u5} = renderCard({filterReason: "pre_activate_rejected"});
        expect(screen.getByTestId("plugin-status-test-plugin").textContent).toBe(
            "[i18n:license-failed]",
        );
        u5();
    });

    it("renders loadErrorMessage detail line when set, omits when null", () => {
        const {unmount: u1} = renderCard({
            filterReason: "load_failed",
            loadErrorMessage: "ImportError: bs4 module not installed",
        });
        expect(
            screen.getByTestId("plugin-status-detail-test-plugin").textContent,
        ).toContain("bs4 module not installed");
        u1();

        const {unmount: u2} = renderCard({
            filterReason: "load_failed",
            loadErrorMessage: null,
        });
        expect(screen.queryByTestId("plugin-status-detail-test-plugin")).toBeNull();
        u2();
    });
});

describe("PluginCard V090 lifecycle line", () => {
    it("renders the lifecycle line with activated_at + source for entry-point plugins", () => {
        const {unmount} = renderCard({
            activatedAt: "2026-05-21T09:30:00Z",
            source: "entry_point",
        });
        const line = screen.getByTestId("plugin-lifecycle-test-plugin");
        expect(line.textContent).toContain("[i18n:active-since]");
        // entry_point is the common case -> no "via ZIP" badge.
        expect(line.textContent).not.toContain("[i18n:via-zip]");
        unmount();
    });

    it("renders 'via ZIP' for direct_register source", () => {
        const {unmount} = renderCard({
            activatedAt: "2026-05-21T09:30:00Z",
            source: "direct_register",
        });
        const line = screen.getByTestId("plugin-lifecycle-test-plugin");
        expect(line.textContent).toContain("[i18n:via-zip]");
        unmount();
    });

    it("renders lastConfigChange when set, omits when null", () => {
        const {unmount: u1} = renderCard({
            activatedAt: "2026-05-21T09:30:00Z",
            lastConfigChange: "2026-05-21T09:45:00Z",
            source: "entry_point",
        });
        const line = screen.getByTestId("plugin-lifecycle-test-plugin");
        expect(line.textContent).toContain("[i18n:settings-applied]");
        u1();

        const {unmount: u2} = renderCard({
            activatedAt: "2026-05-21T09:30:00Z",
            lastConfigChange: null,
            source: "entry_point",
        });
        expect(
            screen.getByTestId("plugin-lifecycle-test-plugin").textContent,
        ).not.toContain("[i18n:settings-applied]");
        u2();
    });

    it("omits the lifecycle line when all v0.9.0 fields are null", () => {
        renderCard({activatedAt: null, lastConfigChange: null, source: null});
        expect(screen.queryByTestId("plugin-lifecycle-test-plugin")).toBeNull();
    });
});
