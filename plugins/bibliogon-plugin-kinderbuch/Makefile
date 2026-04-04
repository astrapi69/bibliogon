.PHONY: build-zip test clean

VERSION := 1.0.0
PLUGIN_NAME := bibliogon-plugin-kinderbuch
ZIP_NAME := $(PLUGIN_NAME)-v$(VERSION).zip

build-zip: ## Build ZIP for plugin installation
	@echo "Building $(ZIP_NAME)..."
	@rm -rf dist/$(ZIP_NAME)
	@mkdir -p dist
	@cd .. && zip -r $(PLUGIN_NAME)/dist/$(ZIP_NAME) \
		$(PLUGIN_NAME)/bibliogon_kinderbuch/ \
		$(PLUGIN_NAME)/plugin.yaml \
		$(PLUGIN_NAME)/pyproject.toml \
		-x "$(PLUGIN_NAME)/bibliogon_kinderbuch/__pycache__/*"
	@echo "Created dist/$(ZIP_NAME)"

test: ## Run plugin tests
	poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

clean: ## Remove build artifacts
	rm -rf dist/ .pytest_cache/ bibliogon_kinderbuch/__pycache__/ tests/__pycache__/
