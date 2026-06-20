/**
 * Maps a Story Bible entity type to a lucide icon
 * (STORY-BIBLE-PLUGIN-01 Session 2). The icon NAME comes from the
 * SSoT (story-bible-entities.yaml ``icon`` field) so nothing here
 * is the source of truth — this only resolves the name string to a
 * concrete lucide component, with a type-based fallback and a final
 * generic fallback so an unknown/new type still renders. C7 layers
 * per-type color coding on top of this mapping.
 */

import {
    BookMarked,
    Box,
    type LucideIcon,
    MapPin,
    Milestone,
    Package,
    User,
} from "lucide-react";

/** SSoT ``icon`` string -> component. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
    User,
    MapPin,
    Milestone,
    Package,
    BookMarked,
};

/** Fallback by entity-type id when the SSoT icon name is unknown. */
const ICON_BY_TYPE: Record<string, LucideIcon> = {
    character: User,
    setting: MapPin,
    plot_point: Milestone,
    item: Package,
    lore: BookMarked,
};

export function entityTypeIcon(typeId: string, iconName?: string): LucideIcon {
    if (iconName && ICON_BY_NAME[iconName]) return ICON_BY_NAME[iconName];
    return ICON_BY_TYPE[typeId] ?? Box;
}

/**
 * Per-entity-type accent color (C7). Subtle, distinct mid-tones used
 * only as a decorative icon tint in the sidebar group headers + the
 * detail-view type badge. Mid-tones are chosen to stay legible on
 * both the light and dark sidebar backgrounds. These are data values
 * (like the Storyboard mood presets), so storyBibleIcons.ts is
 * allowlisted in scripts/check_hardcoded_colors.py.
 */
const COLOR_BY_TYPE: Record<string, string> = {
    character: "#c2703d", // terracotta
    setting: "#3d8a5f", // green
    plot_point: "#7a5cc2", // violet
    item: "#c2a13d", // amber
    lore: "#3d72c2", // blue
};

const DEFAULT_ENTITY_COLOR = "#6b7280"; // neutral slate fallback

export function entityTypeColor(typeId: string): string {
    return COLOR_BY_TYPE[typeId] ?? DEFAULT_ENTITY_COLOR;
}
