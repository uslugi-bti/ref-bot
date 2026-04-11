const UserModel = require('../database/models/User');
const SettingModel = require('../database/models/Setting');
const TelegramService = require('../services/telegramService');
const ExcelService = require('../services/excelService');
const moment = require('moment');

let botInstance = null;
let telegramService = null;

// Состояния админ-панели
const adminStates = new Map();

function initAdminHandler(bot) {
  botInstance = bot;
  telegramService = new TelegramService(bot);
}

async function showAdminMenu(userId) {
  const stats = await UserModel.getStats();
  const prices = await SettingModel.getAllPrices();
  
  const message = 
    `👑 *Админ-панель*\n\n` +
    `📊 *Статистика:*\n` +
    `• Всего пользователей: ${stats.total}\n` +
    `• Активных: ${stats.active}\n` +
    `• Кикнутых: ${stats.kicked}\n` +
    `• В статусе штрафа: ${stats.penalty}\n` +
    `• Оплатили вход: ${stats.entryPaid}\n\n` +
    `💰 *Текущие цены:*\n` +
    `• Вход: ${prices.entry_price} USDT\n` +
    `• Продление (1 мес): ${prices.member_price_1m} USDT\n` +
    `• Продление (3 мес): ${prices.member_price_3m} USDT\n` +
    `• Штраф: +${prices.penalty_price} USDT\n` +
    `• Срок подписки: ${prices.subscription_days} дней\n\n` +
    `💳 *Реквизиты:*\n` +
    `\`\`\`\n${prices.payment_details.substring(0, 100)}${prices.payment_details.length > 100 ? '...' : ''}\n\`\`\`\n\n` +
    `Выберите действие:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Список пользователей', callback_data: 'admin_users' }],
        [{ text: '📥 Импорт (Excel)', callback_data: 'admin_import' }],
        [{ text: '📤 Экспорт (Excel)', callback_data: 'admin_export' }],
        [{ text: '➕ Добавить пользователя', callback_data: 'admin_add' }],
        [{ text: '❌ Удалить пользователя', callback_data: 'admin_remove' }],
        [{ text: '💰 Изменить цены', callback_data: 'admin_prices' }],
        [{ text: '💳 Изменить реквизиты', callback_data: 'admin_payment_details' }],
        [{ text: '📊 Подробная статистика', callback_data: 'admin_stats' }]
      ]
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

async function startEditPaymentDetails(userId) {
  adminStates.set(userId, { action: 'awaiting_payment_details' });
  await telegramService.sendMessage(
    userId,
    `💳 *Изменение реквизитов для оплаты*\n\n` +
    `Отправьте новые реквизиты в любом формате.\n` +
    `Поддерживается Markdown и обычный текст.\n\n` +
    `Пример:\n` +
    `\`\`\`\n` +
    `USDT TRC20: TXxxx...\n` +
    `Банковская карта: 1234 5678 9012 3456\n` +
    `Перевод: Сбербанк +79991234567\n` +
    `\`\`\`\n\n` +
    `Для отмены отправьте /cancel`,
    'Markdown'
  );
}

