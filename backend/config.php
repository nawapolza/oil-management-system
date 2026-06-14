<?php

function env_value(string $key, ?string $default = null): ?string
{
    $value = getenv($key);

    if ($value === false || $value === '') {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? $default;
    }

    return is_string($value) ? trim($value) : $default;
}

$frontendOrigins = env_value('CORS_ALLOWED_ORIGINS', '');
$extraOrigins = $frontendOrigins
    ? array_filter(array_map('trim', explode(',', $frontendOrigins)))
    : [];

return [
    'mongodb' => [
        'uri' => env_value('MONGODB_URI'),
        'db'  => env_value('MONGODB_DB', 'oil_management_system'),
    ],

    'jwt_secret' => env_value('JWT_SECRET', 'd6bed3a2b0587f7e1f69c377760fc7b4'),
    'jwt_expire_seconds' => 60 * 60 * 24 * 7,
    'upload_max_mb' => 5,

    'cors_allowed_origins' => array_values(array_unique(array_merge([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost',
        'http://127.0.0.1',

        // ใส่ URL frontend จริงของที่รักบน Render
        'https://oil-management-system.onrender.com',

        // ใส่ backend ไว้ได้ ไม่เสียหาย
        'https://oil-management-backend.onrender.com',
    ], $extraOrigins))),
];