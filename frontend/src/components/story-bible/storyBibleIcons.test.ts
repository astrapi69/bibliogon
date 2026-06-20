import {describe, it, expect} from "vitest";
import {
    BookMarked,
    Box,
    MapPin,
    Milestone,
    Package,
    User,
} from "lucide-react";
import {entityTypeColor, entityTypeIcon} from "./storyBibleIcons";

describe("entityTypeIcon", () => {
    it("resolves the SSoT icon name first", () => {
        expect(entityTypeIcon("character", "MapPin")).toBe(MapPin);
    });

    it("falls back to the type id when the icon name is unknown", () => {
        expect(entityTypeIcon("character", "NoSuchIcon")).toBe(User);
        expect(entityTypeIcon("setting")).toBe(MapPin);
        expect(entityTypeIcon("plot_point")).toBe(Milestone);
        expect(entityTypeIcon("item")).toBe(Package);
        expect(entityTypeIcon("lore")).toBe(BookMarked);
    });

    it("falls back to a generic icon for an unknown type", () => {
        expect(entityTypeIcon("unknown_type")).toBe(Box);
    });
});

describe("entityTypeColor", () => {
    it("returns a distinct color per known type", () => {
        const colors = [
            entityTypeColor("character"),
            entityTypeColor("setting"),
            entityTypeColor("plot_point"),
            entityTypeColor("item"),
            entityTypeColor("lore"),
        ];
        // All five are distinct hex strings.
        expect(new Set(colors).size).toBe(5);
        for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("returns the neutral fallback for an unknown type", () => {
        expect(entityTypeColor("unknown")).toBe("#6b7280");
    });
});
