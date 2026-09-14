#!/bin/sh
# On every start: run pending migrations (creating the schema from
# scratch on a fresh DB, or upgrading an existing one — this is what
# makes a plain `docker compose up -d --build` an upgrade, not just a
# first install), ensure the default admin exists, then serve.
set -e

php artisan config:cache
php artisan cc:install

php-fpm -D
exec nginx -g 'daemon off;'
