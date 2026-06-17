/**
 * Editor status bar (#307): a compact, always-visible footer showing the
 * current word count, estimated reading time and character count.
 *
 * App-agnostic — no app imports, no i18n hook. Labels are passed in (English
 * defaults) so the component can be reused by any editor. Responsive: only
 * the word count shows on narrow viewports; reading time + character count
 * appear from the `sm` breakpoint up. An optional `children` slot lets a host
 * append extra status content (e.g. a writing-goal progress bar).
 */

import type { ReactNode } from "react";

/** Localizable suffix labels (English defaults keep the component standalone). */
export interface EditorStatusBarLabels {
  words: string;
  readingTime: string;
  characters: string;
}

const DEFAULT_LABELS: EditorStatusBarLabels = {
  words: "words",
  readingTime: "min read",
  characters: "characters",
};

interface EditorStatusBarProps {
  wordCount: number;
  readingTimeMin: number;
  charCount: number;
  labels?: Partial<EditorStatusBarLabels>;
  className?: string;
  /** Extra status content appended after the counts (e.g. a goal bar). */
  children?: ReactNode;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

/** Render the compact editor status bar. */
export default function EditorStatusBar({
  wordCount,
  readingTimeMin,
  charCount,
  labels,
  className,
  children,
}: EditorStatusBarProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className ?? ""}`}
      style={{ color: "var(--text-muted)" }}
      data-testid="editor-status-bar"
    >
      <span data-testid="status-words">
        {fmt(wordCount)} {l.words}
      </span>
      <span className="hidden sm:inline" data-testid="status-reading-time">
        · {readingTimeMin} {l.readingTime}
      </span>
      <span className="hidden sm:inline" data-testid="status-chars">
        · {fmt(charCount)} {l.characters}
      </span>
      {children}
    </div>
  );
}
