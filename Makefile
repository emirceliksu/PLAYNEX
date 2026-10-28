COMPOSE ?= docker compose

.PHONY: bootstrap up down nuke logs ps sh-web sh-api lint typecheck test fmt check-rust tokens brand storybook-build screenshots migrate

.env:
	cp infrastructure/development.env .env

# First run on a clean machine: builds images, installs JS deps and resolves Cargo lockfile.
bootstrap: .env
	$(COMPOSE) build
	$(COMPOSE) run --rm deps
	$(COMPOSE) run --rm --no-deps api cargo fetch

up: .env
	$(COMPOSE) up -d --build
	$(COMPOSE) ps

down:
	$(COMPOSE) down

# Removes named volumes too (node_modules, cargo target, databases).
nuke:
	$(COMPOSE) down -v --remove-orphans

logs:
	$(COMPOSE) logs -f --tail=100 $(S)

ps:
	$(COMPOSE) ps

sh-web:
	$(COMPOSE) exec web sh

sh-api:
	$(COMPOSE) exec api bash

lint:
	$(COMPOSE) exec web pnpm lint

typecheck:
	$(COMPOSE) exec web pnpm typecheck

test:
	$(COMPOSE) exec web pnpm test

fmt:
	$(COMPOSE) exec web pnpm format
	$(COMPOSE) exec api cargo fmt --all

check-rust:
	$(COMPOSE) exec api cargo fmt --all --check
	$(COMPOSE) exec api cargo clippy --workspace --all-targets -- -D warnings
	$(COMPOSE) exec api cargo check --workspace

tokens:
	$(COMPOSE) exec web pnpm --filter @playnex/design-tokens build

# Favicon, app icon and mail logo from the brand mark; the outputs are committed.
brand:
	$(COMPOSE) exec web pnpm --filter @playnex/design-tokens brand

storybook-build:
	$(COMPOSE) exec web pnpm --filter @playnex/ui build-storybook

screenshots:
	$(COMPOSE) --profile tools run --rm playwright

migrate:
	$(COMPOSE) exec api sqlx migrate run --source infrastructure/migrations
