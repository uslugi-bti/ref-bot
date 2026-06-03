const { getDb } = require('../db');

class SettingModel {
  static async get(key) {
    const db = getDb();
    const result = await db.get('SELECT value FROM settings WHERE key = ?', key);
    return result ? result.value : null;
  }

  static async set(key, value) {
    const db = getDb();
    await db.run(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value]);
  }

  static async getAllPrices() {
    const prices = {};
    const keys = ['entry_price', 'member_price_1m', 'member_price_3m', 'penalty_price_1', 'penalty_price_2', 'subscription_days', 'payment_details'];
    
    for (const key of keys) {
      prices[key] = await this.get(key) || (key === 'payment_details' ? 'Реквизиты не заданы' : '0');
    }
    
    return prices;
  }

  static async updatePrices(prices) {
    for (const [key, value] of Object.entries(prices)) {
      await this.set(key, value);
    }
  }

  static async getPaymentDetails() {
    return await this.get('payment_details') || 'Реквизиты не заданы';
  }

  static async updatePaymentDetails(details) {
    await this.set('payment_details', details);
  }
}

module.exports = SettingModel;