import {useI18n} from "../hooks/useI18n";

/**
 * Skip-to-content link — first focusable element on every page so
 * keyboard users can bypass the header / navigation chrome and jump
 * straight to the page's main content. WCAG 2.1 SC 2.4.1 "Bypass
 * Blocks". Visually hidden via `.skip-link` in global.css until
 * focused.
 *
 * Every routed page must render a `<main id="main-content">`
 * landmark so the anchor resolves.
 */
export default function SkipToContentLink() {
    const {t} = useI18n();
    return (
        <a className="skip-link" href="#main-content" data-testid="skip-to-content-link">
            {t("ui.a11y.skip_to_content", "Skip to main content")}
        </a>
    );
}
