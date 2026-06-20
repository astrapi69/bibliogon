/**
 * Deterministic gradient placeholder for books and articles without
 * a cover image. Hash of the title picks the hue; the same title
 * always renders the same colour pair so a user's mental map of
 * "blue book" stays stable across reloads.
 *
 * Used in two surfaces:
 * - Grid card body when ``cover_image`` is absent (full 2:3 tile).
 * - List row thumbnail (compact). The ``compact`` prop scales the
 *   typography so the title still reads at 40x60.
 */
import { useMemo } from "react";

interface Props {
    title: string;
    subtitle?: string | null;
    /** Compact mode for list-view thumbnails. Smaller font, no
     *  subtitle, fixed aspect-ratio applied via CSS so the parent
     *  table cell can size to taste. */
    compact?: boolean;
    "data-testid"?: string;
}

/** 32-bit string hash. Stable across browsers + devices: same input
 *  -> same output forever. Used to pick the gradient hue so a book's
 *  placeholder stays visually identical between sessions. */
function hashHue(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 360;
}

export default function CoverPlaceholder({
    title,
    subtitle,
    compact,
    "data-testid": testId,
}: Props) {
    const hue = useMemo(() => hashHue(title), [title]);

    const style: React.CSSProperties = {
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 32%) 0%, hsl(${(hue + 35) % 360}, 60%, 48%) 100%)`,
        color: "white",
        textShadow: "0 2px 4px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: compact ? "0.25rem" : "1rem",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
    };

    const titleStyle: React.CSSProperties = {
        fontSize: compact ? "0.55rem" : "1.1rem",
        fontWeight: 700,
        margin: 0,
        lineHeight: compact ? 1.1 : 1.2,
        wordBreak: "break-word",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: compact ? 3 : 4,
        WebkitBoxOrient: "vertical" as const,
    };

    return (
        <div
            role="img"
            aria-label={title}
            style={style}
            data-testid={testId ?? "cover-placeholder"}
            data-hue={hue}
        >
            <div>
                <h3 style={titleStyle}>{title}</h3>
                {subtitle && !compact ? (
                    <p style={{ fontSize: "0.85rem", margin: "0.4rem 0 0 0", opacity: 0.9 }}>
                        {subtitle}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
