/**
 * App-level "new release available" banner (#477 Phase 2).
 *
 * Wires {@link useUpdateAutoCheck} (background GitHub-Releases check, gated by
 * the `updates` settings) to the presentational {@link UpdateBanner}. Distinct
 * from {@link AppUpdateBanner} (the Service-Worker redeploy banner): this one
 * surfaces a newer *published release* with its notes, and is the only update
 * signal on desktop (API mode, no Service Worker).
 *
 * Actions:
 * - "What's new?" opens a notes modal (react-markdown, 500-char preview +
 *   "read more" link to the release page).
 * - "Update": PWA -> {@link applyUpdate} (skipWaiting + reload); desktop ->
 *   open the release page.
 * - "Later" / X: records `dismissed_version`, so the banner stays hidden until
 *   a strictly newer release ships.
 */

import { useState } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useI18n } from "../../hooks/useI18n";
import { useStorageMode } from "../../storage/useStorageMode";
import { useUpdateAutoCheck } from "../../hooks/ui/useUpdateAutoCheck";
import { applyUpdate } from "../../shared/utils/swUpdateManager";
import { UpdateBanner } from "../../lib/components/UpdateBanner";

const NOTES_PREVIEW_LIMIT = 500;

export default function AppVersionUpdateBanner() {
  const { t } = useI18n();
  const { mode } = useStorageMode();
  const { pending, dismiss } = useUpdateAutoCheck();
  const [showNotes, setShowNotes] = useState(false);

  if (!pending) return null;

  const version = pending.latestVersion;
  const isDesktop = mode === "api";

  const handleUpdate = () => {
    if (isDesktop) {
      if (pending.releaseUrl) {
        window.open(pending.releaseUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      // PWA: skipWaiting + reload onto the freshly-deployed worker.
      applyUpdate();
    }
  };

  const notesPreview = pending.releaseNotes
    ? pending.releaseNotes.slice(0, NOTES_PREVIEW_LIMIT)
    : "";
  const notesTruncated = (pending.releaseNotes?.length ?? 0) > NOTES_PREVIEW_LIMIT;

  return (
    <>
      <UpdateBanner
        message={t(
          "ui.update_banner.version_available",
          "New version {version} available",
        ).replace("{version}", version)}
        buttonLabel={t("ui.about.update_apply_button", "Aktualisieren")}
        onUpdate={handleUpdate}
        onDismiss={dismiss}
        dismissLabel={t("ui.update_banner.later", "Später")}
        secondaryActions={[
          {
            label: t("ui.update_banner.whats_new", "Was ist neu?"),
            onClick: () => setShowNotes(true),
            testId: "version-banner-whats-new",
          },
          {
            label: t("ui.update_banner.later", "Später"),
            onClick: dismiss,
            testId: "version-banner-later",
          },
        ]}
      />
      {showNotes ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("ui.update_banner.notes_title", "What's new in {version}").replace(
            "{version}",
            version,
          )}
          data-testid="version-banner-notes-modal"
          className="fixed inset-0 z-[1100] grid place-items-center bg-black/50 p-4"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-[36rem] flex-col gap-3 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--bg-card)] p-5 text-[var(--text)] shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold">
                {t("ui.update_banner.notes_title", "What's new in {version}").replace(
                  "{version}",
                  version,
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                aria-label={t("ui.update_banner.dismiss", "Schließen")}
                data-testid="version-banner-notes-close"
                className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="text-sm text-[var(--text-muted)]" data-testid="version-banner-notes-body">
              {notesPreview ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{notesPreview}</ReactMarkdown>
              ) : null}
            </div>
            {pending.releaseUrl ? (
              <a
                className="self-start text-[var(--accent)] underline"
                href={pending.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="version-banner-notes-readmore"
              >
                {notesTruncated
                  ? t("ui.about.update_read_more", "Mehr lesen")
                  : t("ui.about.update_open_release", "Release-Seite öffnen")}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
