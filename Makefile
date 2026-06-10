.PHONY: dev dev-bg dev-bg-logs dev-down dev-backend dev-frontend stop restart fix-watchers \
       install install-backend install-frontend install-plugins install-e2e \
       test test-backend test-plugins test-e2e test-e2e-ui \
       test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook test-plugin-help test-plugin-getstarted test-plugin-git-sync test-plugin-comics test-plugin-medium-import \
       test-coverage test-coverage-backend test-coverage-frontend test-coverage-plugins coverage-backend coverage-frontend \
       audit audit-backend audit-frontend \
       test-coverage-plugin-audiobook test-coverage-plugin-export test-coverage-plugin-grammar test-coverage-plugin-kdp test-coverage-plugin-kinderbuch test-coverage-plugin-ms-tools test-coverage-plugin-translation test-coverage-plugin-help test-coverage-plugin-getstarted test-coverage-plugin-git-sync test-coverage-plugin-comics test-coverage-plugin-medium-import \
       mutmut-backend mutmut-export mutmut-ms-tools mutmut-results \
       check-types check-types-backend check-types-frontend \
       lint-frontend format-frontend \
       check-blockers archive-task archive-task-dry install-hooks \
       sync-versions sync-versions-dry sync-versions-check \
       generate-trial-key \
       docs-install docs-build docs-serve \
       sync-mkdocs-nav verify-mkdocs-nav check-mkdocs-orphans verify-docs-discipline \
       lock-all-plugins verify-plugin-locks verify-theme \
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
	@# Background uvicorn AND save the PID so `make stop`/`dev-down`
	@# can clean it up after the user Ctrl+C's the foreground frontend.
	@# Without the PID file, Ctrl+C only kills npm (foreground); the
	@# backgrounded uvicorn lingers and holds port 8000 until a manual
	@# kill. The `dev` target previously left this gap; the `dev-bg`
	@# target already had it right.
	@cd backend && poetry env use python3.12 -q 2>/dev/null; poetry run uvicorn app.main:app --reload --port 8000 &
	@echo $$! > .pid-backend
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
	@# Port-based kill: catches orphans from a previous crashed run
	@# AND uvicorn-reload's spawned worker (the parent's PID is in
	@# .pid-backend; the worker has a different PID). `fuser -k` is
	@# self-kill-safe: it identifies the holder by port, not by
	@# command-line pattern (the old `pkill -f "uvicorn app.main:app"`
	@# matched the shell running pkill itself because the pattern
	@# string appears in the shell's argv, and `make stop` terminated
	@# with "Beendet" / SIGTERM as a result).
	@# Two-pass: TERM first for clean shutdown, then KILL for any
	@# stragglers - uvicorn's reload supervisor sometimes ignores
	@# SIGTERM and keeps the port bound (observed live 2026-05-18,
	@# orphan PID 14917 survived `fuser -k -TERM` for >1s).
	@fuser -k -TERM 8000/tcp 2>/dev/null || true
	@fuser -k -TERM 5173/tcp 2>/dev/null || true
	@sleep 1
	@fuser -k -KILL 8000/tcp 2>/dev/null || true
	@fuser -k -KILL 5173/tcp 2>/dev/null || true
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

build-frontend: ## Build the frontend production bundle to frontend/dist
	@echo "Building frontend bundle..."
	@cd frontend && npm run build
	@echo "Frontend built -> frontend/dist"

