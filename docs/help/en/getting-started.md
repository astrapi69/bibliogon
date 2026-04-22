# Getting Started

## Installation

Bibliogon installs in two ways. For local development, clone the repository and run `make install`. That command installs both the Python dependencies (via Poetry) and the frontend packages (via npm) and sets up all bundled plugins. Alternatively, a Docker setup is available: `make prod` runs the application in a container on port 7880 without requiring Python or Node.js on your machine.

PDF export needs Pandoc. Pandoc is a separate command-line tool that can be downloaded from [pandoc.org](https://pandoc.org/installing.html). EPUB export works without Pandoc because manuscripta handles that conversion itself.

## First start

After installing, `make dev` launches two parallel processes: the FastAPI backend on port 8000 and the React frontend on port 5173. Once both are running, open a browser at `http://localhost:5173`. You land on the Dashboard, the central overview of all your books.

On first launch the database is empty. Bibliogon uses SQLite as a local database; all data lives on your machine, no external server is required. From Settings you can change language and theme. Six themes (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) are available, each with light and dark variants - see the Themes page for details.

## Dashboard: filter, sort, trash

As the book collection grows, the Dashboard offers search, filter and sort controls above the book grid. You can search by title, author, genre or language, filter by genre and language, and sort by date, title or author in either direction.

![Dashboard filter and sort controls](../assets/screenshots/dashboard-filter-sort.png)

Deleted books go to the Trash (soft delete). The Trash view lists them with three actions: **Restore** puts a book back in the library, **Delete permanently** removes the book and its files immediately, **Empty trash** clears everything at once. Books in the Trash are automatically deleted after 90 days; the timer can be configured in Settings.

![Trash view with Restore, Delete permanently, Empty trash](../assets/screenshots/dashboard-trash.png)

## Creating your first book

On the Dashboard, click "New Book". A two-step dialog opens: in the first step you enter title and author; in the second (expandable via "More details") you can fill in optional fields such as genre, subtitle, language, and series. Only title and author are required.

After creating the book, you are sent straight to the editor. The sidebar lets you add chapters. Each chapter has a title and a chapter type (e.g. Chapter, Foreword, Afterword, Glossary). Chapter order is changeable by drag-and-drop in the sidebar. Just start writing - the editor saves your changes automatically.

## Importing existing projects

If you already have a book project in write-book-template format, you can import it directly. On the Dashboard, click "Import Project" and select the corresponding ZIP file. Bibliogon reads the chapter structure, metadata (title, author, ISBN, language) and assets (images, cover) automatically and creates the book with everything intact.

Backups can be restored the same way. A backup (.bgb file) contains the entire state of all books. From the Dashboard you export the current state via "Backup" and restore it via "Restore".
