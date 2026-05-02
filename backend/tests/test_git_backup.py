"""Tests for Phase 1 git-based backup (SI-01..04 foundation).

Covers:
- init_repo: creates .git, first commit, idempotent
- commit: writes book state, refuses on clean tree, refuses if not init
- log: returns commits newest-first with shape
- status: before-init vs after-init
- file layout: front-matter / chapters / back-matter split
- slugify edge cases (German umlauts, empty title)

Tests use TestClient through the API router. A per-test tmp_path is
used as the uploads root via monkeypatching so real ``uploads/``
outside the test tree is never touched.
"""

from __future__ import annotations

import json

import git
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import git_backup, git_credentials

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    """Redirect UPLOADS_ROOT + credentials dir to a tmp dir for every test."""
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "git_credentials")
    # Phase 2 uses credential_store which requires a secret in env.
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-for-git-backup")
    yield


def _create_book(title: str = "Git Backup Testbuch") -> str:
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "Aster", "language": "de"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _add_chapter(
    book_id: str,
    title: str,
    chapter_type: str = "chapter",
    content: str = '{"type":"doc","content":[{"type":"paragraph"}]}',
) -> str:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "chapter_type": chapter_type, "content": content},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# --- init ---


def test_init_creates_repo_and_first_commit():
    book_id = _create_book("First Init")
    _add_chapter(book_id, "Chapter One")

    resp = client.post(f"/api/books/{book_id}/git/init")
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is True
    assert body["dirty"] is False
    assert body["head_hash"] is not None

    repo_root = git_backup.repo_path(book_id)
    assert (repo_root / ".git").is_dir()
    assert (repo_root / ".gitignore").is_file()
    assert (repo_root / "config" / "metadata.yaml").is_file()
    assert (repo_root / "manuscript" / "chapters").is_dir()


def test_init_is_idempotent():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    first = client.post(f"/api/books/{book_id}/git/init").json()
    second = client.post(f"/api/books/{book_id}/git/init").json()
    assert first["head_hash"] == second["head_hash"]


def test_init_404_for_unknown_book():
    resp = client.post("/api/books/doesnotexist/git/init")
    assert resp.status_code == 404


# --- commit ---


def test_commit_refuses_when_not_initialized():
    book_id = _create_book()
    resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "x"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "repo_not_initialized"


def test_commit_captures_chapter_change():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")

    # Add a new chapter so the working tree diverges from HEAD.
    _add_chapter(book_id, "Ch B")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "Second pass"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"] == "Second pass"
    assert len(body["hash"]) == 40
    assert body["short_hash"] == body["hash"][:7]


def test_commit_refuses_on_clean_tree():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "no-op"}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "nothing_to_commit"


def test_commit_uses_default_message_when_empty():
    book_id = _create_book("Titled Book")
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    _add_chapter(book_id, "Ch B")
    body = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": ""}
    ).json()
    assert "Titled Book" in body["message"]


# --- log ---


def test_log_returns_commits_newest_first():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    _add_chapter(book_id, "Ch B")
    client.post(f"/api/books/{book_id}/git/commit", json={"message": "Second"})

    resp = client.get(f"/api/books/{book_id}/git/log")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 2
    assert entries[0]["message"] == "Second"
    assert "Initial commit" in entries[1]["message"]


def test_log_409_when_not_initialized():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/log")
    assert resp.status_code == 409


def test_log_limit_validation():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/log?limit=0")
    assert resp.status_code == 422


# --- status ---


def test_status_before_init():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is False
    assert body["head_hash"] is None


def test_status_initialized_flag_flips():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    before = client.get(f"/api/books/{book_id}/git/status").json()
    assert before["initialized"] is False
    client.post(f"/api/books/{book_id}/git/init")
    after = client.get(f"/api/books/{book_id}/git/status").json()
    assert after["initialized"] is True
    assert after["head_hash"] is not None


# --- file layout ---


def test_chapters_split_by_section():
    book_id = _create_book()
    _add_chapter(book_id, "Prefaceness", chapter_type="preface")
    _add_chapter(book_id, "Real Chapter", chapter_type="chapter")
    _add_chapter(book_id, "Epilogueness", chapter_type="epilogue")

    client.post(f"/api/books/{book_id}/git/init")

    root = git_backup.repo_path(book_id)
    front = list((root / "manuscript" / "front-matter").glob("*.json"))
    main = list((root / "manuscript" / "chapters").glob("*.json"))
    back = list((root / "manuscript" / "back-matter").glob("*.json"))
    assert len(front) == 1 and "prefaceness" in front[0].name
    assert len(main) == 1 and "real-chapter" in main[0].name
    assert len(back) == 1 and "epilogueness" in back[0].name


