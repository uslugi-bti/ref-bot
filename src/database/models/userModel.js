const db = require('../db');

const UserModel = {
    upsert: (user, callback) => {
        const { id, username, first_name, subscription_end, payment_status } = user;
        db.run(
            `INSERT INTO users (user_id, username, first_name, subscription_end, payment_status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name,
                subscription_end = excluded.subscription_end,
                payment_status = excluded.payment_status`,
            [id, username, first_name, subscription_end, payment_status || 'none'],
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
    },

    getAll: (callback) => {
        db.all(`SELECT * FROM users ORDER BY created_at DESC`, callback);
    },

    // Получить с пагинацией
    getAllPaginated: (page, limit, callback) => {
        const offset = page * limit;
        db.all(`SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset], (err, users) => {
            if (err) {
                callback(err);
            } else {
                db.get(`SELECT COUNT(*) as count FROM users`, (err2, row) => {
                    callback(err2, { users, total: row?.count || 0 });
                });
            }
        });
    },

    // Удалить нескольких пользователей
    deleteMany: (userIds, callback) => {
        const placeholders = userIds.map(() => '?').join(',');
        db.run(`DELETE FROM users WHERE user_id IN (${placeholders})`, userIds, function(err) {
            callback(err, this?.changes || 0);
        });
    },

    // Полная замена таблицы
    replaceAll: (users, callback) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM users');
            
            const stmt = db.prepare('INSERT INTO users (user_id, username, first_name, subscription_end, payment_status) VALUES (?, ?, ?, ?, ?)');
            
            users.forEach(user => {
                stmt.run(
                    user.user_id,
                    user.username || null,
                    user.first_name || 'Unknown',
                    user.subscription_end || null,
                    user.payment_status || 'imported'
                );
            });
            
            stmt.finalize();
            db.run('COMMIT', callback);
        });
    },

    getExpiringSoon: (days, callback) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        const futureDateStr = futureDate.toISOString().split('T')[0];
        
        db.all(
            `SELECT * FROM users 
            WHERE subscription_end = ? 
            AND subscription_end > date('now')`,
            [futureDateStr],
            callback
        );
    }
};

module.exports = UserModel;