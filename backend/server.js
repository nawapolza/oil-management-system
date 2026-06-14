require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');

const app = express();
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

let mongoClient = null;
let mongoDb = null;

function jsonResponse(res, data, status = 200) {
  return res.status(status).json(data);
}

function nowIso() {
  return new Date().toISOString();
}

function oidOrNull(id) {
  if (id instanceof ObjectId) return id;
  const text = String(id || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  try {
    return new ObjectId(text);
  } catch (_) {
    return null;
  }
}

function parseDateOrNull(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeRegex(text) {
  return new RegExp(escapeRegExp(text), 'i');
}

function val(data, key, defaultValue = null) {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
}

function mongoToPlain(value) {
  if (value instanceof ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => mongoToPlain(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '_id') {
        out.id = mongoToPlain(item);
      } else {
        out[key] = mongoToPlain(item);
      }
    }
    return out;
  }
  return value;
}

function publicUser(user) {
  if (!user) return null;
  const out = mongoToPlain(user);
  delete out.password_hash;
  return out;
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndex({ username: 1 }, { unique: true }),
    db.collection('deliveries').createIndex({ user_id: 1, work_date: -1 }),
    db.collection('deliveries').createIndex({ vehicle_id: 1 }),
    db.collection('vehicles').createIndex({ user_id: 1, plate_no: 1 }),
    db.collection('notifications').createIndex({ delivery_id: 1, created_at: -1 }),
  ]);
}

async function getDb() {
  if (mongoDb) return mongoDb;
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is not set');
  }
  mongoClient = new MongoClient(config.mongodb.uri, {
    serverSelectionTimeoutMS: 5000,
  });
  await mongoClient.connect();
  mongoDb = mongoClient.db(config.mongodb.db);
  await ensureIndexes(mongoDb);
  return mongoDb;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function currentUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }

  const oid = oidOrNull(payload.sub);
  if (!oid) return null;

  const user = await req.db.collection('users').findOne(
    { _id: oid, is_active: 1 },
    { projection: { password_hash: 0 } }
  );
  return publicUser(user);
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) {
    return jsonResponse(res, { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  }
  req.user = user;
  return next();
}

function requireOwner(req, res, next) {
  if ((req.user?.role || '') !== 'owner') {
    return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์สำหรับหน้านี้' }, 403);
  }
  return next();
}

async function findUserPublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  const user = await db.collection('users').findOne(
    { _id: oid },
    { projection: { password_hash: 0 } }
  );
  return publicUser(user);
}

async function findVehiclePublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  const vehicle = await db.collection('vehicles').findOne({ _id: oid });
  return mongoToPlain(vehicle);
}

