/**
 * Vitest coverage for the AboutSettings component.
 *
 * Pins the Settings > About tab's section contracts. Issue #87
 * reorganises the panel into five offline-capable sections:
 * Version, System, Contributors, Support, License & Resources.
 * The Contributors + License & Resources sections are static
 * client-side data, so they render identically online (api mode)
 * and offline (dexie mode). The System section's storage label
 * switches on the storage mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AboutSettings, parseUserAgent } from "./AboutSettings";

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
// systemInfo null, build provenance + plugin list + the client-side
// sections still shown — is pinned at the unit layer.
// discoveredPlugins is a shared mock so both online and offline tests
// configure the same plugin payload.
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
        it("renders the build version from the build-time literal", async () => {
            render(<AboutSettings appConfig={{}} />);
            const version = await screen.findByTestId("about-app-version");
            // Sourced from the Vite __APP_VERSION__ literal (the running
            // build), not the backend systemInfo.version, so it is correct
            // offline and identifies the bundle against a stale SW.
            expect(version.textContent).toBe(`v${__APP_VERSION__}`);
        });

        it("renders build hash + branch + build date from build-time literals", async () => {
            render(<AboutSettings appConfig={{}} />);
            const hash = await screen.findByTestId("about-build-hash");
            const branch = await screen.findByTestId("about-build-branch");
            const date = await screen.findByTestId("about-build-date");
            expect(hash.textContent).toBe(__BUILD_HASH__);
            expect(branch.textContent).toBe(__BUILD_BRANCH__);
            expect(date.textContent).toBeTruthy();
        });

        it("does NOT render the license inside the version section (moved to Resources)", async () => {
            render(<AboutSettings appConfig={{}} />);
            const section = await screen.findByTestId("about-version-section");
            expect(section.textContent).not.toMatch(/MIT/);
        });
    });

    describe("parseUserAgent", () => {
        it("parses a Chrome-on-Windows UA", () => {
            const ua =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
            expect(parseUserAgent(ua)).toBe("Windows · Chrome 124.0");
        });

        it("parses a Firefox-on-Linux UA", () => {
            const ua =
                "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";
            expect(parseUserAgent(ua)).toBe("Linux · Firefox 125.0");
        });

        it("parses a Safari-on-macOS UA", () => {
            const ua =
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
                "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";
            expect(parseUserAgent(ua)).toBe("macOS · Safari 17.4");
        });

        it("parses an Edge-on-Windows UA (Edg token before Chrome)", () => {
            const ua =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
            expect(parseUserAgent(ua)).toBe("Windows · Edge 124.0");
        });

        it("falls back to the raw UA when unparseable", () => {
            expect(parseUserAgent("totally-unknown-agent")).toBe(
                "totally-unknown-agent",
            );
        });
    });

    describe("System section (client-side)", () => {
        it("renders the SQLite storage label + platform in api mode", async () => {
            render(<AboutSettings appConfig={{}} />);
            const storage = await screen.findByTestId("about-storage");
            // api-mode storage label fallback returned verbatim by the mock t().
            expect(storage.textContent).toBe("SQLite (Desktop)");
            const platform = screen.getByTestId("about-platform-client");
            expect(platform).toBeTruthy();
        });

        it("renders the IndexedDB storage label in dexie mode", async () => {
            storageMock.mode.current = "dexie";
            render(<AboutSettings appConfig={{}} />);
            const storage = await screen.findByTestId("about-storage");
            expect(storage.textContent).toBe("Lokaler Browser-Speicher (IndexedDB)");
            const dataDir = screen.getByTestId("about-data-dir");
            expect(dataDir.textContent).toBe("Browser-Speicher (IndexedDB)");
        });

        it("renders Python + the 4 backend dependency rows in api mode", async () => {
            render(<AboutSettings appConfig={{}} />);
            const py = await screen.findByTestId("about-python-version");
            expect(py.textContent).toBe("3.12.3");
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

    describe("Contributors section", () => {
        it("renders author + built-with + ai-assistance in api mode", async () => {
            render(<AboutSettings appConfig={{}} />);
            const author = await screen.findByTestId("about-author");
            expect(author.getAttribute("href")).toBe("https://github.com/astrapi69");
            expect(author.getAttribute("target")).toBe("_blank");
            expect(author.getAttribute("rel")).toContain("noopener");
            expect(author.textContent).toContain("Asterios Raptis");

            const builtWith = screen.getByTestId("about-built-with");
            expect(builtWith.textContent).toContain("React");
            expect(builtWith.textContent).toContain("Dexie");
            expect(builtWith.textContent).toContain("Playwright");

            const ai = screen.getByTestId("about-ai-assistance");
            expect(ai.textContent).toContain("Claude (Anthropic)");
        });

        it("renders author + built-with + ai-assistance offline (dexie mode)", async () => {
            storageMock.mode.current = "dexie";
            render(<AboutSettings appConfig={{}} />);
            expect(await screen.findByTestId("about-author")).toBeTruthy();
            expect(screen.getByTestId("about-built-with")).toBeTruthy();
            expect(screen.getByTestId("about-ai-assistance")).toBeTruthy();
        });
    });

    describe("License & Resources section", () => {
        it("renders license + repository + docs + issues links with target=_blank", async () => {
            render(<AboutSettings appConfig={{}} />);
            const license = await screen.findByTestId("about-license");
            const repo = screen.getByTestId("about-repository-link");
            const docs = screen.getByTestId("about-docs-link");
            const issues = screen.getByTestId("about-issues-link");

            expect(license.getAttribute("href")).toBe(
                "https://github.com/astrapi69/bibliogon/blob/main/LICENSE",
            );
            expect(license.getAttribute("target")).toBe("_blank");
            expect(license.getAttribute("rel")).toContain("noopener");
            expect(license.textContent).toContain("MIT");

            expect(repo.getAttribute("href")).toBe("https://github.com/astrapi69/bibliogon");
            expect(repo.getAttribute("target")).toBe("_blank");

            expect(docs.getAttribute("href")).toBe(
                "https://astrapi69.github.io/bibliogon/docs/",
            );
            expect(docs.getAttribute("target")).toBe("_blank");

            expect(issues.getAttribute("href")).toBe(
                "https://github.com/astrapi69/bibliogon/issues",
            );
            expect(issues.getAttribute("target")).toBe("_blank");
        });

        it("renders the Resources section offline (dexie mode)", async () => {
            storageMock.mode.current = "dexie";
            render(<AboutSettings appConfig={{}} />);
            expect(await screen.findByTestId("about-license")).toBeTruthy();
            expect(screen.getByTestId("about-docs-link")).toBeTruthy();
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

        it("does not render the plugins section when no plugins are active", async () => {
            storageMock.discoveredPlugins.mockImplementation(async () => []);
            render(<AboutSettings appConfig={{}} />);
            // Wait for the always-present version section so the async load
            // has settled, then assert the empty plugins section is absent.
            await screen.findByTestId("about-version-section");
            expect(screen.queryByTestId("about-plugins-section")).toBeNull();
        });

        it("does NOT render the browser hint in api mode", async () => {
            render(<AboutSettings appConfig={{}} />);
            await screen.findByTestId("about-plugins-section");
            // The hint clarifies the curated PWA seed list (#97); in api
            // mode the list shows the actually-installed plugins, so no
            // hint is rendered.
            expect(screen.queryByTestId("about-plugins-browser-hint")).toBeNull();
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
        it("renders build provenance + plugins + client-side sections without the backend", async () => {
            storageMock.mode.current = "dexie";
            render(<AboutSettings appConfig={{}} />);

            // Build provenance comes from build-time literals -> still shown.
            const version = await screen.findByTestId("about-app-version");
            expect(version.textContent).toBe(`v${__APP_VERSION__}`);
            expect(screen.getByTestId("about-build-hash").textContent).toBe(__BUILD_HASH__);

            // The plugin list reads the seeded Dexie registry -> still shown,
            // with the browser-availability hint (#97) clarifying that the
            // curated seed plugins run client-side in the PWA.
            expect(screen.getByTestId("about-plugins-section")).toBeTruthy();
            expect(screen.getByTestId("about-plugin-row-comics")).toBeTruthy();
            expect(
                screen.getByTestId("about-plugins-browser-hint").textContent,
            ).toBe("Diese Plugins sind direkt in diesem Browser verfügbar.");

            // Client-side sections render offline.
            expect(screen.getByTestId("about-system-section")).toBeTruthy();
            expect(screen.getByTestId("about-contributors-section")).toBeTruthy();
            expect(screen.getByTestId("about-resources-section")).toBeTruthy();

            // No backend: /api/system/info is never called, the backend
            // dependency rows are omitted, and nothing errors.
            expect(api.system.info).not.toHaveBeenCalled();
            expect(screen.queryByTestId("about-python-version")).toBeNull();
            expect(screen.queryByTestId("about-dep-fastapi")).toBeNull();
            expect(screen.queryByTestId("about-settings-error")).toBeNull();
        });
    });

    describe("proactive error report (EVT-03)", () => {
        it("renders the create-report button in the Resources section", async () => {
            render(<AboutSettings appConfig={{}} />);
            const btn = await screen.findByTestId("about-create-report");
            expect(btn.textContent).toContain("Fehlerbericht erstellen");
        });

        it("opens the ErrorReportDialog in manual mode on click", async () => {
            render(<AboutSettings appConfig={{}} />);
            const btn = await screen.findByTestId("about-create-report");
            // Dialog is closed initially -> its footer button is absent.
            expect(screen.queryByTestId("error-report-download-json")).toBeNull();
            fireEvent.click(btn);
            // Manual-mode dialog mounts: the JSON-download action appears
            // and the manual intro (no preceding-error wording) is shown.
            expect(
                await screen.findByTestId("error-report-download-json"),
            ).toBeTruthy();
            expect(
                screen.getByText(/Erstelle einen Bericht mit deinen letzten Aktionen/),
            ).toBeTruthy();
        });
    });
});
