import { useParams, useNavigate } from "react-router-dom";
import ChapterVersionsView from "../components/ChapterVersionsView";
import { PageLayout } from "../components/PageLayout";
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
