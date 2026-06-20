import WritingHistoryView from "../components/WritingHistoryView";
import { PageLayout } from "../components/PageLayout";
import { useGoBack } from "../hooks/navigation/useGoBack";
import { useI18n } from "../hooks/useI18n";

/**
 * Full-page writing-history surface (Dialog->Pages migration C5).
 * Replaces WritingHistoryModal. The view is global (across all books),
 * so the route is top-level `/writing-history` (not per-book). Back
 * returns to the dashboard where the Writing-Goal widget opens it.
 */
export default function WritingHistoryPage() {
  const { t } = useI18n();
  const goBack = useGoBack("/");

  return (
    <PageLayout
      title={t("ui.writing_stats.title", "Schreibverlauf")}
      testId="writing-history-page"
      maxWidth="lg"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      <WritingHistoryView />
    </PageLayout>
  );
}
