FROM php:8.3-fpm-alpine

# Dépendances système + libs nécessaires aux extensions PHP
RUN apk add --no-cache \
    git unzip \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    openssl-dev \
    rabbitmq-c-dev \
    linux-headers \
    inotify-tools \
    freetype-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    $PHPIZE_DEPS \
    \
    && pecl install redis amqp \
    && docker-php-ext-enable redis amqp \
    \
    && docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
    \
    && docker-php-ext-install \
        pdo \
        pdo_mysql \
        intl \
        sockets \
        zip \
        gd \
    \
    && apk del $PHPIZE_DEPS

# PHP-FPM config
RUN sed -i 's/^;*\s*clear_env\s*=.*/clear_env = no/' /usr/local/etc/php-fpm.d/www.conf

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY . .

RUN chown -R www-data:www-data /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9000

CMD ["/usr/local/bin/docker-entrypoint.sh"]
