# Content types

Bibliogon supports 8 content types so you can capture every long-form
writing shape in the right structure. The type is picked at creation
and can be changed any time in the ArticleEditor.

## The 8 types

| Type | When to use | Extra fields |
|---|---|---|
| **Blog post** | The default for short to medium-length posts | — |
| **Tutorial** | Step-by-step guides | Difficulty level, prerequisites, estimated duration |
| **Review** | Critiques of works (book, product, film …) | Reviewed work, creator, rating 1-5 |
| **Essay** | Longer reflective prose | — |
| **Newsletter** | Recurring posts with issue numbers | Issue number, send date |
| **Interview** | Conversations with other people | Partner name + role |
| **Listicle** | List-based posts (Top 10, 5 tips …) | — |
| **Short story** | Short, self-contained narratives | — |

## Creating with a type

On the article dashboard, click the arrow to the right of the
**New Article** button. A menu shows every type except the default
(Blog post). Picking a type creates a new article of that type
directly.

A plain click on **New Article** creates a blog post — the most
common choice, so it skips the menu round-trip.

## Changing the type later

In the ArticleEditor, the right-hand sidebar shows an **Article
type** dropdown right under the Status field. Switching the type
resets the type-specific fields (e.g. changing from Tutorial to
Review clears the tutorial fields and reveals the review fields).

## Type-specific fields

Tutorial, Review, Newsletter and Interview each have additional
fields that appear under the type dropdown in the **Type-specific
fields** section. The values are stored in the JSON `article_metadata`
column and will be usable for platform publishing (KDP, Medium,
Substack …) in future versions.

## Dashboard display

Every article card (grid view) and list row (list view) shows a
small badge with the type's icon and label. You can see at a glance
which articles are tutorials, reviews, etc. without opening the
editor.
