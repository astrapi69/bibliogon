/**
 * ARTICLE-TYPES-SSOT-01 C7 (2026-05-29). Small badge surfacing
 * the article's content_type (blogpost / tutorial / review / essay
 * / newsletter) with the registry's icon + i18n label.
 *
 * Used in ArticleCard (grid view) + ArticleRow (list view) so the
 * user can tell at a glance what type each article is without
 * opening the editor.
 */

import type {CSSProperties} from "react";

import {ArticleTypeIcon} from "../../utils/articleTypeIcon";
import {useArticleTypes, articleTypeLabelKey, articleTypeIcon} from "../../hooks/useArticleTypes";
import {useI18n} from "../../hooks/useI18n";

interface Props {
    contentType: string;
    testId?: string;
    /** Caller-controlled style — usually flex layout overrides
     *  inside the parent's footer row. */
    style?: CSSProperties;
    /** Caller-controlled className for theme-aware coloring. */
    className?: string;
    /** Icon size; defaults to 12 to match the surrounding
     *  status / language / date badges. */
    iconSize?: number;
}

export function ArticleTypeBadge({
    contentType,
    testId,
    style,
    className,
    iconSize = 12,
}: Props) {
    const {t} = useI18n();
    const snapshot = useArticleTypes();
    const labelKey = articleTypeLabelKey(snapshot, contentType);
    const iconName = articleTypeIcon(snapshot, contentType);

    return (
        <span
            data-testid={testId}
            className={className}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                ...style,
            }}
        >
            <ArticleTypeIcon iconName={iconName} size={iconSize} />
            <span>{t(labelKey, contentType)}</span>
        </span>
    );
}

export default ArticleTypeBadge;
