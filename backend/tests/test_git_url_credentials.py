"""A pasted token-bearing clone URL must not be persisted (#1072).

A user importing a private repository without a configured per-book PAT
will paste the shape that works on the command line,
``https://x-access-token:TOKEN@github.com/owner/repo.git``. Before this
the secret was kept in three places: the application log, the clone's
``remote.origin.url``, and ``GitSyncMapping.repo_url``.

These assert the three leaks are closed and that the credential still
reaches git - stripping it without replacing it would break the import
that works today, which is the half that makes this a fix rather than a
regression.
"""

from __future__ import annotations

import configparser
import logging
from pathlib import Path

import pytest

from app.services.git.urls import split_url_credentials

TOKEN = "ghp_0123456789abcdefghijklmnopqrstuvwxyz"


class TestSplitUrlCredentials:
    """The pure half: what comes out of a URL, and what must not be touched."""

    def test_strips_username_and_secret_from_an_https_url(self) -> None:
        clean, user, secret = split_url_credentials(
            f"https://x-access-token:{TOKEN}@github.com/owner/repo.git"
        )
        assert clean == "https://github.com/owner/repo.git"
        assert user == "x-access-token"
        assert secret == TOKEN

    def test_keeps_a_url_without_credentials_byte_for_byte(self) -> None:
        url = "https://github.com/owner/repo.git"
        assert split_url_credentials(url) == (url, None, None)

    def test_strips_a_username_with_no_password(self) -> None:
        # A username alone is not a secret, but it still does not belong in
        # a stored URL - and git takes it from the credential helper.
        clean, user, secret = split_url_credentials("https://aster@github.com/o/r.git")
        assert clean == "https://github.com/o/r.git"
        assert user == "aster"
        assert secret is None

    def test_leaves_an_scp_style_ssh_url_alone(self) -> None:
        # `git@host:owner/repo.git` has no scheme and its colon separates
        # host from path, not user from password. Splitting on it would
        # corrupt every SSH remote in the app.
        url = "git@github.com:owner/repo.git"
        assert split_url_credentials(url) == (url, None, None)

    def test_leaves_an_ssh_scheme_url_alone(self) -> None:
        url = "ssh://git@github.com/owner/repo.git"
        clean, user, secret = split_url_credentials(url)
        assert clean == url
        assert secret is None

    def test_does_not_mistake_an_at_sign_in_the_path_for_a_credential(self) -> None:
        url = "https://gitlab.com/group/sub@2/repo.git"
        assert split_url_credentials(url) == (url, None, None)

    def test_decodes_a_percent_encoded_secret(self) -> None:
        # git accepts a percent-encoded password; the helper must hand git
        # the decoded value or authentication fails.
        clean, _user, secret = split_url_credentials("https://u:p%40ss@host/r.git")
        assert clean == "https://host/r.git"
        assert secret == "p@ss"

    def test_keeps_an_explicit_port(self) -> None:
        clean, _user, secret = split_url_credentials(
            f"https://u:{TOKEN}@git.example.com:8443/o/r.git"
        )
        assert clean == "https://git.example.com:8443/o/r.git"
        assert secret == TOKEN

    @pytest.mark.parametrize("url", ["", "   ", "not a url"])
    def test_passes_through_what_it_cannot_parse(self, url: str) -> None:
        # The caller validates URL shape; a parser that raises here would
        # turn a 400 into a 500.
        assert split_url_credentials(url) == (url.strip(), None, None)


class TestSanitizeRemoteUrl:
    """`sanitize_git_dir` already strips credential sections; the remote URL
    is the one it missed, and the one a paste actually lands in."""

    def test_strips_credentials_from_remote_origin_url(self, tmp_path: Path) -> None:
        from app.services.git.import_adopter import sanitize_git_dir

        git_dir = tmp_path / "repo" / ".git"
        git_dir.mkdir(parents=True)
        (git_dir / "config").write_text(
            "[core]\n\trepositoryformatversion = 0\n"
            '[remote "origin"]\n'
            f"\turl = https://x-access-token:{TOKEN}@github.com/owner/repo.git\n"
            "\tfetch = +refs/heads/*:refs/remotes/origin/*\n",
            encoding="utf-8",
        )

        actions = sanitize_git_dir(git_dir)

        config = (git_dir / "config").read_text(encoding="utf-8")
        assert TOKEN not in config
        assert "https://github.com/owner/repo.git" in config
        # The fetch refspec has to survive, or the clone stops tracking.
        assert "+refs/heads/*:refs/remotes/origin/*" in config
        assert any("remote" in action and "url" in action for action in actions)

    def test_leaves_a_credential_free_remote_untouched(self, tmp_path: Path) -> None:
        from app.services.git.import_adopter import sanitize_git_dir

        git_dir = tmp_path / "repo" / ".git"
        git_dir.mkdir(parents=True)
        original = (
            "[core]\n\trepositoryformatversion = 0\n"
            '[remote "origin"]\n\turl = https://github.com/owner/repo.git\n'
        )
        (git_dir / "config").write_text(original, encoding="utf-8")

        sanitize_git_dir(git_dir)

        config = (git_dir / "config").read_text(encoding="utf-8")
        parser = configparser.ConfigParser(strict=False, interpolation=None)
        parser.read_string(config)
        assert parser['remote "origin"']["url"] == "https://github.com/owner/repo.git"


