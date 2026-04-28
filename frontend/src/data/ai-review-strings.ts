/**
 * Non-prose warning + rotating status messages for the async AI review
 * panel. Strings live here (NOT in i18n YAML) because they render in
 * the BOOK's language, not the UI's language - the review output uses
 * the book's language, and a mismatched status message reads wrong.
 *
 * See docs/explorations/ai-review-extension.md 3.11 and 3.14.
 */

export type ReviewStringKey = "non_prose_warning" | "status_preparing" | "status_analyzing" | "status_generating"

type StringsByLang = Record<string, Record<ReviewStringKey, string>>

const STRINGS: StringsByLang = {
  de: {
    non_prose_warning:
      "Dieser Abschnitt ist kein typischer Prosa-Text. Das Review könnte eingeschraenkt sein.",
    status_preparing: "Review wird vorbereitet...",
    status_analyzing: "Text wird analysiert...",
    status_generating: "Bericht wird erstellt...",
  },
  en: {
    non_prose_warning:
      "This section is not typical prose. Review feedback may be limited.",
    status_preparing: "Preparing review...",
    status_analyzing: "Analyzing text...",
    status_generating: "Generating report...",
  },
  es: {
    non_prose_warning:
      "Esta seccion no es prosa tipica. Los comentarios del review pueden ser limitados.",
    status_preparing: "Preparando la revision...",
    status_analyzing: "Analizando el texto...",
    status_generating: "Generando el informe...",
  },
  fr: {
    non_prose_warning:
      "Cette section n'est pas de la prose typique. Les commentaires peuvent etre limites.",
    status_preparing: "Preparation de la revue...",
    status_analyzing: "Analyse du texte...",
    status_generating: "Generation du rapport...",
  },
  el: {
    non_prose_warning:
      "Αυτή η ενότητα δεν είναι τυπικός πεζός λόγος. Τα σχόλια μπορεί να είναι περιορισμένα.",
    status_preparing: "Προετοιμασία ανασκόπησης...",
    status_analyzing: "Ανάλυση κειμένου...",
    status_generating: "Δημιουργία αναφοράς...",
  },
  pt: {
    non_prose_warning:
      "Esta secao nao e prosa tipica. Os comentarios do review podem ser limitados.",
    status_preparing: "Preparando a revisao...",
    status_analyzing: "Analisando o texto...",
    status_generating: "Gerando o relatorio...",
  },
  tr: {
    non_prose_warning:
      "Bu bolum tipik bir nesir degildir. Inceleme geribildirimi sinirli olabilir.",
    status_preparing: "Inceleme hazirlaniyor...",
    status_analyzing: "Metin analiz ediliyor...",
    status_generating: "Rapor olusturuluyor...",
  },
  ja: {
    non_prose_warning:
      "このセクションは通常の散文ではありません。レビューのフィードバックは限定的になる場合があります。",
    status_preparing: "レビューを準備しています...",
    status_analyzing: "テキストを分析しています...",
    status_generating: "レポートを生成しています...",
  },
}

export function reviewString(lang: string, key: ReviewStringKey): string {
  const bucket = STRINGS[lang] ?? STRINGS.en
  return bucket[key]
}

// Non-prose chapter types. Mirrors the backend NON_PROSE_TYPES set in
// backend/app/ai/prompts.py. Kept in sync manually; the backend
// exposes GET /api/ai/review/meta for authoritative lookup when a
// fresh copy is worth the request.
export const NON_PROSE_CHAPTER_TYPES: ReadonlySet<string> = new Set([
  "title_page",
  "copyright",
  "toc",
  "imprint",
  "index",
  "half_title",
  "also_by_author",
  "next_in_series",
  "call_to_action",
  "endnotes",
  "bibliography",
  "glossary",
])
