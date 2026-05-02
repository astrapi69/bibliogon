import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChapterTemplate, ChapterType
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
    template = db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    return template


@router.post("", response_model=ChapterTemplateRead, status_code=status.HTTP_201_CREATED)
def create_chapter_template(payload: ChapterTemplateCreate, db: Session = Depends(get_db)):
    """Create a user chapter template. ``is_builtin`` is forced to False."""
    if db.query(ChapterTemplate).filter(ChapterTemplate.name == payload.name).first():
        raise HTTPException(status_code=409, detail="Chapter template name already exists")

    child_ids = payload.child_template_ids or []
    _validate_child_ids(db, child_ids)

    template = ChapterTemplate(
        name=payload.name,
        description=payload.description,
        chapter_type=payload.chapter_type.value,
        content=payload.content,
        language=payload.language,
        is_builtin=False,
        child_template_ids=_encode_child_ids(child_ids),
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
    template = db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Builtin chapter templates are read-only")

    fields = payload.model_dump(exclude_unset=True)
    if "child_template_ids" in fields:
        new_children = fields.pop("child_template_ids") or []
        _validate_child_ids(db, new_children, self_id=template.id)
        template.child_template_ids = _encode_child_ids(new_children)
    for key, value in fields.items():
        if key == "chapter_type" and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter_template(template_id: str, db: Session = Depends(get_db)):
    """Delete a user chapter template. Builtin templates return 403."""
    template = db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")
    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Builtin chapter templates cannot be deleted")

    db.delete(template)
    db.commit()


# --- TM-04b: JSON export / import -------------------------------------------

# Export shape - intentionally a plain dict (no Pydantic) so the shape stays
# stable across schema bumps and a future user can edit a downloaded file by
# hand without fighting validators that reject extra keys.

_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _slugify_filename(name: str) -> str:
    slug = _FILENAME_SAFE_RE.sub("-", name).strip("-").lower()
    return slug or "chapter-template"


def _encode_child_ids(child_ids: list[str] | None) -> str | None:
    """JSON-stringify the child id list for storage in a TEXT column."""
    if not child_ids:
        return None
    return json.dumps(child_ids)


def _decode_child_ids(raw: str | None) -> list[str]:
    """Decode the JSON-stringified child id list (empty list on null)."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def _validate_child_ids(
    db: Session,
    child_ids: list[str],
    *,
    self_id: str | None = None,
) -> None:
    """Reject self-reference, missing ids, and reference cycles.

    The cycle check is a depth-first walk over already-stored
    children, so an attempt to set ``A -> [B]`` when ``B -> [A]`` is
    rejected before the new state is committed.
    """
    if self_id is not None and self_id in child_ids:
        raise HTTPException(
            status_code=400,
            detail="A chapter template cannot reference itself.",
        )
    if not child_ids:
        return

    found = (
        db.query(ChapterTemplate.id)
        .filter(ChapterTemplate.id.in_(child_ids))
        .all()
    )
    found_ids = {row[0] for row in found}
    missing = [cid for cid in child_ids if cid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown child template id(s): {', '.join(missing)}",
        )

    # Cycle check: walk down each child's already-stored child list
    # and bail if the path returns to ``self_id``.
    if self_id is not None:
        stack = list(child_ids)
        seen: set[str] = set()
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            row = (
                db.query(ChapterTemplate.child_template_ids)
                .filter(ChapterTemplate.id == current)
                .first()
            )
            if row is None:
                continue
            grand = _decode_child_ids(row[0])
            if self_id in grand:
                raise HTTPException(
                    status_code=400,
                    detail="Cycle detected in child_template_ids.",
                )
            stack.extend(grand)


@router.get("/{template_id}/export")
def export_chapter_template(template_id: str, db: Session = Depends(get_db)):
    """Download a chapter template as a portable JSON file.

    Both builtin and user templates can be exported - the downloaded file is
    plain content; ``is_builtin`` is intentionally NOT serialised so a re-
    imported file always lands as a user template.
    """
    template = db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Chapter template not found")

    payload = {
        "format": "bibliogon-chapter-template",
        "format_version": "1.0",
        "name": template.name,
        "description": template.description,
        "chapter_type": template.chapter_type,
        "content": template.content,
        "language": template.language,
        # TM-04b sub-item 3: groups carry their child id list. Single-
        # chapter templates serialise the empty list so the importer
        # path stays uniform.
        "child_template_ids": _decode_child_ids(template.child_template_ids),
    }
    filename = f"{_slugify_filename(template.name)}.chapter-template.json"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return JSONResponse(content=payload, headers=headers)


@router.post(
    "/import",
    response_model=ChapterTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def import_chapter_template(file: UploadFile, db: Session = Depends(get_db)):
    """Create a chapter template from a previously-exported JSON file.

    The uploaded file MUST carry ``format: "bibliogon-chapter-template"``
    plus the four template fields (``name``, ``description``,
    ``chapter_type``, ``content``). ``language`` defaults to ``"en"`` when
    absent. Existing-name collisions return 409 (same as create).
    """
    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="File is not valid JSON") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object")
    if data.get("format") != "bibliogon-chapter-template":
        raise HTTPException(
            status_code=400,
            detail="Not a Bibliogon chapter template (missing or wrong 'format' marker)",
        )

    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    chapter_type_raw = data.get("chapter_type")
    if not name or not description or not chapter_type_raw:
        raise HTTPException(
            status_code=400,
            detail="Required fields missing: name, description, chapter_type",
        )
    try:
        chapter_type = ChapterType(chapter_type_raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown chapter_type: {chapter_type_raw}",
        ) from exc

    if db.query(ChapterTemplate).filter(ChapterTemplate.name == name).first():
        raise HTTPException(status_code=409, detail="Chapter template name already exists")

    raw_child_ids = data.get("child_template_ids") or []
    if not isinstance(raw_child_ids, list) or not all(
        isinstance(cid, str) for cid in raw_child_ids
    ):
        raise HTTPException(
            status_code=400,
            detail="child_template_ids must be a list of strings",
        )
    _validate_child_ids(db, raw_child_ids)

    template = ChapterTemplate(
        name=name,
        description=description,
        chapter_type=chapter_type.value,
        content=data.get("content"),
        language=data.get("language") or "en",
        is_builtin=False,
        child_template_ids=_encode_child_ids(raw_child_ids),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    logger.info("Imported chapter template %s (%s)", template.id, template.name)
    return template
