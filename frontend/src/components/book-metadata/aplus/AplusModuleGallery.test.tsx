/**
 * Module gallery (#895): Amazon's 17 A+ modules as tiles or as a list; a
 * click adds the module. The logo can only appear once, and the gallery
 * says when KDP's five-module limit is reached.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { createModule } from "../../../lib/utils/aplus/aplusDocument";
import AplusModuleGallery from "./AplusModuleGallery";

const t = (key: string, fallback?: string) => fallback ?? key;

function renderGallery(templates: string[] = []) {
    const onAdd = vi.fn();
    render(
        <AplusModuleGallery modules={templates.map((id, i) => createModule(id, `m${i}`))} onAdd={onAdd} t={t} />,
    );
    return onAdd;
}

describe("AplusModuleGallery", () => {
    it("offers all 17 modules as tiles, grouped, with name and image size", () => {
        renderGallery();
        const gallery = screen.getByTestId("aplus-module-gallery");
        expect(gallery.getAttribute("data-view")).toBe("tile");
        expect(within(gallery).getAllByRole("button", { name: /^Standard / })).toHaveLength(17);
        const header = screen.getByTestId("aplus-add-image_header_text");
        expect(header.textContent).toContain("Standard Image Header With Text");
        expect(header.textContent).toContain("970x600");
        expect(screen.getByTestId("aplus-gallery-group-table")).toBeTruthy();
        expect(screen.getByTestId("aplus-sketch-image_header_text")).toBeTruthy();
    });

    it("switches to the list and keeps every module", () => {
        renderGallery();
        fireEvent.click(screen.getByTestId("view-list"));
        const gallery = screen.getByTestId("aplus-module-gallery");
        expect(gallery.getAttribute("data-view")).toBe("list");
        expect(within(gallery).getAllByRole("button", { name: /^Standard / })).toHaveLength(17);
        expect(screen.getByTestId("aplus-add-tech_specs").textContent).toContain("4 bis 16");
    });

    it("adds the clicked module", () => {
        const onAdd = renderGallery();
        fireEvent.click(screen.getByTestId("aplus-add-comparison_chart"));
        expect(onAdd).toHaveBeenCalledWith("comparison_chart");
    });

    it("disables the logo once the document has one", () => {
        renderGallery(["company_logo"]);
        const logo = screen.getByTestId("aplus-add-company_logo") as HTMLButtonElement;
        expect(logo.disabled).toBe(true);
        expect(logo.textContent).toContain("Schon vorhanden");
    });

    it("warns at KDP's five modules but still allows more", () => {
        renderGallery(["text", "text", "text", "text"]);
        expect(screen.queryByTestId("aplus-gallery-limit")).toBeNull();
        screen.getByTestId("aplus-add-text").click();
    });

    it("shows the limit note from five modules on", () => {
        renderGallery(["text", "text", "text", "text", "text"]);
        expect(screen.getByTestId("aplus-gallery-limit").textContent).toContain("5");
        expect((screen.getByTestId("aplus-add-text") as HTMLButtonElement).disabled).toBe(false);
    });
});
