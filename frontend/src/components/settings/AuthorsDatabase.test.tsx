/**
 * Bug 8 Phase 1, Commit 5: tests for the Authors-Database
 * Settings tab.
 *
 * Covers:
 * - Root + search input + add toggle render
 * - Initial fetch on mount
 * - Empty state (no authors, with-search empty state)
 * - Loading state
 * - Add form toggle, save POST + refetch
 * - Edit toggle replaces row with form; save PATCHes and updates
 *   the local row
 * - Delete confirm + DELETE + optimistic row removal
 * - Delete cancel leaves the row alone
 * - Error toasts on load / create / delete failures
 *
 * Mocking pattern follows the React 18 dev-mode lesson: use
 * ``mockImplementation`` (not ``mockImplementationOnce``) +
 * ``mockClear`` per test (not ``mockReset``) so the factory
 * default survives across the double-effect mount.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, fireEvent} from "@testing-library/react";

import {AuthorsDatabase} from "./AuthorsDatabase";
import type {Author} from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const listMock = vi.fn<
    (params?: {search?: string; limit?: number}) => Promise<Author[]>
>(async () => []);
const createMock = vi.fn<(...args: unknown[]) => Promise<Author>>(
    async (...args) => {
        const [data] = args as [{name: string; bio?: string | null}];
        return {
            id: "new-id",
            name: data.name,
            slug: data.name.toLowerCase().replace(/\s+/g, "-"),
            bio: data.bio ?? null,
            is_profile_author: false,
            created_at: "2026-05-16T00:00:00Z",
            updated_at: "2026-05-16T00:00:00Z",
        };
    },
);
const updateMock = vi.fn<(id: string, data: unknown) => Promise<Author>>(
    async (id, data) => {
        const payload = data as {name?: string; bio?: string | null};
        return {
            id,
            name: payload.name ?? "Unchanged",
            slug: "slug-" + id,
            bio: payload.bio ?? null,
            is_profile_author: false,
            created_at: "2026-05-16T00:00:00Z",
            updated_at: "2026-05-16T00:00:00Z",
        };
    },
);
const deleteMock = vi.fn<(id: string) => Promise<void>>(async () => {});

const notifySuccess = vi.fn();
const notifyError = vi.fn();
const confirmMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(
    async () => true,
);

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    );
    return {
        ...actual,
        api: {
            authors: {
                list: (params?: {search?: string; limit?: number}) => listMock(params),
                create: (data: unknown) => createMock(data),
                update: (id: string, data: unknown) => updateMock(id, data),
                delete: (id: string) => deleteMock(id),
            },
        },
    };
});

vi.mock("../AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => confirmMock(...args),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => notifySuccess(...args),
        error: (...args: unknown[]) => notifyError(...args),
        info: vi.fn(),
        bulkAction: vi.fn(),
    },
}));

function makeAuthor(overrides: Partial<Author> = {}): Author {
    return {
        id: "a1",
        name: "Asterios Raptis",
        slug: "asterios-raptis",
        bio: "writer + maker",
        is_profile_author: false,
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    listMock.mockClear();
    listMock.mockImplementation(async () => []);
    createMock.mockClear();
    updateMock.mockClear();
    deleteMock.mockClear();
    deleteMock.mockImplementation(async () => {});
    notifySuccess.mockClear();
    notifyError.mockClear();
    confirmMock.mockClear();
    confirmMock.mockImplementation(async () => true);
});

describe("AuthorsDatabase", () => {
    it("renders the root testid + search input + add toggle", async () => {
        render(<AuthorsDatabase/>);
        expect(screen.getByTestId("authors-database-section")).toBeTruthy();
        expect(screen.getByTestId("authors-database-search")).toBeTruthy();
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
    });

    it("fetches authors on mount", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() => expect(listMock).toHaveBeenCalled());
    });

    it("renders the empty-state when no authors exist", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-empty")).toBeTruthy(),
        );
    });

    it("renders fetched authors as rows", async () => {
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Asterios Raptis"}),
            makeAuthor({id: "a2", name: "Bruce Dickinson", slug: "bruce-dickinson"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        expect(screen.getByTestId("authors-database-row-a2")).toBeTruthy();
    });

    it("shows the Profile badge only on is_profile_author rows", async () => {
        listMock.mockImplementation(async () => [
            makeAuthor({id: "p1", name: "My Pen", is_profile_author: true}),
            makeAuthor({id: "c1", name: "Stephen King", slug: "stephen-king"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-p1")).toBeTruthy(),
        );
        expect(
            screen.getByTestId("authors-database-profile-badge-p1"),
        ).toBeTruthy();
        expect(
            screen.queryByTestId("authors-database-profile-badge-c1"),
        ).toBeNull();
    });

    it("reveals the add form when the add toggle is clicked", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        expect(screen.getByTestId("authors-database-add-form")).toBeTruthy();
        expect(screen.getByTestId("authors-database-add-name")).toBeTruthy();
        expect(screen.getByTestId("authors-database-add-bio")).toBeTruthy();
    });

    it("posts to api.authors.create on save and refetches", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        const nameInput = screen.getByTestId(
            "authors-database-add-name",
        ) as HTMLInputElement;
        const bioInput = screen.getByTestId(
            "authors-database-add-bio",
        ) as HTMLTextAreaElement;
        fireEvent.change(nameInput, {target: {value: "Jane Author"}});
        fireEvent.change(bioInput, {target: {value: "fiction writer"}});
        fireEvent.click(screen.getByTestId("authors-database-add-save"));
        await waitFor(() =>
            expect(createMock).toHaveBeenCalledWith({
                name: "Jane Author",
                bio: "fiction writer",
            }),
        );
        expect(notifySuccess).toHaveBeenCalled();
        // Initial fetch on mount + refetch after create.
        await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(1));
    });

    it("sends bio as null when the textarea is left blank", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        fireEvent.change(screen.getByTestId("authors-database-add-name"), {
            target: {value: "Solo"},
        });
        fireEvent.click(screen.getByTestId("authors-database-add-save"));
        await waitFor(() =>
            expect(createMock).toHaveBeenCalledWith({name: "Solo", bio: null}),
        );
    });

    it("disables the save button when the name is empty", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        const save = screen.getByTestId("authors-database-add-save") as HTMLButtonElement;
        expect(save.disabled).toBe(true);
    });

    it("hides the form and resets fields on cancel", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        fireEvent.change(screen.getByTestId("authors-database-add-name"), {
            target: {value: "Half-typed"},
        });
        fireEvent.click(screen.getByTestId("authors-database-add-cancel"));
        expect(screen.queryByTestId("authors-database-add-form")).toBeNull();
        // Re-opening must show empty fields.
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        const nameInput = screen.getByTestId(
            "authors-database-add-name",
        ) as HTMLInputElement;
        expect(nameInput.value).toBe("");
    });

    it("swaps a row into edit mode and PATCHes on save", async () => {
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Old Name"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-row-edit-a1"));
        const nameField = screen.getByTestId(
            "authors-database-row-name-a1",
        ) as HTMLInputElement;
        expect(nameField.value).toBe("Old Name");
        fireEvent.change(nameField, {target: {value: "New Name"}});
        fireEvent.click(screen.getByTestId("authors-database-row-save-a1"));
        await waitFor(() =>
            expect(updateMock).toHaveBeenCalledWith("a1", {
                name: "New Name",
                bio: "writer + maker",
            }),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("cancel edit reverts the row to view mode", async () => {
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Stable"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-row-edit-a1"));
        expect(screen.getByTestId("authors-database-row-name-a1")).toBeTruthy();
        fireEvent.click(screen.getByTestId("authors-database-row-cancel-a1"));
        expect(screen.queryByTestId("authors-database-row-name-a1")).toBeNull();
        expect(updateMock).not.toHaveBeenCalled();
    });

    it("delete asks for confirmation then DELETEs the row", async () => {
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Doomed"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-row-delete-a1"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("a1"));
        await waitFor(() =>
            expect(screen.queryByTestId("authors-database-row-a1")).toBeNull(),
        );
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("delete cancel keeps the row and skips the API", async () => {
        confirmMock.mockImplementation(async () => false);
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Safe"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-row-delete-a1"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(deleteMock).not.toHaveBeenCalled();
        expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy();
    });

    it("surfaces a toast on load failure", async () => {
        listMock.mockImplementation(async () => {
            throw new Error("boom");
        });
        render(<AuthorsDatabase/>);
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
    });

    it("surfaces a toast on create failure", async () => {
        createMock.mockImplementation(async () => {
            throw new Error("boom");
        });
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-add-toggle"));
        fireEvent.change(screen.getByTestId("authors-database-add-name"), {
            target: {value: "Will Fail"},
        });
        fireEvent.click(screen.getByTestId("authors-database-add-save"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
    });

    it("surfaces a toast on delete failure", async () => {
        deleteMock.mockImplementation(async () => {
            throw new Error("boom");
        });
        listMock.mockImplementation(async () => [
            makeAuthor({id: "a1", name: "Doomed"}),
        ]);
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("authors-database-row-delete-a1"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
    });

    it("wraps the action toolbar so buttons never overflow on narrow viewports", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-add-toggle")).toBeTruthy(),
        );
        // The toolbar (the add-toggle's parent) wraps; the search wrapper
        // takes a full row of its own below the sm breakpoint.
        const toolbar = screen.getByTestId("authors-database-add-toggle")
            .parentElement!;
        expect(toolbar.className).toContain("flex-wrap");
        const searchWrapper = screen.getByTestId("authors-database-search")
            .parentElement!;
        expect(searchWrapper.className).toContain("basis-full");
    });

    it("gives the action buttons a 44px minimum touch target", async () => {
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-export")).toBeTruthy(),
        );
        expect(
            screen.getByTestId("authors-database-add-toggle").className,
        ).toContain("min-h-[44px]");
        expect(
            screen.getByTestId("authors-database-export").className,
        ).toContain("min-h-[44px]");
        expect(
            screen.getByTestId("authors-database-import").className,
        ).toContain("min-h-[44px]");
    });

    it("shows the with-search empty state when filter has no matches", async () => {
        listMock.mockImplementation(async (params) => {
            if (params?.search) return [];
            return [makeAuthor({id: "a1", name: "Only One"})];
        });
        render(<AuthorsDatabase/>);
        await waitFor(() =>
            expect(screen.getByTestId("authors-database-row-a1")).toBeTruthy(),
        );
        fireEvent.change(screen.getByTestId("authors-database-search"), {
            target: {value: "xyz-no-match"},
        });
        await waitFor(
            () => expect(screen.getByTestId("authors-database-empty")).toBeTruthy(),
            {timeout: 1000},
        );
    });
});