dev-lan: build-frontend ## Serve the whole app on the LAN, single port 0.0.0.0:8000 (mobile access, LAN-MODE-PHASE-1)
	@# Single-origin LAN mode: the backend serves the built frontend/dist
	@# AND the API on one port, so a phone reaches everything at one URL
	@# with no CORS hop. Foreground (one process); Ctrl+C stops it. NO
	@# --reload: a reload would regenerate the LAN PIN and drop sessions.
	@echo ""
	@echo "Bibliogon LAN mode: frontend + API on a single origin (:8000)."
	@ip=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
		if [ -n "$$ip" ]; then \
			echo "  On this device : http://localhost:8000"; \
			echo "  On the LAN     : http://$$ip:8000"; \
		else \
			echo "  Open http://<this-device-LAN-IP>:8000 on the phone."; \
		fi
	@echo "  (Backend binds 0.0.0.0, no --reload. Ctrl+C to stop.)"
	@echo ""
	@cd backend && poetry env use python3.12 -q 2>/dev/null; \
		BIBLIOGON_LAN_MODE=1 poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000

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

test-plugins: test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch test-plugin-ms-tools test-plugin-translation test-plugin-audiobook test-plugin-help test-plugin-getstarted test-plugin-git-sync test-plugin-comics test-plugin-medium-import ## Run all plugin tests

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

test-plugin-comics: ## Run comics plugin tests
	@echo ""
	@echo "=== Comics Plugin Tests ==="
	cd plugins/bibliogon-plugin-comics && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

test-plugin-medium-import: ## Run medium-import plugin tests
	@echo ""
	@echo "=== Medium-Import Plugin Tests ==="
	cd plugins/bibliogon-plugin-medium-import && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ -v

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

coverage-backend: test-coverage-backend ## Alias of test-coverage-backend (see docs/audits/coverage-baseline.md)

coverage-frontend: test-coverage-frontend ## Alias of test-coverage-frontend (see docs/audits/coverage-baseline.md)

# --- Dependency security audit (mirrors the CI steps in ci.yml) ---

audit: audit-backend audit-frontend ## Run both dependency security audits

audit-backend: ## pip-audit (known advisories ignored; tracked in #47)
	cd backend && poetry run pip-audit --skip-editable \
	  --ignore-vuln CVE-2026-34993 \
	  --ignore-vuln CVE-2026-47265 \
	  --ignore-vuln PYSEC-2026-196 \
	  --ignore-vuln CVE-2025-68616

audit-frontend: ## npm audit (high/critical only)
	cd frontend && npm audit --audit-level=high

test-coverage-plugins: test-coverage-plugin-audiobook test-coverage-plugin-export test-coverage-plugin-grammar test-coverage-plugin-kdp test-coverage-plugin-kinderbuch test-coverage-plugin-ms-tools test-coverage-plugin-translation test-coverage-plugin-help test-coverage-plugin-getstarted test-coverage-plugin-git-sync test-coverage-plugin-comics test-coverage-plugin-medium-import ## Run plugin tests with coverage

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

test-coverage-plugin-git-sync: ## Git-sync plugin coverage
	@echo ""
	@echo "=== Git-Sync Plugin Coverage ==="
	cd plugins/bibliogon-plugin-git-sync && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_git_sync --cov-report=html --cov-report=term

test-coverage-plugin-comics: ## Comics plugin coverage
	@echo ""
	@echo "=== Comics Plugin Coverage ==="
	cd plugins/bibliogon-plugin-comics && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_comics --cov-report=html --cov-report=term

test-coverage-plugin-medium-import: ## Medium-import plugin coverage
	@echo ""
	@echo "=== Medium-Import Plugin Coverage ==="
	cd plugins/bibliogon-plugin-medium-import && poetry env use python3.12 -q 2>/dev/null; poetry run pytest tests/ --cov=bibliogon_medium_import --cov-report=html --cov-report=term

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

# --- Blocker Status ---

check-blockers: ## Ping upstream sources for every BLOCKED item in docs/backlog.md
	@bash scripts/check-blockers.sh

archive-task: ## Move completed [x] tasks out of ROADMAP/backlog into docs/roadmap-archive/YYYY-MM.md (interactive)
	@python3 scripts/archive_completed_task.py

archive-task-dry: ## Same as archive-task but writes nothing (preview)
	@python3 scripts/archive_completed_task.py --dry-run

# --- Git Hooks ---

