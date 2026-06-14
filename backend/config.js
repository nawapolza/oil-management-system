require('dotenv').config();

function envValue(key, defaultValue = '') {
  const value = process.env[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  return String(value).trim();
}

function intValue(key, defaultValue) {
  const n = Number.parseInt(envValue(key, String(defaultValue)), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

const extraOrigins = envValue('CORS_ALLOWED_ORIGINS', '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

module.exports = {
  port: intValue('PORT', 4000),
  mongodb: {
    uri: envValue('MONGODB_URI', ''),
    db: envValue('MONGODB_DB', 'oil_management_system'),
  },
  jwtSecret: envValue('JWT_SECRET', 'CHANGE_THIS_SECRET_FOR_PRODUCTION'),
  jwtExpireSeconds: intValue('JWT_EXPIRE_SECONDS', 60 * 60 * 24 * 7),
  uploadMaxMb: intValue('UPLOAD_MAX_MB', 5),
  corsAllowAll: envValue('CORS_ALLOW_ALL', 'true') === 'true',
  corsAllowedOrigins: Array.from(new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost',
    'http://127.0.0.1',
    'https://oil-management-system.onrender.com',
    'https://oil-management-backend.onrender.com',
    ...extraOrigins,
  ])),
};
