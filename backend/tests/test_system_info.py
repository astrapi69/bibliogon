"""Tests for the About-Dialog backend endpoint /api/system/info.

Asserts SHAPE not exact values: Python + platform vary per
environment (CI vs local dev vs Docker prod), so the contract is
"each section exists with the expected keys" rather than "version
is exactly N.M.K".
"""

from fastapi.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    return TestClient(app)


class TestSystemInfo:
    """GET /api/system/info — About-Dialog payload."""

    def test_returns_200(self) -> None:
        with _client() as c:
            resp = c.get("/api/system/info")
            assert resp.status_code == 200

    def test_top_level_shape(self) -> None:
        with _client() as c:
            body = c.get("/api/system/info").json()
        assert "app" in body
        assert "runtime" in body
        assert "dependencies" in body

    def test_app_section_shape(self) -> None:
        with _client() as c:
            body = c.get("/api/system/info").json()
        app_section = body["app"]
        assert app_section["name"] == "Bibliogon"
        # Version must be a non-empty string. Exact value varies
        # per release; SHAPE is the contract.
        assert isinstance(app_section["version"], str)
        assert app_section["version"]
        assert app_section["license"] == "MIT"
        assert isinstance(app_section["authors"], list)
        # At least one author should be set (currently
        # "Asterios Raptis" per pyproject.toml).
        assert len(app_section["authors"]) >= 1
        assert app_section["repository_url"].startswith("https://github.com/")
        assert "/issues" in app_section["issues_url"]

    def test_runtime_section_shape(self) -> None:
        with _client() as c:
            body = c.get("/api/system/info").json()
        runtime = body["runtime"]
        # Python version is a dotted string like "3.12.3".
        assert isinstance(runtime["python_version"], str)
        assert "." in runtime["python_version"]
        # Platform fields are always strings (even if empty on some
        # exotic platforms).
        assert isinstance(runtime["platform_system"], str)
        assert isinstance(runtime["platform_release"], str)
        assert isinstance(runtime["platform_machine"], str)

    def test_dependencies_section_shape(self) -> None:
        with _client() as c:
            body = c.get("/api/system/info").json()
        deps = body["dependencies"]
        # The 4 bundled libs that the About dialog renders.
        # Either a string version or None (graceful degrade).
        for key in ("fastapi", "sqlalchemy", "pydantic", "pluginforge"):
            assert key in deps, f"Missing dependency entry: {key}"
            value = deps[key]
            assert value is None or isinstance(value, str)


class TestDiscoveredPluginsExtendedFields:
    """GET /api/settings/plugins/discovered — display_name + version added.

    Regression-pin for the About-Dialog 2026-05-18 audit's D4.A
    decision: the endpoint adds ``display_name`` + ``description``
    + ``version`` fields without removing existing ones. Backward-
    compatible expansion.
    """

    def test_endpoint_returns_200(self) -> None:
        with _client() as c:
            resp = c.get("/api/settings/plugins/discovered")
            assert resp.status_code == 200

    def test_pre_existing_fields_unchanged(self) -> None:
        with _client() as c:
            body = c.get("/api/settings/plugins/discovered").json()
        assert isinstance(body, list)
        assert len(body) > 0
        for entry in body:
            # The 6 fields existing consumers depend on
            # (PluginSettings.tsx etc.).
            for key in (
                "name",
                "has_config",
                "enabled",
                "loaded",
                "license_tier",
                "has_license",
            ):
                assert key in entry, (
                    f"Pre-existing field '{key}' missing in plugin "
                    f"{entry.get('name', '?')} discovered entry"
                )

    def test_new_fields_present(self) -> None:
        with _client() as c:
            body = c.get("/api/settings/plugins/discovered").json()
        for entry in body:
            assert "display_name" in entry
            assert "description" in entry
            assert "version" in entry
            # display_name + description are dicts (i18n) or {} when
            # the plugin's yaml lacks them.
            assert isinstance(entry["display_name"], dict)
            assert isinstance(entry["description"], dict)
            # version is a string or None (graceful when missing).
            assert entry["version"] is None or isinstance(entry["version"], str)

    def test_comics_localization_present(self) -> None:
        """plugin-comics is the canonical 8-language i18n example.

        Sub-contract test: comics ships 8 languages per the
        plugin-metadata pattern audit; a future regression that
        strips a language would fail here AND in the
        PLUGIN-METADATA-I18N-PARITY-01 P3 sweep.
        """
        with _client() as c:
            body = c.get("/api/settings/plugins/discovered").json()
        comics = next((p for p in body if p["name"] == "comics"), None)
        assert comics is not None, "comics plugin not discovered"
        assert comics["display_name"].get("de") == "Comic"
        assert comics["display_name"].get("en") == "Comics"
        # All 8 catalogs covered per the metadata audit.
        for lang in ("de", "en", "es", "fr", "el", "pt", "tr", "ja"):
            assert lang in comics["display_name"], (
                f"comics display_name missing {lang}"
            )
