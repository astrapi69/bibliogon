/**
 * Footer with the two legal links (Impressum, Datenschutzerklärung),
 * rendered under every route so the pages are one click away from any
 * screen of the public web app (#876). The targets are static HTML files
 * outside the SPA (see `lib/utils/legalPages.ts`), opened in the same tab.
 */

import { useI18n } from "../../hooks/useI18n";
import { legalPageHref } from "../../lib/utils/legalPages";

const LINK_CLASS =
  "inline-flex min-h-11 items-center px-2 underline-offset-2 hover:underline";

export function LegalFooter() {
  const { t, lang } = useI18n();
  return (
    <footer
      data-testid="legal-footer"
      className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-1 text-xs text-muted-foreground [html.composition-mode_&]:hidden"
    >
      <a
        href={legalPageHref("imprint", lang)}
        data-testid="legal-footer-imprint"
        className={LINK_CLASS}
      >
        {t("ui.about.imprint_link", "Impressum")}
      </a>
      <span aria-hidden>·</span>
      <a
        href={legalPageHref("privacy", lang)}
        data-testid="legal-footer-privacy"
        className={LINK_CLASS}
      >
        {t("ui.about.privacy_link", "Datenschutzerklärung")}
      </a>
    </footer>
  );
}

export default LegalFooter;
