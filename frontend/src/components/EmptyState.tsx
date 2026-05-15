/**
 * Shared empty-state UX block — icon + optional title + optional
 * body + optional row of actions (buttons).
 *
 * Replaces the previous ad-hoc per-page empty-state divs across
 * Dashboard, ArticleList, CoverUpload (filed by EMPTYSTATE-EXTRACT-01,
 * audit G1-F3). Use this for any "no results", "empty list",
 * "first-run" surface.
 *
 * The component is intentionally minimal: it accepts ReactNode for
 * each slot so callers stay in control of the icon (size, color),
 * heading level (h2/h3/p/etc. by passing a JSX element), and the
 * specific action buttons. The shared piece is the layout + spacing
 * + the testid contract.
 *
 * Per-callsite testid hygiene: callers pass a stable ``testId``
 * (e.g. ``article-list-empty``); per-action testids belong on the
 * action buttons themselves, not on EmptyState.
 */

import React from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
    /** Optional icon node. Caller controls size + color. */
    icon?: React.ReactNode;
    /** Optional heading — string renders as ``<p class="title">``,
     *  or pass a JSX element to control heading level + classes. */
    title?: React.ReactNode;
    /** Optional body text — string renders as ``<p class="body">``,
     *  or pass JSX for richer content. */
    body?: React.ReactNode;
    /** Optional row of action buttons. Rendered as a flex row with
     *  gap. Each button needs its own testid; EmptyState only owns
     *  the wrapping div. */
    actions?: React.ReactNode;
    /** Optional ``data-testid`` for the wrapper. */
    testId?: string;
    /** Optional className for the wrapper (additive to the
     *  EmptyState styles). Used by pages that need to extend
     *  spacing / sizing per surface. */
    className?: string;
}

export function EmptyState({
    icon,
    title,
    body,
    actions,
    testId,
    className,
}: EmptyStateProps) {
    const rootClass = className ? `${styles.root} ${className}` : styles.root;
    return (
        <div data-testid={testId} className={rootClass}>
            {icon}
            {title !== undefined && title !== null && title !== ""
                ? typeof title === "string"
                    ? <p className={styles.title}>{title}</p>
                    : title
                : null}
            {body !== undefined && body !== null && body !== ""
                ? typeof body === "string"
                    ? <p className={styles.body}>{body}</p>
                    : body
                : null}
            {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
    );
}
