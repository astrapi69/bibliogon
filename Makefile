.PHONY: dev dev-bg dev-bg-logs dev-down dev-backend dev-frontend stop restart fix-watchers \
       install install-backend install-frontend install-plugins install-e2e \
       test test-backend test-plugins test-e2e test-e2e-ui \
       test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook test-plugin-help test-plugin-getstarted test-plugin-git-sync \
       test-coverage test-coverage-backend test-coverage-frontend test-coverage-plugins \
       test-coverage-plugin-audiobook test-coverage-plugin-export test-coverage-plugin-grammar test-coverage-plugin-kdp test-coverage-plugin-kinderbuch test-coverage-plugin-ms-tools test-coverage-plugin-translation test-coverage-plugin-help test-coverage-plugin-getstarted \
       mutmut-backend mutmut-export mutmut-ms-tools mutmut-results \
       check-types check-types-backend check-types-frontend \
       generate-trial-key \
       docs-install docs-build docs-serve \
       clean prod prod-down prod-logs help

# --- Development ---

dev: ## Start backend + frontend (backend first, then frontend)
	@if [ -r /proc/sys/fs/inotify/max_user_watches ]; then \
		watches=$$(cat /proc/sys/fs/inotify/max_user_watches); \
		if [ "$$watches" -lt 100000 ]; then \
			echo "WARNING: fs.inotify.max_user_watches=$$watches is low (< 100000)."; \
			echo "         vite dev will likely fail with ENOSPC."; \
			echo "         Run 'make fix-watchers' for the persistent fix."; \
		fi; \
	fi
	@echo "Starting Bibliogon..."
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run uvicorn app.main:app --reload --port 8000 &
	@echo "Waiting for backend..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		curl -s http://localhost:8000/api/health > /dev/null 2>&1 && break; \
		sleep 1; \
	done
	@echo "Backend ready. Starting frontend..."
	@cd frontend && npm run dev

DEV_LOG_DIR ?= /tmp/bibliogon-logs

dev-bg: ## Start in background, logs to $(DEV_LOG_DIR) (stop with: make dev-down)
	@mkdir -p $(DEV_LOG_DIR)
	@echo "Starting Bibliogon (background)..."
	@echo "  Backend  log: $(DEV_LOG_DIR)/backend.log"
	@echo "  Frontend log: $(DEV_LOG_DIR)/frontend.log"
	@# `setsid` puts each child in its own session so it survives the
	@# Makefile recipe shell exiting. `< /dev/null` closes stdin so the
	@# child does not block waiting on a tty. `> ... 2>&1` captures both
	@# streams to a log file we can tail later. The bare `&` backgrounds
	@# the compound, and `echo $$!` then writes the child PID for
	@# `dev-down` to kill.
	@# `A && B &` is one AND-OR list backgrounded in a subshell; the
	@# subshell inherits the cd, the main shell does not. So PID
	@# files are written from the main recipe shell at repo root, and
	@# the path is `.pid-backend` (NOT `../.pid-backend`).
	@cd backend && \
		setsid poetry run uvicorn app.main:app --reload --port 8000 \
			< /dev/null > $(DEV_LOG_DIR)/backend.log 2>&1 & \
		echo $$! > .pid-backend
	@cd frontend && \
		setsid npm run dev \
			< /dev/null > $(DEV_LOG_DIR)/frontend.log 2>&1 & \
		echo $$! > .pid-frontend
	@sleep 2
	@if kill -0 $$(cat .pid-backend) 2>/dev/null; then \
		echo "  Backend  PID: $$(cat .pid-backend) (alive)"; \
	else \
		echo "  ERROR: backend died on startup. tail $(DEV_LOG_DIR)/backend.log"; \
		rm -f .pid-backend; \
		exit 1; \
	fi
	@if kill -0 $$(cat .pid-frontend) 2>/dev/null; then \
		echo "  Frontend PID: $$(cat .pid-frontend) (alive)"; \
	else \
		echo "  ERROR: frontend died on startup. tail $(DEV_LOG_DIR)/frontend.log"; \
		rm -f .pid-frontend; \
		exit 1; \
	fi
	@echo "Stop with: make dev-down  |  Tail logs with: make dev-bg-logs"

dev-bg-logs: ## Tail backend + frontend logs from a `make dev-bg` run
	@if [ ! -f $(DEV_LOG_DIR)/backend.log ] && [ ! -f $(DEV_LOG_DIR)/frontend.log ]; then \
		echo "No logs in $(DEV_LOG_DIR). Run 'make dev-bg' first."; \
		exit 1; \
	fi
	@echo "Tailing $(DEV_LOG_DIR)/backend.log + $(DEV_LOG_DIR)/frontend.log (Ctrl+C to stop)..."
	@tail -F $(DEV_LOG_DIR)/backend.log $(DEV_LOG_DIR)/frontend.log

