# Templates

Templates are reusable structures that save you from rebuilding the same skeleton every time you start a new book or chapter. Bibliogon has two kinds:

- **Book templates** pre-fill a new book with a chapter list (title, type, order). Five genres ship with the app: Children's Picture Book, Sci-Fi Novel, Non-Fiction / How-To, Philosophy, and Memoir.
- **Chapter templates** pre-fill a single chapter with a structured outline in TipTap JSON. Four ship with the app: Interview, FAQ, Recipe, Photo Report.

Both kinds distinguish **built-in** templates (ship with Bibliogon, read-only, marked with a lock badge) from **user** templates (saved from your own books or chapters, deletable via a trash icon on the template card).

## Creating a book from a template

1. Click **New Book** on the Dashboard.
2. Switch to the **From template** tab at the top of the dialog.
3. Pick a template card. Each card shows name, genre, description, and chapter count.
4. Fill in title and author. Language and description are pre-filled from the template but can be edited.
5. Click **Create**. The new book opens in the editor with all chapters ready.

Under the hood, `POST /api/books/from-template` creates the book and all its chapters in a single database commit. If any chapter insert fails, the whole book is rolled back.

## Saving a book as a template

1. Open the book in the editor.
2. In the sidebar footer, alongside Metadata, TOC, and Export, click **Save as template**.
3. Enter a name (required, unique) and a description (required). Name is capped at 100 characters, description at 500.
4. Pick **Empty placeholders** (recommended) or **Preserve content**:
   - *Empty placeholders* saves only the structure: titles, types, order. The content field stays empty. Best for reusable blueprints.
   - *Preserve content* copies the full chapter bodies into the template. Best if you want a pattern book with example prose in each chapter.
5. Expand **Preview chapters** if you want to confirm the chapter list before saving.
6. Click **Save**. Your template now appears in the template picker for future **Create from template** flows.

If a template with the same name already exists, the server responds with a 409 and the name field shows an inline error. Pick a different name.

## Creating a chapter from a template

1. In the editor sidebar, click the **+** icon to open the new-chapter dropdown.
2. Select **From template...** at the top of the "Chapter" group.
3. Pick a chapter template card. Each card shows name, chapter type, description, and a built-in lock or user delete button.
4. Click **Insert**. The new chapter is added at the end of the list with the template's title (rename it inline with a double-click), chapter type, and content.

## Saving a chapter as a template

1. Right-click a chapter in the sidebar to open its context menu.
2. Click **Save as template**.
3. Name, description, and content mode (empty placeholder / preserve content) work the same as for book templates. The name is pre-filled from the chapter title; change it if you want a more generic template name.

## Managing user templates

Open the appropriate template picker (book or chapter) and hover over a user template card. A trash icon appears in the card header. Click it, confirm the dialog, and the template is deleted. Built-in templates do not have this icon and cannot be deleted.

Templates are global to your installation. They apply to every book you create or edit. There is no per-book or per-user scoping (Bibliogon is single-user by design).

## Built-in chapter template details

| Template | Default structure |
|----------|-------------------|
| **Interview** | H2 Introduction, H2 Questions (3-item ordered list), H2 Closing |
| **FAQ** | 3 x (H3 Question + paragraph answer) |
| **Recipe** | H2 Ingredients (bullet list), H2 Preparation (ordered list), H2 Notes |
| **Photo Report** | H2 Location, empty paragraph, H2 Impressions, description placeholder, H2 Reflection |

All placeholders are short and meant to be replaced.

## Differences between book and chapter templates

| | Book template | Chapter template |
|--|---------------|------------------|
| Scope | Whole book structure | One chapter |
| Stores | Title, description, genre, language, chapter list | Name, description, chapter type, content |
| Entry point | New Book dialog ("From template" tab) | Sidebar **+** dropdown ("From template..." item) |
| Save trigger | Sidebar footer "Save as template" button | Chapter context menu "Save as template" |
| API prefix | `/api/templates/` | `/api/chapter-templates/` |
