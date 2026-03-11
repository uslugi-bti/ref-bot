const db = require('../db');

const UserModel = {
    upsert: (user, callback) => {
        const { id, username, first_name } = user;
        db.run(
            `INSERT INTO users (user_id, username, first_name)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name`,
            [id, username, first_name],
            callback
        );
    },

    setSubscription: (userId, endDate, callback) => {
        db.run(
            `UPDATE users SET subscription_end = ?, payment_status = 'paid' WHERE user_id = ?`,
            [endDate, userId],
            callback
        );
    },

    get: (userId, callback) => {
        db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], callback);
    },

    getExpired: (today, callback) => {
        db.all(`SELECT * FROM users WHERE subscription_end < ?`, [today], callback);
    },

    setInvoice: (userId, invoiceId, callback) => {
        db.run(
            `UPDATE users SET invoice_id = ?, payment_status = 'pending' WHERE user_id = ?`,
            [invoiceId, userId],
            callback
        );
    },

    findByInvoice: (invoiceId, callback) => {
        db.get(`SELECT * FROM users WHERE invoice_id = ?`, [invoiceId], callback);
    },

    clearInvoice: (invoiceId, callback) => {
        db.run(`UPDATE users SET invoice_id = NULL WHERE invoice_id = ?`, [invoiceId], callback);
    }
};

module.exports = UserModel;