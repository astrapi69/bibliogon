/**
 * Browser mirror of `project_asset_importer` + the asset half of
 * `asset_utils` (#736).
 *
 * Decides WHICH files in `assets/` become book assets, what type each one is,
 * and which one ends up as the cover. Like the chapter planner it returns a
 * plan rather than writing anything, so the parity test can compare against
 * what the backend persisted without standing up storage.
 *
 * @example
 * const planned = planAssets(tree);
 * const cover = chooseCoverImage(metadata.cover_image, planned);
 */

import type { ProjectTree } from "./projectFiles";

/**
 * Folder name -> asset type, mirroring the backend map exactly.
 *
 * `author*` folders are their own type rather than figures so the metadata
 * editor's Design tab can show an author portrait apart from chapter
 * illustrations.
 */
const ASSET_TYPE_MAP: Readonly<Record<string, string>> = {
    cover: "cover",
    covers: "cover",
    "back-cover": "cover",
    figures: "figure",
    images: "figure",
    diagrams: "diagram",
    tables: "table",
    logo: "figure",
    author: "author-asset",
    authors: "author-asset",
    "about-author": "author-asset",
    infographics: "figure",
};

/** Extensions the importer treats as images. Anything else under `assets/`
 *  is left alone - a project may legitimately carry fonts or a licence file
 *  there. */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".bmp",
    ".tiff",
]);

/** One planned asset: where to read it and what the backend would call it. */
export interface PlannedAsset {
    /** Path inside the project tree. */
    path: string;
    filename: string;
    asset_type: string;
}

function extensionOf(path: string): string {
    const base = path.split("/").pop() ?? path;
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

function basenameOf(path: string): string {
    return path.split("/").pop() ?? path;
}

/**
 * The asset type a path relative to `assets/` implies.
 *
 * The first folder is the primary signal; a subfolder overrides it when it
 * names a known type, so `figures/diagrams/plan.png` is a diagram rather than
 * a figure. A path with no known folder falls back to `figure`.
 */
export function classifyAssetType(relativePath: string): string {
    const parts = relativePath.split("/").filter(Boolean);
    const folder = (parts[0] ?? "").toLowerCase();
    let assetType = ASSET_TYPE_MAP[folder] ?? "figure";
    if (parts.length > 2) {
        const subfolder = parts[1].toLowerCase();
        if (subfolder in ASSET_TYPE_MAP) assetType = ASSET_TYPE_MAP[subfolder];
    }
    return assetType;
}

/** Every image under `assets/`, with the type its folder implies. */
export function planAssets(tree: ProjectTree): PlannedAsset[] {
    return tree
        .under("assets")
        .filter((path) => IMAGE_EXTENSIONS.has(extensionOf(path)))
        .map((path) => ({
            path,
            filename: basenameOf(path),
            asset_type: classifyAssetType(path.slice("assets/".length)),
        }));
}

/**
 * The book's `cover_image`, chosen the way the backend chooses it.
 *
 * 1. A metadata value whose basename matches an imported asset stays - the
 *    common case for a Bibliogon-native export.
 * 2. Otherwise the first cover-typed asset. A write-book-template project
 *    often names a translated or renamed cover path in `metadata.yaml` that
 *    no longer matches the file in `assets/covers/`, and before the backend
 *    validated step 1 those imports ended up with a dead cover URL and no
 *    visible cover on the dashboard.
 * 3. Otherwise the first asset whose filename contains "cover".
 * 4. Otherwise the metadata value as it stands, stale or not - which is what
 *    the backend leaves too when a project declares a cover it did not ship.
 *
 * The SELECTION is the backend's; the PATH SHAPE is the client's. The backend
 * stores an absolute uploads path because it serves the file from disk; the
 * browser has no such path and its own cover upload writes
 * `assets/covers/<filename>`, which is what `useAssetUrl` resolves through the
 * storage seam. So the parity test compares the chosen FILENAME, which is the
 * decision, not the string, which is a deployment detail.
 */
export function chooseCoverImage(
    metadataCover: string | null,
    planned: readonly PlannedAsset[],
): string | null {
    const filenames = new Set(planned.map((asset) => asset.filename));
    if (metadataCover && filenames.has(basenameOf(metadataCover))) return metadataCover;

    const byName = [...planned].sort((a, b) => a.filename.localeCompare(b.filename));
    const coverTyped = byName.find((asset) => asset.asset_type === "cover");
    if (coverTyped) return `assets/covers/${coverTyped.filename}`;

    const named = byName.find((asset) => asset.filename.toLowerCase().includes("cover"));
    if (named) return `assets/covers/${named.filename}`;

    return metadataCover;
}
