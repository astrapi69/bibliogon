/**
 * Translate an article through the user's own AI provider, offline (#751).
 *
 * The online path stays on the backend translation plugin, where the user
 * picks DeepL or LMStudio; neither has a browser path today - DeepL's is a
 * verify-first question still open on #751, LMStudio's is a localhost
 * server the PWA cannot reach. So offline translation runs through the same
 * provider the rest of the app's AI features use, with the user's own key.
 *
 * This wrapper sits outside `lib/` on purpose: it reaches for
 * `getStorage()` and `aiComplete`, which a library-grade module may not.
 * The decisions it orchestrates - what to translate, what to copy, how to
 * put a body back together - all live in `lib/translation/`, pinned
 * against a recording of the Python original.
 *
 * @example
 * const id = await translateArticleWithAi(article, {targetLang: "en"});
 * navigate(`/articles/${id}`);
 */

import { aiComplete } from "../../ai/aiComplete";
import { getStorage } from "../../storage";
import type { Article, ArticleCreate } from "../../api/client";
import {
    buildTranslatedArticle,
    translatableFields,
    type TranslationMap,
} from "../../lib/translation/articleTranslation";
import {
    cleanTranslationReply,
    translationPrompt,
} from "../../lib/translation/translationPrompts";

export interface TranslateArticleProgress {
    /** 1-based index of the piece being translated. */
    done: number;
    total: number;
    /** Which piece: a field name, or `body`. */
    key: string;
}

export interface TranslateArticleWithAiOptions {
    targetLang: string;
    titleSuffix?: string;
    onProgress?: (progress: TranslateArticleProgress) => void;
}

export interface TranslatedArticleResult {
    articleId: string;
    /** Pieces whose provider call failed and kept their source value.
     *  Returned rather than thrown: the article exists and is useful, and
     *  the caller decides how loudly to say so. */
    untranslatedPieces: number;
}

/**
 * Translate one article into a new draft article.
 *
 * One provider call per piece of text, not one call for all of them. A
 * single combined call would be cheaper and is how it is tempting to write
 * this, but it needs the reply split back apart by markers the model has
 * to have preserved - and the whole reason the prompt is as strict as it
 * is, is that models do not reliably preserve structure. One call per
 * piece makes the mapping unambiguous at the cost of five extra short
 * requests; the body, which dominates the cost, is one call either way.
 *
 * A piece whose call fails is left untranslated rather than failing the
 * whole article: `buildTranslatedArticle` keeps the source value, so the
 * user gets an article with one German field instead of no article. A
 * failure that affects everything - no key, provider down - throws on the
 * first call and reaches the caller, which is the right outcome because
 * there is nothing to show.
 */
export async function translateArticleWithAi(
    source: Article,
    options: TranslateArticleWithAiOptions,
): Promise<TranslatedArticleResult> {
    const items = translatableFields(source);
    const translations: TranslationMap = {};
    let failures = 0;

    for (const [index, item] of items.entries()) {
        options.onProgress?.({ done: index + 1, total: items.length, key: item.key });
        const { system, user } = translationPrompt(item.text, {
            targetLang: options.targetLang,
            sourceLang: source.language,
        });
        try {
            const reply = await aiComplete([
                { role: "system", content: system },
                { role: "user", content: user },
            ]);
            const cleaned = cleanTranslationReply(reply.content);
            if (cleaned) translations[item.key] = cleaned;
        } catch (err) {
            // The first call failing is a configuration or provider
            // problem, not a per-field one, and continuing would make
            // five more doomed requests before showing the user the same
            // error. A later one is per-field: keep the source value.
            if (index === 0) throw err;
            failures += 1;
        }
    }

    const draft = buildTranslatedArticle(source, translations, {
        targetLang: options.targetLang,
        titleSuffix: options.titleSuffix,
    });

    const storage = getStorage();
    const created = await storage.articles.create({
        title: draft.title,
        subtitle: draft.subtitle,
        author: draft.author,
        language: draft.language,
        content_type: draft.content_type as ArticleCreate["content_type"],
    });
    // The create schema carries five fields; everything else the backend
    // route sets - body, status, SEO, tags, topic, the canonical URL -
    // goes in the patch, so the two paths produce the same row.
    await storage.articles.update(created.id, {
        content_json: draft.content_json,
        status: draft.status,
        canonical_url: draft.canonical_url,
        featured_image_url: draft.featured_image_url,
        excerpt: draft.excerpt,
        tags: draft.tags,
        topic: draft.topic,
        seo_title: draft.seo_title,
        seo_description: draft.seo_description,
    });
    return { articleId: created.id, untranslatedPieces: failures };
}
