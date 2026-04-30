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
import styles from "./DashboardFilterSheet.module.css";

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
                <Dialog.Overlay className={styles.overlay} data-testid="filter-sheet-overlay"/>
                <Dialog.Content
                    className={styles.content}
                    data-testid="filter-sheet"
                    aria-describedby={undefined}
                >
                    <div className={styles.header}>
                        <SlidersHorizontal size={18} className="muted"/>
                        <Dialog.Title className={styles.title}>
                            {t("ui.dashboard.filters", "Filter")}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                className={`btn-icon ${styles.closeBtn}`}
                                data-testid="filter-sheet-close"
                                aria-label="Close"
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

