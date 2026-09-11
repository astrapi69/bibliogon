/**
 * Portfolio board (#810): the matrix over the per-format retail state.
 *
 * These cases drive the page through its real child tree (matrix,
 * filter bar, cells) with only the API + i18n + feature seams mocked,
 * so they assert what the author actually sees rather than that a
 * handler fired. The board's whole point is spotting gaps, so the gap
 * marking, the gaps-only filter and the two distinct empty states are
 * pinned as behaviour, not as markup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import PortfolioBoardPage from "./PortfolioBoardPage";
import type { PortfolioBoard } from "../../api/platform";

let featureActive = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: featureActive ? "active" : "disabled",
        isActive: featureActive,
        isDisabled: !featureActive,
        isHidden: false,
        reason: featureActive ? undefined : "ui.feature.requires_desktop_app",
    }),
}));

vi.mock("react-router-dom", () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../hooks/navigation/useGoBack", () => ({ useGoBack: () => vi.fn() }));

const portfolio = vi.fn();
const setFormatState = vi.fn();
const setUniversalLink = vi.fn();
vi.mock("../../api/client", () => ({
    api: {
        promotion: {
            portfolio: (...args: unknown[]) => portfolio(...args),
            setFormatState: (...args: unknown[]) => setFormatState(...args),
            setUniversalLink: (...args: unknown[]) => setUniversalLink(...args),
        },
    },
    ApiError: class ApiError extends Error {},
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: { success: vi.fn(), error: vi.fn(), saved: vi.fn() },
}));

function row(over: Partial<PortfolioBoard["books"][number]> = {}) {
    return {
        book_id: "b1",
        title: "Erstes Buch",
        author: "A. Raptis",
        language: "de",
        status: "published",
        universal_link: null,
        source_identifier: null,
        formats: [
            { book_format: "ebook", status: "live", store_url: "https://a/dp/B01", asin: "B01" },
            { book_format: "paperback", status: "missing", store_url: null, asin: null },
            { book_format: "hardcover", status: "draft", store_url: null, asin: null },
        ],
        gaps: ["paperback", "hardcover"],
        ...over,
    };
}

function board(books: PortfolioBoard["books"]): PortfolioBoard {
    return {
        formats: ["ebook", "paperback", "hardcover"],
        statuses: ["live", "draft", "missing"],
        books,
    };
}

beforeEach(() => {
    featureActive = true;
    vi.clearAllMocks();
    portfolio.mockResolvedValue(board([row()]));
});

describe("PortfolioBoardPage", () => {
    it("renders one column per format and one row per book", async () => {
        portfolio.mockResolvedValue(
            board([row(), row({ book_id: "b2", title: "Zweites Buch", gaps: [] })]),
        );

        render(<PortfolioBoardPage />);

        await screen.findByTestId("portfolio-board-matrix");
        expect(screen.getByTestId("portfolio-board-row-b1")).toBeTruthy();
        expect(screen.getByTestId("portfolio-board-row-b2")).toBeTruthy();
        for (const fmt of ["ebook", "paperback", "hardcover"]) {
            expect(screen.getByTestId(`portfolio-board-column-${fmt}`)).toBeTruthy();
            expect(screen.getByTestId(`portfolio-board-cell-b1-${fmt}`)).toBeTruthy();
        }
    });

    it("marks the gap formats on the row so they stand out from the live one", async () => {
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        expect(
            screen.getByTestId("portfolio-board-cell-b1-paperback").getAttribute("data-gap"),
        ).toBe("true");
        expect(
            screen.getByTestId("portfolio-board-cell-b1-hardcover").getAttribute("data-gap"),
        ).toBe("true");
        expect(screen.getByTestId("portfolio-board-cell-b1-ebook").getAttribute("data-gap")).toBe(
            "false",
        );
    });

    it("shows the store link for a format that has one", async () => {
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        const link = screen.getByTestId("portfolio-board-cell-link-b1-ebook") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toBe("https://a/dp/B01");
        expect(
            screen.queryByTestId("portfolio-board-cell-link-b1-paperback"),
        ).toBeNull();
    });

    it("reloads the board with gaps_only when the gaps filter is turned on", async () => {
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        fireEvent.click(screen.getByTestId("portfolio-board-filter-gaps"));

        await waitFor(() =>
            expect(portfolio).toHaveBeenLastCalledWith(
                expect.objectContaining({ gapsOnly: true }),
            ),
        );
    });

    it("reloads the board with the selected author and language filters", async () => {
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        fireEvent.change(screen.getByTestId("portfolio-board-filter-author-trigger"), {
            target: { value: "A. Raptis" },
        });
        await waitFor(() =>
            expect(portfolio).toHaveBeenLastCalledWith(
                expect.objectContaining({ author: "A. Raptis" }),
            ),
        );

        fireEvent.change(screen.getByTestId("portfolio-board-filter-language-trigger"), {
            target: { value: "de" },
        });
        await waitFor(() =>
            expect(portfolio).toHaveBeenLastCalledWith(
                expect.objectContaining({ author: "A. Raptis", language: "de" }),
            ),
        );
    });

    it("offers the pen names and languages of the whole board, not of the filtered view", async () => {
        portfolio.mockResolvedValueOnce(
            board([row(), row({ book_id: "b2", author: "Pen Name", language: "en" })]),
        );
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        // The filtered reload returns one author only; the options must
        // still carry both, or the user cannot switch back.
        portfolio.mockResolvedValue(board([row()]));
        fireEvent.change(screen.getByTestId("portfolio-board-filter-author-trigger"), {
            target: { value: "A. Raptis" },
        });
        await waitFor(() => expect(portfolio).toHaveBeenCalledTimes(2));

        const options = Array.from(
            screen.getByTestId("portfolio-board-filter-author-trigger").querySelectorAll("option"),
        ).map((o) => o.getAttribute("value"));
        expect(options).toContain("Pen Name");
        expect(options).toContain("A. Raptis");
    });

    it("writes a changed format status straight through to the backend", async () => {
        setFormatState.mockResolvedValue({
            ...row(),
            formats: [
                { book_format: "ebook", status: "live", store_url: "https://a/dp/B01", asin: "B01" },
                { book_format: "paperback", status: "live", store_url: null, asin: null },
                { book_format: "hardcover", status: "draft", store_url: null, asin: null },
            ],
            gaps: ["hardcover"],
        });

        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        fireEvent.change(
            screen.getByTestId("portfolio-board-cell-status-b1-paperback-trigger"),
            { target: { value: "live" } },
        );

        await waitFor(() =>
            expect(setFormatState).toHaveBeenCalledWith("b1", "paperback", { status: "live" }),
        );
        // The row refreshes from the response, so the gap marking clears
        // without a full board reload.
        await waitFor(() =>
            expect(
                screen.getByTestId("portfolio-board-cell-b1-paperback").getAttribute("data-gap"),
            ).toBe("false"),
        );
    });

    it("saves an edited store URL for one format", async () => {
        setFormatState.mockResolvedValue(row());

        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        fireEvent.click(screen.getByTestId("portfolio-board-cell-edit-b1-paperback"));
        fireEvent.change(screen.getByTestId("portfolio-board-cell-url-b1-paperback"), {
            target: { value: "https://amazon.de/dp/B02" },
        });
        fireEvent.click(screen.getByTestId("portfolio-board-cell-url-save-b1-paperback"));

        await waitFor(() =>
            expect(setFormatState).toHaveBeenCalledWith("b1", "paperback", {
                store_url: "https://amazon.de/dp/B02",
            }),
        );
    });

    it("saves the universal link for a book", async () => {
        setUniversalLink.mockResolvedValue({ ...row(), universal_link: "https://b2r/x" });

        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        fireEvent.change(screen.getByTestId("portfolio-board-universal-link-b1"), {
            target: { value: "https://b2r/x" },
        });
        // The save button stays disabled until the edit makes the field
        // dirty; clicking before that re-render is a no-op, so wait for
        // the enabled state rather than racing it.
        const save = screen.getByTestId(
            "portfolio-board-universal-link-save-b1",
        ) as HTMLButtonElement;
        await waitFor(() => expect(save.disabled).toBe(false));
        fireEvent.click(save);

        await waitFor(() =>
            expect(setUniversalLink).toHaveBeenCalledWith("b1", "https://b2r/x"),
        );
    });

    it("shows the first-run empty state when no book exists yet", async () => {
        portfolio.mockResolvedValue(board([]));

        render(<PortfolioBoardPage />);

        await screen.findByTestId("portfolio-board-empty");
        expect(screen.queryByTestId("portfolio-board-matrix")).toBeNull();
        expect(screen.queryByTestId("portfolio-board-no-matches")).toBeNull();
    });

    it("distinguishes 'no matches' from 'nothing seeded' once a filter is active", async () => {
        render(<PortfolioBoardPage />);
        await screen.findByTestId("portfolio-board-matrix");

        portfolio.mockResolvedValue(board([]));
        fireEvent.click(screen.getByTestId("portfolio-board-filter-gaps"));

        await screen.findByTestId("portfolio-board-no-matches");
        expect(screen.queryByTestId("portfolio-board-empty")).toBeNull();
    });

    it("explains itself instead of calling the backend when the board is desktop-only", async () => {
        featureActive = false;

        render(<PortfolioBoardPage />);

        await screen.findByTestId("portfolio-board-disabled");
        expect(portfolio).not.toHaveBeenCalled();
        expect(screen.queryByTestId("portfolio-board-matrix")).toBeNull();
    });
});
