import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Flat ESLint config for the frontend (Issue #48). Initial baseline:
 * correctness + security findings are errors; the high-churn stylistic /
 * type rules start as warnings and are tightened in later sessions.
 * Prettier owns formatting (eslint-config-prettier last disables any
 * formatting rules, so ESLint and Prettier never fight).
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      "node_modules/**",
      "src/storage/seed/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    rules: {
      // TypeScript (tsc, already clean) handles undefined identifiers;
      // core no-undef only produces false positives on TS/DOM/SW globals.
      "no-undef": "off",
      // Tightened over time; warnings for now so the baseline is non-blocking.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // High false-positive rate (flags every computed property access);
      // off by default, the targeted security rules below stay on.
      "security/detect-object-injection": "off",
    },
  },
  eslintConfigPrettier,
);
