import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SuccessStep } from "./SuccessStep";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual =
        await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function renderStep(onClose = vi.fn(), onAnother = vi.fn()) {
    return render(
        <MemoryRouter>
            <SuccessStep
                bookId="new-1"
                title="My New Book"
                onClose={onClose}
                onAnother={onAnother}
            />
        </MemoryRouter>,
    );
}

describe("SuccessStep", () => {
    it("renders the imported title", () => {
        renderStep();
        expect(screen.getByTestId("success-book-title")).toHaveTextContent(
            "My New Book",
        );
    });

    it("Open-in-editor cancels auto-redirect and navigates", () => {
        navigateMock.mockReset();
        const onClose = vi.fn();
        renderStep(onClose);
        fireEvent.click(screen.getByTestId("success-open-editor"));
        expect(onClose).toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith("/book/new-1");
    });

    it("Import-another calls onAnother", () => {
        const onAnother = vi.fn();
        renderStep(vi.fn(), onAnother);
        fireEvent.click(screen.getByTestId("success-import-another"));
        expect(onAnother).toHaveBeenCalled();
    });

    it("shows the auto-redirect countdown", () => {
        renderStep();
        expect(screen.getByTestId("success-auto-redirect")).toBeInTheDocument();
    });
});
