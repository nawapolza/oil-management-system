FROM php:8.3-cli-alpine

RUN apk add --no-cache \
    bash \
    git \
    unzip \
    autoconf \
    g++ \
    make \
    openssl-dev

RUN pecl install mongodb \
    && docker-php-ext-enable mongodb

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY backend/composer.json backend/composer.lock* ./backend/

RUN cd backend && composer install --no-dev --optimize-autoloader --no-interaction

COPY backend ./backend

WORKDIR /app/backend

CMD php -S 0.0.0.0:${PORT:-10000} -t public public/index.php