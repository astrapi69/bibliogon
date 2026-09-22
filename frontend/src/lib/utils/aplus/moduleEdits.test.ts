/**
 * Editing a module built from a template (#895): image places and table
 * rows within the template's limits, comparison values kept in step with
 * the columns.
 */

import { describe, expect, it } from "vitest";

import { createModule } from "./aplusDocument";
import { addRow, addSlot, canAddSlot, canRemoveSlot, removeRow, removeSlot, setField, setRowValue } from "./moduleEdits";

describe("createModule from the catalog", () => {
    it("builds empty slots, fields and rows from the template", () => {
        const chart = createModule("comparison_chart", "c1");
        expect(chart.slots).toHaveLength(3);
        expect(chart.slots[0]).toEqual({ title: "", text: "", image_prompt: "", alt_text: "", caption: "", asin: "" });
        expect(chart.rows).toHaveLength(3);
        expect(chart.rows?.[0]).toEqual({ label: "", values: ["", "", ""] });

        const specs = createModule("tech_specs", "t1");
        expect(specs.slots).toEqual([]);
        expect(specs.rows).toHaveLength(4);
        expect(specs.rows?.[0].values).toEqual([""]);

        const highlights = createModule("single_image_highlights", "h1");
        expect(Object.keys(highlights.fields ?? {})).toContain("block_3_body");
        expect(highlights.fields?.bullets).toBe("");
    });
});

describe("slots", () => {
    it("adds a comparison column and a matching value in every row", () => {
        const chart = createModule("comparison_chart", "c1");
        expect(canAddSlot(chart)).toBe(true);
        const wider = addSlot(chart);
        expect(wider.slots).toHaveLength(4);
        expect(wider.rows?.every((row) => row.values.length === 4)).toBe(true);
        expect(chart.slots).toHaveLength(3);
    });

    it("stops at the template maximum and minimum", () => {
        let chart = createModule("comparison_chart", "c1");
        for (let i = 0; i < 10; i++) chart = addSlot(chart);
        expect(chart.slots).toHaveLength(6);
        expect(canAddSlot(chart)).toBe(false);
        const header = createModule("image_header_text", "h1");
        expect(canAddSlot(header)).toBe(false);
        expect(canRemoveSlot(header)).toBe(false);
        expect(removeSlot(header, 0)).toBe(header);
    });

    it("removes a column together with its values", () => {
        const chart = setRowValue(createModule("comparison_chart", "c1"), 0, 1, "zwei");
        const narrower = removeSlot(chart, 0);
        expect(narrower.slots).toHaveLength(2);
        expect(narrower.rows?.[0].values).toEqual(["zwei", ""]);
    });
});

describe("rows", () => {
    it("adds and removes rows within the limits", () => {
        const specs = createModule("tech_specs", "t1");
        expect(removeRow(specs, 0)).toBe(specs);
        let longer = specs;
        for (let i = 0; i < 20; i++) longer = addRow(longer);
        expect(longer.rows).toHaveLength(16);
        expect(removeRow(longer, 0).rows).toHaveLength(15);
    });

    it("sets a row label or value without touching the others", () => {
        const specs = setRowValue(createModule("tech_specs", "t1"), 1, "label", "Seitenzahl");
        const filled = setRowValue(specs, 1, 0, "320");
        expect(filled.rows?.[1]).toEqual({ label: "Seitenzahl", values: ["320"] });
        expect(filled.rows?.[0]).toEqual({ label: "", values: [""] });
    });
});

describe("setField", () => {
    it("writes a module-level field", () => {
        const text = setField(createModule("text", "t"), "body", "Hallo");
        expect(text.fields?.body).toBe("Hallo");
    });
});
