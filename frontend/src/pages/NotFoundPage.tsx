import { Link } from "react-router-dom";
import { useI18n } from "../hooks/useI18n";

/**
 * Catch-all 404 surface for unknown in-app routes.
 *
 * GitHub Pages bounces unknown deep-links through `public/404.html`
 * (`?redirect=` → main.tsx restores the route), so a mistyped or stale
 * URL still reaches the React Router. Without a catch-all the router
 * rendered nothing (blank screen); this page gives the user a clear
 * "not found" message plus a route home. Fully offline — no `/api`.
 */
export default function NotFoundPage() {
    const { t } = useI18n();
    return (
        <div
            className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
            data-testid="not-found-page"
        >
            <p className="text-6xl font-bold text-muted">404</p>
            <h1 className="text-xl font-semibold">
                {t("ui.not_found.title", "Seite nicht gefunden")}
            </h1>
            <p className="max-w-md text-muted">
                {t(
                    "ui.not_found.description",
                    "Die angeforderte Seite existiert nicht oder wurde verschoben.",
                )}
            </p>
            <Link
                to="/"
                className="btn btn-primary"
                data-testid="not-found-home-link"
            >
                {t("ui.not_found.back_home", "Zurück zum Dashboard")}
            </Link>
        </div>
    );
}
