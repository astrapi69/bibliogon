/**
 * Non-dismissible preview/test-version warning banner (#642).
 *
 * Rendered at the top of the app shell on every page. Visible only when the
 * build is the preview/test deploy (`getBuildInfo().isPreview`, set by
 * VITE_IS_PREVIEW=true in deploy-preview.yml); production and local builds
 * resolve to false, so the banner stays off there. Build-info is static, so
 * the banner works identically online and offline (Dexie/PWA mode).
 *
 * Tailwind-first; colours come from the theme `--warning*` tokens so the
 * amber styling holds across all 6 palettes (light + dark).
 */

import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { getBuildInfo } from "../../lib/buildInfo";

export default function PreviewBanner() {
  const { t } = useI18n();
  if (!getBuildInfo().isPreview) return null;

  return (
    <div
      role="status"
      data-testid="preview-banner"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-2 text-center text-sm text-[var(--warning-dark)]"
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        <AlertTriangle size={16} aria-hidden />
        {t("ui.preview_banner.title", "Vorschau-/Testversion")}
      </span>
      <span>
        {t(
          "ui.preview_banner.message",
          "Du verwendest eine Vorschau-/Testversion. Sie ist nicht stabil und kann Fehler enthalten.",
        )}
      </span>
    </div>
  );
}
