const { getDb } = require('../db');
const moment = require('moment');

class UserModel {
  static async findOrCreate(telegramId, userData = {}) {
    const db = getDb();
    let user = await db.get('SELECT * FROM users WHERE id = ?', telegramId);
    
    if (!user) {
      await db.run(`
        INSERT INTO users (id, username, first_name, last_name, status, entry_paid, last_payment_request)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        telegramId, 
        userData.username || null, 
        userData.first_name || null, 
        userData.last_name || null,
        'inactive',
        0,
        null
      ]);
      user = await db.get('SELECT * FROM users WHERE id = ?', telegramId);
    } else {
      await db.run(`
        UPDATE users 
        SET username = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [userData.username || user.username, userData.first_name || user.first_name, userData.last_name || user.last_name, telegramId]);
      user = await db.get('SELECT * FROM users WHERE id = ?', telegramId);
    }
    
    return user;
  }

  static async getById(telegramId) {
    const db = getDb();
    return await db.get('SELECT * FROM users WHERE id = ?', telegramId);
  }

  // Проверка на спам (кнопка "Я оплатил")
  static async canRequestPaymentConfirmation(telegramId, cooldownMinutes = 10) {
    const db = getDb();
    const user = await this.getById(telegramId);
    
    if (!user || !user.last_payment_request) {
      return true;
    }
    
    const lastRequest = moment(user.last_payment_request);
    const now = moment();
    const diffMinutes = now.diff(lastRequest, 'minutes');
    
    return diffMinutes >= cooldownMinutes;
  }

  // Обновить время последнего запроса на подтверждение
  static async updateLastPaymentRequest(telegramId) {
    const db = getDb();
    await db.run(`
      UPDATE users 
      SET last_payment_request = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [telegramId]);
  }

  static async updateSubscription(telegramId, endDate, entryPaid = true) {
    const db = getDb();
    const status = 'active';
    await db.run(`
      UPDATE users 
      SET subscription_end = ?, status = ?, entry_paid = ?, is_member = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [endDate, status, entryPaid ? 1 : 0, telegramId]);
  }

  static async extendSubscription(telegramId, days, withPenalty = false) {
    const db = getDb();
    const user = await this.getById(telegramId);
    
    let newEndDate;
    if (user.subscription_end && new Date(user.subscription_end) > new Date()) {
      newEndDate = moment(user.subscription_end).add(days, 'days').format('YYYY-MM-DD');
    } else {
      newEndDate = moment().add(days, 'days').format('YYYY-MM-DD');
    }
    
    await db.run(`
      UPDATE users 
      SET subscription_end = ?, status = 'active', is_member = 1, 
          penalty_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newEndDate, telegramId]);
    
    return newEndDate;
  }

  static async kickUser(telegramId) {
    const db = getDb();
    await db.run(`
      UPDATE users 
      SET status = 'kicked', is_member = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [telegramId]);
  }

  static async setPenalty(telegramId, days) {
    const db = getDb();
    const penaltyUntil = moment().add(days, 'days').format('YYYY-MM-DD');
    await db.run(`
      UPDATE users 
      SET penalty_until = ?, status = 'penalty', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [penaltyUntil, telegramId]);
  }

  static async deleteUser(telegramId) {
    const db = getDb();
    await db.run('DELETE FROM users WHERE id = ?', telegramId);
  }

  static async getAllPaginated(offset = 0, limit = 10) {
    const db = getDb();
    const users = await db.all(`
      SELECT * FROM users 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const total = await db.get('SELECT COUNT(*) as count FROM users');
    
    return { users, total: total.count };
  }

  static async getExpiringSoon(days = 5) {
    const db = getDb();
    const targetDate = moment().add(days, 'days').format('YYYY-MM-DD');
    return await db.all(`
      SELECT * FROM users 
      WHERE subscription_end <= ? 
        AND subscription_end > date('now')
        AND status = 'active'
        AND is_member = 1
    `, [targetDate]);
  }

  static async getExpired() {
    const db = getDb();
    return await db.all(`
      SELECT * FROM users 
      WHERE subscription_end < date('now')
        AND status = 'active'
        AND is_member = 1
    `, []);
  }

  static async getStats() {
    const db = getDb();
    const total = await db.get('SELECT COUNT(*) as count FROM users');
    const active = await db.get('SELECT COUNT(*) as count FROM users WHERE status = "active" AND is_member = 1');
    const kicked = await db.get('SELECT COUNT(*) as count FROM users WHERE status = "kicked"');
    const penalty = await db.get('SELECT COUNT(*) as count FROM users WHERE status = "penalty"');
    const entryPaid = await db.get('SELECT COUNT(*) as count FROM users WHERE entry_paid = 1');
    
    return {
      total: total.count,
      active: active.count,
      kicked: kicked.count,
      penalty: penalty.count,
      entryPaid: entryPaid.count
    };
  }
}

module.exports = UserModel;