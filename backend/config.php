<?php
return [
    // ตั้งค่า CORS ด้วย env เช่น https://your-frontend.onrender.com,http://localhost:5173
    'cors_allowed_origins' => array_filter(array_map('trim', explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1'))),

    'jwt_secret' => getenv('JWT_SECRET') ?: 'CHANGE_THIS_SECRET_FOR_PRODUCTION_2026',
    'jwt_expire_seconds' => (int)(getenv('JWT_EXPIRE_SECONDS') ?: 60 * 60 * 24 * 7),
    'upload_max_mb' => (int)(getenv('UPLOAD_MAX_MB') ?: 5),

    'mongo' => [
        // รองรับทั้ง MONGODB_URI และ MONGODB เพื่อใช้กับค่าที่ตั้งไว้เดิม
        'uri' => getenv('MONGODB_URI') ?: (getenv('MONGODB') ?: 'mongodb://127.0.0.1:27017'),
        'db' => getenv('MONGODB_DB') ?: 'oil_management_system',
    ],
];