install-hooks: ## Install scripts/git-hooks/* into .git/hooks (per-checkout, not committed under .git)
	@mkdir -p .git/hooks
	@for hook in scripts/git-hooks/*; do \
		name=$$(basename $$hook); \
		ln -sf ../../$$hook .git/hooks/$$name; \
		echo "linked .git/hooks/$$name -> $$hook"; \
	done
	@echo "Hooks installed. They run on every git push; tag pushes trigger pre-commit on all backend files."

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

lint-frontend: ## Run ESLint on the frontend (non-blocking baseline; see docs/audits/eslint-baseline.md)
	@echo ""
	@echo "=== ESLint Frontend ==="
	cd frontend && npx eslint "src/**/*.{ts,tsx}"

format-frontend: ## Check Prettier formatting on the frontend (use ARGS=--write on changed files only; never the whole tree)
	@echo ""
	@echo "=== Prettier Frontend ==="
	cd frontend && npx prettier --check $(if $(ARGS),$(ARGS),"src/**/*.{ts,tsx}")

# --- E2E Tests ---

test-e2e: ## Run Playwright e2e tests (starts servers automatically)
	cd e2e && npx playwright test

test-e2e-ui: ## Run e2e tests with Playwright UI
	cd e2e && npx playwright test --ui

# --- Version sync ---

sync-versions: ## Propagate backend/pyproject.toml version to all subsystems
	@python3 scripts/sync_versions.py

sync-versions-dry: ## Show what sync-versions would change without writing
	@python3 scripts/sync_versions.py --dry-run

sync-versions-check: ## Exit non-zero if any subsystem version drifts from canonical
	@python3 scripts/sync_versions.py --check

# --- License ---

generate-seed-data: ## Regenerate offline-PWA seed JSON from backend YAML (run + commit after changing i18n/app.yaml/type registries)
	@cd backend && poetry run python ../scripts/generate-seed-data.py

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

sync-mkdocs-nav: ## Regenerate mkdocs.yml nav blocks from docs/help/_meta.yaml
	cd docs && poetry run python ../scripts/generate_mkdocs_nav.py

verify-mkdocs-nav: ## Check mkdocs.yml is in sync with docs/help/_meta.yaml (CI-friendly)
	cd docs && poetry run python ../scripts/generate_mkdocs_nav.py --check

check-mkdocs-orphans: ## Adversarial check: fail if mkdocs reports orphan pages
	bash scripts/check_mkdocs_orphans.sh

verify-docs-discipline: verify-mkdocs-nav check-mkdocs-orphans ## All docs-discipline gates (mandatory in pre-tag chain)
	@echo "All docs-discipline checks passed."

verify-docs-completeness: ## Release-time doc-completeness gate (version headers, help i18n parity, image/xref integrity). FAIL (exit 1) blocks; WARN (exit 2) is advisory.
	@python3 scripts/verify_docs_completeness.py; ec=$$?; \
	if [ $$ec -eq 1 ]; then exit 1; fi; \
	if [ $$ec -eq 2 ]; then echo "(verify-docs-completeness: advisory warnings only — not blocking)"; fi

# --- Plugin lockfile discipline (PLUGIN-LOCKFILE-DRIFT-01) ---
# `make test` installs plugins from the backend's combined poetry.lock
# (path-deps); CI installs each plugin from its OWN poetry.lock. The two
# paths drift independently when a shared external pin (e.g. fastapi)
# bumps in every plugin's pyproject. Catches the divergence before push.

lock-all-plugins: ## Re-lock every plugin's poetry.lock (after a shared-dep pin bump)
	@for d in plugins/bibliogon-plugin-*/; do \
		echo ""; echo "=== $$(basename $$d) ==="; \
		cd "$$d" && poetry lock && cd - >/dev/null; \
	done
	@echo ""
	@echo "Re-locked $$(ls -d plugins/bibliogon-plugin-*/ | wc -l) plugin(s)."

