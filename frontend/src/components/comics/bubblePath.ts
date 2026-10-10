/**
 * Moved to ``lib/comics/bubblePath.ts`` so the client-side comic PDF can
 * read the bubble geometry without reaching into ``components/`` (#742).
 * Re-exported here for the call sites that still import it from this path.
 */

export * from "../../lib/comics/bubblePath";
