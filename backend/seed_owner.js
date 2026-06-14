require('dotenv').config();

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const config = require('./config');

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is not set');
  }

  const username = process.env.OWNER_USERNAME || 'owner';
  const password = process.env.OWNER_PASSWORD || 'password123';
  const name = process.env.OWNER_NAME || 'เจ้าของกิจการ';

  const client = new MongoClient(config.mongodb.uri, {
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db(config.mongodb.db);

  await db.collection('users').createIndex({ username: 1 }, { unique: true });

  const exists = await db.collection('users').findOne({ username });

  if (exists) {
    await db.collection('users').updateOne(
      { username },
      {
        $set: {
          name: exists.name || name,
          password_hash: bcrypt.hashSync(password, 10),
          role: 'owner',
          is_active: 1,
          updated_at: nowIso(),
        },
        $unset: { password: '' },
      }
    );

    console.log('Updated owner user');
  } else {
    await db.collection('users').insertOne({
      name,
      username,
      password_hash: bcrypt.hashSync(password, 10),
      role: 'owner',
      phone: '',
      is_active: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    console.log('Created owner user');
  }

  console.log('Login username:', username);
  console.log('Login password:', password);
  console.log('Database:', config.mongodb.db);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
