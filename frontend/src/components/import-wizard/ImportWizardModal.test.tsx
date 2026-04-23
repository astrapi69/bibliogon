import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ImportWizardModal from "./ImportWizardModal";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function renderModal(open: boolean, onClose = vi.fn(), onImported = vi.fn()) {
    return render(
        <MemoryRouter>
            <ImportWizardModal open={open} onClose={onClose} onImported={onImported} />
        </MemoryRouter>,
    );
}

describe("ImportWizardModal scaffold", () => {
    it("is not rendered when open=false", () => {
        renderModal(false);
        expect(screen.queryByTestId("import-wizard-modal")).not.toBeInTheDocument();
    });

    it("renders the step-1 upload content when open=true", () => {
        renderModal(true);
        expect(screen.getByTestId("import-wizard-modal")).toBeInTheDocument();
        expect(screen.getByTestId("upload-step")).toBeInTheDocument();
        expect(screen.getByTestId("wizard-step-indicator")).toHaveTextContent(
            /Step 1 of 4/,
        );
    });

    it("close button invokes onClose", () => {
        const onClose = vi.fn();
        renderModal(true, onClose);
        fireEvent.click(screen.getByTestId("wizard-close"));
        expect(onClose).toHaveBeenCalled();
    });
});
