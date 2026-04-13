# AI Assistant

Bibliogon includes an optional AI assistant that helps with writing, editing, and marketing. It supports multiple AI providers and works with both cloud services and local models.

## Setting up

1. Open **Settings > General > AI Assistant**
2. Check **Enable AI features**
3. Select your provider (Anthropic, OpenAI, Google Gemini, Mistral, or LM Studio)
4. Enter your API key (not needed for LM Studio)
5. Click **Test connection** to verify

On first launch, a setup wizard guides you through these steps.

The AI assistant is disabled by default. Your text is only sent to the AI provider when you explicitly use an AI feature. Nothing is sent in the background.

## Providers

| Provider | Requires API key | Notes |
|----------|-----------------|-------|
| Anthropic (Claude) | Yes | High-quality writing assistance |
| OpenAI (GPT) | Yes | Widely available |
| Google (Gemini) | Yes | Free tier available |
| Mistral | Yes | European provider |
| LM Studio | No | Runs locally on your computer, fully offline |

LM Studio is ideal if you want AI assistance without sending your text to a cloud service.

## Text suggestions

In the editor, select some text, then click the AI button in the toolbar. Four modes are available:

- **Improve** - fix grammar, improve clarity and flow
- **Shorten** - make the text more concise
- **Expand** - add more detail and description
- **Custom** - enter your own instruction

The AI returns a suggestion. Click **Accept** to replace your selection, or **Discard** to keep the original.

The AI adapts its suggestions to your book's genre and language.

## Chapter review

Click the **Review** tab in the AI panel. The AI analyzes your entire chapter and provides structured feedback:

- **Summary** - one sentence about the chapter's content
- **Strengths** - what works well, with specific references
- **Suggestions** - concrete improvements with explanations
- **Overall** - a brief assessment

The review considers your book's genre and provides genre-appropriate feedback (e.g. pacing feedback for thrillers, clarity feedback for non-fiction).

## Marketing text

In **Book Metadata > Marketing**, each text field has a small AI button:

- **Book description (Amazon)** - generates an HTML blurb for online stores
- **Back cover text** - concise text for the printed back cover
- **Author bio** - short biography in third person
- **Keywords** - search terms for Amazon KDP

The AI uses your book title, author name, genre, description, and chapter titles to generate relevant text. You can edit the result before saving.

## Usage tracking

Bibliogon tracks how many AI tokens each book uses. The current count and estimated cost range are shown in the Marketing tab. This helps you understand your AI usage and costs.

## Privacy

- AI features are off by default
- Your text is only sent when you click an AI button
- Nothing is sent in the background
- The API key is stored locally, never shared
- LM Studio keeps everything on your computer
