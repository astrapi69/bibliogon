.PHONY: dev dev-bg dev-down dev-backend dev-frontend \
       install install-backend install-frontend install-plugins \
       test test-backend test-plugins \
       test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch \
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
	cd backend && poetry run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# --- Install ---

install: install-plugins install-backend install-frontend ## Install all dependencies

install-backend:
	cd backend && poetry install

install-frontend:
	cd frontend && npm install

install-plugins:
	@for dir in plugins/bibliogon-plugin-*; do \
		if [ -f "$$dir/pyproject.toml" ]; then \
			echo "Installing $$dir..."; \
			cd "$$dir" && poetry install && cd ../..; \
		fi; \
	done

# --- Test ---

test: test-plugins test-backend ## Run ALL tests (plugins + backend)
	@echo ""
	@echo "=== All tests complete ==="

test-backend: ## Run backend tests (10 tests)
	@echo ""
	@echo "=== Backend Tests ==="
	cd backend && poetry run pytest tests/ -v

test-plugins: test-plugin-export test-plugin-grammar test-plugin-kdp test-plugin-kinderbuch ## Run all plugin tests (48 tests)

test-plugin-export: ## Run export plugin tests (23 tests)
	@echo ""
	@echo "=== Export Plugin Tests ==="
	cd plugins/bibliogon-plugin-export && poetry run pytest tests/ -v

test-plugin-grammar: ## Run grammar plugin tests (7 tests)
	@echo ""
	@echo "=== Grammar Plugin Tests ==="
	cd plugins/bibliogon-plugin-grammar && poetry run pytest tests/ -v

test-plugin-kdp: ## Run KDP plugin tests (10 tests)
	@echo ""
	@echo "=== KDP Plugin Tests ==="
	cd plugins/bibliogon-plugin-kdp && poetry run pytest tests/ -v

test-plugin-kinderbuch: ## Run kinderbuch plugin tests (8 tests)
	@echo ""
	@echo "=== Kinderbuch Plugin Tests ==="
	cd plugins/bibliogon-plugin-kinderbuch && poetry run pytest tests/ -v

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
