/**
 * Vitest coverage for AutorenSettings
 * (SETT-AUTHORS-TAB-CONSOLIDATION-01).
 *
 * The wrapper is intentionally thin — it just composes
 * AuthorSettings + AuthorsDatabase. AuthorSettings has its own
 * regression-pin (AuthorSettings.test.tsx) and AuthorsDatabase
 * has its own (AuthorsDatabase.test.tsx). This file pins only
 * the composition contract: both child surfaces mount, share the
 * same parent ``autoren-settings`` testid, and the existing inner
 * testids (``author-settings`` + ``authors-database-section``)
 * are preserved verbatim.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import {AutorenSettings} from "./AutorenSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

vi.mock("../AppDialog", () => ({
    useDialog: () => ({confirm: vi.fn(), prompt: vi.fn()}),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: {success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()},
}));

const mockAuthorsList = vi.fn();
vi.mock("../../api/client", () => ({
    api: {
        authors: {
            list: (...args: unknown[]) => mockAuthorsList(...args),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

describe("AutorenSettings — consolidated author tab", () => {
    beforeEach(() => {
        mockAuthorsList.mockReset();
        mockAuthorsList.mockResolvedValue([]);
    });

    it("mounts both AuthorSettings + AuthorsDatabase inside one wrapper", async () => {
        render(
            <AutorenSettings
                config={{author: {name: "Asterios", pen_names: []}}}
                onSave={vi.fn()}
                saving={false}
            />,
        );
        // Outer wrapper testid (new).
        expect(screen.getByTestId("autoren-settings")).toBeInTheDocument();
        // Inner section testids (preserved verbatim from the two
        // child components — see SETT-AUTHORS-TAB-CONSOLIDATION-01
        // archive entry).
        expect(screen.getByTestId("author-settings")).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId("authors-database-section")).toBeInTheDocument();
        });
    });

    /**
     * Task 3.7 (UX clarification — Path C): the wrapper renders an
     * intro paragraph at the top and a visible divider between the
     * two child sections so the user perceives the boundary as
     * deliberate, not accidental.
     */
    it("renders the intro paragraph at the top of the tab", () => {
        render(
            <AutorenSettings
                config={{author: {name: "Asterios", pen_names: []}}}
                onSave={vi.fn()}
                saving={false}
            />,
        );
        expect(screen.getByTestId("autoren-settings-intro")).toBeInTheDocument();
    });

    it("renders a divider between AuthorSettings and AuthorsDatabase", () => {
        render(
            <AutorenSettings
                config={{author: {name: "Asterios", pen_names: []}}}
                onSave={vi.fn()}
                saving={false}
            />,
        );
        expect(screen.getByTestId("autoren-settings-divider")).toBeInTheDocument();
    });
});
