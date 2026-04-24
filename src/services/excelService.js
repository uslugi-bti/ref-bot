const XLSX = require('xlsx');
const moment = require('moment');

class ExcelService {
  // Экспорт пользователей в Excel
  static exportUsers(users) {
    const data = users.map(user => ({
      'ID': user.id,
      'Имя': user.first_name || '',
      'Username': user.username || '',
      'Подписка до': user.subscription_end ? moment(user.subscription_end).format('YYYY-MM-DD') : '',
      'Статус оплаты': user.entry_paid ? 'Оплачен' : 'Не оплачен',
      'Свой/Чужой': user.entry_paid ? 'Свой' : 'Чужой',
      'Статус в системе': this.getStatusRu(user.status),
      'В канале': user.is_member ? 'Да' : 'Нет',
      'Дата регистрации': moment(user.created_at).format('YYYY-MM-DD HH:mm:ss')
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Настройка ширины колонок
    const colWidths = [
      { wch: 15 }, // ID
      { wch: 20 }, // Имя
      { wch: 20 }, // Username
      { wch: 15 }, // Подписка до
      { wch: 15 }, // Статус оплаты
      { wch: 12 }, // Свой/Чужой
      { wch: 15 }, // Статус в системе
      { wch: 10 }, // В канале
      { wch: 20 }  // Дата регистрации
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Пользователи');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

    static async importUsers(buffer, bot, onProgress) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    const results = {
        total: data.length,
        success: 0,
        errors: [],
        updated: 0,
        created: 0
    };

    const { getDb } = require('../database/db');
    const db = getDb();
    const UserModel = require('../database/models/User');

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNumber = i + 2;
        
        try {
        // Проверяем обязательные поля
        if (!row['ID']) {
            results.errors.push(`Строка ${rowNumber}: отсутствует ID`);
            continue;
        }

        const userId = parseInt(row['ID']);
        if (isNaN(userId)) {
            results.errors.push(`Строка ${rowNumber}: некорректный ID`);
            continue;
        }

        // Парсим дату
        let endDate = null;
        if (row['Подписка до']) {
            let dateStr = row['Подписка до'].toString();
            let parsedDate = moment(dateStr, ['YYYY-MM-DD', 'DD.MM.YYYY', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
            if (parsedDate.isValid()) {
            endDate = parsedDate.format('YYYY-MM-DD');
            } else {
            results.errors.push(`Строка ${rowNumber}: неверный формат даты "${dateStr}"`);
            continue;
            }
        }

        // Определяем статус "Свой/Чужой" (регистронезависимо)
        let entryPaid = false;
        let statusValue = '';
        let paymentStatusValue = '';
        
        if (row['Свой/Чужой']) {
            statusValue = String(row['Свой/Чужой']).toUpperCase().trim();
        }
        if (row['Статус оплаты']) {
            paymentStatusValue = String(row['Статус оплаты']).toUpperCase().trim();
        }
        
        // Проверяем: СВОЙ, Свой, свой, ОПЛАЧЕН, Оплачен, оплачен
        if (statusValue === 'СВОЙ' || statusValue === 'СВОЙ' || 
            paymentStatusValue === 'ОПЛАЧЕН' || paymentStatusValue === 'ОПЛАЧЕН') {
            entryPaid = true;
        }
        
        // Проверяем существующего пользователя
        let user = await UserModel.getById(userId);
        
        if (user) {
            // Обновляем
            await db.run(`
            UPDATE users 
            SET username = ?, 
                first_name = ?, 
                subscription_end = ?, 
                entry_paid = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `, [
            row['Username'] || user.username,
            row['Имя'] || user.first_name,
            endDate,
            entryPaid ? 1 : 0,
            userId
            ]);
            results.updated++;
        } else {
            // Создаем
            await db.run(`
            INSERT INTO users (id, username, first_name, subscription_end, entry_paid, status, is_member)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
            userId,
            row['Username'] || null,
            row['Имя'] || null,
            endDate,
            entryPaid ? 1 : 0,
            endDate && moment(endDate).isAfter(moment()) ? 'active' : 'inactive',
            endDate && moment(endDate).isAfter(moment()) ? 1 : 0
            ]);
            results.created++;
        }
        
        results.success++;
        
        if (onProgress && i % 10 === 0) {
            await onProgress(`Импорт: ${i + 1}/${data.length}`);
        }
        
        } catch (error) {
        results.errors.push(`Строка ${rowNumber}: ${error.message}`);
        console.error(`Import error at row ${rowNumber}:`, error);
        }
    }

    return results;
    }

  static getStatusRu(status) {
    const statusMap = {
      'active': 'Активен',
      'kicked': 'Исключен',
      'penalty': 'Штраф',
      'inactive': 'Неактивен'
    };
    return statusMap[status] || status;
  }

    static createTemplate() {
    const template = [
        {
        'ID': 123456789,
        'Имя': 'Иван Иванов',
        'Username': '@ivan',
        'Подписка до': '2025-12-31',
        'Статус оплаты': 'Оплачен',
        'Свой/Чужой': 'Свой'
        },
        {
        'ID': 987654321,
        'Имя': 'Петр Петров',
        'Username': '@petr',
        'Подписка до': '2025-06-30',
        'Статус оплаты': 'Не оплачен',
        'Свой/Чужой': 'Чужой'
        },
        {
        'ID': 555555555,
        'Имя': 'Тест Тестов',
        'Username': '@test',
        'Подписка до': '2025-01-01',
        'Статус оплаты': 'ОПЛАЧЕН',
        'Свой/Чужой': 'СВОЙ'
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
}

module.exports = ExcelService;