/**
 * Shared loading indicator — animated lucide ``Loader2`` icon
 * with optional label, ``aria-busy``, and two display modes
 * (inline vs block).
 *
 * Replaces the previous ad-hoc per-page "Laden..." paragraphs +
 * the scattered ``Loader2 className="spin"`` callsites that
 * relied on a globally-undefined ``.spin`` class. Filed by
 * LOADING-INDICATOR-EXTRACT-01 (audit G4-F2).
 *
 * The spinner uses the global ``@keyframes spin`` + ``.spin``
 * class defined in ``frontend/src/styles/global.css``. Direct
 * Loader2 usage inside other buttons can keep using
 * ``className="spin"`` directly; this component is the
 * standardised wrapper for the "this whole pane is loading"
 * and "inline labelled loader" cases.
 */

import React from "react";
import {Loader2} from "lucide-react";
import styles from "./LoadingIndicator.module.css";

export interface LoadingIndicatorProps {
    /** Optional label rendered next to the spinner. String for the
     *  default ``<p class="label">``, JSX for custom layout. */
    label?: React.ReactNode;
    /** Inline (default) places spinner + label in a horizontal
     *  row; block centers them in a column with vertical padding
     *  for full-pane loading. */
    variant?: "inline" | "block";
    /** Icon size (pixels). Default 16 for inline, 32 for block. */
    size?: number;
    /** Optional ``data-testid`` for the wrapper. */
    testId?: string;
    /** Optional className additive to the variant's root styles. */
    className?: string;
}

export function LoadingIndicator({
    label,
    variant = "inline",
    size,
    testId,
    className,
}: LoadingIndicatorProps) {
    const iconSize = size ?? (variant === "block" ? 32 : 16);
    const variantClass = variant === "block" ? styles.block : styles.root;
    const rootClass = className ? `${variantClass} ${className}` : variantClass;
    return (
        <div
            data-testid={testId}
            className={rootClass}
            role="status"
            aria-busy="true"
            aria-live="polite"
        >
            <Loader2 size={iconSize} className="spin" aria-hidden="true" />
            {label !== undefined && label !== null && label !== ""
                ? typeof label === "string"
                    ? <p className={styles.label}>{label}</p>
                    : label
                : null}
        </div>
    );
}
