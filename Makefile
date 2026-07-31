.PHONY: help install dev backend frontend check clean

help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install backend + frontend dependencies
	cd backend && npm install
	cd frontend && pnpm install
	@test -f backend/.env || (cp backend/.env.example backend/.env && \
		echo "\n  Created backend/.env — fill in OPENROUTER_API_KEY (MCP defaults are ready to run)\n")

dev: ## Run backend (:3000) and frontend (:5173) together
	@$(MAKE) -j2 backend frontend

backend: ## Run the backend only
	cd backend && npm run dev

frontend: ## Run the frontend only
	cd frontend && pnpm dev

check: ## Type-check and lint both sides
	cd backend && npm run type-check && npm run lint
	cd frontend && pnpm type-check && pnpm lint

clean: ## Remove installed dependencies
	rm -rf backend/node_modules frontend/node_modules
