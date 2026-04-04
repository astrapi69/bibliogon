.PHONY: dev dev-bg dev-down dev-backend dev-frontend \
       install install-backend install-frontend install-plugins install-e2e \
       test test-backend test-plugins test-e2e test-e2e-ui \
       test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook \
       mutmut-backend mutmut-export mutmut-ms-tools mutmut-results \
       check-types check-types-backend check-types-frontend \
       generate-trial-key \
       clean prod prod-down prod-logs help

# --- Development ---

dev: ## Start backend + frontend parallel (Strg+C stoppt beide)
	@echo "Starting Bibliogon..."
	@make -j2 dev-backend dev-frontend

dev-bg: ## Start in background (stop with: make dev-down)
	@echo "Starting Bibliogon (background)..."
	@cd backend && poetry run uvicorn app.main:app --reload --port 8000 & echo $$! > .pid-backend
	@cd frontend && npm run dev & echo $$! > .pid-frontend
	@echo "Backend PID: $$(cat .pid-backend)"
	@echo "Frontend PID: $$(cat .pid-frontend)"
	@echo "Stop with: make dev-down"

dev-down: ## Stop background dev servers
	@if [ -f .pid-backend ]; then kill $$(cat .pid-backend) 2>/dev/null; rm -f .pid-backend; echo "Backend stopped"; fi
	@if [ -f .pid-frontend ]; then kill $$(cat .pid-frontend) 2>/dev/null; rm -f .pid-frontend; echo "Frontend stopped"; fi
	@pkill -f "uvicorn app.main:app" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@echo "Done"

dev-backend:
	cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# --- Install ---

install: install-plugins install-backend install-frontend install-e2e ## Install all dependencies

install-backend:
	cd backend && poetry install

install-frontend:
	cd frontend && npm install

install-e2e:
	cd e2e && npm install && npx playwright install chromium

install-plugins:
	@for dir in plugins/bibliogon-plugin-*; do \
		if [ -f "$$dir/pyproject.toml" ]; then \
			echo "Installing $$dir..."; \
			cd "$$dir" && poetry install && cd ../..; \
		fi; \
	done

# --- Test ---

test: test-plugins test-backend test-frontend ## Run ALL tests (plugins + backend + frontend)
	@echo ""
	@echo "=== All tests complete ==="

test-frontend: ## Run frontend unit tests (Vitest)
	@echo ""
	@echo "=== Frontend Tests ==="
	cd frontend && npx vitest run

test-backend: ## Run backend tests
	@echo ""
	@echo "=== Backend Tests ==="
	cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugins: test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook ## Run all plugin tests

test-plugin-export: ## Run export plugin tests
	@echo ""
	@echo "=== Export Plugin Tests ==="
	cd plugins/bibliogon-plugin-export && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-grammar: ## Run grammar plugin tests
	@echo ""
	@echo "=== Grammar Plugin Tests ==="
	cd plugins/bibliogon-plugin-grammar && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-kdp: ## Run KDP plugin tests
	@echo ""
	@echo "=== KDP Plugin Tests ==="
	cd plugins/bibliogon-plugin-kdp && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-kinderbuch: ## Run kinderbuch plugin tests
	@echo ""
	@echo "=== Kinderbuch Plugin Tests ==="
	cd plugins/bibliogon-plugin-kinderbuch && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-ms-tools: ## Run manuscript tools plugin tests
	@echo ""
	@echo "=== Manuscript Tools Plugin Tests ==="
	cd plugins/bibliogon-plugin-ms-tools && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-translation: ## Run translation plugin tests
	@echo ""
	@echo "=== Translation Plugin Tests ==="
	cd plugins/bibliogon-plugin-translation && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-audiobook: ## Run audiobook plugin tests
	@echo ""
	@echo "=== Audiobook Plugin Tests ==="
	cd plugins/bibliogon-plugin-audiobook && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

# --- Mutation Testing ---

mutmut-backend: ## Run mutation testing on backend
	@echo ""
	@echo "=== Mutation Testing: Backend ==="
	cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run mutmut run

mutmut-export: ## Run mutation testing on export plugin
	@echo ""
	@echo "=== Mutation Testing: Export Plugin ==="
	cd plugins/bibliogon-plugin-export && poetry env use python3.12 -q 2>/dev/null; poetry run mutmut run

mutmut-ms-tools: ## Run mutation testing on ms-tools plugin
	@echo ""
	@echo "=== Mutation Testing: MS-Tools Plugin ==="
	cd plugins/bibliogon-plugin-ms-tools && poetry env use python3.12 -q 2>/dev/null; poetry run mutmut run

mutmut-results: ## Show mutation testing results
	@echo "=== Backend ===" && cd backend && poetry run mutmut results 2>/dev/null || true
	@echo "=== Export ===" && cd plugins/bibliogon-plugin-export && poetry run mutmut results 2>/dev/null || true
	@echo "=== MS-Tools ===" && cd plugins/bibliogon-plugin-ms-tools && poetry run mutmut results 2>/dev/null || true

# --- Type Checking ---

check-types: check-types-backend check-types-frontend ## Run all type checks

check-types-backend: ## Run mypy on backend
	@echo ""
	@echo "=== mypy Backend ==="
	cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run mypy app/

check-types-frontend: ## Run tsc --noEmit on frontend
	@echo ""
	@echo "=== TypeScript Frontend ==="
	cd frontend && npx tsc --noEmit

# --- E2E Tests ---

test-e2e: ## Run Playwright e2e tests (starts servers automatically)
	cd e2e && npx playwright test

test-e2e-ui: ## Run e2e tests with Playwright UI
	cd e2e && npx playwright test --ui

# --- License ---

generate-trial-key: ## Generate a 30-day trial key for all premium plugins
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run python -c \
		"from app.licensing import LicenseValidator, create_trial_key; \
		v = LicenseValidator('pluginforge-default-key'); \
		print(create_trial_key(v, 30))"

# --- Production (Docker) ---

prod: ## Start production via Docker Compose
	docker compose -f docker-compose.prod.yml up --build -d

prod-down: ## Stop production
	docker compose -f docker-compose.prod.yml down

prod-logs: ## Show production logs
	docker compose -f docker-compose.prod.yml logs -f

# --- Clean ---

clean: ## Remove build artifacts and caches
	rm -rf backend/__pycache__ backend/.pytest_cache backend/*.db
	rm -rf frontend/node_modules frontend/dist
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

# --- Help ---

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'