dev-down: ## Stop background dev servers
	@if [ -f .pid-backend ]; then kill $$(cat .pid-backend) 2>/dev/null; rm -f .pid-backend; echo "Backend stopped"; fi
	@if [ -f .pid-frontend ]; then kill $$(cat .pid-frontend) 2>/dev/null; rm -f .pid-frontend; echo "Frontend stopped"; fi
	@pkill -f "uvicorn app.main:app" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@echo "Done"

stop: dev-down ## Alias for dev-down (stop dev servers)

restart: dev-down dev ## Stop and restart dev servers (use after a hung session)

fix-watchers: ## Persist Linux inotify limits for vite dev (sudo required, runs once)
	@echo "Bibliogon: persist inotify limits for vite dev mode."
	@echo "Sudo prompt is for the sysctl write to /etc/sysctl.d/."
	@echo ""
	@echo "fs.inotify.max_user_watches=524288" | sudo tee /etc/sysctl.d/99-bibliogon-watchers.conf > /dev/null
	@echo "fs.inotify.max_user_instances=512" | sudo tee -a /etc/sysctl.d/99-bibliogon-watchers.conf > /dev/null
	@sudo sysctl --system > /dev/null
	@echo "Wrote /etc/sysctl.d/99-bibliogon-watchers.conf and applied:"
	@echo "  fs.inotify.max_user_watches    = $$(cat /proc/sys/fs/inotify/max_user_watches)"
	@echo "  fs.inotify.max_user_instances  = $$(cat /proc/sys/fs/inotify/max_user_instances)"
	@echo "Persistent across reboots."

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

test: test-plugins test-backend test-frontend ## Run ALL tests, no coverage (everyday use; coverage runs in CI - see test-coverage)
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

test-plugins: test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook test-plugin-help test-plugin-getstarted test-plugin-git-sync ## Run all plugin tests

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

test-plugin-help: ## Run help plugin tests
	@echo ""
	@echo "=== Help Plugin Tests ==="
	cd plugins/bibliogon-plugin-help && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-getstarted: ## Run getstarted plugin tests
	@echo ""
	@echo "=== Getstarted Plugin Tests ==="
	cd plugins/bibliogon-plugin-getstarted && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-git-sync: ## Run git-sync plugin tests (PGS-01)
	@echo ""
	@echo "=== Git-Sync Plugin Tests ==="
	cd plugins/bibliogon-plugin-git-sync && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

# --- Coverage (heavy, opt-in; CI runs this on every push - see .github/workflows/coverage.yml) ---

test-coverage: test-coverage-plugins test-coverage-backend test-coverage-frontend ## Run ALL tests with coverage (slow; prefer CI)
	@echo ""
	@echo "=== All coverage runs complete ==="

test-coverage-backend: ## Backend coverage report (htmlcov/)
	@echo ""
	@echo "=== Backend Coverage ==="
	cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=app --cov-report=html --cov-report=term

test-coverage-frontend: ## Frontend coverage report (coverage/)
	@echo ""
	@echo "=== Frontend Coverage ==="
	cd frontend && npm run test:coverage

test-coverage-plugins: test-coverage-plugin-audiobook test-coverage-plugin-export test-coverage-plugin-grammar test-coverage-plugin-kdp test-coverage-plugin-kinderbuch test-coverage-plugin-ms-tools test-coverage-plugin-translation test-coverage-plugin-help test-coverage-plugin-getstarted ## Run plugin tests with coverage

test-coverage-plugin-audiobook: ## Audiobook plugin coverage
	@echo ""
	@echo "=== Audiobook Plugin Coverage ==="
	cd plugins/bibliogon-plugin-audiobook && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_audiobook --cov-report=html --cov-report=term

test-coverage-plugin-export: ## Export plugin coverage
	@echo ""
	@echo "=== Export Plugin Coverage ==="
	cd plugins/bibliogon-plugin-export && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_export --cov-report=html --cov-report=term

test-coverage-plugin-grammar: ## Grammar plugin coverage
	@echo ""
	@echo "=== Grammar Plugin Coverage ==="
	cd plugins/bibliogon-plugin-grammar && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_grammar --cov-report=html --cov-report=term

