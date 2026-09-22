# A+ Content

A+ Content is the extended product copy Amazon shows below the book description: text modules with images. In Bibliogon you fill it in per book and language and carry it over field by field into KDP's A+ manager.

You find it in the book's metadata editor under **Publishing > A+ Content**. It works in the desktop app, the web app and on a phone; everything is saved automatically.

## Structure

- **Content name**: the name the content has in the A+ manager. Prefilled with "Book title - A+Content".
- **Short description**, at most 300 characters.
- **Three bullet points**, each with a heading (at most 160 characters) and a body (at most 1000 characters).
- **Modules**, in the order they appear on Amazon.

The counters below the fields turn red when a text is too long. It is still saved, so a draft is never lost.

## Module templates

A new document starts with the two standard modules. You add more with the template buttons at the bottom:

- **Standard image header with text**: one image of 970x600 pixels (aspect ratio 97:60).
- **Standard three images & text**: three images of 300x300 pixels each (1:1).

Every module has a **module name** and, per image, a **title**, **text**, **image prompt** and **alt text** (at most 200 characters). The arrows move a module, the bin removes it; if it already holds text, Bibliogon asks first.

## Copying

Every field has a copy button. **Copy all** puts the whole content on the clipboard as text, ordered by name, short description with its character count, bullets, and modules with their image size.

## Language

Each language has its own document. The book's language is preselected; German, English, French and Spanish are always offered too.

## Fill with AI

**Fill with AI** is optional and only available in the desktop app. It needs:

- AI set up (Settings > AI Assistant).
- German, English, French or Spanish as the language.
- An **author** and at least one description on the book: Description, Amazon Description, or Backpage Description.

When something is missing, Bibliogon does not call the AI at all. It lists the missing fields instead; **Go to field** jumps to the section where you fill them in.

The AI writes the short description, the bullets and the two standard modules. The content name, module names and any further modules stay as they are. When the document already holds text, Bibliogon asks before overwriting it.

## Validation

After an AI fill every field is checked against a fixed ruleset. Among other things it checks lengths, emoji, dashes, invisible characters, marketing imperatives such as "Discover", price and shipping claims, third-party brand names, and words that do not fit the genre.

Findings are listed above the editor: an **Error** must be fixed before you use the text, a **Note** is a recommendation.

## Backup

A+ Content is part of the full backup, in the desktop app and the web app alike. The selective export has its own option for it.
