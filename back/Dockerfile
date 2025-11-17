FROM php:8.3-fpm-alpine

# Installation des dépendances système et Nginx
RUN apk add --no-cache git unzip libzip-dev icu-dev oniguruma-dev openssl-dev rabbitmq-c-dev linux-headers $PHPIZE_DEPS \
    && pecl install redis amqp \
    && docker-php-ext-enable redis amqp \
    && docker-php-ext-install pdo pdo_mysql intl sockets \
    && apk del $PHPIZE_DEPS

# Installation des extensions PHP
RUN sed -i 's/^;*\s*clear_env\s*=.*/clear_env = no/' /usr/local/etc/php-fpm.d/www.conf

# Installation de Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copie des fichiers de l'application
COPY . .

# Permissions
RUN chown -R www-data:www-data /var/www/html

EXPOSE 9000