test-coverage-plugin-kdp: ## KDP plugin coverage
	@echo ""
	@echo "=== KDP Plugin Coverage ==="
	cd plugins/bibliogon-plugin-kdp && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_kdp --cov-report=html --cov-report=term

test-coverage-plugin-kinderbuch: ## Kinderbuch plugin coverage
	@echo ""
	@echo "=== Kinderbuch Plugin Coverage ==="
	cd plugins/bibliogon-plugin-kinderbuch && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_kinderbuch --cov-report=html --cov-report=term

test-coverage-plugin-ms-tools: ## ms-tools plugin coverage
	@echo ""
	@echo "=== ms-tools Plugin Coverage ==="
	cd plugins/bibliogon-plugin-ms-tools && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_ms_tools --cov-report=html --cov-report=term

test-coverage-plugin-translation: ## Translation plugin coverage
	@echo ""
	@echo "=== Translation Plugin Coverage ==="
	cd plugins/bibliogon-plugin-translation && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_translation --cov-report=html --cov-report=term

test-coverage-plugin-help: ## Help plugin coverage
	@echo ""
	@echo "=== Help Plugin Coverage ==="
	cd plugins/bibliogon-plugin-help && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_help --cov-report=html --cov-report=term

test-coverage-plugin-getstarted: ## Getstarted plugin coverage
	@echo ""
	@echo "=== Getstarted Plugin Coverage ==="
	cd plugins/bibliogon-plugin-getstarted && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_getstarted --cov-report=html --cov-report=term

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

generate-trial-key: ## Generate 30-day trial key. Usage: make generate-trial-key AUTHOR="Name"
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run python -c \
		"from app.licensing import *; \
		v = LicenseValidator(get_license_secret()); \
		key = create_trial_key(v, author='$(AUTHOR)', days=30); \
		print('Trial Key:', key); \
		print('Author:', '$(AUTHOR)' or '(any)'); \
		from datetime import date, timedelta; \
		print('Expires:', (date.today() + timedelta(days=30)).isoformat())"

generate-license-key: ## Generate plugin key. Usage: make generate-license-key PLUGIN=audiobook AUTHOR="Name" DAYS=365
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run python -c \
		"from app.licensing import *; \
		v = LicenseValidator(get_license_secret()); \
		key = create_plugin_key(v, '$(PLUGIN)', '$(AUTHOR)', int('$(DAYS)' or '365')); \
		print('Key:', key); \
		print('Plugin:', '$(PLUGIN)'); \
		print('Author:', '$(AUTHOR)'); \
		from datetime import date, timedelta; \
		print('Expires:', (date.today() + timedelta(days=int('$(DAYS)' or '365'))).isoformat())"

generate-license-key-all: ## Generate key for all plugins. Usage: make generate-license-key-all AUTHOR="Name" DAYS=365
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run python -c \
		"from app.licensing import *; \
		v = LicenseValidator(get_license_secret()); \
		from datetime import date, timedelta; \
		days = int('$(DAYS)' or '365'); \
		expires = (date.today() + timedelta(days=days)).isoformat(); \
		p = LicensePayload(plugin='*', version='1', expires=expires, author='$(AUTHOR)'); \
		key = v.create_license(p); \
		print('Key:', key); \
		print('Plugins: ALL'); \
		print('Author:', '$(AUTHOR)'); \
		print('Expires:', expires)"

seed-voices: ## Sync Edge TTS voices into the database
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run python -c \
		"import asyncio; from app.database import SessionLocal, init_db; init_db(); \
		from app.voice_store import sync_edge_tts_voices; \
		db = SessionLocal(); count = asyncio.run(sync_edge_tts_voices(db)); db.close(); \
		print(f'{count} voices synced')"

# --- Production (Docker) ---

prod: ## Start production via Docker Compose
	docker compose -f docker-compose.prod.yml up --build -d

prod-down: ## Stop production
	docker compose -f docker-compose.prod.yml down

prod-logs: ## Show production logs
	docker compose -f docker-compose.prod.yml logs -f

# --- Documentation (MkDocs) ---

docs-install: ## Install MkDocs dependencies (separate venv in docs/)
	cd docs && poetry install

docs-build: ## Build static documentation site
	cd docs && poetry run python ../scripts/generate_mkdocs_nav.py
	cd docs && poetry run mkdocs build -f ../mkdocs.yml

docs-serve: ## Serve documentation locally (hot-reload)
	cd docs && poetry run python ../scripts/generate_mkdocs_nav.py
	cd docs && poetry run mkdocs serve -f ../mkdocs.yml

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
