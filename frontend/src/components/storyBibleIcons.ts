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
