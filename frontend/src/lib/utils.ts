import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

/**
 * Merge class names, resolving conflicting Tailwind utilities so the
 * last one wins (the shadcn/ui convention). ``clsx`` flattens the
 * conditional/array inputs; ``twMerge`` dedupes Tailwind conflicts
 * (e.g. ``px-2 px-4`` -> ``px-4``).
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
