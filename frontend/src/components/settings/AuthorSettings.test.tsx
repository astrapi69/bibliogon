/**
 * AuthorSettings tests pin the testid surface and the pen-name list
 * mutations (add, remove, dedup, save-payload shape). Extracted from
 * Settings.tsx in PLUGIN-SETTINGS-TESTID-COVERAGE-01.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {AuthorSettings} from "./AuthorSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

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
});
