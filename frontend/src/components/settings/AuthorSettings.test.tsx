/**
 * AuthorSettings tests pin the testid surface and the pen-name list
 * mutations (add, remove, dedup, save-payload shape). Extracted from
 * Settings.tsx in PLUGIN-SETTINGS-TESTID-COVERAGE-01.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import {AuthorSettings} from "./AuthorSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

const listMock = vi.fn<() => Promise<unknown[]>>(async () => []);
const createMock = vi.fn(async (data: {name: string}) => ({
    id: "new",
    name: data.name,
    slug: data.name,
    bio: null,
    is_profile_author: true,
    created_at: "",
    updated_at: "",
}));
const updateMock = vi.fn(async () => ({}));

vi.mock("../../storage", () => ({
    getStorage: () => ({
        authors: {
            list: (...args: unknown[]) => listMock(...(args as [])),
            create: (...args: unknown[]) => createMock(...(args as [{name: string}])),
            update: (...args: unknown[]) => updateMock(...(args as [])),
        },
    }),
}));

const notifySuccess = vi.fn();
const notifyError = vi.fn();
vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...a: unknown[]) => notifySuccess(...a),
        error: (...a: unknown[]) => notifyError(...a),
    },
}));

beforeEach(() => {
    listMock.mockReset();
    createMock.mockClear();
    updateMock.mockClear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    listMock.mockResolvedValue([]);
});

describe("AuthorSettings", () => {
    it("renders the root testid + real-name input", () => {
        render(<AuthorSettings config={{}} onSave={() => {}} saving={false}/>);
        expect(screen.getByTestId("author-settings")).toBeTruthy();
        expect(screen.getByTestId("author-real-name")).toBeTruthy();
        expect(screen.getByTestId("author-save")).toBeTruthy();
    });

    it("seeds real-name + pen-names from config.author", () => {
        const config = {author: {name: "Asterios Raptis", pen_names: ["A. R.", "Aster"]}};
        render(<AuthorSettings config={config} onSave={() => {}} saving={false}/>);
        const real = screen.getByTestId("author-real-name") as HTMLInputElement;
        expect(real.value).toBe("Asterios Raptis");
        expect(screen.getByTestId("author-pen-name-0").textContent).toContain("A. R.");
        expect(screen.getByTestId("author-pen-name-1").textContent).toContain("Aster");
    });

    it("adds a pen-name via the add button", () => {
        render(<AuthorSettings config={{author: {name: "X", pen_names: []}}} onSave={() => {}} saving={false}/>);
        const input = screen.getByTestId("author-pen-name-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Pseudo"}});
        fireEvent.click(screen.getByTestId("author-pen-name-add"));
        expect(screen.getByTestId("author-pen-name-0").textContent).toContain("Pseudo");
        expect(input.value).toBe("");
    });

    it("adds a pen-name on Enter", () => {
        render(<AuthorSettings config={{}} onSave={() => {}} saving={false}/>);
        const input = screen.getByTestId("author-pen-name-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "EnterPseudo"}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(screen.getByTestId("author-pen-name-0").textContent).toContain("EnterPseudo");
    });

    it("dedups identical pen-names silently", () => {
        render(<AuthorSettings config={{author: {pen_names: ["Solo"]}}} onSave={() => {}} saving={false}/>);
        const input = screen.getByTestId("author-pen-name-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Solo"}});
        fireEvent.click(screen.getByTestId("author-pen-name-add"));
        expect(screen.queryByTestId("author-pen-name-1")).toBeNull();
    });

    it("removes a pen-name via the remove button", () => {
        render(<AuthorSettings config={{author: {pen_names: ["Keep", "Drop"]}}} onSave={() => {}} saving={false}/>);
        expect(screen.getByTestId("author-pen-name-1")).toBeTruthy();
        fireEvent.click(screen.getByTestId("author-pen-name-remove-1"));
        expect(screen.queryByTestId("author-pen-name-1")).toBeNull();
        expect(screen.getByTestId("author-pen-name-0").textContent).toContain("Keep");
    });

    it("save passes {author: {name, pen_names}}", () => {
        const onSave = vi.fn();
        render(<AuthorSettings config={{author: {name: "X", pen_names: ["P1"]}}} onSave={onSave} saving={false}/>);
        const real = screen.getByTestId("author-real-name") as HTMLInputElement;
        fireEvent.change(real, {target: {value: "Y"}});
        fireEvent.click(screen.getByTestId("author-save"));
        expect(onSave).toHaveBeenCalledWith({author: {name: "Y", pen_names: ["P1"]}});
    });

    it("auto-saves immediately when a pen name is added (no Speichern click)", () => {
        const onSave = vi.fn();
        render(<AuthorSettings config={{author: {name: "X", pen_names: []}}} onSave={onSave} saving={false}/>);
        fireEvent.change(screen.getByTestId("author-pen-name-input"), {
            target: {value: "TestPen"},
        });
        fireEvent.click(screen.getByTestId("author-pen-name-add"));
        expect(onSave).toHaveBeenCalledWith({author: {name: "X", pen_names: ["TestPen"]}});
    });

    it("auto-saves immediately when a pen name is removed", () => {
        const onSave = vi.fn();
        render(<AuthorSettings config={{author: {name: "X", pen_names: ["Keep", "Drop"]}}} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("author-pen-name-remove-1"));
        expect(onSave).toHaveBeenCalledWith({author: {name: "X", pen_names: ["Keep"]}});
    });

    it("auto-saves the real name on blur when it changed", () => {
        const onSave = vi.fn();
        render(<AuthorSettings config={{author: {name: "X", pen_names: []}}} onSave={onSave} saving={false}/>);
        const real = screen.getByTestId("author-real-name");
        fireEvent.change(real, {target: {value: "New Name"}});
        fireEvent.blur(real);
        expect(onSave).toHaveBeenCalledWith({author: {name: "New Name", pen_names: []}});
    });

    it("does not save on blur when the real name is unchanged", () => {
        const onSave = vi.fn();
        render(<AuthorSettings config={{author: {name: "X", pen_names: []}}} onSave={onSave} saving={false}/>);
        fireEvent.blur(screen.getByTestId("author-real-name"));
        expect(onSave).not.toHaveBeenCalled();
    });

    it("disables save while saving=true", () => {
        render(<AuthorSettings config={{}} onSave={() => {}} saving={true}/>);
        const btn = screen.getByTestId("author-save") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it("add button disabled on empty input", () => {
        render(<AuthorSettings config={{}} onSave={() => {}} saving={false}/>);
        const add = screen.getByTestId("author-pen-name-add") as HTMLButtonElement;
        expect(add.disabled).toBe(true);
    });

    it("sync-to-database button is disabled when the profile is empty", () => {
        render(<AuthorSettings config={{}} onSave={() => {}} saving={false}/>);
        const sync = screen.getByTestId("author-sync-to-db") as HTMLButtonElement;
        expect(sync.disabled).toBe(true);
    });

    it("sync creates missing profile authors and promotes existing matches", async () => {
        listMock.mockResolvedValue([
            {
                id: "e1",
                name: "Pen",
                slug: "pen",
                bio: null,
                is_profile_author: false,
                created_at: "",
                updated_at: "",
            },
        ]);
        render(
            <AuthorSettings
                config={{author: {name: "Real", pen_names: ["Pen"]}}}
                onSave={() => {}}
                saving={false}
            />,
        );
        fireEvent.click(screen.getByTestId("author-sync-to-db"));
        await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
        expect(createMock).toHaveBeenCalledWith({
            name: "Real",
            is_profile_author: true,
        });
        expect(updateMock).toHaveBeenCalledWith("e1", {is_profile_author: true});
    });

    it("sync skips an existing entry already flagged as profile author", async () => {
        listMock.mockResolvedValue([
            {
                id: "e1",
                name: "Real",
                slug: "real",
                bio: null,
                is_profile_author: true,
                created_at: "",
                updated_at: "",
            },
        ]);
        render(
            <AuthorSettings
                config={{author: {name: "Real", pen_names: []}}}
                onSave={() => {}}
                saving={false}
            />,
        );
        fireEvent.click(screen.getByTestId("author-sync-to-db"));
        await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
        expect(createMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
    });
});
