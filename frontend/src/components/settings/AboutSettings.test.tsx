/**
 * Vitest coverage for the AboutSettings component.
 *
 * Pins the Settings > About tab's section contracts (Version,
 * Credits, System-Info). Plugin-List + Donation-Channels arrive
 * in C4 — tests for those land in the same commit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AboutSettings } from "./AboutSettings";

vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: "active",
        isActive: true,
        isDisabled: false,
        isHidden: false,
        reason: undefined,
    }),
}));

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
    return {
        ...actual,
        api: {
            ...actual.api,
            system: {
                info: vi.fn(),
            },
            settings: {
                ...actual.api.settings,
                discoveredPlugins: vi.fn(),
            },
        },
    };
});

// Storage seam mock: a mutable mode lets a test flip to "dexie" (the
// backendless GitHub-Pages build) so the offline About-render path —
// systemInfo null, build provenance + plugin list still shown — is
// pinned at the unit layer. discoveredPlugins is a shared mock so both
// online and offline tests configure the same plugin payload.
const storageMock = vi.hoisted(() => ({
    mode: { current: "api" as "api" | "dexie" },
    discoveredPlugins: vi.fn(),
}));

vi.mock("../../storage", async () => {
    const actual = await vi.importActual<typeof import("../../storage")>("../../storage");
    return {
        ...actual,
        getStorage: () =>
            ({
                mode: storageMock.mode.current,
                settings: { discoveredPlugins: storageMock.discoveredPlugins },
            }) as unknown as ReturnType<typeof actual.getStorage>,
    };
});

import { api, type DiscoveredPlugin } from "../../api/client";

const FIXTURE = {
    app: {
        name: "Bibliogon",
        version: "0.35.1",
        license: "MIT",
        authors: ["Asterios Raptis"],
        repository_url: "https://github.com/astrapi69/bibliogon",
        issues_url: "https://github.com/astrapi69/bibliogon/issues",
    },
    runtime: {
        python_version: "3.12.3",
        platform_system: "Linux",
        platform_release: "6.8.0-117",
        platform_machine: "x86_64",
    },
    dependencies: {
        fastapi: "0.136.1",
        sqlalchemy: "2.0.49",
        pydantic: "2.13.4",
        pluginforge: "0.5.0",
    },
};

const PLUGINS_FIXTURE: DiscoveredPlugin[] = [
    {
        name: "comics",
        has_config: true,
        enabled: true,
        loaded: true,
        license_tier: "core",
        has_license: true,
        display_name: { de: "Comic", en: "Comics" },
        description: { de: "Comic-Authoring", en: "Comic authoring" },
        version: "1.0.0",
        filter_reason: null,
        load_error_message: null,
        activated_at: null,
        last_config_change: null,
        source: null,
    },
    {
        name: "kdp",
        has_config: true,
        enabled: true,
        loaded: true,
        license_tier: "core",
        has_license: true,
        display_name: { en: "Amazon KDP" },
        description: { en: "KDP metadata + cover validation" },
        version: "1.0.0",
        filter_reason: null,
        load_error_message: null,
        activated_at: null,
        last_config_change: null,
        source: null,
    },
    {
        name: "comments",
        has_config: true,
        enabled: false,
        loaded: false,
        license_tier: "core",
        has_license: true,
        display_name: { en: "Comments" },
        description: {},
        version: "1.0.0",
        filter_reason: null,
        load_error_message: null,
        activated_at: null,
        last_config_change: null,
        source: null,
    },
];

describe("AboutSettings", () => {
    beforeEach(() => {
        storageMock.mode.current = "api";
        vi.mocked(api.system.info).mockImplementation(async () => FIXTURE);
        storageMock.discoveredPlugins.mockImplementation(async () => PLUGINS_FIXTURE);
    });

    afterEach(() => {
        vi.mocked(api.system.info).mockClear();
        storageMock.discoveredPlugins.mockClear();
    });

    it("renders loading state initially", () => {
        // Block the resolve so the loading state stays visible.
        vi.mocked(api.system.info).mockImplementation(() => new Promise(() => {}));
        render(<AboutSettings appConfig={{}} />);
        expect(screen.getByTestId("about-settings-loading")).toBeTruthy();
    });

    it("renders content after /api/system/info resolves", async () => {
        render(<AboutSettings appConfig={{}} />);
        await waitFor(() => expect(screen.getByTestId("about-settings-content")).toBeTruthy());
        expect(api.system.info).toHaveBeenCalledOnce();
    });

    describe("Version section", () => {
        it("renders the build version from the build-time literal + license", async () => {
            render(<AboutSettings appConfig={{}} />);
            const version = await screen.findByTestId("about-app-version");
            // Sourced from the Vite __APP_VERSION__ literal (the running
            // build), not the backend systemInfo.version, so it is correct
            // offline and identifies the bundle against a stale SW.
            expect(version.textContent).toBe(`v${__APP_VERSION__}`);
            const section = screen.getByTestId("about-version-section");
            expect(section.textContent).toMatch(/MIT/);
        });

        it("renders build hash + build date from build-time literals", async () => {
            render(<AboutSettings appConfig={{}} />);
            const hash = await screen.findByTestId("about-build-hash");
            const date = await screen.findByTestId("about-build-date");
            expect(hash.textContent).toBe(__BUILD_HASH__);
            expect(date.textContent).toBeTruthy();
        });
    });

    describe("Credits section", () => {
        it("renders authors list", async () => {
            render(<AboutSettings appConfig={{}} />);
            const authors = await screen.findByTestId("about-authors");
            expect(authors.textContent).toBe("Asterios Raptis");
        });

        it("renders repository + issues links with target=_blank", async () => {
            render(<AboutSettings appConfig={{}} />);
            const repo = await screen.findByTestId("about-repository-link");
            const issues = await screen.findByTestId("about-issues-link");
            expect(repo.getAttribute("href")).toBe("https://github.com/astrapi69/bibliogon");
            expect(repo.getAttribute("target")).toBe("_blank");
            expect(repo.getAttribute("rel")).toContain("noopener");
            expect(issues.getAttribute("href")).toBe(
                "https://github.com/astrapi69/bibliogon/issues",
            );
        });

        it("falls back to 'Unknown' when authors list is empty", async () => {
            vi.mocked(api.system.info).mockImplementation(async () => ({
                ...FIXTURE,
                app: { ...FIXTURE.app, authors: [] },
            }));
            render(<AboutSettings appConfig={{}} />);
            const authors = await screen.findByTestId("about-authors");
            // Fallback uses i18n "Unbekannt" which the test mock
            // returns verbatim via the t(key, fallback) shim.
            expect(authors.textContent).toBe("Unbekannt");
        });
    });

    describe("System-Info section", () => {
        it("renders Python + platform + 4 dependencies", async () => {
            render(<AboutSettings appConfig={{}} />);
            const py = await screen.findByTestId("about-python-version");
            expect(py.textContent).toBe("3.12.3");
            const platform = await screen.findByTestId("about-platform");
            expect(platform.textContent).toMatch(/Linux/);
            expect(platform.textContent).toMatch(/x86_64/);
            expect(screen.getByTestId("about-dep-fastapi").textContent).toBe("0.136.1");
            expect(screen.getByTestId("about-dep-sqlalchemy").textContent).toBe("2.0.49");
            expect(screen.getByTestId("about-dep-pydantic").textContent).toBe("2.13.4");
            expect(screen.getByTestId("about-dep-pluginforge").textContent).toBe("0.5.0");
        });

        it("renders 'Unknown' for null dependency versions", async () => {
            vi.mocked(api.system.info).mockImplementation(async () => ({
                ...FIXTURE,
                dependencies: {
                    ...FIXTURE.dependencies,
                    pluginforge: null,
                },
            }));
            render(<AboutSettings appConfig={{}} />);
            const dep = await screen.findByTestId("about-dep-pluginforge");
            // Fallback uses i18n "Unbekannt"; test mock returns
            // the fallback string verbatim.
            expect(dep.textContent).toBe("Unbekannt");
        });
    });

    describe("Plugin-List section", () => {
        it("renders only enabled+loaded plugins, sorted by slug", async () => {
            render(<AboutSettings appConfig={{}} />);
            await screen.findByTestId("about-plugins-section");
            // comics + kdp are enabled+loaded; comments is filtered out.
            expect(screen.getByTestId("about-plugin-row-comics")).toBeTruthy();
            expect(screen.getByTestId("about-plugin-row-kdp")).toBeTruthy();
            expect(screen.queryByTestId("about-plugin-row-comments")).toBeNull();
        });

        it("renders localized display_name + version", async () => {
            render(<AboutSettings appConfig={{}} />);
            const comicsRow = await screen.findByTestId("about-plugin-row-comics");
            // useI18n mock uses lang='en'; getLocalized resolves
            // english key from the dict.
            expect(comicsRow.textContent).toContain("Comics");
            expect(comicsRow.textContent).toContain("v1.0.0");
        });

        it("falls back to slug when display_name dict is empty", async () => {
            storageMock.discoveredPlugins.mockImplementation(async () => [
                {
                    ...PLUGINS_FIXTURE[0],
                    name: "noname",
                    display_name: {},
                },
            ]);
            render(<AboutSettings appConfig={{}} />);
            const row = await screen.findByTestId("about-plugin-row-noname");
            expect(row.textContent).toContain("noname");
        });

        it("renders empty-state when no plugins active", async () => {
            storageMock.discoveredPlugins.mockImplementation(async () => []);
            render(<AboutSettings appConfig={{}} />);
            const empty = await screen.findByTestId("about-plugins-empty");
            expect(empty.textContent).toBe("Keine Plugins aktiv.");
        });
    });

    describe("Donations section", () => {
        const DONATIONS_CONFIG = {
            donations: {
                enabled: true,
                landing_page_url: null,
                channels: [
                    {
                        name: "Liberapay",
                        url: "https://liberapay.com/astrapi69/donate",
                        recommended: true,
                    },
                ],
            },
        };

        it("renders donations wrapper when donations.enabled === true", async () => {
            render(<AboutSettings appConfig={DONATIONS_CONFIG} />);
            await screen.findByTestId("about-plugins-section");
            expect(screen.getByTestId("about-donations-section")).toBeTruthy();
        });

        it("does NOT render donations wrapper when donations.enabled is false", async () => {
            render(<AboutSettings appConfig={{ donations: { enabled: false, channels: [] } }} />);
            await screen.findByTestId("about-plugins-section");
            expect(screen.queryByTestId("about-donations-section")).toBeNull();
        });
    });

    describe("Error path", () => {
        it("renders error message when /api/system/info fails", async () => {
            const { ApiError } = await import("../../api/client");
            vi.mocked(api.system.info).mockImplementation(async () => {
                throw new ApiError(500, "boom", "/system/info", "GET");
            });
            render(<AboutSettings appConfig={{}} />);
            const err = await screen.findByTestId("about-settings-error");
            await waitFor(() => {
                expect(err.textContent).toMatch(/boom/);
            });
            // Defensive: also assert that fireEvent is importable
            // (catches accidental tree-shake regressions).
            expect(typeof fireEvent.click).toBe("function");
        });
    });

    describe("Offline (dexie) mode", () => {
        it("renders build provenance + plugins without the backend, hiding backend-only sections", async () => {
            storageMock.mode.current = "dexie";
            render(<AboutSettings appConfig={{}} />);

            // Build provenance comes from build-time literals -> still shown.
            const version = await screen.findByTestId("about-app-version");
            expect(version.textContent).toBe(`v${__APP_VERSION__}`);
            expect(screen.getByTestId("about-build-hash").textContent).toBe(__BUILD_HASH__);

            // The plugin list reads the seeded Dexie registry -> still shown.
            expect(screen.getByTestId("about-plugins-section")).toBeTruthy();
            expect(screen.getByTestId("about-plugin-row-comics")).toBeTruthy();

            // No backend: /api/system/info is never called, and the
            // systemInfo-dependent sections are omitted (not errored).
            expect(api.system.info).not.toHaveBeenCalled();
            expect(screen.queryByTestId("about-credits-section")).toBeNull();
            expect(screen.queryByTestId("about-system-section")).toBeNull();
            expect(screen.queryByTestId("about-settings-error")).toBeNull();
        });
    });
});
