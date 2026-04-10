import {HelpCircle} from "lucide-react";
import {useHelp} from "../../contexts/HelpContext";
import {useI18n} from "../../hooks/useI18n";

/**
 * Small help icon that opens the help panel on a specific page.
 *
 * Usage: ``<HelpLink slug="export/epub" />`` next to the EPUB export
 * button opens the help panel directly on the EPUB docs page.
 */
export default function HelpLink({slug, size = 14}: {slug: string; size?: number}) {
    const {openHelp} = useHelp();
    const {t} = useI18n();

    return (
        <button
            type="button"
            onClick={() => openHelp(slug)}
            className="btn-icon"
            title={t("ui.help.open", "Hilfe oeffnen")}
            style={{opacity: 0.5, padding: 2}}
        >
            <HelpCircle size={size}/>
        </button>
    );
}
