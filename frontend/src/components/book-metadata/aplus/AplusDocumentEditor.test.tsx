/**
 * The A+ document editor (#891): every field of the document, module
 * cards built from templates, add / move / remove modules. Pure
 * controlled component - every edit reports a new document.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const confirmMock = vi.fn(async () => true);
vi.mock("../../shared/AppDialog", () => ({
    useDialog: () => ({ confirm: confirmMock }),
}));

import { createModule, emptyDocument, type AplusDocumentDraft } from "../../../lib/utils/aplus/aplusDocument";
import AplusDocumentEditor from "./AplusDocumentEditor";

const t = (key: string, fallback?: string) => fallback ?? key;

let counter = 0;
const newId = () => `id-${++counter}`;

function renderEditor(doc: AplusDocumentDraft) {
    const onChange = vi.fn();
    render(<AplusDocumentEditor document={doc} onChange={onChange} t={t} />);
    return onChange;
}

function openBasics() {
    fireEvent.click(screen.getByTestId("aplus-basics-toggle"));
}

function openModule(index: number) {
    fireEvent.click(screen.getByTestId(`aplus-module-${index}-toggle`));
}

const lastDoc = (onChange: ReturnType<typeof vi.fn>): AplusDocumentDraft =>
    onChange.mock.calls[onChange.mock.calls.length - 1][0];

beforeEach(() => {
    confirmMock.mockClear();
    confirmMock.mockResolvedValue(true);
});

describe("AplusDocumentEditor", () => {
    it("shows the content name, short description with its limit, three bullets and both modules", () => {
        renderEditor(emptyDocument("El caballo", newId));
        openBasics();
        expect((screen.getByTestId("aplus-content-name") as HTMLTextAreaElement).value).toBe(
            "El caballo - A+Content",
        );
        expect(screen.getByTestId("aplus-short-description-char-count").textContent).toContain("/ 300");
        expect(screen.getByTestId("aplus-bullet-2-heading")).toBeTruthy();
        expect(screen.getByTestId("aplus-module-0").textContent).toContain("970x600");
        expect(screen.getByTestId("aplus-module-1").textContent).toContain("300x300");
        openModule(0);
        openModule(1);
        expect(screen.getByTestId("aplus-module-1-slot-2-alt")).toBeTruthy();
        expect(screen.getByTestId("aplus-module-1-slot-2-alt-char-count").textContent).toContain("/ 200");
    });

    it("reports a typed short description as a new document", () => {
        const onChange = renderEditor(emptyDocument("Buch", newId));
        openBasics();
        fireEvent.change(screen.getByTestId("aplus-short-description"), { target: { value: "Kurz" } });
        expect(lastDoc(onChange).short_description).toBe("Kurz");
    });

    it("writes a bullet body into the right bullet", () => {
        const onChange = renderEditor(emptyDocument("Buch", newId));
        openBasics();
        fireEvent.change(screen.getByTestId("aplus-bullet-1-body"), { target: { value: "Zwei" } });
        const doc = lastDoc(onChange);
        expect(doc.bullets[1].body).toBe("Zwei");
        expect(doc.bullets[0].body).toBe("");
    });

    it("writes a slot field into the right module and slot", () => {
        const onChange = renderEditor(emptyDocument("Buch", newId));
        openModule(1);
        openModule(0);
        fireEvent.change(screen.getByTestId("aplus-module-1-slot-2-prompt"), {
            target: { value: "family dinner --ar 1:1" },
        });
        const promptDoc: AplusDocumentDraft = onChange.mock.calls[0][0];
        expect(promptDoc.modules[1].slots[2].image_prompt).toBe("family dinner --ar 1:1");
        expect(promptDoc.modules[1].slots[1].image_prompt).toBe("");
        fireEvent.change(screen.getByTestId("aplus-module-0-title"), { target: { value: "Kopf" } });
        expect(lastDoc(onChange).modules[0].module_title).toBe("Kopf");
    });

    it("adds a module from a template at the end", () => {
        const onChange = renderEditor(emptyDocument("Buch", newId));
        fireEvent.click(screen.getByTestId("aplus-add-three_images_text"));
        const doc = lastDoc(onChange);
        expect(doc.modules.map((m) => m.template)).toEqual([
            "image_header_text",
            "three_images_text",
            "three_images_text",
        ]);
        expect(doc.modules[2].slots).toHaveLength(3);
    });

    it("moves a module down and disables moves past the ends", () => {
        const doc = emptyDocument("Buch", newId);
        const onChange = renderEditor(doc);
        expect((screen.getByTestId("aplus-module-0-up") as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByTestId("aplus-module-1-down") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByTestId("aplus-module-0-down"));
        expect(lastDoc(onChange).modules.map((m) => m.id)).toEqual([doc.modules[1].id, doc.modules[0].id]);
    });

    it("removes an empty module without asking", async () => {
        const onChange = renderEditor(emptyDocument("Buch", newId));
        fireEvent.click(screen.getByTestId("aplus-module-0-remove"));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(confirmMock).not.toHaveBeenCalled();
        expect(lastDoc(onChange).modules.map((m) => m.template)).toEqual(["three_images_text"]);
    });

    it("asks before removing a module with content and keeps it on cancel", async () => {
        const doc = emptyDocument("Buch", newId);
        doc.modules[0] = { ...createModule("image_header_text", "m1"), module_title: "Wichtig" };
        confirmMock.mockResolvedValue(false);
        const onChange = renderEditor(doc);
        fireEvent.click(screen.getByTestId("aplus-module-0-remove"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(onChange).not.toHaveBeenCalled();
    });

    it("renders a template it does not know without crashing", () => {
        const doc = { ...emptyDocument("Buch", newId), modules: [{ ...createModule("custom_x", "c1") }] };
        renderEditor(doc);
        expect(screen.getByTestId("aplus-module-0").textContent).toContain("custom_x");
    });
});
