const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let dbInstance = null;

async function initDatabase() {
  const dbPath = process.env.DB_PATH || './database.sqlite';
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      subscription_end DATE,
      status TEXT DEFAULT 'inactive',
      is_member BOOLEAN DEFAULT 0,
      entry_paid BOOLEAN DEFAULT 0,
      penalty_until DATE,
      last_payment_request DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Таблица заявок на оплату
    CREATE TABLE IF NOT EXISTS payment_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL,
      type TEXT,
      status TEXT DEFAULT 'pending',
      admin_action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invite_links (
      user_id INTEGER PRIMARY KEY,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_subscription_end ON users(subscription_end);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id ON payment_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
  `);

    const defaultPrices = {
    entry_price: process.env.ENTRY_PRICE || '250',
    member_price_1m: process.env.MEMBER_PRICE_1M || '50',
    member_price_3m: process.env.MEMBER_PRICE_3M || '120',
    penalty_price_1: process.env.PENALTY_PRICE_1 || '50',   // Штраф за первые 5 дней
    penalty_price_2: process.env.PENALTY_PRICE_2 || '100',  // Штраф после 5 дней
    subscription_days: process.env.SUBSCRIPTION_DAYS || '30',
    payment_details: process.env.PAYMENT_DETAILS || 'USDT TRC20: TXxxx...\nКарта: 1234 5678...'
    };

  for (const [key, value] of Object.entries(defaultPrices)) {
    await db.run(`
      INSERT OR IGNORE INTO settings (key, value) 
      VALUES (?, ?)
    `, [key, value]);
  }

  console.log('✅ Database initialized');
  dbInstance = db;
  return db;
}

function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

module.exports = { initDatabase, getDb };