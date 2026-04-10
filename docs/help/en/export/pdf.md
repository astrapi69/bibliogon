# PDF Export

PDF export requires Pandoc and a LaTeX distribution (TeX Live or MiKTeX) to be installed on the system. Pandoc converts Markdown to PDF via LaTeX. When using Docker (`make prod`), both are pre-installed in the container.

Bibliogon also supports export to DOCX (Word), HTML, Markdown, and project structure (ZIP). All formats use the same pipeline: TipTap JSON to Markdown to target format via manuscripta and Pandoc.
