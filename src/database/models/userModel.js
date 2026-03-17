const db = require('../db');

const UserModel = {
    // Создание таблицы (вызвать один раз при инициализации)
    initTable: (callback) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                subscription_end DATE,
                payment_status TEXT DEFAULT 'none',
                invoice_id TEXT UNIQUE,
                is_member INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, callback);
    },

    // Добавить или обновить пользователя
    upsert: (user, callback) => {
        const { id, username, first_name, subscription_end, payment_status, is_member } = user;
        db.run(
            `INSERT INTO users (user_id, username, first_name, subscription_end, payment_status, is_member)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name,
                subscription_end = excluded.subscription_end,
                payment_status = excluded.payment_status,
                is_member = excluded.is_member`,
            [
                id, 
                username || null, 
                first_name || null, 
                subscription_end || null, 
                payment_status || 'none',
                is_member !== undefined ? (is_member ? 1 : 0) : 0
            ],
            callback
        );
    },

    // Установить подписку
    setSubscription: (userId, endDate, callback) => {
        db.run(
            `UPDATE users SET subscription_end = ?, payment_status = 'paid' WHERE user_id = ?`,
            [endDate, userId],
            callback
        );
    },

    // Получить пользователя по ID
    get: (userId, callback) => {
        db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], callback);
    },

    // Получить пользователей с истекшей подпиской
    getExpired: (today, callback) => {
        db.all(`SELECT * FROM users WHERE subscription_end < ?`, [today], callback);
    },

    // Установить invoice ID
    setInvoice: (userId, invoiceId, callback) => {
        db.run(
            `UPDATE users SET invoice_id = ?, payment_status = 'pending' WHERE user_id = ?`,
            [invoiceId, userId],
            callback
        );
    },

    // Найти по invoice ID
    findByInvoice: (invoiceId, callback) => {
        db.get(`SELECT * FROM users WHERE invoice_id = ?`, [invoiceId], callback);
    },

    // Очистить invoice ID
    clearInvoice: (invoiceId, callback) => {
        db.run(`UPDATE users SET invoice_id = NULL WHERE invoice_id = ?`, [invoiceId], callback);
    },

    // Получить всех пользователей
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

    // Полная замена таблицы (с поддержкой is_member)
    replaceAll: (users, callback) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM users');
            
            const stmt = db.prepare(
                'INSERT INTO users (user_id, username, first_name, subscription_end, payment_status, is_member) VALUES (?, ?, ?, ?, ?, ?)'
            );
            
            users.forEach(user => {
                stmt.run(
                    parseInt(user.user_id) || user.user_id,
                    user.username || user.Username || null,
                    user.first_name || user.Имя || 'Unknown',
                    user.subscription_end || user['Подписка до'] || null,
                    user.payment_status || user.Статус || 'imported',
                    user.is_member !== undefined ? (user.is_member ? 1 : 0) : (user['Участник сообщества (скидка)'] === '+' ? 1 : 0)
                );
            });
            
            stmt.finalize();
            db.run('COMMIT', callback);
        });
    },

    // Установить статус участника
    setMemberStatus: (userId, isMember, callback) => {
        db.run(
            `UPDATE users SET is_member = ? WHERE user_id = ?`,
            [isMember ? 1 : 0, userId],
            callback
        );
    },

    // Получить пользователей, у которых подписка истекает через N дней
    getExpiringSoon: (days, callback) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        const futureDateStr = futureDate.toISOString().split('T')[0];
        
        db.all(
            `SELECT * FROM users 
             WHERE date(subscription_end) = date(?) 
             AND subscription_end > date('now')`,
            [futureDateStr],
            callback
        );
    },

    // Получить статистику по статусам
    getStats: (callback) => {
        db.get(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_member = 1 THEN 1 ELSE 0 END) as members,
                SUM(CASE WHEN is_member = 0 THEN 1 ELSE 0 END) as nonmembers,
                SUM(CASE WHEN subscription_end > date('now') THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN subscription_end <= date('now') AND subscription_end IS NOT NULL THEN 1 ELSE 0 END) as expired
             FROM users`,
            callback
        );
    }
};

module.exports = UserModel;