class TestTheSecretReachesGitWithoutBeingStored:
    """The split lives in the backend orchestrator, not in the handler: the
    plugin's CI job installs only its own tree, so it cannot import ``app``.
    The handler takes an env and forwards it."""

    def test_secret_git_env_puts_the_token_in_the_environment_only(self) -> None:
        from app.services.git.credentials import PAT_ENV_VAR, secret_git_env

        env = secret_git_env("https://github.com/owner/repo.git", TOKEN, username="x-access-token")

        assert env[PAT_ENV_VAR] == TOKEN
        # Delivered as git's own config-from-environment (>= 2.31) rather
        # than `-c` arguments, so the helper is not in argv either - and
        # GitPython shlex-splits multi_options, which a shell function with
        # spaces in it does not survive.
        assert env["GIT_CONFIG_COUNT"] == "2"
        assert env["GIT_CONFIG_KEY_0"] == "credential.helper"
        assert env["GIT_CONFIG_VALUE_0"] == ""
        assert env["GIT_CONFIG_KEY_1"] == "credential.helper"
        assert "x-access-token" in env["GIT_CONFIG_VALUE_1"]
        # The helper reads the token from the environment, so the token
        # itself must not be baked into the helper string.
        assert TOKEN not in env["GIT_CONFIG_VALUE_1"]
        assert env["GIT_TERMINAL_PROMPT"] == "0"

    def test_secret_git_env_is_empty_without_a_secret_or_for_ssh(self) -> None:
        from app.services.git.credentials import secret_git_env

        assert secret_git_env("https://github.com/o/r.git", None) == {}
        assert secret_git_env("https://github.com/o/r.git", "") == {}
        # An SSH remote authenticates with a key; a credential helper would
        # never be consulted.
        assert secret_git_env("git@github.com:o/r.git", TOKEN) == {}

    def test_the_handler_forwards_the_env_and_keeps_it_out_of_argv_and_the_log(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        from bibliogon_git_sync.handlers.git_handler import GitImportHandler

        captured: dict[str, object] = {}

        class FakeRepo:
            @staticmethod
            def clone_from(url: str, to_path: str, **kwargs: object) -> None:
                captured["url"] = url
                captured["kwargs"] = kwargs
                Path(to_path).mkdir(parents=True, exist_ok=True)

        import git as git_module

        monkeypatch.setattr(git_module, "Repo", FakeRepo)

        caplog.set_level(logging.DEBUG)
        GitImportHandler().clone(
            "https://github.com/owner/repo.git",
            tmp_path,
            env={"BIBLIOGON_GIT_PAT": TOKEN},
        )

        kwargs = captured["kwargs"]
        assert isinstance(kwargs, dict)
        assert captured["url"] == "https://github.com/owner/repo.git"
        assert kwargs["env"] == {"BIBLIOGON_GIT_PAT": TOKEN}
        assert TOKEN not in str(kwargs.get("multi_options"))
        assert TOKEN not in caplog.text

    def test_the_orchestrator_imports_both_halves_and_they_compose(self) -> None:
        from app.routers import import_orchestrator

        clean, user, secret = import_orchestrator.split_url_credentials(
            f"https://x-access-token:{TOKEN}@github.com/owner/repo.git"
        )
        env = import_orchestrator.secret_git_env(clean, secret, username=user)

        # The clone call is three lines of a 120-line endpoint and not worth
        # a FastAPI fixture; what is worth pinning is that this module holds
        # both halves, so they cannot drift apart from the one place that
        # has to use them together.
        assert clean == "https://github.com/owner/repo.git"
        assert env["BIBLIOGON_GIT_PAT"] == TOKEN


class TestMappingRowNeverHoldsASecret:
    """`GitSyncMapping.repo_url` is what the metadata panel shows and what
    a backup carries, so it must be clean regardless of what the clone's
    config says - the scrub does not depend on `sanitize_git_dir` having
    run first."""

    def test_read_repo_metadata_strips_credentials_from_the_remote(self, tmp_path: Path) -> None:
        import git as git_module

        from app.services.git.sync_mapping import _read_repo_metadata

        repo_root = tmp_path / "clone"
        repo = git_module.Repo.init(repo_root, initial_branch="main")
        (repo_root / "README.md").write_text("x", encoding="utf-8")
        repo.index.add(["README.md"])
        repo.index.commit("init")
        repo.create_remote("origin", f"https://x-access-token:{TOKEN}@github.com/owner/repo.git")

        url, branch, head_sha = _read_repo_metadata(repo_root)

        assert url == "https://github.com/owner/repo.git"
        assert branch == "main"
        assert head_sha
