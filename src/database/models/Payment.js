const { getDb } = require('../db');

class PaymentModel {
  // Создать запись о платеже
  static async create(userId, invoiceId, amount, type) {
    const db = getDb();
    await db.run(`
      INSERT INTO payments (user_id, invoice_id, amount, type, status)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, invoiceId, amount, type, 'pending']);
    
    return await this.getByInvoiceId(invoiceId);
  }

  // Обновить статус платежа
  static async updateStatus(invoiceId, status, paidAt = null) {
    const db = getDb();
    await db.run(`
      UPDATE payments 
      SET status = ?, paid_at = COALESCE(?, paid_at)
      WHERE invoice_id = ?
    `, [status, paidAt, invoiceId]);
  }

  // Получить платеж по invoice_id
  static async getByInvoiceId(invoiceId) {
    const db = getDb();
    return await db.get('SELECT * FROM payments WHERE invoice_id = ?', invoiceId);
  }

  // Получить все платежи пользователя
  static async getUserPayments(userId, limit = 10) {
    const db = getDb();
    return await db.all(`
      SELECT * FROM payments 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [userId, limit]);
  }

  // Проверить, есть ли уже pending платеж у пользователя
  static async hasPendingPayment(userId) {
    const db = getDb();
    const payment = await db.get(`
      SELECT * FROM payments 
      WHERE user_id = ? AND status = 'pending'
    `, [userId]);
    return !!payment;
  }

  // Отменить старые pending платежи
  static async cancelOldPending(userId) {
    const db = getDb();
    await db.run(`
      UPDATE payments 
      SET status = 'cancelled'
      WHERE user_id = ? AND status = 'pending' AND created_at < datetime('now', '-1 hour')
    `, [userId]);
  }
}

module.exports = PaymentModel;