def test_chapter_file_contains_tiptap_json():
    book_id = _create_book()
    _add_chapter(
        book_id,
        "Content Test",
        content='{"type":"doc","content":[{"type":"paragraph"}]}',
    )
    client.post(f"/api/books/{book_id}/git/init")

    chapter_file = next(
        (git_backup.repo_path(book_id) / "manuscript" / "chapters").glob("*.json")
    )
    payload = json.loads(chapter_file.read_text(encoding="utf-8"))
    assert payload["title"] == "Content Test"
    assert payload["content"]["type"] == "doc"


def test_metadata_yaml_has_book_fields():
    book_id = _create_book("Metadata Test")
    client.post(f"/api/books/{book_id}/git/init")

    import yaml

    data = yaml.safe_load(
        (git_backup.repo_path(book_id) / "config" / "metadata.yaml")
        .read_text(encoding="utf-8")
    )
    assert data["title"] == "Metadata Test"
    assert data["author"] == "Aster"
    assert data["language"] == "de"


# --- slugify edge cases ---


def test_slugify_umlauts():
    assert git_backup._slugify("Über Alles") == "ueber-alles"
    assert git_backup._slugify("Straße") == "strasse"


def test_slugify_empty_falls_back():
    slug = git_backup._slugify("")
    assert slug.startswith("ch-")


def test_slugify_drops_non_alphanum():
    assert git_backup._slugify("Kapitel 1: Der Beginn!") == "kapitel-1-der-beginn"


# --- removed-chapter cleanup ---


def test_removed_chapter_drops_from_repo_on_commit():
    book_id = _create_book()
    ch_id = _add_chapter(book_id, "To Be Removed")
    _add_chapter(book_id, "Keeper")
    client.post(f"/api/books/{book_id}/git/init")

    chapters_dir = git_backup.repo_path(book_id) / "manuscript" / "chapters"
    assert len(list(chapters_dir.glob("*.json"))) == 2

    client.delete(f"/api/books/{book_id}/chapters/{ch_id}")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "Drop removed"}
    )
    assert resp.status_code == 200
    remaining = list(chapters_dir.glob("*.json"))
    assert len(remaining) == 1
    assert "keeper" in remaining[0].name


# --- Phase 2: remote config, push, pull, sync-status ---


def _bare_remote(tmp_path, name: str = "remote.git") -> str:
    """Create a file-system bare repo and return its path (usable as URL)."""
    path = tmp_path / name
    git.Repo.init(path, bare=True, initial_branch="main")
    return str(path)


def _init_book_with_remote(tmp_path, title: str = "Remote Test") -> tuple[str, str]:
    book_id = _create_book(title)
    _add_chapter(book_id, "Ch A")
    assert client.post(f"/api/books/{book_id}/git/init").status_code == 200
    url = _bare_remote(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git/remote",
        json={"url": url, "pat": "secret-pat-value"},
    )
    assert resp.status_code == 200
    return book_id, url


