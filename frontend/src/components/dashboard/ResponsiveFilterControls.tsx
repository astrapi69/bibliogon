/**
 * Responsive filter-controls cluster shared by the Books and Articles
 * dashboards. Renders the inline filter bar on desktop
 * (``hide-mobile``), a "Filter" trigger button on small screens
 * (``show-mobile-only``), and a slide-in filter sheet driven by an
 * internally-owned open-state. Closing #273's AD/BD parity gap: both
 * dashboards previously hand-rolled this same three-part cluster (BD
 * inline, AD missing the sheet entirely).
 *
 * The concrete bar + sheet are passed in so each surface keeps its own
 * hook-bound filter set; this component owns only the shared layout +
 * the open-state plumbing. The ``sheet`` element is cloned with the
 * controlled ``open`` / ``onOpenChange`` props, so callers pass it
 * without wiring the open-state themselves.
 *
 * @param triggerLabel - Localized "Filter" button label.
 * @param bar - The inline desktop filter bar element.
 * @param sheet - The mobile sheet element; receives ``open`` +
 *   ``onOpenChange`` props via cloning.
 */

import { cloneElement, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

interface SheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

interface Props {
    triggerLabel: string;
    bar: ReactNode;
    sheet: ReactElement<SheetProps>;
}

export default function ResponsiveFilterControls({ triggerLabel, bar, sheet }: Props) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="hide-mobile">{bar}</div>
            <button
                className="btn btn-secondary btn-sm show-mobile-only mb-2"
                data-testid="filter-sheet-trigger"
                onClick={() => setOpen(true)}
            >
                <SlidersHorizontal size={14} /> {triggerLabel}
            </button>
            {cloneElement(sheet, { open, onOpenChange: setOpen })}
        </>
    );
}
