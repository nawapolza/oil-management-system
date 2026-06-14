require('dotenv').config();

const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const config = require('./config');

async function main() {
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is not set');
  }

  const client = new MongoClient(config.mongodb.uri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db(config.mongodb.db);

  await Promise.all([
    db.collection('users').createIndex({ username: 1 }, { unique: true }),
    db.collection('deliveries').createIndex({ user_id: 1, work_date: -1 }),
    db.collection('deliveries').createIndex({ vehicle_id: 1 }),
    db.collection('vehicles').createIndex({ user_id: 1, plate_no: 1 }),
    db.collection('notifications').createIndex({ delivery_id: 1, created_at: -1 }),
  ]);

  const username = process.env.OWNER_USERNAME || 'owner';
  const password = process.env.OWNER_PASSWORD || 'password123';
  const name = process.env.OWNER_NAME || 'เจ้าของระบบ';

  const exists = await db.collection('users').findOne({ username });
  if (exists) {
    console.log(`Owner already exists: ${username}`);
    await client.close();
    return;
  }

  const result = await db.collection('users').insertOne({
    name,
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'owner',
    phone: null,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('Created owner user');
  console.log(`username: ${username}`);
  console.log(`password: ${password}`);
  console.log(`id: ${String(result.insertedId)}`);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
