/**
 * Shared responsive filter-panel shell. Opens as a slide-in side
 * sheet on small screens; the page renders it behind a "Filter"
 * trigger button (``show-mobile-only``) while the desktop layout
 * keeps the inline filter bar (``hide-mobile``).
 *
 * The shell owns only the Radix Dialog chrome (overlay, header,
 * close button, scroll-locked side panel). The concrete filter bar
 * is passed as ``children`` so the Books (``DashboardFilterSheet``)
 * and Articles (``ArticleFilterSheet``) surfaces can keep their
 * distinct, hook-bound filter sets while sharing one sheet shape.
 * This is the RCU unification of the duplicated dialog chrome, not
 * of the bars themselves.
 *
 * @param title - Localized panel heading.
 * @param open - Controlled open state.
 * @param onOpenChange - Open-state setter from the parent.
 * @param children - The filter bar to render inside the sheet.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X, SlidersHorizontal } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import styles from "../FilterSheet.module.css";

interface Props {
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
}

export default function FilterSheet({ title, open, onOpenChange, children }: Props) {
    const { t } = useI18n();

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className={styles.overlay} data-testid="filter-sheet-overlay" />
                <Dialog.Content
                    className={styles.content}
                    data-testid="filter-sheet"
                    aria-describedby={undefined}
                >
                    <div className={styles.header}>
                        <SlidersHorizontal size={18} className="muted" />
                        <Dialog.Title className={styles.title}>{title}</Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                className={`btn-icon ${styles.closeBtn}`}
                                data-testid="filter-sheet-close"
                                aria-label={t("ui.common.close", "Schließen")}
                            >
                                <X size={18} />
                            </button>
                        </Dialog.Close>
                    </div>

                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