async function resolveVehicleId(db, user, data) {
  if (data.vehicle_id) {
    const oid = oidOrNull(data.vehicle_id);
    if (!oid) return null;

    const filter = { _id: oid, is_active: 1 };
    if ((user.role || '') !== 'owner') {
      filter.user_id = String(user.id);
    }

    const vehicle = await db.collection('vehicles').findOne(filter, { projection: { _id: 1 } });
    return vehicle ? String(vehicle._id) : null;
  }

  const plate = String(data.plate_no || '').trim();
  if (!plate) return null;

  const ownerAssignedUser = (user.role || '') === 'owner' && data.user_id;
  const vehicleUserId = ownerAssignedUser ? String(data.user_id) : String(user.id);
  const vehicleNo = String(data.vehicle_no || '').trim() || null;
  const driverName = String(data.driver_name || '').trim() || ((user.role || '') === 'owner' ? null : (user.name || null));

  const existing = await db.collection('vehicles').findOne(
    { plate_no: plate, user_id: vehicleUserId, is_active: 1 },
    { sort: { created_at: -1 }, projection: { _id: 1 } }
  );
  if (existing) return String(existing._id);

  const result = await db.collection('vehicles').insertOne({
    user_id: vehicleUserId,
    plate_no: plate,
    vehicle_no: vehicleNo,
    driver_name: driverName,
    description: 'เพิ่มจากหน้าบันทึกงานมือถือ',
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return String(result.insertedId);
}

async function createAutoNotifications(db, deliveryId, data) {
  const alerts = [];
  if (Number(data.quantity_liters || 0) >= 280) {
    alerts.push(['ปริมาณน้ำมันสูงผิดปกติ', 'รายการนี้มีปริมาณน้ำมันตั้งแต่ 280 ลิตรขึ้นไป กรุณาตรวจสอบ', 'danger']);
  }
  if ((data.payment_status || 'pending') === 'pending') {
    alerts.push(['ยังไม่จ่ายค่าแรง', 'รายการนี้ยังเป็นสถานะรอจ่าย', 'warning']);
  }
  if (!data.receipt_photo) {
    alerts.push(['ยังไม่แนบรูปบิล', 'รายการนี้ยังไม่มีรูปบิลหรือเอกสารแนบ', 'info']);
  }

  if (!alerts.length) return;

  await db.collection('notifications').insertMany(alerts.map((alert) => ({
    delivery_id: deliveryId,
    title: alert[0],
    message: alert[1],
    type: alert[2],
    is_read: 0,
    created_at: nowIso(),
  })));
}

async function buildDeliveryFilter(db, user, query) {
  const filter = {};

  if ((user.role || '') !== 'owner') {
    filter.user_id = String(user.id);
  }

  if (query.from) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$gte = parseDateOrNull(query.from) || String(query.from);
  }

  if (query.to) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$lte = parseDateOrNull(query.to) || String(query.to);
  }

  if (query.q) {
    const q = String(query.q).trim();
    if (q) {
      const rx = safeRegex(q);
      const or = [
        { bill_no: rx },
        { origin_place: rx },
        { destination_place: rx },
        { oil_type: rx },
      ];

      const vehicleFilter = { plate_no: rx, is_active: 1 };
      if ((user.role || '') !== 'owner') {
        vehicleFilter.user_id = String(user.id);
      }
      const vehicles = await db.collection('vehicles')
        .find(vehicleFilter, { projection: { _id: 1 } })
        .toArray();
      const vehicleIds = vehicles.map((v) => String(v._id));
      if (vehicleIds.length) {
        or.push({ vehicle_id: { $in: vehicleIds } });
      }
      filter.$or = or;
    }
  }

  return filter;
}

async function enrichDelivery(db, delivery) {
  const d = mongoToPlain(delivery);
  const [employee, vehicle] = await Promise.all([
    d.user_id ? findUserPublic(db, d.user_id) : null,
    d.vehicle_id ? findVehiclePublic(db, d.vehicle_id) : null,
  ]);

  d.employee_name = employee?.name || null;
  d.employee_username = employee?.username || null;
  d.plate_no = vehicle?.plate_no || null;
  d.vehicle_no = vehicle?.vehicle_no || null;
  d.driver_name = vehicle?.driver_name || null;

  const quantity = Number(d.quantity_liters || 0);
  const amount = Number(d.amount_baht || 0);
  const distance = Number(d.distance_km || 0);
  const fuelUsed = Number(d.fuel_used_liters || 0);

  d.price_per_liter = quantity > 0 ? Math.round((amount / quantity) * 100) / 100 : 0;
  d.fuel_liters_per_100km = distance > 0 ? Math.round((fuelUsed / distance * 100) * 100) / 100 : 0;

  return d;
}

async function fetchEnrichedDeliveries(db, filter, options = {}) {
  const rows = await db.collection('deliveries').find(filter, options).toArray();
  return Promise.all(rows.map((row) => enrichDelivery(db, row)));
}