def test_remote_config_round_trip(tmp_path):
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")

    url = _bare_remote(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git/remote",
        json={"url": url, "pat": "ghp_xxx"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == url
    assert body["has_credential"] is True

    get_resp = client.get(f"/api/books/{book_id}/git/remote")
    assert get_resp.status_code == 200
    assert get_resp.json()["url"] == url
    assert get_resp.json()["has_credential"] is True
    # PAT must never appear in responses.
    assert "ghp_xxx" not in get_resp.text


def test_remote_config_refuses_before_init(tmp_path):
    book_id = _create_book()
    url = _bare_remote(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git/remote",
        json={"url": url, "pat": None},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "repo_not_initialized"


def test_remote_config_gitignore_entry(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    gitignore = (git_backup.repo_path(book_id) / ".gitignore").read_text()
    assert git_backup.GIT_CONFIG_FILENAME in gitignore


def test_remote_delete_removes_config_and_credential(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    assert client.delete(f"/api/books/{book_id}/git/remote").status_code == 204
    body = client.get(f"/api/books/{book_id}/git/remote").json()
    assert body["url"] is None
    assert body["has_credential"] is False


def test_push_to_bare_remote(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    resp = client.post(f"/api/books/{book_id}/git/push")
    assert resp.status_code == 200
    body = resp.json()
    assert body["branch"] == "main"
    # Confirm the remote actually has the commit now.
    remote_repo = git.Repo(url)
    assert "main" in [h.name for h in remote_repo.heads]


def test_push_refuses_without_remote():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    resp = client.post(f"/api/books/{book_id}/git/push")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "remote_not_configured"


def test_pull_fast_forwards_from_remote(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    # First push so remote has the initial commit.
    client.post(f"/api/books/{book_id}/git/push")

    # Clone the bare remote, add an external commit, push back.
    work = tmp_path / "external-clone"
    ext_repo = git.Repo.clone_from(url, work)
    (work / "external.txt").write_text("external change", encoding="utf-8")
    ext_repo.git.add(A=True)
    ext_repo.index.commit(
        "External commit",
        author=git.Actor("Reviewer", "reviewer@example.com"),
        committer=git.Actor("Reviewer", "reviewer@example.com"),
    )
    ext_repo.remote().push()

    # Now pull from the Bibliogon side.
    resp = client.post(f"/api/books/{book_id}/git/pull")
    assert resp.status_code == 200
    body = resp.json()
    assert body["updated"] is True
    assert body["fast_forward"] is True
    # Pulled file is now present in the book's repo.
    assert (git_backup.repo_path(book_id) / "external.txt").is_file()


def test_pull_no_changes_is_idempotent(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")
    resp = client.post(f"/api/books/{book_id}/git/pull")
    assert resp.status_code == 200
    assert resp.json()["updated"] is False


def test_pull_diverged_returns_409(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")

    # Remote gains a commit the local hasn't seen.
    work = tmp_path / "external-clone-diverge"
    ext_repo = git.Repo.clone_from(url, work)
    (work / "from-remote.txt").write_text("remote side", encoding="utf-8")
    ext_repo.git.add(A=True)
    ext_repo.index.commit(
        "Remote-only commit",
        author=git.Actor("Reviewer", "reviewer@example.com"),
        committer=git.Actor("Reviewer", "reviewer@example.com"),
    )
    ext_repo.remote().push()

    # Local gains a DIFFERENT commit on top of the previously-shared
    # state (so histories diverge).
    _add_chapter(book_id, "Local-only chapter")
    client.post(
        f"/api/books/{book_id}/git/commit",
        json={"message": "Local-only commit"},
    )

    resp = client.post(f"/api/books/{book_id}/git/pull")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "diverged"


def test_sync_status_no_remote():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    body = client.get(f"/api/books/{book_id}/git/sync-status").json()
    assert body["remote_configured"] is False
    assert body["state"] == "no_remote"


def test_sync_status_in_sync_after_push_and_pull(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")
    client.post(f"/api/books/{book_id}/git/pull")
    body = client.get(f"/api/books/{book_id}/git/sync-status").json()
    assert body["state"] == "in_sync"
    assert body["ahead"] == 0
    assert body["behind"] == 0


def test_sync_status_local_ahead_after_commit(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")
    client.post(f"/api/books/{book_id}/git/pull")

    _add_chapter(book_id, "Another Ch")
    client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "New local"}
    )
    body = client.get(f"/api/books/{book_id}/git/sync-status").json()
    assert body["state"] == "local_ahead"
    assert body["ahead"] == 1
    assert body["behind"] == 0


def test_force_push_overrides_diverged_remote(tmp_path):
    """Accept-Local: force push wins over a diverged remote."""
    book_id, url = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")

    # External commit on remote.
    work = tmp_path / "external-clone-force"
    ext_repo = git.Repo.clone_from(url, work)
    (work / "remote-only.txt").write_text("remote", encoding="utf-8")
    ext_repo.git.add(A=True)
    ext_repo.index.commit(
        "Remote side",
        author=git.Actor("Reviewer", "reviewer@example.com"),
        committer=git.Actor("Reviewer", "reviewer@example.com"),
    )
    ext_repo.remote().push()

    # Divergent local commit.
    _add_chapter(book_id, "Local-only ch")
    client.post(f"/api/books/{book_id}/git/commit", json={"message": "Local"})

    # Plain push rejected.
    plain = client.post(f"/api/books/{book_id}/git/push", json={"force": False})
    assert plain.status_code == 409
    assert plain.json()["detail"]["code"] == "remote_rejected"

    # Force push accepted.
    forced = client.post(f"/api/books/{book_id}/git/push", json={"force": True})
    assert forced.status_code == 200
    assert forced.json()["forced"] is True

    # Remote now matches local HEAD.
    remote_repo = git.Repo(url)
    local_repo = git.Repo(git_backup.repo_path(book_id))
    assert remote_repo.heads["main"].commit.hexsha == local_repo.head.commit.hexsha


# --- Phase 4: conflict analysis + per-file resolution ---


def _diverge_histories(tmp_path, book_id: str, url: str, *, overlap: bool) -> None:
    """Leave book_id's local repo and the remote with divergent histories.

    When overlap=True, both sides modify the same file. When False,
    they modify different files (simple case).
    """
    # Seed identical first state on both sides.
    client.post(f"/api/books/{book_id}/git/push")

    # Remote-side commit via an external clone.
    work = tmp_path / "external-for-diverge"
    ext_repo = git.Repo.clone_from(url, work)
    if overlap:
        # Target a file Bibliogon writes via the book state export.
        target_dir = work / "manuscript" / "chapters"
        target_dir.mkdir(parents=True, exist_ok=True)
        target_files = list(target_dir.glob("*.json"))
        target = target_files[0] if target_files else target_dir / "01-shared.json"
        target.write_text("remote side edit", encoding="utf-8")
    else:
        (work / "remote-only.txt").write_text("remote only", encoding="utf-8")
    ext_repo.git.add(A=True)
    ext_repo.index.commit(
        "Remote side commit",
        author=git.Actor("Reviewer", "reviewer@example.com"),
        committer=git.Actor("Reviewer", "reviewer@example.com"),
    )
    ext_repo.remote().push()

    # Local-side commit.
    if overlap:
        # Force conflict on the same chapter file by re-committing the
        # book state after an (invisible) change: easier to synthesise
        # via direct file write.
        root = git_backup.repo_path(book_id)
        target_dir = root / "manuscript" / "chapters"
        target_files = list(target_dir.glob("*.json"))
        target = target_files[0] if target_files else target_dir / "01-shared.json"
        target.write_text("local side edit", encoding="utf-8")
        repo = git.Repo(root)
        repo.git.add(A=True)
        repo.index.commit(
            "Local side commit",
            author=git.Actor("Aster", "aster@bibliogon.local"),
            committer=git.Actor("Aster", "aster@bibliogon.local"),
        )
    else:
        _add_chapter(book_id, "Local-only chapter")
        client.post(
            f"/api/books/{book_id}/git/commit",
            json={"message": "Local-only commit"},
        )

    # Fetch so origin/main is up-to-date locally without merging.
    git.Repo(git_backup.repo_path(book_id)).remotes.origin.fetch()


def test_analyze_conflict_no_remote():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    body = client.get(f"/api/books/{book_id}/git/conflict/analyze").json()
    assert body["state"] == "no_remote"
    assert body["classification"] is None


def test_analyze_conflict_in_sync(tmp_path):
    book_id, _ = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")
    body = client.get(f"/api/books/{book_id}/git/conflict/analyze").json()
    assert body["state"] == "in_sync"
    assert body["classification"] is None


def test_analyze_conflict_simple_disjoint(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=False)
    body = client.get(f"/api/books/{book_id}/git/conflict/analyze").json()
    assert body["state"] == "diverged"
    assert body["classification"] == "simple"
    assert body["overlapping_files"] == []
    assert body["local_files"]
    assert body["remote_files"]


def test_analyze_conflict_complex_overlap(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    body = client.get(f"/api/books/{book_id}/git/conflict/analyze").json()
    assert body["state"] == "diverged"
    assert body["classification"] == "complex"
    assert body["overlapping_files"]


def test_merge_simple_auto_merges(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=False)
    resp = client.post(f"/api/books/{book_id}/git/merge")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "merged"
    assert body["head_hash"]
    # Remote-only file is now present locally.
    assert (git_backup.repo_path(book_id) / "remote-only.txt").is_file()


def test_merge_complex_returns_conflicts(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    resp = client.post(f"/api/books/{book_id}/git/merge")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "conflicts"
    assert body["files"]
    # Merge is now in progress.
    assert (git_backup.repo_path(book_id) / ".git" / "MERGE_HEAD").exists()


def test_resolve_keeps_mine(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    conflicts = client.post(f"/api/books/{book_id}/git/merge").json()
    files = conflicts["files"]
    assert files

    resp = client.post(
        f"/api/books/{book_id}/git/conflict/resolve",
        json={"resolutions": {path: "mine" for path in files}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "merged"
    # Local side wins: file has "local side edit".
    root = git_backup.repo_path(book_id)
    target = root / files[0]
    assert target.read_text(encoding="utf-8") == "local side edit"


def test_resolve_keeps_theirs(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    conflicts = client.post(f"/api/books/{book_id}/git/merge").json()
    files = conflicts["files"]

    resp = client.post(
        f"/api/books/{book_id}/git/conflict/resolve",
        json={"resolutions": {path: "theirs" for path in files}},
    )
    assert resp.status_code == 200
    target = git_backup.repo_path(book_id) / files[0]
    assert target.read_text(encoding="utf-8") == "remote side edit"


def test_resolve_rejects_missing_files(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    client.post(f"/api/books/{book_id}/git/merge")
    resp = client.post(
        f"/api/books/{book_id}/git/conflict/resolve",
        json={"resolutions": {}},
    )
    assert resp.status_code == 400
    assert "missing" in resp.json()["detail"].lower()


def test_abort_merge_returns_to_pre_merge_head(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    pre_head = git.Repo(git_backup.repo_path(book_id)).head.commit.hexsha
    client.post(f"/api/books/{book_id}/git/merge")

    resp = client.post(f"/api/books/{book_id}/git/conflict/abort")
    assert resp.status_code == 200
    assert resp.json()["status"] == "aborted"
    assert git.Repo(git_backup.repo_path(book_id)).head.commit.hexsha == pre_head


def test_abort_without_merge_returns_409():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    resp = client.post(f"/api/books/{book_id}/git/conflict/abort")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "no_merge_in_progress"


def test_merge_rejects_when_merge_in_progress(tmp_path):
    book_id, url = _init_book_with_remote(tmp_path)
    _diverge_histories(tmp_path, book_id, url, overlap=True)
    client.post(f"/api/books/{book_id}/git/merge")
    # Second call must refuse.
    resp = client.post(f"/api/books/{book_id}/git/merge")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "merge_in_progress"


# --- Phase 5: Markdown side-files ---


def test_commit_writes_markdown_alongside_json():
    book_id = _create_book()
    _add_chapter(
        book_id,
        "Intro",
        content=json.dumps({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Hello world."}],
                }
            ],
        }),
    )
    client.post(f"/api/books/{book_id}/git/init")

    root = git_backup.repo_path(book_id)
    chapters_dir = root / "manuscript" / "chapters"
    json_files = sorted(chapters_dir.glob("*.json"))
    md_files = sorted(chapters_dir.glob("*.md"))
    assert len(json_files) == 1
    assert len(md_files) == 1
    assert json_files[0].stem == md_files[0].stem


def test_markdown_side_file_contains_title_header_and_body():
    book_id = _create_book()
    _add_chapter(
        book_id,
        "My Chapter",
        content=json.dumps({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "First paragraph."}],
                }
            ],
        }),
    )
    client.post(f"/api/books/{book_id}/git/init")

    md_path = next(
        (git_backup.repo_path(book_id) / "manuscript" / "chapters").glob("*.md")
    )
    content = md_path.read_text(encoding="utf-8")
    assert content.startswith("# My Chapter")
    assert "First paragraph." in content


def test_markdown_regenerates_on_every_commit():
    book_id = _create_book()
    ch_id = _add_chapter(
        book_id,
        "Evolving",
        content=json.dumps({"type": "doc", "content": []}),
    )
    client.post(f"/api/books/{book_id}/git/init")

    md_path = next(
        (git_backup.repo_path(book_id) / "manuscript" / "chapters").glob("*.md")
    )
    # First pass: empty body.
    first = md_path.read_text(encoding="utf-8")
    assert first.startswith("# Evolving")
    assert len(first.strip().splitlines()) == 1  # title only

    # Modify chapter content via the book API - need to bypass the
    # optimistic-lock version field by deleting + re-adding.
    client.delete(f"/api/books/{book_id}/chapters/{ch_id}")
    _add_chapter(
        book_id,
        "Evolving",
        content=json.dumps({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Added text."}],
                }
            ],
        }),
    )

    client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "Second"}
    )
    second = md_path.read_text(encoding="utf-8")
    assert "Added text." in second
    assert second != first


def test_markdown_side_file_renders_heading_node():
    book_id = _create_book()
    _add_chapter(
        book_id,
        "Heading Test",
        content=json.dumps({
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Subhead"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Body."}],
                },
            ],
        }),
    )
    client.post(f"/api/books/{book_id}/git/init")

    md_path = next(
        (git_backup.repo_path(book_id) / "manuscript" / "chapters").glob("*.md")
    )
    content = md_path.read_text(encoding="utf-8")
    assert "## Subhead" in content
    assert "Body." in content


def test_pat_never_appears_on_disk_in_git_config(tmp_path):
    """Guard against leaking the PAT through git's remote URL config."""
    book_id, url = _init_book_with_remote(tmp_path)
    client.post(f"/api/books/{book_id}/git/push")
    config_text = (git_backup.repo_path(book_id) / ".git" / "config").read_text()
    assert "secret-pat-value" not in config_text
    assert "x-access-token" not in config_text
