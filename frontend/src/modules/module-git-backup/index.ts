/**
 * module-git-backup — desktop-only counterpart of `plugin-git-sync`'s backup path.
 *
 * NOT available offline (Maximal Offline, #34). Committing/pushing a book to a
 * Git remote needs a real `git` binary plus filesystem access, neither of which
 * a browser provides. The surface is gated by feature-strategy
 * (`FEATURES.GIT_BACKUP` → `disabled`, reason `requires_desktop_app`): it stays
 * visible and explained, never silently hidden.
 *
 * This module intentionally has no browser implementation; it exists so the
 * plugin-parity map is complete and the gate's rationale has a home.
 */
export const OFFLINE_AVAILABLE = false as const;
