"""Regression tests for ``POST /api/admin/rediscover``.

C4 of PLUGINFORGE-V060-ADOPTION-01. Pins:

- Happy path: against the running test app (13 plugins
  activated via lifespan), ``rediscover()`` reports all 13 as
  unchanged with empty ``added`` + ``removed`` (no entry-point
  set change since startup).
- Severity discipline: when the underlying
  ``manager.rediscover()`` returns a ``DiscoveryDiff`` whose
  ``errors`` list mixes ``severity="error"`` + ``severity="warning"``
  entries, the response surfaces them on separate keys
  (``errors`` vs ``notices``) — the same discipline applied to
  startup logging in C2.

Test 2 mocks ``manager.rediscover`` directly so the test does
not depend on a way to make pluginforge produce a mixed errors
list in vivo (which currently requires either an entry-point
disappearance event or a third-party plugin without
``target_application``; neither is convenient in a unit test).
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from pluginforge import DiscoveryDiff, PluginError, PluginState


def test_admin_rediscover_happy_path_reports_13_unchanged() -> None:
    """Against the test app's running manager (lifespan activated
    all 13 plugins, entry-point set is stable in the same
    process), rediscover reports 13 unchanged with no diff."""
    from app.main import app

    with TestClient(app) as client:
        response = client.post("/api/admin/rediscover")
        assert response.status_code == 200
        body = response.json()

    assert body["added"] == []
    assert body["removed"] == []
    assert sorted(body["unchanged"]) == sorted(
        [
            "audiobook",
            "comics",
            "export",
            "getstarted",
            "git-sync",
            "grammar",
            "help",
            "kdp",
            "kinderbuch",
            "medium-import",
            "ms-tools",
            "story-bible",
            "translation",
        ]
    )
    assert body["errors"] == []
    assert body["notices"] == []
    # `states` is per pluginforge's contract only populated for
    # newly-discovered entry points; with nothing added in this
    # call, the dict can be empty.
    assert isinstance(body["states"], dict)


def test_admin_rediscover_response_splits_errors_and_notices_by_severity(
    monkeypatch,
) -> None:
    """The severity-filter discipline established in C2 also
    holds at the admin/rediscover surface: ``severity="error"``
    entries surface in ``errors``; ``severity="warning"`` entries
    (e.g. v0.7.0 identity deprecation) surface in ``notices``.
    Consumers can render the two channels with different visual
    treatment without re-checking severity client-side."""
    from app.main import app, manager

    fake_diff = DiscoveryDiff(
        added=["new-plugin"],
        removed=[],
        unchanged=[],
        states={
            "new-plugin": PluginState(
                name="new-plugin",
                discovered=True,
                enabled_in_config=True,
                disabled_in_config=False,
                activated=False,
                filter_reason="load_failed",
            ),
        },
        errors=[
            PluginError(
                name="new-plugin",
                phase="activation",
                cause=None,
                user_facing_message="ImportError on activation",
                severity="error",
            ),
            PluginError(
                name="third-party-undeclared",
                phase="identity_check",
                cause=None,
                user_facing_message="does not declare target_application",
                severity="warning",
            ),
        ],
    )

    monkeypatch.setattr(manager, "rediscover", lambda: fake_diff)

    with TestClient(app) as client:
        response = client.post("/api/admin/rediscover")
        assert response.status_code == 200
        body = response.json()

    # Error-severity entry landed in `errors`, not `notices`.
    assert len(body["errors"]) == 1
    assert body["errors"][0]["name"] == "new-plugin"
    assert body["errors"][0]["phase"] == "activation"
    assert "ImportError" in body["errors"][0]["user_facing_message"]

    # Warning-severity entry landed in `notices`, not `errors`.
    assert len(body["notices"]) == 1
    assert body["notices"][0]["name"] == "third-party-undeclared"
    assert body["notices"][0]["phase"] == "identity_check"
    assert "target_application" in body["notices"][0]["user_facing_message"]

    # Diff fields propagate unchanged.
    assert body["added"] == ["new-plugin"]
    assert "new-plugin" in body["states"]
    assert body["states"]["new-plugin"]["filter_reason"] == "load_failed"
