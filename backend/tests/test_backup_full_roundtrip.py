"""H2 / BACKUP-COMPLETENESS-01 safety net.

Builds a maximal object graph (one comic book + one article + the global
content), exports a ``.bgb``, wipes EVERY table, imports, and asserts
field-level equality for every row of every model.

This is the test that drives the backup-completeness overhaul: before the
fix it fails (pages, comics, story bible, labels, snapshots, publishing
state, ARC reviewers, comments, import sources, writing sessions, authors
and templates are dropped, and several Book/Chapter columns too); after the
fix every model round-trips byte-for-byte on its column values.

Deliberate exclusions (NOT user content; documented, asserted-empty after
restore would be wrong to assert, so we simply never create them here):
  - AudioVoice: a cache re-synced from edge-TTS at startup.
  - GitSyncMapping: machine-local clone path; the git-sync plugin
    re-establishes it. Carrying a stale absolute path across machines is
    worse than dropping it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    ArcReviewer,
    Article,
    ArticleAsset,
    ArticleComment,
    ArticleImportSource,
    Asset,
    Author,
    Base,
    Book,
    BookImportSource,
    BookPublishingState,
    BookTemplate,
    BookTemplateChapter,
    Chapter,
    ChapterLabel,
    ChapterTemplate,
    ChapterVersion,
    ComicBubble,
    ComicPanel,
    Page,
    Publication,
    StoryEntity,
    StoryEntityPageLink,
    WritingSession,
)
from app.services.backup.backup_export import export_backup_archive
from app.services.backup.backup_import import import_backup_archive

# Models whose rows MUST survive a backup -> restore cycle.
CONTENT_MODELS = [
    Book,
    BookImportSource,
    Chapter,
    ChapterLabel,
    ChapterVersion,
    WritingSession,
    Asset,
    Page,
    ComicPanel,
    ComicBubble,
    StoryEntity,
    StoryEntityPageLink,
    BookPublishingState,
    ArcReviewer,
    Article,
    ArticleImportSource,
    Publication,
    ArticleAsset,
    ArticleComment,
    Author,
    BookTemplate,
    BookTemplateChapter,
    ChapterTemplate,
]


def _dump(obj) -> dict:
    """Column-value dict for a row; dates/datetimes normalised to iso."""
    out = {}
    for attr in sa_inspect(obj).mapper.column_attrs:
        v = getattr(obj, attr.key)
        if isinstance(v, (datetime, date)):
            v = v.isoformat()
        out[attr.key] = v
    return out


def _dump_all(db: Session) -> dict[str, dict[str, dict]]:
    """{table_name: {pk: column_dict}} across every content model."""
    snap: dict[str, dict[str, dict]] = {}
    for model in CONTENT_MODELS:
        rows = db.query(model).all()
        snap[model.__tablename__] = {r.id: _dump(r) for r in rows}
    return snap


def _wipe_everything(db: Session) -> None:
    # children first (reversed FK-dependency order)
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()


def _build_graph(db: Session, tmp_upload: str) -> None:
    # --- global content ---
    db.add(Author(id="auth1", name="Asterios Raptis", slug="asterios-raptis", bio="Bio text"))
    tmpl = BookTemplate(
        id="tmpl1", name="Novel", description="A novel", genre="fiction", language="en"
    )
    db.add(tmpl)
    db.flush()
    db.add(
        BookTemplateChapter(
            id="tc1",
            template_id="tmpl1",
            position=0,
            title="Ch1",
            chapter_type="chapter",
            content="{}",
        )
    )
    db.add(
        ChapterTemplate(
            id="ctmpl1",
            name="Interview",
            description="Q&A",
            chapter_type="chapter",
            content="{}",
            language="en",
        )
    )

    # --- book graph (comic_book to exercise pages/panels/bubbles) ---
    book = Book(
        id="bk1",
        title="Comic",
        subtitle="Sub",
        author="A",
        language="en",
        book_type="comic_book",
        status="published",
        series="S",
        series_index=2,
        description="desc",
        genre="action",
        word_target=50000,
        word_target_deadline=date(2026, 12, 31),
        categories='["X"]',
        bisac_codes='["FIC000000"]',
        graph_layout={"nodes": [{"id": "n1", "x": 1.0, "y": 2.0}]},
        repository_url="https://example.org/repo",
        ai_assisted=True,
        ai_tokens_used=42,
        keywords="k1,k2",
        html_description="<p>h</p>",
        backpage_description="bp",
        cover_image="uploads/bk1/cover/c.png",
        custom_css=".x{}",
        tts_engine="edge",
        tts_voice="v",
        tts_language="en",
        tts_speed=1.1,
    )
    db.add(book)
    db.flush()
    db.add(
        BookImportSource(
            id="bis1", book_id="bk1", source_identifier="src", source_type="wbt", format_name="zip"
        )
    )
    label = ChapterLabel(id="lbl1", book_id="bk1", name="Draft", color="#abcdef", position=1)
    db.add(label)
    db.flush()
    ch = Chapter(
        id="ch1",
        book_id="bk1",
        title="Chapter One",
        content='{"type":"doc"}',
        position=0,
        chapter_type="chapter",
        version=3,
        notes="n",
        story_beat="rising",
        mood_color="#ff0000",
        act_group="Act I",
        status="in_progress",
        label_id="lbl1",
        target_words=1200,
    )
    db.add(ch)
    db.flush()
    db.add(
        ChapterVersion(
            id="cv1",
            chapter_id="ch1",
            content='{"type":"doc"}',
            title="Chapter One",
            version=2,
            name="snap",
            is_manual=True,
        )
    )
    db.add(
        WritingSession(
            id="ws1", day=date(2026, 6, 1), words_written=300, book_id="bk1", chapter_id="ch1"
        )
    )
    asset = Asset(id="as1", book_id="bk1", filename="c.png", asset_type="cover", path=tmp_upload)
    db.add(asset)
    db.flush()
    page = Page(
        id="pg1",
        book_id="bk1",
        position=0,
        layout="comic_panel_grid",
        text_content="t",
        image_asset_id="as1",
        layout_config='{"k":"v"}',
        notes="pn",
        story_beat="climax",
        mood_color="#00ff00",
        act_group="Act II",
    )
    db.add(page)
    db.flush()
    panel = ComicPanel(
        id="cp1",
        page_id="pg1",
        position=0,
        image_asset_id="as1",
        bounds='{"x":0}',
        panel_config='{"c":1}',
    )
    db.add(panel)
    db.flush()
    db.add(
        ComicBubble(
            id="cb1",
            panel_id="cp1",
            position=0,
            bubble_type="speech",
            anchor='{"x_pct":50}',
            width_pct=40,
            height_pct=25,
            tail_direction="down",
            tail_position_pct=60,
            tail_length_px=20,
            bubble_config='{"b":1}',
            text_content="Hi!",
        )
    )
    ent = StoryEntity(
        id="se1",
        book_id="bk1",
        entity_type="character",
        name="Hero",
        description='{"d":1}',
        entity_metadata='{"m":1}',
        relationships='[{"to":"x"}]',
        image_asset_id="as1",
        position=0,
    )
    db.add(ent)
    db.flush()
    db.add(
        StoryEntityPageLink(
            id="sel1",
            entity_id="se1",
            page_id="pg1",
            chapter_id=None,
            role="protagonist",
            notes="ln",
        )
    )
    db.add(
        StoryEntityPageLink(
            id="sel2", entity_id="se1", page_id=None, chapter_id="ch1", role="mention", notes="ln2"
        )
    )
    state = BookPublishingState(
        id="bps1",
        book_id="bk1",
        royalty_plan="70",
        kdp_select_enrolled=True,
        kdp_select_enrollment_date=datetime(2026, 5, 1, tzinfo=UTC),
        expanded_distribution=True,
        prices='{"US":9.99}',
        launch_checklist_state='{"cover":true}',
        publication_target_date="2026-12-01",
        last_kdp_upload_at=datetime(2026, 5, 20, tzinfo=UTC),
    )
    db.add(state)
    db.flush()
    db.add(
        ArcReviewer(
            id="arc1",
            publishing_state_id="bps1",
            reviewer_name="Rev",
            reviewer_email="r@e.com",
            review_status="reviewed",
            copy_version="v1",
            review_permalink="https://r",
            review_text_excerpt="great",
            invited_at=datetime(2026, 5, 2, tzinfo=UTC),
            reviewed_at=datetime(2026, 5, 10, tzinfo=UTC),
        )
    )

    # --- article graph ---
    art = Article(
        id="ar1",
        title="Article",
        subtitle="Asub",
        author="A",
        language="en",
        content_type="tutorial",
        article_metadata='{"x":1}',
        content_json='{"type":"doc"}',
        status="published",
        canonical_url="https://a",
        featured_image_url="https://img",
        excerpt="ex",
        tags='["t1"]',
        topic="philosophy",
        seo_title="seo",
        seo_description="seod",
        ai_tokens_used=7,
    )
    db.add(art)
    db.flush()
    db.add(
        ArticleImportSource(
            id="ais1",
            article_id="ar1",
            source_identifier="s",
            source_type="medium",
            format_name="html",
            importer_version="1",
        )
    )
    db.add(
        Publication(
            id="pub1",
            article_id="ar1",
            platform="medium",
            is_promo=True,
            status="published",
            platform_metadata='{"p":1}',
            notes="pn",
        )
    )
    db.add(
        ArticleAsset(
            id="aa1",
            article_id="ar1",
            filename="i.png",
            asset_type="featured_image",
            path=tmp_upload,
        )
    )
    db.add(
        ArticleComment(
            id="com1",
            author="Reader",
            body_text="Nice",
            body_json='{"d":1}',
            language="en",
            canonical_url="https://c",
            responds_to_article_id="ar1",
            responds_to_url="https://a",
            imported_from="medium",
            source_filename="f.html",
        )
    )
    # orphan comment (no article link) - must also round-trip
    db.add(
        ArticleComment(
            id="com2", body_text="Orphan", imported_from="manual", responds_to_article_id=None
        )
    )
    db.commit()


def test_full_backup_roundtrip_field_equality(tmp_path):
    upload_file = tmp_path / "c.png"
    upload_file.write_bytes(b"PNG-bytes")

    with SessionLocal() as db:
        _wipe_everything(db)
        _build_graph(db, str(upload_file))

    with SessionLocal() as db:
        before = _dump_all(db)
        bgb_path, _ = export_backup_archive(db)

    with SessionLocal() as db:
        _wipe_everything(db)
        assert sum(db.query(m).count() for m in CONTENT_MODELS) == 0

    from fastapi import UploadFile

    with open(bgb_path, "rb") as fh:
        upload = UploadFile(filename="full.bgb", file=fh)
        with SessionLocal() as db:
            import_backup_archive(upload, db)

    with SessionLocal() as db:
        after = _dump_all(db)

    # ``path`` on asset rows is an environment-specific filesystem
    # location regenerated into the restored uploads dir; the asset id +
    # every other field must round-trip, but the absolute path legitimately
    # differs. Everything else is compared verbatim.
    excluded = {"assets": {"path"}, "article_assets": {"path"}}

    problems: list[str] = []
    for table, rows_before in before.items():
        rows_after = after.get(table, {})
        if set(rows_before) != set(rows_after):
            problems.append(f"{table}: ids before={sorted(rows_before)} after={sorted(rows_after)}")
            continue
        skip = excluded.get(table, set())
        for pk, cols_before in rows_before.items():
            cols_after = rows_after[pk]
            for col, val in cols_before.items():
                if col in skip:
                    continue
                if cols_after.get(col) != val:
                    problems.append(
                        f"{table}[{pk}].{col}: before={val!r} after={cols_after.get(col)!r}"
                    )
    assert not problems, "Backup round-trip lost data:\n" + "\n".join(problems)
