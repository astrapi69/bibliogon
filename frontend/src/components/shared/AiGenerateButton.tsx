/**
 * Reusable AI-generation icon button. Sparkles icon, swaps to a
 * spinning loader while ``generating`` is true. Disabled state
 * surfaces ``disabledReason`` via the native ``title`` tooltip so
 * users learn why a button is dim before they click.
 *
 * Used by the ArticleEditor SEO + tags fields; meant to extend to
 * future AI-assisted fields (excerpt, topic suggestion, ...) without
 * change.
 */
import { Loader2, Sparkles } from "lucide-react";

interface Props {
    onClick: () => void;
    generating: boolean;
    disabled: boolean;
    /** Tooltip shown on the active state. Speaks the user-visible
     *  contract: what input is read, what gets written. */
    tooltip: string;
    /** Tooltip shown when ``disabled`` is true. Should explain why -
     *  typical case is "article needs content before AI can
     *  generate". */
    disabledReason?: string;
    "data-testid"?: string;
}

export default function AiGenerateButton({
    onClick,
    generating,
    disabled,
    tooltip,
    disabledReason,
    "data-testid": testId,
}: Props) {
    const titleText = disabled ? disabledReason ?? tooltip : tooltip;
    const isDisabled = disabled || generating;

    return (
        <button
            type="button"
            className="btn-icon"
            onClick={(e) => {
                e.stopPropagation();
                if (!isDisabled) onClick();
            }}
            disabled={isDisabled}
            aria-label={tooltip}
            title={titleText}
            data-testid={testId ?? "ai-generate-button"}
            data-generating={generating ? "true" : undefined}
            style={{
                color: "var(--accent)",
                width: 28,
                height: 28,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
            }}
        >
            {generating ? (
                <Loader2
                    size={14}
                    aria-hidden
                    style={{ animation: "spin 1s linear infinite" }}
                />
            ) : (
                <Sparkles size={14} aria-hidden />
            )}
        </button>
    );
}
