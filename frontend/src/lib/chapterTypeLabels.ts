import { type ChapterType } from "../api/client";

type TranslateFn = (key: string, fallback?: string) => string;

/**
 * Translated display labels for every {@link ChapterType}.
 *
 * Extracted so the BookEditor and the ChapterSidebar share one map instead of
 * each carrying an identical 26-entry literal (a copy-paste that drifted apart
 * on edits). Call it inside a component with the active `t` so the labels stay
 * reactive to the UI language.
 *
 * @param t - The i18n translate function (`useI18n().t`).
 * @returns A full `ChapterType -> label` record.
 */
export function chapterTypeLabels(t: TranslateFn): Record<ChapterType, string> {
    return {
        chapter: t("ui.chapter_types.chapter", "Kapitel"),
        preface: t("ui.chapter_types.preface", "Vorwort"),
        foreword: t("ui.chapter_types.foreword", "Geleitwort"),
        acknowledgments: t("ui.chapter_types.acknowledgments", "Danksagung"),
        about_author: t("ui.chapter_types.about_author", "Über den Autor"),
        appendix: t("ui.chapter_types.appendix", "Anhang"),
        bibliography: t("ui.chapter_types.bibliography", "Literatur"),
        glossary: t("ui.chapter_types.glossary", "Glossar"),
        epilogue: t("ui.chapter_types.epilogue", "Epilog"),
        imprint: t("ui.chapter_types.imprint", "Impressum"),
        next_in_series: t("ui.chapter_types.next_in_series", "Nächster Band"),
        part: t("ui.chapter_types.part", "Teil"),
        part_intro: t("ui.chapter_types.part_intro", "Teil-Einleitung"),
        interlude: t("ui.chapter_types.interlude", "Interludium"),
        toc: t("ui.chapter_types.toc", "Inhaltsverzeichnis"),
        dedication: t("ui.chapter_types.dedication", "Widmung"),
        prologue: t("ui.chapter_types.prologue", "Prolog"),
        introduction: t("ui.chapter_types.introduction", "Einleitung"),
        afterword: t("ui.chapter_types.afterword", "Nachwort"),
        final_thoughts: t("ui.chapter_types.final_thoughts", "Schlussgedanken"),
        index: t("ui.chapter_types.index", "Stichwortverzeichnis"),
        epigraph: t("ui.chapter_types.epigraph", "Motto"),
        endnotes: t("ui.chapter_types.endnotes", "Endnoten"),
        also_by_author: t("ui.chapter_types.also_by_author", "Weitere Bücher"),
        excerpt: t("ui.chapter_types.excerpt", "Leseprobe"),
        call_to_action: t("ui.chapter_types.call_to_action", "Aufruf zur Aktion"),
    };
}
