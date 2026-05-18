.PHONY: build-zip test clean

VERSION := 1.0.0
SLUG := kinderbuch
PLUGIN_NAME := bibliogon-plugin-$(SLUG)
PACKAGE := bibliogon_$(subst -,_,$(SLUG))
ZIP_NAME := $(PLUGIN_NAME)-v$(VERSION).zip
# plugin.yaml is generated at build time from the canonical runtime
# metadata source. Single-source-of-truth per the 2026-05-18 plugin-
# metadata pattern audit (docs/audits/plugin-metadata-pattern-audit-
# 2026-05-18.md). No plugin.yaml is kept in the plugin source tree.
CANONICAL_YAML := ../../backend/config/plugins/$(SLUG).yaml

build-zip: ## Build ZIP for plugin installation (plugin.yaml generated from canonical source)
	@echo "Building $(ZIP_NAME)..."
	@test -f $(CANONICAL_YAML) || (echo "ERROR: canonical yaml missing at $(CANONICAL_YAML)"; exit 1)
	@rm -rf dist/$(ZIP_NAME) dist/staging
	@mkdir -p dist/staging/$(PLUGIN_NAME)
	@cp -r $(PACKAGE) dist/staging/$(PLUGIN_NAME)/
	@cp $(CANONICAL_YAML) dist/staging/$(PLUGIN_NAME)/plugin.yaml
	@cp pyproject.toml dist/staging/$(PLUGIN_NAME)/
	@cd dist/staging && zip -r ../$(ZIP_NAME) $(PLUGIN_NAME)/ \
		-x "$(PLUGIN_NAME)/$(PACKAGE)/__pycache__/*"
	@rm -rf dist/staging
	@echo "Created dist/$(ZIP_NAME) (plugin.yaml sourced from $(CANONICAL_YAML))"

test: ## Run plugin tests
	poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

clean: ## Remove build artifacts
	rm -rf dist/ .pytest_cache/ $(PACKAGE)/__pycache__/ tests/__pycache__/
