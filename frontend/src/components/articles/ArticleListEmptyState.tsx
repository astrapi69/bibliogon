import { FileText, Plus, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../../hooks/useI18n";
import { EmptyState } from "../../lib/components/EmptyState";

/** Empty-state shown when the article list has zero articles. Offers a
 *  primary "new article" CTA plus a get-started link. */
export default function ArticleListEmptyState({ onCreate }: { onCreate: () => void }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    return (
        <EmptyState
            testId="article-list-empty"
            icon={<FileText size={32} className="muted" />}
            title={t("ui.articles.empty_heading", "Noch keine Artikel")}
            body={t(
                "ui.articles.empty_subtitle",
                "Erstelle deinen ersten Artikel, um lange Beiträge separat von Büchern zu verfassen.",
            )}
            actions={
                <>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onCreate}
                        data-testid="article-list-empty-cta"
                    >
                        <Plus size={14} />
                        {t("ui.articles.new", "Neuer Artikel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate("/get-started")}
                        data-testid="article-list-empty-get-started"
                    >
                        <Rocket size={14} />
                        {t("ui.get_started.title", "Erste Schritte")}
                    </button>
                </>
            }
        />
    );
}