// Список пользователей (постранично)
async function showUsersList(userId, page = 0) {
  const { users, total } = await UserModel.getAllPaginated(page * 10, 10);
  const totalPages = Math.ceil(total / 10);
  
  if (users.length === 0) {
    await telegramService.sendMessage(userId, '📭 Пользователей не найдено.');
    return;
  }

  let message = `📋 *Список пользователей (стр. ${page + 1}/${totalPages})*\n\n`;
  
  for (const user of users) {
    const statusEmoji = {
      'active': '✅',
      'kicked': '❌',
      'penalty': '⚠️',
      'inactive': '⏳'
    }[user.status] || '❓';
    
    const subscriptionEnd = user.subscription_end ? moment(user.subscription_end).format('DD.MM.YYYY') : '—';
    const entryPaidStatus = user.entry_paid ? 'Свой' : 'Чужой';
    
    message += `${statusEmoji} *${user.first_name || 'No name'}* (${user.id})\n`;
    message += `   👤 @${user.username || 'no_username'}\n`;
    message += `   📅 Подписка до: ${subscriptionEnd}\n`;
    message += `   🏷 ${entryPaidStatus}\n\n`;
  }

  const buttons = [];
  if (page > 0) {
    buttons.push({ text: '◀️ Назад', callback_data: `admin_users_page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    buttons.push({ text: 'Вперед ▶️', callback_data: `admin_users_page_${page + 1}` });
  }
  buttons.push({ text: '🔙 В меню', callback_data: 'admin_back' });

  const keyboard = {
    reply_markup: {
      inline_keyboard: [buttons]
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

// Добавление пользователя
async function startAddUser(userId) {
  adminStates.set(userId, { action: 'awaiting_user_id' });
  await telegramService.sendMessage(
    userId,
    `➕ *Добавление пользователя*\n\n` +
    `Отправьте данные в формате:\n` +
    `\`ID, Имя, Username, Дата окончания (ГГГГ-ММ-ДД), Свой/Чужой (+/-)\`\n\n` +
    `Пример:\n` +
    `\`123456789, Иван Иванов, @ivan, 2025-12-31, +\`\n\n` +
    `Где:\n` +
    `• + = Свой (оплатил вход)\n` +
    `• - = Чужой (не оплачивал вход)\n\n` +
    `Для отмены отправьте /cancel`,
    'Markdown'
  );
}

// Удаление пользователя
async function startRemoveUser(userId) {
  adminStates.set(userId, { action: 'awaiting_remove_id' });
  await telegramService.sendMessage(
    userId,
    `❌ *Удаление пользователя*\n\n` +
    `Отправьте ID пользователя для удаления.\n\n` +
    `Пример: \`123456789\`\n\n` +
    `Для отмены отправьте /cancel`,
    'Markdown'
  );
}

// Изменение цен
async function showPriceEditor(userId) {
  const prices = await SettingModel.getAllPrices();
  
  const message = 
    `💰 *Редактирование цен*\n\n` +
    `Текущие значения:\n` +
    `• Цена входа: ${prices.entry_price} USDT\n` +
    `• Продление (1 мес): ${prices.member_price_1m} USDT\n` +
    `• Продление (3 мес): ${prices.member_price_3m} USDT\n` +
    `• Штраф: ${prices.penalty_price} USDT\n` +
    `• Срок подписки: ${prices.subscription_days} дней\n\n` +
    `Выберите параметр для изменения:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Цена входа', callback_data: 'price_entry' }],
        [{ text: '📅 Продление (1 мес)', callback_data: 'price_1m' }],
        [{ text: '📅 Продление (3 мес)', callback_data: 'price_3m' }],
        [{ text: '⚠️ Штраф', callback_data: 'price_penalty' }],
        [{ text: '📆 Срок подписки (дней)', callback_data: 'price_days' }],
        [{ text: '🔙 В меню', callback_data: 'admin_back' }]
      ]
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

// Экспорт в Excel
async function exportToExcel(userId) {
  const users = await UserModel.getAllPaginated(0, 10000);
  
  const excelBuffer = await ExcelService.exportUsers(users.users);
  
  await botInstance.telegram.sendDocument(
    userId,
    { source: excelBuffer, filename: `users_${moment().format('YYYY-MM-DD')}.xlsx` },
    { caption: '📊 Экспорт пользователей' }
  );
  
  await telegramService.sendMessage(userId, '✅ Экспорт завершен!');
}

// Статистика (исправленная — без payments)
async function showStats(userId) {
  const stats = await UserModel.getStats();
  const prices = await SettingModel.getAllPrices();
  
  const message =
    `📊 *Детальная статистика*\n\n` +
    `👥 *Пользователи:*\n` +
    `• Всего: ${stats.total}\n` +
    `• Активных: ${stats.active}\n` +
    `• Кикнутых: ${stats.kicked}\n` +
    `• В штрафе: ${stats.penalty}\n` +
    `• Свой/Чужой: ${stats.entryPaid}/${stats.total - stats.entryPaid}\n\n` +
    `⚙️ *Настройки:*\n` +
    `• Вход: ${prices.entry_price} USDT\n` +
    `• Продление (1м): ${prices.member_price_1m} USDT\n` +
    `• Продление (3м): ${prices.member_price_3m} USDT\n` +
    `• Штраф: +${prices.penalty_price} USDT\n` +
    `• Срок: ${prices.subscription_days} дней`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 В меню', callback_data: 'admin_back' }]
      ]
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

// Обработка текстовых сообщений от админа
async function handleAdminInput(userId, text) {
  const state = adminStates.get(userId);
  if (!state) return false;

  if (text === '/cancel') {
    adminStates.delete(userId);
    await showAdminMenu(userId);
    await telegramService.sendMessage(userId, '❌ Действие отменено.');
    return true;
  }

  if (state.action === 'awaiting_payment_details') {
    await SettingModel.updatePaymentDetails(text);
    await telegramService.sendMessage(userId, '✅ *Реквизиты обновлены!*\n\nНовые реквизиты:\n```\n' + text + '\n```', 'Markdown');
    adminStates.delete(userId);
    await showAdminMenu(userId);
    return true;
  }

  if (state.action === 'awaiting_user_id') {
    const parts = text.split(',').map(p => p.trim());
    if (parts.length !== 5) {
      await telegramService.sendMessage(userId, '❌ Неверный формат. Используйте: ID, Имя, Username, ГГГГ-ММ-ДД, + или -');
      return true;
    }
    
    const [id, firstName, username, endDate, status] = parts;
    const entryPaid = status === '+';
    
    if (isNaN(parseInt(id))) {
      await telegramService.sendMessage(userId, '❌ ID должен быть числом');
      return true;
    }
    
    if (!moment(endDate, 'YYYY-MM-DD', true).isValid()) {
      await telegramService.sendMessage(userId, '❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД');
      return true;
    }
    
    let user = await UserModel.getById(id);
    
    if (user) {
      const db = require('../database/db').getDb();
      await db.run(`
        UPDATE users 
        SET username = ?, first_name = ?, subscription_end = ?, entry_paid = ?, status = 'active'
        WHERE id = ?
      `, [username, firstName, endDate, entryPaid ? 1 : 0, id]);
      
      await telegramService.sendMessage(userId, `✅ Пользователь ${id} обновлен!`);
    } else {
      const db = require('../database/db').getDb();
      await db.run(`
        INSERT INTO users (id, username, first_name, subscription_end, entry_paid, status, is_member)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, username, firstName, endDate, entryPaid ? 1 : 0, 'active', 1]);
      
      await telegramService.sendMessage(userId, `✅ Пользователь ${id} добавлен!`);
    }
    
    adminStates.delete(userId);
    await showAdminMenu(userId);
    return true;
  }
  
  if (state.action === 'awaiting_remove_id') {
    const id = parseInt(text);
    if (isNaN(id)) {
      await telegramService.sendMessage(userId, '❌ Введите корректный ID');
      return true;
    }
    
    const user = await UserModel.getById(id);
    if (!user) {
      await telegramService.sendMessage(userId, `❌ Пользователь ${id} не найден`);
      return true;
    }
    
    await UserModel.deleteUser(id);
    await telegramService.sendMessage(userId, `✅ Пользователь ${id} удален!`);
    
    adminStates.delete(userId);
    await showAdminMenu(userId);
    return true;
  }
  
  if (state.action === 'awaiting_price_change') {
    const newValue = parseFloat(text);
    if (isNaN(newValue) || newValue <= 0) {
      await telegramService.sendMessage(userId, '❌ Введите корректное положительное число');
      return true;
    }
    
    await SettingModel.set(state.priceKey, newValue.toString());
    await telegramService.sendMessage(userId, `✅ ${state.priceName} изменен на ${newValue} USDT`);
    
    adminStates.delete(userId);
    await showAdminMenu(userId);
    return true;
  }
  
  if (state.action === 'awaiting_days_change') {
    const newValue = parseInt(text);
    if (isNaN(newValue) || newValue <= 0 || newValue > 365) {
      await telegramService.sendMessage(userId, '❌ Введите корректное число дней (1-365)');
      return true;
    }
    
    await SettingModel.set('subscription_days', newValue.toString());
    await telegramService.sendMessage(userId, `✅ Срок подписки изменен на ${newValue} дней`);
    
    adminStates.delete(userId);
    await showAdminMenu(userId);
    return true;
  }
  
  return false;
}

module.exports = { 
  initAdminHandler, 
  showAdminMenu, 
  showUsersList,
  startAddUser,
  startRemoveUser,
  showPriceEditor,
  startEditPaymentDetails,
  exportToExcel,
  showStats,
  handleAdminInput,
  adminStates
};