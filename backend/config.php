<?php
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: 'localhost',
        'port' => getenv('DB_PORT') ?: '3307',
        'name' => getenv('DB_NAME') ?: 'oil_system',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'jwt_secret' => getenv('JWT_SECRET') ?: 'CHANGE_THIS_SECRET_FOR_PRODUCTION_2026',
    'jwt_expire_seconds' => 60 * 60 * 24 * 7,
    'upload_max_mb' => 5,
    'cors_allowed_origins' => [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost',
        'http://127.0.0.1',
    ],
];
