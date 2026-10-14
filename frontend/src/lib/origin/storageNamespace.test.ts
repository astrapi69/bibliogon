/**
 * #991: the preview deploy must not share IndexedDB with production.
 *
 * `__IS_PREVIEW__` resolves to false under Vitest, which is the
 * production-build branch - so `storageDbName` is pinned here against the
 * name production must keep, and the preview branch is covered through
 * the pure function underneath it.
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_DB_SUFFIX, namespacedDbName, storageDbName } from "./storageNamespace";

describe("namespacedDbName", () => {
    it("leaves the name alone outside the preview build", () => {
        expect(namespacedDbName("bibliogon-offline", false)).toBe("bibliogon-offline");
    });

    it("suffixes the name in the preview build", () => {
        expect(namespacedDbName("bibliogon-offline", true)).toBe("bibliogon-offline-preview");
    });

    it("keeps the three databases distinct from each other in the preview", () => {
        const names = ["bibliogon", "bibliogon-offline", "bibliogon-backup-history"].map(
            (name) => namespacedDbName(name, true),
        );
        expect(new Set(names).size).toBe(3);
    });

    it("exposes the suffix so a migration or a cleanup can find the preview stores", () => {
        expect(PREVIEW_DB_SUFFIX).toBe("-preview");
    });
});

describe("storageDbName", () => {
    it("returns the unsuffixed production name in a non-preview build", () => {
        // Renaming a production database orphans every existing install's
        // books - this assertion is what stops that from happening by
        // accident.
        expect(storageDbName("bibliogon-offline")).toBe("bibliogon-offline");
        expect(storageDbName("bibliogon")).toBe("bibliogon");
        expect(storageDbName("bibliogon-backup-history")).toBe("bibliogon-backup-history");
    });
});
