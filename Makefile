.PHONY: dev dev-backend dev-frontend install install-backend install-frontend test clean prod

# --- Development ---

dev: ## Start backend + frontend parallel
	@echo "Starting Bibliogon..."
	@make -j2 dev-backend dev-frontend

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
