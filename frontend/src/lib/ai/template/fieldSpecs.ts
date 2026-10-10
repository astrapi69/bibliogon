/**
 * The per-field documentation a `.biblio.yaml` carries (#745).
 *
 * A mirror of `_article_field_specs` / `_book_field_specs` in
 * `backend/app/ai/template_factories.py`. The text is not decoration: in
 * the external-roundtrip workflow the file is the only thing the
 * assistant sees, so a `description` that drifts from the backend's
 * changes what a browser-exported template asks for versus a
 * server-exported one.
 *
 * So these constants were lifted out of the recorded endpoint response
 * rather than retyped, and `aiTemplate.parity.test.ts` compares every
 * one of them against that record character for character. Editing a
 * string here without the backend turns the parity test red, which is
 * the intended cost. Long values are written as concatenations only to
 * keep the line width; the joined result is the recorded string.
 *
 * `current_value` is absent on purpose: a spec describes a field, a
 * factory fills it. See `factories.ts`.
 *
 * @example
 * const spec = BOOK_FIELD_SPECS.title;  // {description, example}
 */

/** Documentation for one fillable field, without its value. */
export interface TemplateFieldSpec {
    description: string;
    example: unknown;
}

export const BOOK_FIELD_SPECS: Record<string, TemplateFieldSpec> = {
    title: {
        description:
            "The book's main title. Should be memorable, genre-appropriate, and " +
            "discoverable in search.",
        example: "The Last Cartographer",
    },
    subtitle: {
        description:
            "Optional subtitle. Often used for non-fiction to specify the topic or " +
            "angle; for fiction, sometimes a tagline.",
        example: "A Practical Guide to Map-Making in the Age of GPS",
    },
    description: {
        description:
            "Short plain-text book description (1-2 paragraphs). Used internally; the " +
            "Amazon HTML description is generated separately.",
        example:
            "A field guide for the modern cartographer, drawing on fifteen years of " +
            "experience mapping urban wildlife corridors.",
    },
    genre: {
        description:
            "Primary genre. Single word or short phrase. Used for marketplace " +
            "categorization.",
        example: "Non-Fiction / Reference",
    },
    keywords: {
        description:
            "5-10 keywords, single-word or hyphenated, lowercase. Used for SEO and " +
            "marketplace search.",
        example: [
            "cartography",
            "field-guide",
            "urban-wildlife",
            "map-making",
            "non-fiction",
        ],
    },
    html_description: {
        description:
            "Amazon-style HTML book description. Allowed tags: b, i, br, p, h2, ul, " +
            "li. Hook in the first paragraph; benefits as a list; soft call-to-action " +
            "at the end. Around 200-300 words.",
        example:
            "<p><b>How do you map what doesn't want to be mapped?</b></p><p>The Last " +
            "Cartographer follows fifteen years of fieldwork tracking wildlife " +
            "through urban environments...</p>",
    },
    backpage_description: {
        description:
            "Back-cover blurb. 100-200 words. Hook -> conflict -> stakes. No " +
            "spoilers.",
        example:
            "When the city decided to pave over the last green corridor, Marta took " +
            "her notebooks and went looking for what was about to disappear...",
    },
    backpage_author_bio: {
        description:
            "Short author bio for the back cover. 50-100 words. Third person. " +
            "Credentials + a personal note.",
        example:
            "Marta Rivers is a field biologist and amateur cartographer based in " +
            "Lisbon. She has been mapping urban wildlife corridors for over fifteen " +
            "years...",
    },
    cover_image_prompt: {
        description:
            "Stable-Diffusion-style prompt for the book cover. Specify mood, color " +
            "palette, dominant subject. Book covers are usually portrait orientation " +
            "(6x9 inches). Add 'no text in image' when appropriate (text is overlaid " +
            "separately).",
        example:
            "Hand-drawn vintage map of a city park overlaid with faint wildlife " +
            "tracks, muted earth-tones, parchment texture, portrait composition, soft " +
            "natural lighting, no text in image",
    },
    chapter_summaries: {
        description:
            "One-sentence summary per chapter, used for marketing copy and the " +
            "table-of-contents page. Each entry has {chapter_id, title, summary}. " +
            "Match summaries to chapters by chapter_id (preferred) or title; do NOT " +
            "add entries for chapters not in the list.",
        example: [
            {
                chapter_id: "abc123",
                title: "The First Survey",
                summary: "Marta arrives in Lisbon and lays out the methodology for the survey.",
            },
        ],
    },
};

export const ARTICLE_FIELD_SPECS: Record<string, TemplateFieldSpec> = {
    title: {
        description:
            "The article's main title. Should be specific, capture interest, and " +
            "accurately reflect content.",
        example: "Fake News: A Threat to Society",
    },
    seo_title: {
        description:
            "Search-engine-optimized title, maximum 60 characters. Front-load the " +
            "primary keyword. Often identical to the main title, but can differ for " +
            "SEO reasons.",
        example: "Fake News and Misinformation: Society's Modern Threat",
    },
    seo_description: {
        description:
            "Meta-description shown in search results. 150-160 characters. Describe " +
            "the value proposition with a subtle call-to-action.",
        example:
            "Discover how fake news shapes public opinion and learn five practical " +
            "strategies to identify misinformation. Essential reading for media " +
            "literacy.",
    },
    excerpt: {
        description:
            "Short summary (200-300 characters) shown on article lists and as " +
            "social-media-share preview. More conversational than the SEO " +
            "description.",
        example:
            "Fake news isn't just an internet problem - it shapes elections, public " +
            "health responses, and the basic trust that holds societies together. " +
            "Here's what's really at stake.",
    },
    tags: {
        description:
            "5-10 tags, single-word or hyphenated, lowercase. Reflects the topics " +
            "covered. Used for search and grouping.",
        example: [
            "misinformation",
            "media-literacy",
            "fact-checking",
            "social-media",
            "public-discourse",
        ],
    },
    topic: {
        description:
            "Single primary topic (one word or short phrase). Bibliogon uses this to " +
            "group articles by theme.",
        example: "Media Literacy",
    },
    featured_image_prompt: {
        description:
            "Stable-Diffusion-style prompt for the article's hero image. Include " +
            "style hint (photorealistic, illustration, abstract), composition, mood, " +
            "and lighting. Add 'no text in image' when appropriate.",
        example:
            "A close-up photograph of a person reading a newspaper with the headline " +
            "blurred, modern realistic photography style, cool blue lighting " +
            "suggesting an analytical mood, slight depth of field, no text in image",
    },
    inline_image_prompts: {
        description:
            "Prompts for illustrations within the article body, one per major section " +
            "(typically h2-headed). Each entry has {section_hint, prompt}. The " +
            "section_hint is a short label telling the AI where the illustration " +
            "goes; the prompt is the actual image-generation prompt.",
        example: [
            {
                section_hint: "Introduction - the problem",
                prompt:
                    "Multiple newspaper headlines overlapping, some crumpled, mixed with " +
                    "smartphone screens showing social media notifications, dramatic shadow " +
                    "lighting, editorial photo style, no text",
            },
            {
                section_hint: "Spread mechanism",
                prompt:
                    "Abstract network visualization with red nodes pulsing outward, dark " +
                    "background, suggesting viral misinformation spread, generative-art " +
                    "style, no text",
            },
        ],
    },
};
