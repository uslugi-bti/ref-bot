const fs = require('fs');
const path = require('path');
const db = require('../database/db');

const CSVService = {
    // Экспорт всех пользователей в CSV
    exportToCSV: async () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT user_id, username, first_name, subscription_end, created_at FROM users ORDER BY user_id`, (err, rows) => {
                if (err) return reject(err);
                
                // Заголовки CSV
                const headers = ['user_id', 'username', 'first_name', 'subscription_end', 'created_at'];
                
                // Преобразуем строки в CSV
                let csv = headers.join(',') + '\n';
                
                rows.forEach(row => {
                    const values = headers.map(header => {
                        let value = row[header] || '';
                        // Экранируем кавычки и оборачиваем в кавычки если есть запятая
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                            value = value.replace(/"/g, '""');
                            return `"${value}"`;
                        }
                        return value;
                    });
                    csv += values.join(',') + '\n';
                });
                
                resolve(csv);
            });
        });
    },

    // Импорт пользователей из CSV (полная замена)
    importFromCSV: async (csvContent) => {
        return new Promise((resolve, reject) => {
            const lines = csvContent.split('\n').filter(line => line.trim());
            if (lines.length < 2) return reject('Файл пуст или содержит только заголовки');
            
            const headers = lines[0].split(',').map(h => h.trim());
            
            // Проверяем обязательные поля
            if (!headers.includes('user_id')) {
                return reject('В CSV отсутствует обязательное поле user_id');
            }
            
            // Парсим строки
            const users = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // Простой парсинг CSV (для сложных случаев лучше использовать библиотеку)
                const values = [];
                let inQuote = false;
                let currentValue = '';
                
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        if (inQuote && line[j+1] === '"') {
                            currentValue += '"';
                            j++;
                        } else {
                            inQuote = !inQuote;
                        }
                    } else if (char === ',' && !inQuote) {
                        values.push(currentValue);
                        currentValue = '';
                    } else {
                        currentValue += char;
                    }
                }
                values.push(currentValue);
                
                // Создаём объект пользователя
                const user = {};
                headers.forEach((header, index) => {
                    user[header] = values[index] || '';
                });
                
                users.push(user);
            }
            
            // Начинаем транзакцию
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                try {
                    // Удаляем всех старых пользователей
                    db.run('DELETE FROM users');
                    
                    // Вставляем новых
                    const stmt = db.prepare(
                        'INSERT OR REPLACE INTO users (user_id, username, first_name, subscription_end, created_at) VALUES (?, ?, ?, ?, ?)'
                    );
                    
                    users.forEach(user => {
                        stmt.run(
                            user.user_id,
                            user.username || null,
                            user.first_name || null,
                            user.subscription_end || null,
                            user.created_at || new Date().toISOString().split('T')[0]
                        );
                    });
                    
                    stmt.finalize();
                    db.run('COMMIT');
                    resolve({ success: true, count: users.length });
                } catch (error) {
                    db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    },

    // Генерация временного файла для скачивания
    createTempFile: async (content, filename) => {
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, content);
        return filePath;
    },

    // Очистка старых временных файлов
    cleanTempFiles: () => {
        const tempDir = path.join(__dirname, '../../temp');
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            const now = Date.now();
            files.forEach(file => {
                const filePath = path.join(tempDir, file);
                const stats = fs.statSync(filePath);
                // Удаляем файлы старше 1 часа
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlinkSync(filePath);
                }
            });
        }
    }
};

module.exports = CSVService;