/**
 * Issue #132 regression pin: a Medium ZIP dropped in the generic
 * offline import dialog must be HANDED OFF to the dedicated
 * MediumImportPage (preview/select/progress/result), NOT imported
 * inline.
 *
 * Before the fix, ``OfflineImportDialog`` detected ``medium-zip`` and
 * called ``importFile`` synchronously — no preview, no progress, the
 * rich page never shown. The fix navigates to /articles/import/medium
 * with the file in ``location.state`` instead.
 *
 * The test drives the real router (no navigate mock) and asserts the
 * file lands on a probe rendered at the target route. ``importFile``
 * is mocked to FAIL the assertion if it is ever called for a Medium
 * ZIP (it must not be).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../import/detectFormat", () => ({
    detectImportFormat: vi.fn(async () => "medium-zip"),
}));

const importFileSpy = vi.fn();
vi.mock("../../import/importRouter", () => ({
    importFile: (...args: unknown[]) => {
        importFileSpy(...args);
        return Promise.reject(new Error("importFile must not run for medium-zip"));
    },
    OfflineNotSupportedError: class extends Error {},
    UnknownFormatError: class extends Error {},
}));

import OfflineImportDialog from "./OfflineImportDialog";

function MediumProbe() {
    const loc = useLocation();
    const file = (loc.state as { pendingMediumFile?: File } | null)
        ?.pendingMediumFile;
    return <div data-testid="medium-page-probe">{file ? file.name : "no-file"}</div>;
}

describe("OfflineImportDialog medium-zip handoff (#132)", () => {
    it("routes a Medium ZIP to the dedicated page instead of importing inline", async () => {
        render(
            <MemoryRouter initialEntries={["/articles"]}>
                <Routes>
                    <Route
                        path="/articles"
                        element={<OfflineImportDialog open onClose={() => {}} />}
                    />
                    <Route
                        path="/articles/import/medium"
                        element={<MediumProbe />}
                    />
                </Routes>
            </MemoryRouter>,
        );

        const input = screen.getByTestId("offline-import-input");
        const file = new File(["zip-bytes"], "medium-export.zip", {
            type: "application/zip",
        });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByTestId("medium-page-probe").textContent).toBe(
                "medium-export.zip",
            );
        });
        expect(importFileSpy).not.toHaveBeenCalled();
    });
});
