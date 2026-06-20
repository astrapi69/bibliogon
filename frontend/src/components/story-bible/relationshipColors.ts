/** Relationship-type colour + ordering shared by the Story Bible
 *  relationship editor (StoryEntityEditor) and the Arc View
 *  relationship lines (StoryboardArcView) — STORY-BIBLE C10.
 *
 *  These are user-facing colour DATA (a fixed legend mapping each
 *  relationship type to a line/badge colour), not theme styling — the
 *  same exemption class as the Storyboard mood palette + the Story
 *  Bible per-entity-type accent colours. The file is allowlisted in
 *  ``scripts/check_hardcoded_colors.py``. Mid-tones chosen to read on
 *  both light and dark surfaces. */
import type {RelationshipType} from "../../api/client"

/** Canonical ordering for the type selector + legend (matches the
 *  backend ``RelationshipType`` Literal order). */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
    "ally",
    "rival",
    "family",
    "mentor",
    "romantic",
    "neutral",
] as const

/** Per the C10 spec: ally=green, rival=red, family=blue,
 *  mentor=purple, romantic=pink, neutral=grey. */
export const RELATIONSHIP_COLORS: Record<RelationshipType, string> = {
    ally: "#2E7D32",
    rival: "#C62828",
    family: "#1565C0",
    mentor: "#6A1B9A",
    romantic: "#AD1457",
    neutral: "#616161",
}

export function relationshipColor(type: string): string {
    return RELATIONSHIP_COLORS[type as RelationshipType] ?? RELATIONSHIP_COLORS.neutral
}
