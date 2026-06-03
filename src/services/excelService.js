const XLSX = require('xlsx');
const moment = require('moment');

class ExcelService {
  // Преобразование Excel даты в строку YYYY-MM-DD
  static excelDateToJSDate(excelDate) {
    // Excel даты начинаются с 1 января 1900 года
    // 25569 - это количество дней между 1 января 1900 и 1 января 1970
    const utcDays = excelDate - 25569;
    const msPerDay = 86400000;
    const date = new Date(utcDays * msPerDay);
    return moment(date).format('YYYY-MM-DD');
  }

  // Попытка распарсить дату из разных форматов
  static parseDate(dateValue) {
    if (!dateValue) return null;
    
    // Если это число (Excel дата)
    if (typeof dateValue === 'number' && dateValue > 40000 && dateValue < 50000) {
      return this.excelDateToJSDate(dateValue);
    }
    
    // Если это строка
    if (typeof dateValue === 'string') {
      // Пробуем разные форматы
      const formats = [
        'YYYY-MM-DD',
        'DD.MM.YYYY',
        'MM/DD/YYYY',
        'DD/MM/YYYY',
        'YYYY/MM/DD'
      ];
      
      for (const format of formats) {
        const parsed = moment(dateValue, format, true);
        if (parsed.isValid()) {
          return parsed.format('YYYY-MM-DD');
        }
      }
    }
    
    return null;
  }

  // Экспорт пользователей в Excel
  static exportUsers(users) {
    const data = users.map(user => ({
      'ID': user.id,
      'Имя': user.first_name || '',
      'Username': user.username || '',
      'Подписка до': user.subscription_end ? moment(user.subscription_end).format('YYYY-MM-DD') : '',
      'Статус оплаты': user.entry_paid ? 'Оплачен' : 'Не оплачен',
      'Свой/Чужой': user.entry_paid ? 'СВОЙ' : 'ЧУЖОЙ',
      'Статус в системе': this.getStatusRu(user.status),
      'В канале': user.is_member ? 'Да' : 'Нет',
      'Дата регистрации': moment(user.created_at).format('YYYY-MM-DD HH:mm:ss')
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
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
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Импорт пользователей из Excel
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
        // Получаем ID (поддерживаем разные названия колонок)
        let userId = row['ID'] || row['id'] || row['Id'];
        if (!userId) {
          results.errors.push(`Строка ${rowNumber}: отсутствует ID`);
          continue;
        }
        
        userId = parseInt(userId);
        if (isNaN(userId)) {
          results.errors.push(`Строка ${rowNumber}: некорректный ID "${row['ID']}"`);
          continue;
        }

        // Получаем имя (поддерживаем разные названия)
        let firstName = row['Имя'] || row['Name'] || row['name'] || '';
        
        // Получаем username (поддерживаем разные названия)
        let username = row['Username'] || row['username'] || row['User'] || '';
        
        // Парсим дату (поддерживаем Excel-числа и строки)
        let endDate = null;
        const dateValue = row['Подписка до'] || row['Дата окончания'] || row['Date'];
        if (dateValue) {
          endDate = this.parseDate(dateValue);
          if (!endDate) {
            results.errors.push(`Строка ${rowNumber}: неверный формат даты "${dateValue}"`);
            continue;
          }
        }

        // Определяем статус "Свой/Чужой" (поддерживаем разные варианты)
        let entryPaid = false;
        let statusValue = '';
        let paymentStatusValue = '';
        
        const customField = row['Свой/Чужой'] || row['Тип'] || row['Status'] || '';
        const paymentField = row['Статус оплаты'] || row['Paid'] || '';
        
        if (customField) {
          statusValue = String(customField).toUpperCase().trim();
        }
        if (paymentField) {
          paymentStatusValue = String(paymentField).toUpperCase().trim();
        }
        
        // Проверяем: СВОЙ, Свой, свой, ОПЛАЧЕН, paid, true, 1
        if (statusValue === 'СВОЙ' || statusValue === 'СВОЙ' || 
            paymentStatusValue === 'ОПЛАЧЕН' || paymentStatusValue === 'PAID' ||
            paymentStatusValue === 'TRUE' || paymentStatusValue === '1') {
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
            username || user.username,
            firstName || user.first_name,
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
            username || null,
            firstName || null,
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

  // Создание шаблона Excel для импорта
  static createTemplate() {
    const template = [
      {
        'ID': 123456789,
        'Имя': 'Иван Иванов',
        'Username': '@ivan',
        'Подписка до': '2025-12-31',
        'Статус оплаты': 'Оплачен',
        'Свой/Чужой': 'СВОЙ'
      },
      {
        'ID': 987654321,
        'Имя': 'Петр Петров',
        'Username': '@petr',
        'Подписка до': '2025-06-30',
        'Статус оплаты': 'Не оплачен',
        'Свой/Чужой': 'ЧУЖОЙ'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = ExcelService;