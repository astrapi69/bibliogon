/**
 * The rules-for-AI header blocks of a `.biblio.yaml` template (#745).
 *
 * A byte-for-byte mirror of `backend/app/ai/template_headers.py`. These are
 * not decoration: in the external-roundtrip workflow - the user pastes the
 * file into Claude.ai or ChatGPT and pastes the filled result back - this
 * header is the ONLY instruction the assistant sees. A port that
 * paraphrases it breaks the workflow the format exists for, so
 * `aiTemplate.parity.test.ts` compares it against the recorded response
 * character for character rather than checking that it looks similar.
 *
 * @example
 * const file = BOOK_HEADER + "\n" + yamlBody;
 */

/** The template schema version, mirroring `SCHEMA_VERSION`. */
export const SCHEMA_VERSION = 1;

const RULES_BLOCK = `# RULES FOR AI ASSISTANTS:
#
# 1. Fill ONLY the \`current_value\` keys. Do not modify the
#    \`description\` or \`example\` keys - they are documentation
#    for you to read, not output to produce.
# 2. If \`current_value\` already has a value, leave it alone
#    unless the user explicitly asks for re-generation.
# 3. Return valid YAML. No commentary outside YAML comments.
# 4. Use real UTF-8 characters (ä ö ü ß umlauts, accents,
#    CJK characters). Do NOT escape them and do NOT substitute
#    ASCII transliterations like 'ae' for 'ä' or 'ss' for 'ß'.
# 5. Respond in the article's language. If \`reference.language\`
#    is set, use that. If only \`language\` at root is set (empty
#    new-idea template), use that. Default to English if
#    neither is present.
# 6. If you cannot generate a field with high confidence,
#    leave its \`current_value\` null. Do not invent.
# 7. Do not change \`type\`, \`schema_version\`, \`reference\`, or
#    \`language\` at root. They are file metadata, not content.`;

export const ARTICLE_HEADER = `# ============================================================
# Bibliogon Article Template (schema v${SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Article and the
# metadata fields you can fill in for it.
#
${RULES_BLOCK}
#
# ============================================================
`;

export const BOOK_HEADER = `# ============================================================
# Bibliogon Book Template (schema v${SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Book and the
# metadata fields you can fill in for it.
#
${RULES_BLOCK}
#
# Note for Books: the \`chapter_summaries\` field is a list of
# objects, one per existing chapter. Match summaries to
# chapters by \`chapter_id\` (preferred) or \`title\`. Do not add
# new chapter entries; only fill the \`summary\` field of
# existing ones.
#
# ============================================================
`;
