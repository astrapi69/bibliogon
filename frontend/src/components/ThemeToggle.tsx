import {Moon, Sun} from "lucide-react";
import {useTheme} from "../hooks/useTheme";

interface Props {
    variant?: "light" | "dark";
}

export default function ThemeToggle({variant}: Props) {
    const {theme, toggle} = useTheme();
    const isDark = theme === "dark";

    const color = variant === "dark"
        ? "var(--text-sidebar)"
        : "var(--text-secondary)";

    return (
        <button
            onClick={toggle}
            title={isDark ? "Light Mode" : "Dark Mode"}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                border: "none",
                background: "transparent",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color,
                transition: "all 150ms",
            }}
        >
            {isDark ? <Sun size={18}/> : <Moon size={18}/>}
        </button>
    );
}
