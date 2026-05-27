/**
 * Inline X button for clearing a search/filter text input.
 *
 * Standard UX pattern (Google, VS Code, GitHub) — when a search
 * field has content, an X appears on the right side so the user
 * can clear it without selecting + deleting the text.
 *
 * Rendered ONLY when ``value`` is non-empty. The component places
 * itself with absolute positioning at the right edge; the caller
 * must wrap input + button in a ``position: relative`` container
 * (every existing usage already does so for the leading magnifier
 * icon).
 *
 * Existing precedent inline in ArticleFilterBar pre-RCU; the
 * RECURRING-COMPONENT-UNIFICATION rule fires at 2+ sites — this
 * extraction is the 4-site migration that closes that.
 */

import {X} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

interface Props {
    value: string;
    onClear: () => void;
    "data-testid"?: string;
    /** Optional override for the button class. Defaults to ``btn-icon``. */
    className?: string;
    /** Optional override for the icon size. Defaults to 12. */
    size?: number;
}

export default function SearchClearButton({
    value,
    onClear,
    className = "btn-icon",
    size = 12,
    ...rest
}: Props) {
    const {t} = useI18n();
    if (!value) return null;
    return (
        <button
            type="button"
            className={className}
            aria-label={t("ui.common.clear", "Leeren")}
            onClick={onClear}
            data-testid={rest["data-testid"]}
        >
            <X size={size} />
        </button>
    );
}
