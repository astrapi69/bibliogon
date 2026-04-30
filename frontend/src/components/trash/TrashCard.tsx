/**
 * Shared trash-grid card. Renders title + optional sub-line(s) +
 * a Restore + Permanent-Delete button pair. Used by both books-
 * trash (Dashboard.tsx) and articles-trash (ArticleList.tsx) so
 * the two dashboards render identical cards.
 *
 * The component is structural only; consumers pass labels and
 * test-ids so existing testid contracts (`trash-card-${id}`,
 * `trash-restore-${id}`, `trash-delete-permanent-${id}`,
 * `article-trash-card-${id}`, `article-trash-restore-${id}`,
 * `article-trash-permanent-${id}`) survive without breaking
 * smoke tests.
 *
 * Pilot of the T-01 inline-styles refactor.
 */
import { ReactNode } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import styles from "./TrashCard.module.css";

interface Props {
    title: string;
    subtitle?: string | null;
    /** Optional second meta line (e.g. trashed-at timestamp). */
    meta?: ReactNode;
    onRestore: () => void;
    onPermanentDelete: () => void;
    /** Translation strings; consumers pass them so this component
     *  stays i18n-agnostic and can be used from any page. */
    restoreLabel: string;
    deletePermanentLabel: string;
    /** Test-id contract for the outer card + the two buttons.
     *  Consumers pass scoped ids (e.g. ``trash-card-${id}``) so
     *  existing smoke tests keep working unchanged. */
    cardTestId: string;
    restoreTestId: string;
    permanentTestId: string;
}

export default function TrashCard({
    title,
    subtitle,
    meta,
    onRestore,
    onPermanentDelete,
    restoreLabel,
    deletePermanentLabel,
    cardTestId,
    restoreTestId,
    permanentTestId,
}: Props) {
    return (
        <div data-testid={cardTestId} className={styles.card}>
            <div className={styles.body}>
                <strong className={styles.title}>{title}</strong>
                {subtitle ? <p className={styles.meta}>{subtitle}</p> : null}
                {meta ? <p className={styles.metaSmall}>{meta}</p> : null}
            </div>
            <div className={styles.actions}>
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onRestore}
                    data-testid={restoreTestId}
                    title={restoreLabel}
                >
                    <RotateCcw size={12} />
                    {restoreLabel}
                </button>
                <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={onPermanentDelete}
                    data-testid={permanentTestId}
                    title={deletePermanentLabel}
                >
                    <Trash2 size={12} />
                    {deletePermanentLabel}
                </button>
            </div>
        </div>
    );
}
