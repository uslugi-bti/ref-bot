const { Markup } = require('telegraf');
const UserModel = require('./database/models/User');
const { showUserMenu, handlePaymentSubmit, initUserHandler } = require('./handlers/userHandler');
const { 
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
} = require('./handlers/adminHandler');
const { initPaymentHandler, approvePayment, rejectPayment } = require('./handlers/paymentHandler');
const TelegramService = require('./services/telegramService');
const ExcelService = require('./services/excelService');

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

async function setupBotCommands(bot) {
  initUserHandler(bot);
  initAdminHandler(bot);
  initPaymentHandler(bot);
  const telegramService = new TelegramService(bot);

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = (userId === ADMIN_ID);
    
    await UserModel.findOrCreate(userId, {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name
    });
    
    if (isAdmin) {
      await showAdminMenu(userId);
    } else {
      await showUserMenu(userId);
    }
  });

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    if (adminStates.has(userId)) {
      adminStates.delete(userId);
      await ctx.reply('❌ Действие отменено.');
      if (userId === ADMIN_ID) {
        await showAdminMenu(userId);
      } else {
        await showUserMenu(userId);
      }
    } else {
      await ctx.reply('Нет активных действий для отмены.');
    }
  });

  bot.help(async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = (userId === ADMIN_ID);
    
    let helpText = 
      `🤖 *Помощь по боту*\n\n` +
      `Основные команды:\n` +
      `/start - Главное меню\n` +
      `/help - Эта справка\n` +
      `/cancel - Отмена текущего действия\n\n` +
      `💰 *Как получить доступ:*\n` +
      `1. Нажмите /start\n` +
      `2. Оплатите по реквизитам нужную сумму\n` +
      `3. Нажмите кнопку "Я оплатил"\n` +
      `4. Дождитесь подтверждения администратора\n\n` +
      `❓ *Вопросы:*\n` +
      `По всем вопросам обращайтесь к администратору.`;
    
    if (isAdmin) {
      helpText += `\n\n👑 *Админ-команды:*\n• /start - Админ-панель`;
    }
    
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  });

  // Обработка callback-запросов
  bot.action(/.*/, async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const isAdmin = (userId === ADMIN_ID);
    
    await ctx.answerCbQuery();
    
    // Админские действия
    if (isAdmin) {
      // Подтверждение оплаты
      if (data.match(/approve_payment_(.+)_(\d+)/)) {
        const match = data.match(/approve_payment_(.+)_(\d+)/);
        const type = match[1];
        const targetUserId = parseInt(match[2]);
        await approvePayment(targetUserId, type);
        await ctx.editMessageText(`✅ Оплата подтверждена для пользователя ${targetUserId}`, { parse_mode: 'Markdown' });
        return;
      }
      
      // Отклонение оплаты
      if (data.match(/reject_payment_(\d+)/)) {
        const targetUserId = parseInt(data.match(/reject_payment_(\d+)/)[1]);
        await rejectPayment(targetUserId);
        await ctx.editMessageText(`❌ Оплата отклонена для пользователя ${targetUserId}`, { parse_mode: 'Markdown' });
        return;
      }
      
      // Админ-панель
      if (data === 'admin_back') {
        await showAdminMenu(userId);
        return;
      }
      
      if (data === 'admin_users') {
        await showUsersList(userId, 0);
        return;
      }
      
      if (data.match(/admin_users_page_(\d+)/)) {
        const page = parseInt(data.match(/admin_users_page_(\d+)/)[1]);
        await showUsersList(userId, page);
        return;
      }
      
      if (data === 'admin_import') {
        await ctx.reply(
          `📥 *Импорт пользователей из Excel*\n\n` +
          `Отправьте мне Excel файл в формате .xlsx\n\n` +
          `Для отмены отправьте /cancel`,
          { parse_mode: 'Markdown' }
        );
        adminStates.set(userId, { action: 'awaiting_import_file' });
        return;
      }
      
      if (data === 'admin_export') {
        await exportToExcel(userId);
        return;
      }
      
      if (data === 'admin_add') {
        await startAddUser(userId);
        return;
      }
      
      if (data === 'admin_remove') {
        await startRemoveUser(userId);
        return;
      }
      
      if (data === 'admin_prices') {
        await showPriceEditor(userId);
        return;
      }
      
      if (data === 'admin_payment_details') {
        await startEditPaymentDetails(userId);
        return;
      }
      
      if (data === 'admin_stats') {
        await showStats(userId);
        return;
      }
      
      // Обработка изменения цен
      const priceActions = {
        'price_entry': { key: 'entry_price', name: 'Цену входа' },
        'price_1m': { key: 'member_price_1m', name: 'Цену продления (1 месяц)' },
        'price_3m': { key: 'member_price_3m', name: 'Цену продления (3 месяца)' },
        'price_penalty': { key: 'penalty_price', name: 'Штраф' },
        'price_days': { key: 'subscription_days', name: 'Срок подписки', isDays: true }
      };
      
      if (priceActions[data]) {
        const action = priceActions[data];
        if (action.isDays) {
          adminStates.set(userId, { action: 'awaiting_days_change' });
          await ctx.reply('📆 Введите новый срок подписки (в днях):\n\nПример: `30`', { parse_mode: 'Markdown' });
        } else {
          adminStates.set(userId, { action: 'awaiting_price_change', priceKey: action.key, priceName: action.name });
          await ctx.reply(`💰 Введите новую ${action.name} (в USDT):\n\nПример: \`250\``, { parse_mode: 'Markdown' });
        }
        return;
      }
    }
    
    // Пользовательские действия
    if (data.match(/submit_payment_(.+)/)) {
      const paymentType = data.match(/submit_payment_(.+)/)[1];
      await handlePaymentSubmit(userId, paymentType);
      return;
    }
  });
  
  // Обработка текстовых сообщений
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = (userId === ADMIN_ID);
    const text = ctx.message.text;
    
    if (text.startsWith('/')) return;
    
    if (isAdmin) {
      const handled = await handleAdminInput(userId, text);
      if (handled) return;
    }
    
    if (!isAdmin) {
      await showUserMenu(userId);
    }
  });
  
  // Обработка документов (Excel)
  bot.on('document', async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = (userId === ADMIN_ID);
    
    if (!isAdmin) {
      await ctx.reply('❌ У вас нет прав для импорта файлов.');
      return;
    }
    
    const state = adminStates.get(userId);
    if (!state || state.action !== 'awaiting_import_file') {
      await ctx.reply('❌ Сначала выберите "Импорт" в админ-панели.');
      return;
    }
    
    const document = ctx.message.document;
    if (!document.file_name.endsWith('.xlsx')) {
      await ctx.reply('❌ Пожалуйста, отправьте файл в формате .xlsx');
      return;
    }
    
    await ctx.reply('📥 Начинаю импорт...');
    
    try {
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      const results = await ExcelService.importUsers(buffer, bot);
      
      let resultMessage = 
        `✅ *Импорт завершен!*\n\n` +
        `• Всего обработано: ${results.total}\n` +
        `• Успешно: ${results.success}\n` +
        `• Создано: ${results.created}\n` +
        `• Обновлено: ${results.updated}\n`;
      
      if (results.errors.length > 0) {
        resultMessage += `\n⚠️ *Ошибки:*\n`;
        for (const error of results.errors.slice(0, 5)) {
          resultMessage += `• ${error}\n`;
        }
      }
      
      await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
      adminStates.delete(userId);
      
    } catch (error) {
      console.error('Import error:', error);
      await ctx.reply(`❌ Ошибка импорта: ${error.message}`);
    }
  });
  
  console.log('✅ Bot commands and handlers initialized');
}

module.exports = { setupBotCommands };