import { useParams, useNavigate } from "react-router-dom";
import { useFeature } from "@astrapi69/feature-strategy-react";
import ChapterVersionsView from "../components/ChapterVersionsView";
import { PageLayout } from "../components/PageLayout";
import { FEATURES } from "../features/featureConfig";
import { useGoBack } from "../hooks/useGoBack";
import { useI18n } from "../hooks/useI18n";

/**
 * Full-page chapter version-history / snapshots surface (Dialog->Pages
 * migration C6) at `/books/:bookId/chapters/:chapterId/snapshots`.
 *
 * Replaces ChapterVersionsModal. After a restore the page navigates back
 * to the editor at `/book/:bookId?chapter=:chapterId` — the editor reads
 * the chapter from the URL (C6 prep), re-mounts, and re-fetches the
 * restored content, so the restore is reflected with the right chapter
 * still selected. Back (and the editor fallback) go to the same place.
 */
export default function ChapterVersionsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { bookId, chapterId } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const editorUrl =
    bookId && chapterId ? `/book/${bookId}?chapter=${chapterId}` : "/";
  const goBack = useGoBack(editorUrl);
  // Chapter snapshots are backend-only; offline (Dexie) this route is not
  // reachable through the UI (the trigger is gated), and a direct deep-link
  // renders nothing rather than firing /api. Mirrors GitSyncPage's guard.
  const versionHistory = useFeature(FEATURES.VERSION_HISTORY);
  if (versionHistory.isHidden) return null;

  return (
    <PageLayout
      title={t("ui.versions.title", "Versionsverlauf")}
      testId="chapter-versions-page"
      maxWidth="md"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      {bookId && chapterId ? (
        <ChapterVersionsView
          bookId={bookId}
          chapterId={chapterId}
          onRestored={(restoredId) =>
            navigate(`/book/${bookId}?chapter=${restoredId}`)
          }
        />
      ) : null}
    </PageLayout>
  );
}
