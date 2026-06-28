/**
 * Settings / i18n / editor-plugin-status API namespaces. Extracted from
 * api/platform.ts (#679). Holds the single-flighted app-settings read.
 */
import { request } from "../http";
import { singleFlight } from "../../lib/utils/singleFlight";
import type { DiscoveredPlugin } from "../client";

/**
 * Single-flighted app-settings read. Many components fetch `/settings/app`
 * independently on mount; without dedup that fired ~15 parallel requests per
 * page load. The single-flight collapses the concurrent burst into one request
 * and clears once it settles (no stale value retained across navigations).
 */
const _getAppSettings = singleFlight(() =>
  request<Record<string, unknown>>("/settings/app"),
);

export const i18n = {
  get: (lang: string) =>
    request<Record<string, unknown>>(`/i18n/${encodeURIComponent(lang)}`),
};

export const settings = {
  getApp: () => _getAppSettings(),

  updateApp: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>("/settings/app", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Append a name to the user's author profile. The wizard's
   * AuthorPicker calls this on the "Create new" path when the
   * imported source references an author not yet in Settings.
   * Returns the updated `{name, pen_names}` block. */
  addPenName: (name: string) =>
    request<{ name: string; pen_names: string[] }>(
      "/settings/author/pen-name",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    ),

  listPlugins: () => request<Record<string, unknown>>("/settings/plugins"),

  discoveredPlugins: () =>
    request<DiscoveredPlugin[]>("/settings/plugins/discovered"),

  getPlugin: (name: string) =>
    request<Record<string, unknown>>(`/settings/plugins/${name}`),

  createPlugin: (data: {
    name: string;
    display_name?: string;
    description?: string;
    version?: string;
    license?: string;
    settings?: Record<string, unknown>;
  }) =>
    request<Record<string, unknown>>("/settings/plugins", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deletePlugin: (name: string) =>
    request<{ plugin: string; status: string }>(`/settings/plugins/${name}`, {
      method: "DELETE",
    }),

  updatePlugin: (name: string, settings: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/settings/plugins/${name}`, {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    }),

  enablePlugin: (name: string) =>
    request<{ plugin: string; status: string }>(
      `/settings/plugins/${name}/enable`,
      { method: "POST" },
    ),

  disablePlugin: (name: string) =>
    request<{ plugin: string; status: string }>(
      `/settings/plugins/${name}/disable`,
      { method: "POST" },
    ),
};

export const editorPluginStatus = () =>
  request<
    Record<
      string,
      { available: boolean; reason: string | null; message?: string }
    >
  >("/editor/plugin-status");
