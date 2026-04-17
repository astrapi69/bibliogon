import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChapterTemplate
from app.schemas import (
    ChapterTemplateCreate,
    ChapterTemplateRead,
    ChapterTemplateUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chapter-templates", tags=["chapter-templates"])


@router.get("", response_model=list[ChapterTemplateRead])
def list_chapter_templates(db: Session = Depends(get_db)):
    """List all chapter templates, builtin and user-created."""
    return (
        db.query(ChapterTemplate)
        .order_by(ChapterTemplate.is_builtin.desc(), ChapterTemplate.name)
        .all()
    )


@router.get("/{template_id}", response_model=ChapterTemplateRead)
def get_chapter_template(template_id: str, db: Session = Depends(get_db)):
    template = (
        db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    return template


@router.post("", response_model=ChapterTemplateRead, status_code=status.HTTP_201_CREATED)
def create_chapter_template(
    payload: ChapterTemplateCreate, db: Session = Depends(get_db)
):
    """Create a user chapter template. ``is_builtin`` is forced to False."""
    if (
        db.query(ChapterTemplate)
        .filter(ChapterTemplate.name == payload.name)
        .first()
    ):
        raise HTTPException(status_code=409, detail="Chapter template name already exists")

    template = ChapterTemplate(
        name=payload.name,
        description=payload.description,
        chapter_type=payload.chapter_type.value,
        content=payload.content,
        language=payload.language,
        is_builtin=False,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=ChapterTemplateRead)
def update_chapter_template(
    template_id: str, payload: ChapterTemplateUpdate, db: Session = Depends(get_db)
):
    """Update a user chapter template. Builtin templates are read-only (403)."""
    template = (
        db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Builtin chapter templates are read-only")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "chapter_type" and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter_template(template_id: str, db: Session = Depends(get_db)):
    """Delete a user chapter template. Builtin templates return 403."""
    template = (
        db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    if template.is_builtin:
        raise HTTPException(
            status_code=403, detail="Builtin chapter templates cannot be deleted"
        )

    db.delete(template)
    db.commit()
