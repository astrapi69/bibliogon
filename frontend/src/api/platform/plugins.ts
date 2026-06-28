/**
 * Plugin-install + license API namespaces. Extracted from
 * api/platform.ts (#679).
 */
import { ApiError } from "../errors";
import { BASE, guardedFetch, request } from "../http";

export const pluginInstall = {
  install: async (
    file: File,
  ): Promise<{
    plugin: string;
    version: string;
    status: string;
    message: string;
    error: string | null;
  }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await guardedFetch(`${BASE}/plugins/install`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(
        res.status,
        err.detail || "Installation fehlgeschlagen",
        `${BASE}/plugins/install`,
        "POST",
        err.stacktrace || "",
      );
    }
    return res.json();
  },

  uninstall: (name: string) =>
    request<{ plugin: string; status: string }>(`/plugins/install/${name}`, {
      method: "DELETE",
    }),

  listInstalled: () =>
    request<
      {
        name: string;
        display_name: string;
        description: string;
        version: string;
        license: string;
        active: boolean;
        path: string;
      }[]
    >("/plugins/installed"),

  manifests: () =>
    request<Record<string, Record<string, unknown>>>("/plugins/manifests"),
};

export const licenses = {
  list: () => request<Record<string, unknown>>("/licenses"),

  activate: (pluginName: string, licenseKey: string) =>
    request<Record<string, unknown>>("/licenses", {
      method: "POST",
      body: JSON.stringify({
        plugin_name: pluginName,
        license_key: licenseKey,
      }),
    }),

  deactivate: (pluginName: string) =>
    request<Record<string, unknown>>(`/licenses/${pluginName}`, {
      method: "DELETE",
    }),
};
