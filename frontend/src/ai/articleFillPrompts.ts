/**
 * Article aiFill prompts + field-class registry (offline AI 1b).
 *
 * A TypeScript port of `backend/app/ai/article_template_prompts.py` and the
 * field-class registry in `backend/app/routers/article_ai_fill.py`, adapted to
 * request a JSON object instead of a YAML fragment (the browser has no YAML
 * parser; see templateApply.ts).
 *
 * Offline scope: all five of the backend's field-classes. `image_prompts`
 * was omitted until #1077 because its `featured_image_prompt` /
 * `inline_image_prompts` columns were not on the frontend Article shape and
 * no PATCH accepted them - #1076 fixed both, so the class works through the
 * storage seam like the other four.
 */

import type { AiChatMessage } from "./llmClient";
import type { FillClassSpec } from "./fillTypes";

/** Minimal article shape the prompt builders read. */
export interface ArticlePromptInput {
  title: string;
  subtitle?: string | null;
  topic?: string | null;
  author?: string | null;
  language: string;
}

/** Maximum body excerpt length passed to the LLM. Mirrors the backend
 *  `_BODY_EXCERPT_LIMIT`. */
const BODY_EXCERPT_LIMIT = 1500;

function formatHeader(article: ArticlePromptInput): string {
  const lines = [`Article title: ${article.title}`];
  if (article.subtitle) lines.push(`Subtitle: ${article.subtitle}`);
  if (article.topic) lines.push(`Topic: ${article.topic}`);
  if (article.author) lines.push(`Author: ${article.author}`);
  lines.push(`Language: ${article.language}`);
  return lines.join("\n");
}

function excerpt(body: string): string {
  return body.slice(0, BODY_EXCERPT_LIMIT);
}

function systemPrompt(article: ArticlePromptInput): string {
  return `You are filling metadata fields for an article in a Bibliogon AI template. Follow these rules:

1. Respond with a JSON object ONLY. No prose, no markdown fences, no commentary outside the JSON.
2. Respond in the article's language: ${article.language}. All generated text (titles, descriptions, tags) must be in that language. Image prompts can stay in English (image generators are most reliable with English prompts).
3. Use real UTF-8 characters (umlauts, accents, CJK characters). Do NOT escape them and do NOT substitute ASCII transliterations.
4. If you cannot generate a field with high confidence, set it to null. Do not invent.
5. Output ONLY the fields requested in the user message; do not echo unrelated fields.`;
}

function userPrefix(article: ArticlePromptInput, body: string): string {
  return `${formatHeader(article)}

Article body (excerpt):
${excerpt(body)}`;
}

function messages(article: ArticlePromptInput, user: string): AiChatMessage[] {
  return [
    { role: "system", content: systemPrompt(article) },
    { role: "user", content: user },
  ];
}

function buildSeoMessages(article: ArticlePromptInput, body: string): AiChatMessage[] {
  return messages(
    article,
    `${userPrefix(article, body)}

Generate the article's SEO metadata. Output exactly this JSON shape and nothing else:

{"seo_title": "<max 60 chars, front-loaded keyword>", "seo_description": "<150-160 chars, value proposition + soft call-to-action>"}`,
  );
}

function buildTagsMessages(article: ArticlePromptInput, body: string): AiChatMessage[] {
  return messages(
    article,
    `${userPrefix(article, body)}

Generate 5-10 tags for this article. Each tag is single-word or hyphenated, lowercase, in the article's language. Output exactly this JSON shape:

{"tags": ["tag-1", "tag-2", "tag-3"]}`,
  );
}

function buildTopicMessages(article: ArticlePromptInput, body: string): AiChatMessage[] {
  return messages(
    article,
    `${userPrefix(article, body)}

Identify the article's primary topic. One word or a short phrase (max 4 words). Output exactly this JSON shape:

{"topic": "<primary topic>"}`,
  );
}

function buildExcerptMessages(article: ArticlePromptInput, body: string): AiChatMessage[] {
  return messages(
    article,
    `${userPrefix(article, body)}

Generate a short conversational excerpt for this article, shown on article lists and social-media-share previews. Length 200-300 characters. More conversational than an SEO description; should hook the reader. Output exactly this JSON shape:

{"excerpt": "<200-300 character conversational summary>"}`,
  );
}

/**
 * Prompts for the hero image and one illustration per body section.
 *
 * `inlineCount` mirrors the backend's heuristic default of 3, clamped to
 * 1..5 the same way; the field-class dialog can override it.
 */
function buildImagePromptsMessages(
  article: ArticlePromptInput,
  body: string,
  inlineCount = 3,
): AiChatMessage[] {
  const count = Math.max(1, Math.min(inlineCount, 5));
  return messages(
    article,
    `${userPrefix(article, body)}

Generate Stable-Diffusion-style image prompts for this article. Image prompts may stay in English even when the article language differs - image generators are most reliable with English prompts.

Each prompt should include:
- style hint (photorealistic, illustration, abstract)
- composition + subject
- mood + lighting
- "no text in image" when appropriate

Output exactly this JSON shape, with ${count} entries in inline_image_prompts:

{"featured_image_prompt": "<hero image prompt, evokes the article's main theme>", "inline_image_prompts": [{"section_hint": "<short label, where this illustration goes>", "prompt": "<SD-style prompt>"}]}`,
  );
}

/** The article field-classes, all five of them since #1077. */
export const ARTICLE_FILL_CLASSES: Record<string, FillClassSpec<ArticlePromptInput>> = {
  seo: {
    buildMessages: buildSeoMessages,
    targets: [
      { aiKey: "seo_title", column: "seo_title", isList: false },
      { aiKey: "seo_description", column: "seo_description", isList: false },
    ],
  },
  tags: {
    buildMessages: buildTagsMessages,
    targets: [{ aiKey: "tags", column: "tags", isList: true }],
  },
  topic: {
    buildMessages: buildTopicMessages,
    targets: [{ aiKey: "topic", column: "topic", isList: false }],
  },
  excerpt: {
    buildMessages: buildExcerptMessages,
    targets: [{ aiKey: "excerpt", column: "excerpt", isList: false }],
  },
  image_prompts: {
    buildMessages: buildImagePromptsMessages,
    targets: [
      {
        aiKey: "featured_image_prompt",
        column: "featured_image_prompt",
        isList: false,
      },
      {
        aiKey: "inline_image_prompts",
        column: "inline_image_prompts",
        isList: true,
      },
    ],
  },
};

/** Field-class names supported offline, in display order. */
export const ARTICLE_OFFLINE_FILL_CLASSES = Object.keys(ARTICLE_FILL_CLASSES);
