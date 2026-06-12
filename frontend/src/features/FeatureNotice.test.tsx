import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FeatureNotice } from "./FeatureNotice";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (key: string, fallback: string) => `${key}|${fallback}`,
    }),
}));

describe("FeatureNotice", () => {
    it("renders the reason key through t()", () => {
        render(<FeatureNotice reason="ui.feature.requires_desktop_app" />);
        const node = screen.getByTestId("feature-notice");
        expect(node.textContent).toContain("ui.feature.requires_desktop_app");
    });

    it("falls back to the desktop-app reason when none is given", () => {
        render(<FeatureNotice testId="x-disabled" />);
        const node = screen.getByTestId("x-disabled");
        expect(node.textContent).toContain("ui.feature.requires_desktop_app");
    });
});
