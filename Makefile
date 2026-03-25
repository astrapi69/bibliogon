.PHONY: dev dev-bg dev-down dev-backend dev-frontend install install-backend install-frontend test clean prod

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

install: install-backend install-frontend ## Install all dependencies

install-backend:
	cd backend && poetry install

install-frontend:
	cd frontend && npm install

# --- Test ---

test: ## Run backend tests
	cd backend && poetry run pytest tests/ -v

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

# --- Help ---

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
