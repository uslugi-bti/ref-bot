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
      `🤖 ПОМОЩЬ ПО БОТУ\n\n` +
      `Основные команды:\n` +
      `/start - Главное меню\n` +
      `/help - Эта справка\n` +
      `/cancel - Отмена текущего действия\n\n` +
      `💰 КАК ПОЛУЧИТЬ ДОСТУП:\n` +
      `1. Нажмите /start\n` +
      `2. Оплатите по реквизитам нужную сумму\n` +
      `3. Нажмите кнопку "Я оплатил"\n` +
      `4. Дождитесь подтверждения администратора\n\n` +
      `❓ Вопросы:\n` +
      `По всем вопросам обращайтесь к администратору.`;
    
    if (isAdmin) {
      helpText += `\n\n👑 АДМИН-КОМАНДЫ:\n• /start - Админ-панель`;
    }
    
    await ctx.reply(helpText);
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
        await ctx.editMessageText(`✅ Оплата подтверждена для пользователя ${targetUserId}`);
        return;
      }
      
      // Отклонение оплаты
      if (data.match(/reject_payment_(\d+)/)) {
        const targetUserId = parseInt(data.match(/reject_payment_(\d+)/)[1]);
        await rejectPayment(targetUserId);
        await ctx.editMessageText(`❌ Оплата отклонена для пользователя ${targetUserId}`);
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
          `📥 ИМПОРТ ПОЛЬЗОВАТЕЛЕЙ ИЗ EXCEL\n\n` +
          `Отправьте мне Excel файл в формате .xlsx\n\n` +
          `Для отмены отправьте /cancel`
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
      if (data === 'price_entry') {
        adminStates.set(userId, { action: 'awaiting_price_change', priceKey: 'entry_price', priceName: 'Цену входа' });
        await ctx.reply(`💰 Введите новую цену входа (в USDT):\n\nПример: 250`);
        return;
      }
      
      if (data === 'price_1m') {
        adminStates.set(userId, { action: 'awaiting_price_change', priceKey: 'member_price_1m', priceName: 'Цену продления (1 месяц)' });
        await ctx.reply(`📅 Введите новую цену продления на 1 месяц (в USDT):\n\nПример: 50`);
        return;
      }
      
      if (data === 'price_3m') {
        adminStates.set(userId, { action: 'awaiting_price_change', priceKey: 'member_price_3m', priceName: 'Цену продления (3 месяца)' });
        await ctx.reply(`📅 Введите новую цену продления на 3 месяца (в USDT):\n\nПример: 120`);
        return;
      }
      
      if (data === 'price_penalty_1') {
        adminStates.set(userId, { action: 'awaiting_price_change', priceKey: 'penalty_price_1', priceName: 'Штраф (1-5 дней)' });
        await ctx.reply(`⚠️ Введите новый размер штрафа для периода 1-5 дней (в USDT):\n\nПример: 50`);
        return;
      }
      
      if (data === 'price_penalty_2') {
        adminStates.set(userId, { action: 'awaiting_price_change', priceKey: 'penalty_price_2', priceName: 'Штраф (>5 дней)' });
        await ctx.reply(`⚠️ Введите новый размер штрафа для периода после 5 дней (в USDT):\n\nПример: 100`);
        return;
      }
      
      if (data === 'price_days') {
        adminStates.set(userId, { action: 'awaiting_days_change' });
        await ctx.reply(`📆 Введите новый срок подписки (в днях):\n\nПример: 30`);
        return;
      }
    }
    
    // Пользовательские действия
    if (data === 'pay_entry') {
      await handlePaymentSubmit(userId, 'entry');
      return;
    }
    
    if (data === 'submit_payment_entry') {
      await handlePaymentSubmit(userId, 'entry');
      return;
    }
    
    if (data === 'submit_payment_renew_1m') {
      await handlePaymentSubmit(userId, 'renew_1m');
      return;
    }
    
    if (data === 'submit_payment_renew_3m') {
      await handlePaymentSubmit(userId, 'renew_3m');
      return;
    }
    
    if (data === 'submit_payment_penalty_light') {
      await handlePaymentSubmit(userId, 'penalty_light');
      return;
    }
    
    if (data === 'submit_payment_penalty_heavy') {
      await handlePaymentSubmit(userId, 'penalty_heavy');
      return;
    }
    
    if (data === 'submit_payment_penalty') {
      await handlePaymentSubmit(userId, 'penalty_light');
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
        `✅ ИМПОРТ ЗАВЕРШЕН!\n\n` +
        `• Всего обработано: ${results.total}\n` +
        `• Успешно: ${results.success}\n` +
        `• Создано: ${results.created}\n` +
        `• Обновлено: ${results.updated}\n`;
      
      if (results.errors.length > 0) {
        resultMessage += `\n⚠️ ОШИБКИ:\n`;
        for (const error of results.errors.slice(0, 5)) {
          resultMessage += `• ${error}\n`;
        }
      }
      
      await ctx.reply(resultMessage);
      adminStates.delete(userId);
      
    } catch (error) {
      console.error('Import error:', error);
      await ctx.reply(`❌ Ошибка импорта: ${error.message}`);
    }
  });
  
  console.log('✅ Bot commands and handlers initialized');
}

module.exports = { setupBotCommands };