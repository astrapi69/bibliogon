/**
 * Vitest coverage for ErweitertSettings.
 *
 * Pins the "Erweitert" tab after the White-Label removal (#150):
 * the tab hosts SSH key management plus advanced upload limits. The
 * White-Label app-customisation card and its save contract are gone.
 *
 * SshKeySection is stubbed; it has its own regression-pin
 * (SshKeySection.test.tsx).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErweitertSettings } from "./ErweitertSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

vi.mock("./SshKeySection", () => ({
    default: () => <div data-testid="stub-ssh-key-section" />,
}));

describe("ErweitertSettings — Advanced tab", () => {
    it("renders the section heading + SshKeySection stub", () => {
        render(
            <ErweitertSettings config={{ app: { max_upload_mb: 500 } }} onSave={vi.fn()} saving={false} />,
        );
        expect(screen.getByTestId("erweitert-settings")).toBeInTheDocument();
        expect(screen.getByText("Erweitert")).toBeInTheDocument();
        expect(screen.getByTestId("stub-ssh-key-section")).toBeInTheDocument();
    });

    it("no longer renders any White-Label customisation surface", () => {
        render(
            <ErweitertSettings config={{ app: { max_upload_mb: 500 } }} onSave={vi.fn()} saving={false} />,
        );
        expect(screen.queryByTestId("white-label-card")).not.toBeInTheDocument();
        expect(screen.queryByTestId("white-label-app-name")).not.toBeInTheDocument();
        expect(screen.queryByTestId("erweitert-settings-save")).not.toBeInTheDocument();
    });
});
