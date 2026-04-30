/**
 * Responsive filter panel for the dashboard. Opens as a side
 * sheet on small screens when the user clicks the "Filter" button.
 *
 * Renders the same DashboardFilterBar in "stack" layout inside a
 * Radix Dialog (used as a slide-in side panel). Focus trap, scroll
 * lock and overlay come from Radix for free.
 */

import * as Dialog from "@radix-ui/react-dialog";
import {X, SlidersHorizontal} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import DashboardFilterBar from "./DashboardFilterBar";
import type {BookFilters} from "../hooks/useBookFilters";

interface Props {
    filters: BookFilters;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function DashboardFilterSheet({filters, open, onOpenChange}: Props) {
    const {t} = useI18n();

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay style={styles.overlay} data-testid="filter-sheet-overlay"/>
                <Dialog.Content
                    style={styles.content}
                    data-testid="filter-sheet"
                    aria-describedby={undefined}
                >
                    <div style={styles.header}>
                        <SlidersHorizontal size={18} className="muted"/>
                        <Dialog.Title style={styles.title}>
                            {t("ui.dashboard.filters", "Filter")}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                className="btn-icon"
                                data-testid="filter-sheet-close"
                                aria-label="Close"
                                style={{marginLeft: "auto"}}
                            >
                                <X size={18}/>
                            </button>
                        </Dialog.Close>
                    </div>

                    <DashboardFilterBar filters={filters} layout="stack"/>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        zIndex: 2000,
    },
    content: {
        position: "fixed",
        right: 0,
        top: 0,
        height: "100vh",
        width: "min(320px, 85vw)",
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border)",
        padding: 24,
        zIndex: 2001,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
    },
    title: {
        fontSize: "1rem",
        fontWeight: 600,
        margin: 0,
    },
};
