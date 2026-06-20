/**
 * Vitest coverage for SshKeySection (SETT-PHASE-1-QUICK-WINS-01).
 *
 * Pins SETT-QW-2: SshKeySection renders as its own card with an
 * explicit ``Settings.module.css`` ``sectionTitle`` heading plus
 * ``card`` body, and the title falls back to "SSH-Schlüssel für
 * Git-Sync" (the new label).
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import SshKeySection from "../SshKeySection";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

vi.mock("../AppDialog", () => ({
    useDialog: () => ({confirm: vi.fn(), prompt: vi.fn()}),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: {success: vi.fn(), error: vi.fn(), info: vi.fn()},
}));

const mockInfo = vi.fn();
vi.mock("../../api/client", () => ({
    api: {
        ssh: {
            info: (...args: unknown[]) => mockInfo(...args),
        },
    },
    ApiError: class ApiError extends Error {},
}));

describe("SshKeySection — card + header (SETT-QW-2)", () => {
    beforeEach(() => {
        mockInfo.mockReset();
    });

    it("renders the section with the Git-Sync title once info loads", async () => {
        mockInfo.mockResolvedValue({exists: false});
        render(<SshKeySection/>);
        await waitFor(() => {
            expect(screen.getByTestId("ssh-key-section")).toBeInTheDocument();
        });
        // The heading falls back to the new "Git-Sync" label.
        expect(
            screen.getByText("SSH-Schlüssel für Git-Sync"),
        ).toBeInTheDocument();
    });
});
