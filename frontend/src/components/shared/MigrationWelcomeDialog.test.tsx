/** Tests for MigrationWelcomeDialog (#591). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import MigrationWelcomeDialog, {
    MIGRATION_OFFERED_KEY,
    ONLINE_VERSION_URL,
    shouldOfferMigration,
    markMigrationOffered,
} from "./MigrationWelcomeDialog";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback?: string) => fallback ?? _k,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

beforeEach(() => {
    localStorage.clear();
});

describe("MigrationWelcomeDialog flag helpers", () => {
    it("shouldOfferMigration is true by default, false once marked", () => {
        expect(shouldOfferMigration()).toBe(true);
        markMigrationOffered();
        expect(localStorage.getItem(MIGRATION_OFFERED_KEY)).toBe("true");
        expect(shouldOfferMigration()).toBe(false);
    });
});

describe("MigrationWelcomeDialog rendering", () => {
    it("renders the dialog + 4-step walkthrough + 3 actions when open", async () => {
        render(<MigrationWelcomeDialog open onClose={vi.fn()} onImport={vi.fn()} />);
        expect(await screen.findByTestId("migration-welcome-dialog")).toBeInTheDocument();
        const steps = await screen.findByTestId("migration-welcome-steps");
        expect(steps.querySelectorAll("li")).toHaveLength(4);
        expect(screen.getByTestId("migration-welcome-skip")).toBeInTheDocument();
        expect(screen.getByTestId("migration-welcome-import")).toBeInTheDocument();
        const online = screen.getByTestId("migration-welcome-open-online");
        expect(online).toHaveAttribute("href", ONLINE_VERSION_URL);
        expect(online).toHaveAttribute("target", "_blank");
    });

    it('"Ohne Daten starten" sets the flag and calls onClose', async () => {
        const onClose = vi.fn();
        render(<MigrationWelcomeDialog open onClose={onClose} onImport={vi.fn()} />);
        fireEvent.click(await screen.findByTestId("migration-welcome-skip"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(shouldOfferMigration()).toBe(false);
    });

    it('"Backup importieren" calls onImport WITHOUT setting the flag (so it can reappear)', async () => {
        const onImport = vi.fn();
        render(<MigrationWelcomeDialog open onClose={vi.fn()} onImport={onImport} />);
        fireEvent.click(await screen.findByTestId("migration-welcome-import"));
        expect(onImport).toHaveBeenCalledTimes(1);
        expect(shouldOfferMigration()).toBe(true);
    });

    it("close-X sets the flag and calls onClose", async () => {
        const onClose = vi.fn();
        render(<MigrationWelcomeDialog open onClose={onClose} onImport={vi.fn()} />);
        fireEvent.click(await screen.findByTestId("migration-welcome-close"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(shouldOfferMigration()).toBe(false);
    });
});