function groupSum(rows, key, sumField, limit = 0) {
  const groups = new Map();
  for (const row of rows) {
    const name = String(row[key] || '').trim() || 'ไม่ระบุ';
    if (!groups.has(name)) {
      groups.set(name, { name, value: 0, trips: 0 });
    }
    const item = groups.get(name);
    item.value += Number(row[sumField] || 0);
    item.trips += 1;
  }
  const out = Array.from(groups.values()).sort((a, b) => b.value - a.value);
  return limit > 0 ? out.slice(0, limit) : out;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extByMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = extByMime[file.mimetype] || 'jpg';
    const name = `bill_${req.params.id}_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    cb(null, name);
  },
});

const uploadPhoto = multer({
  storage,
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('รองรับเฉพาะ JPG, PNG, WEBP'));
    }
    return cb(null, true);
  },
}).single('photo');

app.disable('x-powered-by');

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (config.corsAllowAll || config.corsAllowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// รองรับ frontend เก่าที่ยังยิงแบบ /index.php?route=/auth/login ชั่วคราว
app.use((req, _res, next) => {
  if (req.query && req.query.route) {
    const route = '/' + String(req.query.route).replace(/^\/+/, '');
    const rest = { ...req.query };
    delete rest.route;
    const qs = new URLSearchParams(rest).toString();
    req.url = route + (qs ? `?${qs}` : '');
  } else if (req.url.startsWith('/index.php/')) {
    req.url = req.url.replace('/index.php', '') || '/';
  }
  next();
});

app.get('/ping', (req, res) => {
  jsonResponse(res, {
    success: true,
    message: 'pong',
    build: 'node-express-mongodb-v1',
    route: req.path,
    time: nowIso(),
  });
});

app.use(asyncHandler(async (req, _res, next) => {
  req.db = await getDb();
  next();
}));

const router = express.Router();

router.get('/health', asyncHandler(async (req, res) => {
  await req.db.command({ ping: 1 });
  jsonResponse(res, {
    success: true,
    message: 'Backend connected to MongoDB successfully',
    build: 'node-express-mongodb-v1',
    database: config.mongodb.db,
    route: req.path,
    time: nowIso(),
  });
}));

router.get('/', (req, res) => {
  jsonResponse(res, {
    success: true,
    name: 'OilOps Node API MongoDB',
    build: 'node-express-mongodb-v1',
    time: nowIso(),
    endpoints: ['/ping', '/health', '/auth/login', '/auth/me', '/deliveries', '/dashboard/stats', '/notifications', '/users', '/vehicles'],
  });
});

router.get('/auth/login', (req, res) => {
  jsonResponse(res, {
    success: true,
    message: 'auth/login route found. Use POST with username and password to login.',
    build: 'node-express-mongodb-v1',
    route: req.path,
  });
});

router.post('/auth/login', asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return jsonResponse(res, { success: false, message: 'กรุณากรอก username และ password' }, 422);
  }

  const userDoc = await req.db.collection('users').findOne({ username, is_active: 1 });
  const user = mongoToPlain(userDoc);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return jsonResponse(res, { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpireSeconds }
  );

  delete user.password_hash;
  return jsonResponse(res, { success: true, token, user });
}));

router.get('/auth/me', requireAuth, (req, res) => {
  jsonResponse(res, { success: true, user: req.user });
});

router.get('/vehicles', requireAuth, asyncHandler(async (req, res) => {
  const filter = { is_active: 1 };
  if ((req.user.role || '') !== 'owner') {
    filter.user_id = String(req.user.id);
  }

  const vehicles = await req.db.collection('vehicles')
    .find(filter, { sort: { created_at: -1 } })
    .toArray();

  const rows = await Promise.all(vehicles.map(async (v) => {
    const row = mongoToPlain(v);
    const employee = row.user_id ? await findUserPublic(req.db, row.user_id) : null;
    row.employee_name = employee?.name || null;
    row.employee_username = employee?.username || null;
    row.total_trips = await req.db.collection('deliveries').countDocuments({ vehicle_id: String(row.id) });
    return row;
  }));

  jsonResponse(res, { success: true, data: rows });
}));

router.post('/vehicles', requireAuth, asyncHandler(async (req, res) => {
  const data = req.body || {};
  const plate = String(data.plate_no || '').trim();
  if (!plate) {
    return jsonResponse(res, { success: false, message: 'กรุณากรอกทะเบียนรถ' }, 422);
  }

  const vehicleUserId = (req.user.role || '') === 'owner'
    ? (data.user_id ? String(data.user_id) : null)
    : String(req.user.id);
  const driverName = String(data.driver_name || '').trim() || ((req.user.role || '') === 'owner' ? null : (req.user.name || null));

  const result = await req.db.collection('vehicles').insertOne({
    user_id: vehicleUserId,
    plate_no: plate,
    vehicle_no: val(data, 'vehicle_no'),
    driver_name: driverName,
    description: val(data, 'description'),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  jsonResponse(res, { success: true, id: String(result.insertedId) }, 201);
}));

router.get('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const rows = await req.db.collection('users')
    .find({}, { sort: { created_at: -1 }, projection: { password_hash: 0 } })
    .toArray();

  jsonResponse(res, { success: true, data: rows.map(mongoToPlain) });
}));

router.post('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const data = req.body || {};
  const name = String(data.name || '').trim();
  const username = String(data.username || '').trim();
  const password = String(data.password || 'password123');
  const role = ['owner', 'employee'].includes(data.role) ? data.role : 'employee';

  if (!name || !username) {
    return jsonResponse(res, { success: false, message: 'กรุณากรอกชื่อและ username' }, 422);
  }

  const exists = await req.db.collection('users').countDocuments({ username });
  if (exists > 0) {
    return jsonResponse(res, { success: false, message: 'username นี้มีอยู่แล้ว' }, 422);
  }

  const result = await req.db.collection('users').insertOne({
    name,
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role,
    phone: val(data, 'phone'),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  jsonResponse(res, { success: true, id: String(result.insertedId) }, 201);
}));

router.patch('/users/:id/toggle', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const id = String(req.params.id || '');
  if (id === String(req.user.id)) {
    return jsonResponse(res, { success: false, message: 'ไม่สามารถปิดใช้งานบัญชีตัวเองได้' }, 422);
  }

  const oid = oidOrNull(id);
  if (!oid) return jsonResponse(res, { success: false, message: 'id ไม่ถูกต้อง' }, 422);

  const target = await req.db.collection('users').findOne({ _id: oid });
  if (!target) return jsonResponse(res, { success: false, message: 'ไม่พบผู้ใช้' }, 404);

  const newStatus = Number(target.is_active ?? 1) === 1 ? 0 : 1;
  await req.db.collection('users').updateOne(
    { _id: oid },
    { $set: { is_active: newStatus, updated_at: nowIso() } }
  );

  jsonResponse(res, { success: true });
}));

router.get('/deliveries', requireAuth, asyncHandler(async (req, res) => {
  const filter = await buildDeliveryFilter(req.db, req.user, req.query);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10), 1), 500);
  const rows = await fetchEnrichedDeliveries(req.db, filter, {
    sort: { work_date: -1, created_at: -1 },
    limit,
  });
  jsonResponse(res, { success: true, data: rows });
}));

router.post('/deliveries', requireAuth, asyncHandler(async (req, res) => {
  const data = req.body || {};
  const workDate = parseDateOrNull(data.work_date) || new Date().toISOString().slice(0, 10);
  const ownerCanAssign = (req.user.role || '') === 'owner' && data.user_id;
  const userId = ownerCanAssign ? String(data.user_id) : String(req.user.id);

  const fields = {
    user_id: userId,
    vehicle_id: await resolveVehicleId(req.db, req.user, data),
    work_date: workDate,
    report_month: workDate.slice(0, 7),
    bill_no: val(data, 'bill_no'),
    origin_place: val(data, 'origin_place'),
    load_date: parseDateOrNull(val(data, 'load_date')),
    oil_type: val(data, 'oil_type'),
    unload_date: parseDateOrNull(val(data, 'unload_date')),
    destination_place: val(data, 'destination_place'),
    tank_weight: Number(val(data, 'tank_weight', 0)),
    quantity_liters: Number(val(data, 'quantity_liters', 0)),
    amount_baht: Number(val(data, 'amount_baht', 0)),
    distance_km: Number(val(data, 'distance_km', 0)),
    fuel_used_liters: Number(val(data, 'fuel_used_liters', 0)),
    wage_payer: val(data, 'wage_payer'),
    payment_status: data.payment_status === 'paid' ? 'paid' : 'pending',
    note: val(data, 'note'),
    receipt_photo: val(data, 'receipt_photo'),
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const result = await req.db.collection('deliveries').insertOne(fields);
  const id = String(result.insertedId);
  await createAutoNotifications(req.db, id, fields);

  jsonResponse(res, { success: true, id }, 201);
}));

router.put('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'id ไม่ถูกต้อง' }, 422);

  const oldDoc = await req.db.collection('deliveries').findOne({ _id: oid });
  const old = mongoToPlain(oldDoc);
  if (!old) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);

  if ((req.user.role || '') !== 'owner' && String(old.user_id) !== String(req.user.id)) {
    return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์แก้ไขรายการนี้' }, 403);
  }

  const data = req.body || {};
  const workDate = parseDateOrNull(data.work_date || old.work_date) || old.work_date || new Date().toISOString().slice(0, 10);
  const vehicleId = await resolveVehicleId(req.db, req.user, data) || old.vehicle_id || null;
  const fields = {
    vehicle_id: vehicleId,
    work_date: workDate,
    report_month: workDate.slice(0, 7),
    bill_no: val(data, 'bill_no', old.bill_no || null),
    origin_place: val(data, 'origin_place', old.origin_place || null),
    load_date: parseDateOrNull(val(data, 'load_date', old.load_date || null)),
    oil_type: val(data, 'oil_type', old.oil_type || null),
    unload_date: parseDateOrNull(val(data, 'unload_date', old.unload_date || null)),
    destination_place: val(data, 'destination_place', old.destination_place || null),
    tank_weight: Number(val(data, 'tank_weight', old.tank_weight || 0)),
    quantity_liters: Number(val(data, 'quantity_liters', old.quantity_liters || 0)),
    amount_baht: Number(val(data, 'amount_baht', old.amount_baht || 0)),
    distance_km: Number(val(data, 'distance_km', old.distance_km || 0)),
    fuel_used_liters: Number(val(data, 'fuel_used_liters', old.fuel_used_liters || 0)),
    wage_payer: val(data, 'wage_payer', old.wage_payer || null),
    payment_status: (data.payment_status || old.payment_status || 'pending') === 'paid' ? 'paid' : 'pending',
    note: val(data, 'note', old.note || null),
    updated_at: nowIso(),
  };

  await req.db.collection('deliveries').updateOne({ _id: oid }, { $set: fields });
  jsonResponse(res, { success: true });
}));

router.delete('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'id ไม่ถูกต้อง' }, 422);

  const oldDoc = await req.db.collection('deliveries').findOne({ _id: oid });
  const old = mongoToPlain(oldDoc);
  if (!old) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);

  if ((req.user.role || '') !== 'owner' && String(old.user_id) !== String(req.user.id)) {
    return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์ลบรายการนี้' }, 403);
  }

  await req.db.collection('deliveries').deleteOne({ _id: oid });
  jsonResponse(res, { success: true });
}));

router.post('/deliveries/:id/upload', requireAuth, (req, res, next) => {
  uploadPhoto(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'ไฟล์ใหญ่เกินกำหนด'
        : err.message || 'อัปโหลดไม่สำเร็จ';
      return jsonResponse(res, { success: false, message }, 422);
    }
    return next();
  });
}, asyncHandler(async (req, res) => {
  const id = String(req.params.id || '');
  const oid = oidOrNull(id);
  if (!oid) {
    if (req.file) fs.unlinkSync(req.file.path);
    return jsonResponse(res, { success: false, message: 'id ไม่ถูกต้อง' }, 422);
  }

  const oldDoc = await req.db.collection('deliveries').findOne({ _id: oid });
  const old = mongoToPlain(oldDoc);
  if (!old) {
    if (req.file) fs.unlinkSync(req.file.path);
    return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  }

  if ((req.user.role || '') !== 'owner' && String(old.user_id) !== String(req.user.id)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์อัปโหลดรายการนี้' }, 403);
  }

  if (!req.file) {
    return jsonResponse(res, { success: false, message: 'กรุณาเลือกไฟล์รูป' }, 422);
  }

  const relative = `/uploads/${req.file.filename}`;
  await req.db.collection('deliveries').updateOne(
    { _id: oid },
    { $set: { receipt_photo: relative, updated_at: nowIso() } }
  );

  await req.db.collection('notifications').insertOne({
    delivery_id: id,
    title: 'แนบรูปสำเร็จ',
    message: 'มีการแนบรูปบิลให้รายการนี้แล้ว',
    type: 'success',
    is_read: 0,
    created_at: nowIso(),
  });

  jsonResponse(res, { success: true, path: relative });
}));

router.get('/dashboard/stats', requireAuth, asyncHandler(async (req, res) => {
  const filter = await buildDeliveryFilter(req.db, req.user, req.query);
  const rows = await fetchEnrichedDeliveries(req.db, filter, { sort: { work_date: 1 } });

  const summary = {
    total_trips: rows.length,
    total_liters: 0,
    total_amount: 0,
    avg_price: 0,
    total_distance: 0,
    total_fuel_used: 0,
    pending_payments: 0,
    missing_photos: 0,
  };

  let priceSum = 0;
  let priceCount = 0;
  const dailyMap = new Map();
  const destMap = new Map();

  for (const row of rows) {
    const liters = Number(row.quantity_liters || 0);
    const amount = Number(row.amount_baht || 0);
    const distance = Number(row.distance_km || 0);
    const fuel = Number(row.fuel_used_liters || 0);

    summary.total_liters += liters;
    summary.total_amount += amount;
    summary.total_distance += distance;
    summary.total_fuel_used += fuel;
    if ((row.payment_status || 'pending') === 'pending') summary.pending_payments += 1;
    if (!row.receipt_photo) summary.missing_photos += 1;
    if (liters > 0) {
      priceSum += amount / liters;
      priceCount += 1;
    }

    const date = row.work_date || 'ไม่ระบุ';
    if (!dailyMap.has(date)) dailyMap.set(date, { work_date: date, liters: 0, amount: 0, trips: 0 });
    const daily = dailyMap.get(date);
    daily.liters += liters;
    daily.amount += amount;
    daily.trips += 1;

    const dest = String(row.destination_place || '').trim() || 'ไม่ระบุ';
    if (!destMap.has(dest)) destMap.set(dest, { destination: dest, liters: 0, amount: 0, trips: 0 });
    const destItem = destMap.get(dest);
    destItem.liters += liters;
    destItem.amount += amount;
    destItem.trips += 1;
  }

  summary.avg_price = priceCount > 0 ? Math.round((priceSum / priceCount) * 100) / 100 : 0;

  if ((req.user.role || '') === 'owner') {
    summary.active_employees = await req.db.collection('users').countDocuments({ role: 'employee', is_active: 1 });
    summary.active_vehicles = await req.db.collection('vehicles').countDocuments({ is_active: 1 });
  } else {
    summary.active_vehicles = await req.db.collection('vehicles').countDocuments({ user_id: String(req.user.id), is_active: 1 });
  }

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))
    .slice(-60);

  const oilTypes = groupSum(rows, 'oil_type', 'quantity_liters', 10);

  const topDestinations = Array.from(destMap.values())
    .sort((a, b) => b.liters - a.liters)
    .slice(0, 8);

  const latest = await fetchEnrichedDeliveries(req.db, filter, {
    sort: { created_at: -1 },
    limit: 8,
  });

  jsonResponse(res, {
    success: true,
    summary,
    daily,
    oilTypes,
    topDestinations,
    latest,
    serverTime: nowIso(),
  });
}));

router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  let filter = {};
  if ((req.user.role || '') !== 'owner') {
    const deliveries = await req.db.collection('deliveries')
      .find({ user_id: String(req.user.id) }, { projection: { _id: 1 } })
      .toArray();
    const deliveryIds = deliveries.map((d) => String(d._id));
    filter = {
      $or: [
        { user_id: String(req.user.id) },
        { delivery_id: { $in: deliveryIds } },
      ],
    };
  }

  const notifications = await req.db.collection('notifications')
    .find(filter, { sort: { created_at: -1 }, limit: 50 })
    .toArray();

  const rows = await Promise.all(notifications.map(async (n) => {
    const row = mongoToPlain(n);
    if (row.delivery_id) {
      const oid = oidOrNull(row.delivery_id);
      const delivery = oid ? await req.db.collection('deliveries').findOne({ _id: oid }) : null;
      const deliveryPlain = mongoToPlain(delivery);
      row.bill_no = deliveryPlain?.bill_no || null;
      row.work_date = deliveryPlain?.work_date || null;
    }
    return row;
  }));

  jsonResponse(res, { success: true, data: rows });
}));

router.patch('/notifications/:id/read', requireAuth, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'id ไม่ถูกต้อง' }, 422);

  await req.db.collection('notifications').updateOne(
    { _id: oid },
    { $set: { is_read: 1, updated_at: nowIso() } }
  );

  jsonResponse(res, { success: true });
}));

app.use('/', router);
app.use('/api', router);

app.use((req, res) => {
  jsonResponse(res, { success: false, message: `ไม่พบ endpoint: ${req.path}` }, 404);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const isDbError = String(err.name || '').toLowerCase().includes('mongo') || String(err.message || '').includes('Mongo');
  jsonResponse(res, {
    success: false,
    message: isDbError ? 'Database error' : 'Server error',
    detail: err.message,
  }, status);
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`OilOps Node API running on port ${config.port}`);
});

async function shutdown() {
  console.log('Shutting down...');
  server.close(async () => {
    if (mongoClient) await mongoClient.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
