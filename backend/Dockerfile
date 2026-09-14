FROM php:8.3-fpm-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev unzip nginx \
    && docker-php-ext-install pdo_pgsql pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Install locked dependencies first so this layer is cached across code changes
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --prefer-dist

COPY . .
RUN composer dump-autoload --optimize --no-dev

COPY docker/nginx-backend.conf /etc/nginx/sites-enabled/default
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p storage/framework/{cache,sessions,testing,views} storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD php -r "exit(@file_get_contents('http://127.0.0.1:8001/api/health') !== false ? 0 : 1);"

CMD ["/entrypoint.sh"]