verify-plugin-locks: ## Detect drift between each plugin's pyproject.toml and its poetry.lock
	@drift=0; \
	for d in plugins/bibliogon-plugin-*/; do \
		name=$$(basename $$d); \
		out=$$(cd "$$d" && poetry install --dry-run --no-interaction --no-ansi 2>&1 | head -3); \
		if echo "$$out" | grep -q "changed significantly"; then \
			echo "DRIFT: $$name (run \`make lock-all-plugins\` or \`cd $$d && poetry lock\`)"; \
			drift=1; \
		fi; \
	done; \
	if [ $$drift -eq 1 ]; then \
		echo ""; \
		echo "ERROR: at least one plugin pyproject.toml drifts from its poetry.lock."; \
		echo "Same shape as the v0.30.0 release CI red-on-main: the backend's"; \
		echo "combined lock can be in sync while per-plugin locks lag. Run"; \
		echo "\`make lock-all-plugins\` to bring all plugin locks in sync."; \
		exit 1; \
	fi; \
	echo "OK: all plugin pyproject.toml/poetry.lock pairs in sync."

verify-theme: ## Theme-system gates: token completeness/undefined refs + WCAG contrast + no hardcoded hex
	@echo "=== theme-token completeness + undefined-token refs ==="
	@python3 scripts/audit_theme_tokens.py --enforce --quiet
	@echo "=== WCAG contrast across 12 variants ==="
	@python3 scripts/check_theme_contrast.py --enforce --quiet
	@echo "=== no hardcoded hex outside the allowed set ==="
	@python3 scripts/check_hardcoded_colors.py --enforce
	@echo "=== semantic badge contrast (color-mix tints, 12 variants) ==="
	@python3 scripts/check_badge_contrast.py
	@echo "Theme gates green."

verify-components: ## Advisory (non-blocking): CSS-module classes that re-declare a shared control surface (CSS-first rule)
	@python3 scripts/check_component_classes.py

# --- Release ---
# Aggregate Makefile targets for the release-workflow.md mechanical steps
# (Step 1 state capture, Step 4b dep currency, Step 5 test gate, Step 6
# builds, Step 7 tag+push, Step 8 GitHub release). Composes existing
# tools; does NOT replace the canonical sync-versions / verify_version_pins
# chain. The LLM/human-content steps (CHANGELOG draft, per-release notes
# composition, CLAUDE.md prose, journal entry) stay manual — release
# narrative is the human/LLM value-add.

release-state: ## Print state-capture report (release-workflow.md Step 1)
	@echo "=== Latest tags ==="
	@git tag --sort=-creatordate | head -5
	@LAST_TAG=$$(git describe --tags --abbrev=0); \
	echo ""; \
	echo "=== Commits since $$LAST_TAG ==="; \
	git log $$LAST_TAG..HEAD --oneline --no-merges | head -100; \
	echo ""; \
	echo "Commit count: $$(git log $$LAST_TAG..HEAD --oneline --no-merges | wc -l)"; \
	echo ""; \
	echo "=== Diff stat $$LAST_TAG..HEAD ==="; \
	git diff $$LAST_TAG..HEAD --stat | tail -1
	@echo ""
	@echo "=== Current canonical version ==="
	@grep "^version" backend/pyproject.toml

release-outdated: ## Dependency currency check across all surfaces (release-workflow.md Step 4b)
	@echo "=== Backend (poetry show --outdated) ==="
	@cd backend && COLUMNS=200 poetry show --outdated --no-ansi 2>&1 | grep -v "^bibliogon-plugin-" || true
	@echo ""
	@echo "=== Launcher (poetry show --outdated) ==="
	@cd launcher && COLUMNS=200 poetry show --outdated --no-ansi 2>&1 || true
	@echo ""
	@echo "=== Frontend (npm outdated) ==="
	@cd frontend && npm outdated --no-color 2>&1 || true
	@echo ""
	@echo "Reminder: apply routine bumps (patch+minor within same major) via 'poetry update <allowlist>' (never bare)."

