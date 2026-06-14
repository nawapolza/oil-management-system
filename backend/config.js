require('dotenv').config();

function env(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function envNumber(name, fallback) {
  const value = Number(env(name, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

module.exports = {
  port: envNumber('PORT', 10000),

  mongodb: {
    uri: env('MONGODB_URI', env('MONGODB', '')),
    db: env('MONGODB_DB', 'oil_management_system'),
  },

  jwtSecret: env('JWT_SECRET', 'CHANGE_THIS_SECRET_FOR_PRODUCTION_2026'),
  jwtExpireSeconds: envNumber('JWT_EXPIRE_SECONDS', 60 * 60 * 24 * 7),

  uploadMaxMb: envNumber('UPLOAD_MAX_MB', 5),

  corsAllowedOrigins: Array.from(new Set([
    ...defaultOrigins,
    ...splitOrigins(env('CORS_ALLOWED_ORIGINS', '')),
    ...splitOrigins(env('FRONTEND_URL', '')),
  ])),

  corsAllowAll: ['1', 'true', 'yes', 'on'].includes(env('CORS_ALLOW_ALL', 'false').toLowerCase()),
};
