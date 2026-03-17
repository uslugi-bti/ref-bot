const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./src/config');

console.log('🔄 Проверка структуры базы данных...');
console.log('📁 Путь к БД:', config.DB_PATH);

const dbPath = path.resolve(__dirname, config.DB_PATH);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Проверяем, существует ли таблица users
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки таблицы:', err);
            db.close();
            return;
        }

        if (!row) {
            console.log('📦 Таблица users не существует. Создаём...');
            db.run(`
                CREATE TABLE users (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    first_name TEXT,
                    subscription_end DATE,
                    payment_status TEXT DEFAULT 'none',
                    invoice_id TEXT UNIQUE,
                    is_member INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания таблицы:', err);
                } else {
                    console.log('✅ Таблица users создана с полем is_member');
                }
                db.close();
            });
            return;
        }

        // Таблица существует, проверяем колонки
        db.all("PRAGMA table_info(users)", (err, columns) => {
            if (err) {
                console.error('❌ Ошибка получения информации о таблице:', err);
                db.close();
                return;
            }

            console.log('📊 Текущие колонки в таблице:');
            columns.forEach(col => {
                console.log(`   - ${col.name} (${col.type})`);
            });

            const hasIsMember = columns.some(col => col.name === 'is_member');
            
            if (!hasIsMember) {
                console.log('➕ Добавляем колонку is_member...');
                db.run("ALTER TABLE users ADD COLUMN is_member INTEGER DEFAULT 0", (err) => {
                    if (err) {
                        console.error('❌ Ошибка добавления колонки:', err);
                    } else {
                        console.log('✅ Колонка is_member успешно добавлена');
                        
                        // Обновляем существующие записи
                        db.run("UPDATE users SET is_member = 0 WHERE is_member IS NULL", (err) => {
                            if (err) {
                                console.error('❌ Ошибка обновления данных:', err);
                            } else {
                                console.log('✅ Существующие пользователи обновлены');
                            }
                            db.close();
                        });
                    }
                });
            } else {
                console.log('✅ Колонка is_member уже существует');
                db.close();
            }
        });
    });
});