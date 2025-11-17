DC = docker compose
API = api
WORKER = worker
FRONT = front

up:
	@$(DC) up -d

exec-api:
	@$(DC) exec -ti $(API) sh

exec-front:
	@$(DC) exec -T $(FRONT) sh

composer-install:
	@$(DC) exec -T $(API) composer install --no-interaction --prefer-dist --optimize-autoloader $(ARGS)

down:
	@$(DC) down