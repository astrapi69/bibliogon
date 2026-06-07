import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.models import BookTemplate, BookTemplateChapter
from app.repositories.templates import (
    BookTemplateRepository,
    get_book_template_repository,
)
from app.schemas import BookTemplateCreate, BookTemplateRead, BookTemplateUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[BookTemplateRead])
def list_templates(
    repo: BookTemplateRepository = Depends(get_book_template_repository),
):
    """List all templates, builtin and user-created."""
    return list(repo.list())


@router.get("/{template_id}", response_model=BookTemplateRead)
def get_template(
    template_id: str,
    repo: BookTemplateRepository = Depends(get_book_template_repository),
):
    template = repo.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("", response_model=BookTemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: BookTemplateCreate,
    repo: BookTemplateRepository = Depends(get_book_template_repository),
):
    """Create a user template. ``is_builtin`` is always forced to False."""
    if repo.name_exists(payload.name):
        raise HTTPException(status_code=409, detail="Template name already exists")

    template = BookTemplate(
        name=payload.name,
        description=payload.description,
        genre=payload.genre,
        language=payload.language,
        is_builtin=False,
    )
    for chapter in payload.chapters:
        template.chapters.append(
            BookTemplateChapter(
                position=chapter.position,
                title=chapter.title,
                chapter_type=chapter.chapter_type.value,
                content=chapter.content,
            )
        )
    return repo.add(template)


@router.put("/{template_id}", response_model=BookTemplateRead)
def update_template(
    template_id: str,
    payload: BookTemplateUpdate,
    repo: BookTemplateRepository = Depends(get_book_template_repository),
):
    """Update a user template. Builtin templates are read-only (403)."""
    template = repo.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Builtin templates are read-only")

    data = payload.model_dump(exclude_unset=True)
    chapters = data.pop("chapters", None)
    for key, value in data.items():
        setattr(template, key, value)

    if chapters is not None:
        template.chapters.clear()
        repo.flush()
        for chapter in chapters:
            template.chapters.append(
                BookTemplateChapter(
                    position=chapter["position"],
                    title=chapter["title"],
                    chapter_type=chapter["chapter_type"],
                    content=chapter.get("content"),
                )
            )

    return repo.save(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    repo: BookTemplateRepository = Depends(get_book_template_repository),
):
    """Delete a user template. Builtin templates cannot be deleted (403)."""
    template = repo.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Builtin templates cannot be deleted")

    repo.delete(template)
