/**
 * #991: the notice must appear exactly where it is true.
 *
 * Shown on a path-per-site host, absent on the desktop, Docker and LAN
 * builds - a warning that fires everywhere is one users learn to skip,
 * and one that never fires tells them nothing before they paste a token.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SharedOriginNote } from "./SharedOriginNote";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: () => {},
        catalog: {},
    }),
}));

function setHostname(hostname: string): void {
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, hostname },
    });
}

const originalLocation = window.location;

afterEach(() => {
    Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
    });
});

describe("SharedOriginNote", () => {
    it("shows the notice on a GitHub Pages host", () => {
        setHostname("astrapi69.github.io");
        render(<SharedOriginNote testId="shared-origin-note" />);
        const note = screen.getByTestId("shared-origin-note");
        expect(note.textContent).toContain("Desktop-App");
    });

    it("renders nothing on localhost", () => {
        setHostname("localhost");
        render(<SharedOriginNote testId="shared-origin-note" />);
        expect(screen.queryByTestId("shared-origin-note")).toBeNull();
    });

    it("renders nothing on a LAN address", () => {
        setHostname("192.168.1.42");
        render(<SharedOriginNote testId="shared-origin-note" />);
        expect(screen.queryByTestId("shared-origin-note")).toBeNull();
    });
});