release-test: test ## Aggregate pre-tag test gate (release-workflow.md Step 5)
	@echo ""
	@echo "=== Frontend tsc --noEmit ==="
	@cd frontend && npx tsc --noEmit
	@echo "tsc clean."
	@echo ""
	@echo "=== Backend ruff check ==="
	@cd backend && poetry run ruff check app/
	@echo ""
	@echo "=== Backend mypy ==="
	@cd backend && poetry run mypy app/
	@echo ""
	@echo "=== pre-commit run --all-files ==="
	@cd backend && poetry run pre-commit run --all-files
	@$(MAKE) verify-docs-discipline
	@$(MAKE) verify-docs-completeness
	@$(MAKE) verify-plugin-locks
	@echo ""
	@echo "=== Theme-system gates (tokens + contrast + hardcoded colors) ==="
	@$(MAKE) verify-theme
	@echo ""
	@echo "=== Launcher PyInstaller build smoke ==="
	@cd launcher && poetry run pyinstaller bibliogon-launcher.spec --clean --noconfirm > /tmp/launcher-build.log 2>&1 && echo "Launcher build OK" || (tail -20 /tmp/launcher-build.log && exit 1)
	@echo ""
	@echo "Release test gate green. Run Playwright smoke separately: cd e2e && npx playwright test --project=smoke"

release-build: ## Build release artifacts (release-workflow.md Step 6)
	@PACKAGE_MODE=$$(grep "^package-mode" backend/pyproject.toml | head -1 | awk '{print $$3}' | tr -d ' '); \
	if [ "$$PACKAGE_MODE" = "false" ]; then \
		echo "=== Backend poetry build: SKIPPED (package-mode=false) ==="; \
	else \
		echo "=== Backend poetry build ==="; \
		cd backend && poetry build; \
	fi
	@echo ""
	@echo "=== Frontend npm run build ==="
	@cd frontend && npm run build

release-tag: ## Tag + push main + push tag. Usage: make release-tag VERSION=0.X.Y
ifndef VERSION
	$(error VERSION is required, e.g. make release-tag VERSION=0.35.0)
endif
	@echo "=== Pre-tag verification (verify_version_pins.sh) ==="
	@bash scripts/verify_version_pins.sh $(VERSION)
	@echo ""
	@echo "=== Creating tag v$(VERSION) ==="
	@git tag -a v$(VERSION) -m "Release v$(VERSION)"
	@echo "=== Pushing main ==="
	@git push origin main
	@echo "=== Pushing tag v$(VERSION) ==="
	@git push origin v$(VERSION)
	@echo ""
	@echo "Tag pushed. Next: make release-publish VERSION=$(VERSION)"

release-discover: ## Discover version-shape literals outside the sync-versions target list (advisory)
	@echo "=== Version-literal discovery ==="
	@echo "Scanning for X.Y.Z literals in version-assignment contexts"
	@echo "outside the known sync-versions targets + Tier-4 manual files."
	@echo ""
	@output=$$(bash scripts/discover_version_literals.sh); \
	if [ -z "$$output" ]; then \
		echo "Clean. No unknown version literals."; \
	else \
		echo "$$output"; \
	fi

release-publish: ## Create GitHub Release from changelog/releases/vX.Y.Z.md. Usage: make release-publish VERSION=0.X.Y
ifndef VERSION
	$(error VERSION is required, e.g. make release-publish VERSION=0.35.0)
endif
	@if [ ! -f "changelog/releases/v$(VERSION).md" ]; then \
		echo "ERROR: changelog/releases/v$(VERSION).md missing."; \
		echo "Draft the per-release notes file first (release-workflow.md Step 3)."; \
		exit 1; \
	fi
	@echo "=== Publishing GitHub Release v$(VERSION) ==="
	@gh release create v$(VERSION) \
		--title "Bibliogon v$(VERSION)" \
		--notes-file changelog/releases/v$(VERSION).md

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
