<?php

return [
    'mongodb' => [
        'uri' => getenv('MONGODB_URI')
            ?: getenv('MONGODB')
            ?: 'mongodb+srv://sarawutoil:8CCKjqGJ0LaqUJgq@sarawutoil.rz8pa0w.mongodb.net/',
        'db' => getenv('MONGODB_DB') ?: 'oil_management_system',
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