/**
 * System info + Danger-Zone reset API namespace. Extracted from
 * api/platform.ts (#679).
 */
import { request } from "../http";
import type { SystemInfo } from "../client";

export const system = {
  info: () => request<SystemInfo>("/system/info"),

  /** Danger-Zone two-phase reset. Step 1: obtain a 5-min HMAC
   *  token via ``resetPrepare``. Step 2: post the token + the
   *  literal ``"RESET"`` to ``reset`` to execute the wipe. The
   *  backend rejects either step on its own (missing token →
   *  400; wrong confirmation literal → 400). See
   *  ``backend/app/routers/system.py`` for the contract. */
  resetPrepare: () =>
    request<{ token: string; expires_at: number; ttl_seconds: number }>(
      "/system/reset/prepare",
      { method: "POST" },
    ),

  reset: (token: string, confirmation: string) =>
    request<{
      status: string;
      jobs_cancelled: number;
      rows_deleted: number;
      uploads_cleared: boolean;
      tmp_cleared: boolean;
      backup_history_cleared: boolean;
      config_overlays_cleared: number;
      installed_plugins_cleared: number;
      secrets_cleared: boolean;
    }>("/system/reset", {
      method: "POST",
      body: JSON.stringify({ token, confirmation }),
    }),
};
