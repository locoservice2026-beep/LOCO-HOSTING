const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function openDb() {
  const db = await open({
    filename: path.join(__dirname, '..', 'data.sqlite'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstname TEXT,
      lastname TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS otps (
      email TEXT,
      code TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      owner_email TEXT,
      name TEXT,
      script TEXT,
      status TEXT,
      webhook_token TEXT,
      created_at INTEGER
    );
  `);

  // Ensure optional columns exist (safe on first run)
  try {
    await db.run("ALTER TABLE users ADD COLUMN webhook TEXT");
  } catch (e) {
    // ignore if column exists
  }

  try {
    await db.run("ALTER TABLE bots ADD COLUMN webhook_url TEXT");
  } catch (e) {
    // ignore if column exists
  }

  return db;
}

module.exports = { openDb };
