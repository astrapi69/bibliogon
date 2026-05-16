/**
 * Tests for Bug 1 fix (commit `fix(navigation): Settings/Help/GetStarted
 * back-button uses browser history`).
 *
 * Three 'global' pages (Settings, Help, GetStarted) had hardcoded
 * `navigate("/")` back-buttons that always landed on the Books-
 * Dashboard regardless of origin. The fix replaces the hardcoded call
 * with a `handleBack` helper:
 *
 *   const handleBack = () => {
 *       if (location.key === "default") {
 *           navigate("/");
 *       } else {
 *           navigate(-1);
 *       }
 *   };
 *
 * These tests pin the behaviour by mocking react-router-dom's
 * `useNavigate` and `useLocation` so we can:
 *
 *   - Force `location.key === "default"` (direct-URL entry, no history)
 *     and assert navigate("/") fires.
 *   - Force `location.key === "<some-random-key>"` (user navigated to
 *     this page from elsewhere in the app) and assert navigate(-1) fires.
 *
 * Each page has a dedicated test that renders the real page component
 * with mocks for its heavy children + clicks the page-specific
 * data-testid back-button so a regression in wiring (e.g. someone
 * reverting the onClick) fires here.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// react-router hooks are mocked PAGE-WIDE: the test owns the
// returned `navigate` and `location` so we can assert + simulate.
const navigateMock = vi.fn();
let currentLocationKey = "default";

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    );
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useLocation: () => ({ key: currentLocationKey, pathname: "/", search: "", hash: "", state: null }),
        useSearchParams: () => [
            new URLSearchParams(),
            vi.fn(),
        ],
    };
});

// Heavy children stubs (Settings, Help, GetStarted all pull large
// component trees - we are only exercising the back-button so the
// real ones don't need to run).
vi.mock("../components/ThemeToggle", () => ({
    default: () => <div data-testid="theme-toggle-stub" />,
}));
vi.mock("../components/SupportSection", () => ({
    default: () => <div data-testid="support-stub" />,
    getDonationsConfig: () => ({
        enabled: false,
        levels: { discovery: false, support: false, advocacy: false },
    }),
}));
vi.mock("../components/CommentsAdminSection", () => ({
    default: () => <div data-testid="comments-stub" />,
}));
vi.mock("../components/settings/AppSettings", () => ({
    AppSettings: () => <div data-testid="app-settings-stub" />,
}));
vi.mock("../components/settings/AiAssistantSettings", () => ({
    AiAssistantSettings: () => <div data-testid="ai-stub" />,
}));
vi.mock("../components/settings/AuthorSettings", () => ({
    AuthorSettings: () => <div data-testid="author-stub" />,
}));
vi.mock("../components/settings/TopicsSettings", () => ({
    TopicsSettings: () => <div data-testid="topics-stub" />,
}));
vi.mock("../components/settings/PluginSettings", () => ({
    PluginSettings: () => <div data-testid="plugin-stub" />,
}));

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("../api/client", () => ({
    api: {
        config: {
            getApp: vi.fn(async () => ({})),
            updateApp: vi.fn(async () => ({})),
            listPlugins: vi.fn(async () => []),
            getPlugin: vi.fn(async () => ({ settings: {} })),
            updatePlugin: vi.fn(async () => ({})),
        },
        help: {
            shortcuts: vi.fn(async () => []),
            faq: vi.fn(async () => []),
            about: vi.fn(async () => ({})),
        },
        getStarted: {
            guide: vi.fn(async () => []),
            sampleBook: vi.fn(async () => ({})),
        },
        books: {
            create: vi.fn(async () => ({ id: "test" })),
        },
        chapters: {
            create: vi.fn(async () => undefined),
        },
        plugins: {
            list: vi.fn(async () => []),
            discoveredPlugins: vi.fn(async () => []),
            install: vi.fn(),
            uninstall: vi.fn(),
        },
    },
    APP_VERSION: "test",
}));

import Settings from "./Settings";
import Help from "./Help";
import GetStarted from "./GetStarted";

beforeEach(() => {
    navigateMock.mockClear();
    currentLocationKey = "default";
});

describe("Bug 1: Settings back-button origin tracking", () => {
    it("navigates to '/' when location.key === 'default' (direct URL entry)", () => {
        currentLocationKey = "default";
        render(<Settings />);
        fireEvent.click(screen.getByTestId("settings-nav-back"));
        expect(navigateMock).toHaveBeenCalledTimes(1);
        expect(navigateMock).toHaveBeenCalledWith("/");
    });

    it("navigates(-1) when location.key is a real history entry", () => {
        currentLocationKey = "abc123";
        render(<Settings />);
        fireEvent.click(screen.getByTestId("settings-nav-back"));
        expect(navigateMock).toHaveBeenCalledTimes(1);
        expect(navigateMock).toHaveBeenCalledWith(-1);
    });
});

describe("Bug 1: Help back-button origin tracking", () => {
    it("navigates to '/' when location.key === 'default'", () => {
        currentLocationKey = "default";
        render(<Help />);
        fireEvent.click(screen.getByTestId("help-nav-back"));
        expect(navigateMock).toHaveBeenCalledWith("/");
    });

    it("navigates(-1) when location.key is a real history entry", () => {
        currentLocationKey = "abc123";
        render(<Help />);
        fireEvent.click(screen.getByTestId("help-nav-back"));
        expect(navigateMock).toHaveBeenCalledWith(-1);
    });
});

describe("Bug 1: GetStarted back-button origin tracking", () => {
    it("navigates to '/' when location.key === 'default'", () => {
        currentLocationKey = "default";
        render(<GetStarted />);
        fireEvent.click(screen.getByTestId("getstarted-nav-back"));
        expect(navigateMock).toHaveBeenCalledWith("/");
    });

    it("navigates(-1) when location.key is a real history entry", () => {
        currentLocationKey = "abc123";
        render(<GetStarted />);
        fireEvent.click(screen.getByTestId("getstarted-nav-back"));
        expect(navigateMock).toHaveBeenCalledWith(-1);
    });
});
