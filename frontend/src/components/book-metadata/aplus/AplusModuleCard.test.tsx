/**
 * A module card renders what its template defines (#895): the module
 * headline only where Amazon has one, module-level texts, labelled image
 * places, add/remove for variable places, and table rows.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { createModule, type AplusModuleDraft } from "../../../lib/utils/aplus/aplusDocument";
import AplusModuleCard from "./AplusModuleCard";

const t = (key: string, fallback?: string) => fallback ?? key;

function renderCard(module: AplusModuleDraft) {
    const onChange = vi.fn();
    render(
        <AplusModuleCard
            module={module}
            index={0}
            count={1}
            t={t}
            onChange={onChange}
            onMove={vi.fn()}
            onRemove={vi.fn()}
        />,
    );
    return onChange;
}

function openModule() {
    fireEvent.click(screen.getByTestId("aplus-module-0-toggle"));
}

const last = (fn: ReturnType<typeof vi.fn>): AplusModuleDraft => fn.mock.calls[fn.mock.calls.length - 1][0];

describe("AplusModuleCard", () => {
    it("renders the sidebar module with labelled images, caption and its texts", () => {
        const onChange = renderCard(createModule("image_sidebar", "s"));
        openModule();
        expect(screen.getByTestId("aplus-module-0-title")).toBeTruthy();
        expect(screen.getByTestId("aplus-module-0-slot-0").textContent).toContain("Hauptbild");
        expect(screen.getByTestId("aplus-module-0-slot-1").textContent).toContain("Seitenleiste");
        expect(screen.getByTestId("aplus-module-0-slot-0-caption")).toBeTruthy();
        expect(screen.queryByTestId("aplus-module-0-slot-0-title")).toBeNull();
        expect(screen.getByTestId("aplus-module-0").textContent).toContain("300x400, 350x175");
        fireEvent.change(screen.getByTestId("aplus-module-0-field-sidebar_bullets"), {
            target: { value: "eins\nzwei" },
        });
        expect(last(onChange).fields?.sidebar_bullets).toBe("eins\nzwei");
    });

    it("has no module headline where Amazon has none", () => {
        renderCard(createModule("image_dark_overlay", "o"));
        openModule();
        expect(screen.queryByTestId("aplus-module-0-title")).toBeNull();
        expect(screen.getByTestId("aplus-module-0-slot-0-title")).toBeTruthy();
    });

    it("adds and removes comparison columns and keeps the values in step", () => {
        const onChange = renderCard(createModule("comparison_chart", "c"));
        openModule();
        expect(screen.getByTestId("aplus-module-0-slot-2-asin")).toBeTruthy();
        fireEvent.click(screen.getByTestId("aplus-module-0-add-slot"));
        const wider = last(onChange);
        expect(wider.slots).toHaveLength(4);
        expect(wider.rows?.[0].values).toHaveLength(4);
        fireEvent.click(screen.getByTestId("aplus-module-0-slot-1-remove"));
        expect(last(onChange).slots).toHaveLength(2);
    });

    it("edits comparison rows: label and one value per column", () => {
        const onChange = renderCard(createModule("comparison_chart", "c"));
        openModule();
        fireEvent.change(screen.getByTestId("aplus-module-0-row-0-label"), { target: { value: "Genre" } });
        expect(last(onChange).rows?.[0].label).toBe("Genre");
        fireEvent.change(screen.getByTestId("aplus-module-0-row-0-value-2"), { target: { value: "Krimi" } });
        expect(last(onChange).rows?.[0].values).toEqual(["", "", "Krimi"]);
        fireEvent.click(screen.getByTestId("aplus-module-0-add-row"));
        expect(last(onChange).rows).toHaveLength(4);
    });

    it("keeps at least four tech-spec rows", () => {
        renderCard(createModule("tech_specs", "t"));
        openModule();
        expect(screen.getByTestId("aplus-module-0-row-3-value-0")).toBeTruthy();
        expect((screen.getByTestId("aplus-module-0-row-0-remove") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByTestId("aplus-module-0-add-slot")).toBeNull();
    });

    it("renders the text module as headline and body", () => {
        const onChange = renderCard(createModule("text", "x"));
        openModule();
        fireEvent.change(screen.getByTestId("aplus-module-0-field-body"), { target: { value: "Hallo" } });
        expect(last(onChange).fields?.body).toBe("Hallo");
        expect(screen.getByTestId("aplus-module-0").textContent).toContain("Kein Bild");
    });

    it("shows the product description limit", () => {
        renderCard(createModule("product_description", "p"));
        openModule();
        expect(screen.getByTestId("aplus-module-0-field-body-char-count").textContent).toContain("/ 6000");
    });

    it("reads an older document without caption, fields or rows", () => {
        const old = { id: "h", template: "image_header_text", module_title: "", slots: [{ title: "T", text: "", image_prompt: "", alt_text: "" }] };
        renderCard(old);
        openModule();
        expect((screen.getByTestId("aplus-module-0-slot-0-title") as HTMLTextAreaElement).value).toBe("T");
    });
});
