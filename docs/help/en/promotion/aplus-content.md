# A+ Content

A+ Content is the extended product copy Amazon shows below the book description: text modules with images. Bibliogon builds a ready package for it from the book data, which you carry over into KDP.

You find it in the book's metadata editor under **Publishing > A+ Content**.

## What the package contains

- **Short description**, at most 300 characters.
- **Three bullet points**, each with a heading and a body.
- **Header module** with title, text, image prompt and alt text.
- **Three-image module** with the same fields per image.

Every field has a copy button. A bullet point is copied as "Heading: body". The image prompts are fully worded, including image size and aspect ratio, and paste straight into an image tool.

## Requirements

- AI is set up (Settings > AI Assistant). Without it, **Generate** stays disabled and the section says why.
- The book has an **author** and at least one description: Description, Amazon Description, or Backpage Description.

When something is missing, Bibliogon does not call the AI at all. The section lists the missing fields instead; **Go to field** jumps to the section where you fill them in.

## Language

Packages exist for German, English, French and Spanish. The book's language is preselected; for any other book language, English. Each language has its own package, and switching loads it.

## Generate and regenerate

**Generate** builds the package and stores it. The next time you open the section it is shown again without a new AI call. **Regenerate** always builds it fresh, even when the book data has not changed.

## Validation

After generation every field is checked against a fixed ruleset, independent of which AI wrote the text. Among other things it checks lengths, emoji, dashes, invisible characters, marketing imperatives such as "Discover", price and shipping claims, third-party brand names, and words that do not fit the genre.

Findings are listed above the package: an **Error** must be fixed before you use the text, a **Note** is a recommendation.

## Desktop app only

Generation and validation run in the backend. In the web app the section therefore shows a notice and makes no request.
