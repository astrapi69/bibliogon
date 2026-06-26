/**
 * Settings > About > "Die App teilen" section (#643).
 *
 * Lets the user share the app via QR code + link for two targets: the stable
 * production build and the preview/test build (with a non-stable warning).
 * QR codes are generated entirely client-side (qrcode.react), so the section
 * works offline (Dexie/PWA mode) — unlike LAN mode's backend-rendered QR.
 *
 * Tailwind-first; colours come from theme tokens so the styling holds across
 * all 6 palettes (light + dark).
 */

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Copy, QrCode, Share2 } from "lucide-react";
import { copyToClipboard } from "../../utils/platform/clipboard";
import { notify } from "../../utils/platform/notify";

type T = (key: string, fallback: string) => string;

/** Shareable app URLs. Centralized so the QR/link/copy targets stay in one
 *  place rather than being duplicated across the component. */
export const SHARE_URLS = {
  production: "https://astrapi69.github.io/bibliogon/",
  preview: "https://astrapi69.github.io/bibliogon-preview/",
} as const;

const sectionStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid var(--border, #ddd)",
  borderRadius: 8,
  backgroundColor: "var(--surface-2, #fafafa)",
};

export function ShareAppSection({ t }: { t: T }) {
  return (
    <article data-testid="about-share-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.share_heading", "Die App teilen")}
      </h3>
      <div className="flex flex-col gap-4">
        <ShareTarget
          t={t}
          testIdPrefix="share-production"
          title={t("ui.about.share_production_heading", "Hauptversion (stabil)")}
          description={t(
            "ui.about.share_production_description",
            "Teile die stabile App per QR-Code, damit andere sie öffnen können.",
          )}
          url={SHARE_URLS.production}
        />
        <hr className="border-0 border-t border-[var(--border)]" />
        <ShareTarget
          t={t}
          testIdPrefix="share-preview"
          title={t("ui.about.share_preview_heading", "Latest-Version (Test)")}
          description={t(
            "ui.about.share_preview_description",
            "Dies ist eine Vorschau-/Testversion. Sie ist nicht stabil und kann Fehler enthalten. Teile sie nur mit Testern.",
          )}
          url={SHARE_URLS.preview}
          warning
        />
      </div>
    </article>
  );
}

function ShareTarget({
  t,
  testIdPrefix,
  title,
  description,
  url,
  warning,
}: {
  t: T;
  testIdPrefix: string;
  title: string;
  description: string;
  url: string;
  warning?: boolean;
}) {
  const [showQr, setShowQr] = useState(false);

  const handleOpen = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      notify.success(t("ui.about.share_copied", "Link kopiert!"));
    } else {
      notify.warning(
        t("ui.about.share_copy_failed", "Link konnte nicht kopiert werden."),
      );
    }
  };

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleShare = async () => {
    try {
      await navigator.share({
        title: "Bibliogon",
        text: t(
          "ui.about.share_text",
          "Open-Source-Plattform für Autoren",
        ),
        url,
      });
    } catch {
      // User-cancelled or unsupported — no error surface needed.
    }
  };

  return (
    <div data-testid={`${testIdPrefix}-block`} className="flex flex-col gap-2">
      <strong>{title}</strong>
      <p
        data-testid={warning ? `${testIdPrefix}-warning` : undefined}
        className={
          warning
            ? "m-0 text-sm text-[var(--warning-dark)]"
            : "m-0 text-sm text-[var(--text-muted)]"
        }
      >
        {description}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          data-testid={`${testIdPrefix}-qr-toggle`}
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
        >
          <QrCode size={16} aria-hidden />
          {showQr
            ? t("ui.about.share_qr_hide", "QR-Code verbergen")
            : t("ui.about.share_qr_show", "QR-Code anzeigen")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid={`${testIdPrefix}-open`}
          onClick={handleOpen}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
        >
          <ExternalLink size={16} aria-hidden />
          {t("ui.about.share_open", "Link öffnen")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid={`${testIdPrefix}-copy`}
          onClick={handleCopy}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
        >
          <Copy size={16} aria-hidden />
          {t("ui.about.share_copy", "Link kopieren")}
        </button>
        {canShare ? (
          <button
            type="button"
            className="btn btn-secondary"
            data-testid={`${testIdPrefix}-share`}
            onClick={handleShare}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
          >
            <Share2 size={16} aria-hidden />
            {t("ui.about.share_native", "Teilen")}
          </button>
        ) : null}
      </div>

      {showQr ? (
        <div
          data-testid={`${testIdPrefix}-qr`}
          className="rounded-[8px] bg-white p-3"
          style={{ width: "fit-content" }}
        >
          <QRCodeSVG value={url} size={180} level="M" />
        </div>
      ) : null}

      <code
        data-testid={`${testIdPrefix}-url`}
        className="text-xs text-[var(--text-muted)]"
        style={{ wordBreak: "break-all" }}
      >
        {url}
      </code>
    </div>
  );
}
