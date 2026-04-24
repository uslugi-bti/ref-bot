const { getDb } = require('../database/db');
const UserModel = require('../database/models/User');
const SettingModel = require('../database/models/Setting');
const TelegramService = require('../services/telegramService');
const moment = require('moment');

let botInstance = null;
let telegramService = null;

function initPaymentHandler(bot) {
  botInstance = bot;
  telegramService = new TelegramService(bot);
}

// Создание заявки на оплату
async function createPaymentRequest(userId, type, amount) {
  const db = getDb();
  
  const existing = await db.get(`
    SELECT * FROM payment_requests 
    WHERE user_id = ? AND status = 'pending'
  `, [userId]);
  
  if (existing) {
    return { success: false, error: 'У вас уже есть активная заявка. Дождитесь обработки.' };
  }
  
  await db.run(`
    INSERT INTO payment_requests (user_id, amount, type, status)
    VALUES (?, ?, ?, ?)
  `, [userId, amount, type, 'pending']);
  
  const request = await db.get(`
    SELECT * FROM payment_requests WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1
  `, [userId]);
  
  return { success: true, request };
}

// Отправка уведомления админу о новой заявке
async function notifyAdminAboutPayment(userId, type, amount) {
  const user = await UserModel.getById(userId);
  const prices = await SettingModel.getAllPrices();
  
  // Проверка на существование пользователя
  if (!user) {
    console.error(`User ${userId} not found in database`);
    await telegramService.sendMessage(
      process.env.ADMIN_ID,
      `⚠️ Ошибка: пользователь ${userId} не найден в БД при создании заявки на оплату`
    );
    return;
  }
  
  const typeText = {
    'entry': 'Вход в клуб',
    'renew_1m': 'Продление (1 месяц)',
    'renew_3m': 'Продление (3 месяца)',
    'renew_with_penalty': 'Восстановление со штрафом'
  }[type] || 'Оплата';
  
  const userName = user.first_name || 'Без имени';
  const userLogin = user.username || 'no_username';
  
  const message = 
    `💰 НОВАЯ ЗАЯВКА НА ОПЛАТУ\n\n` +
    `${typeText}\n` +
    `👤 Пользователь: ${userName} (@${userLogin})\n` +
    `🆔 ID: ${userId}\n` +
    `💵 Сумма: ${amount} USDT\n\n` +
    `📝 Реквизиты для оплаты:\n` +
    `${prices.payment_details}\n\n` +
    `❗️ После получения оплаты нажмите "Подтвердить"`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Подтвердить оплату', callback_data: `approve_payment_${type}_${userId}` },
          { text: '❌ Отклонить', callback_data: `reject_payment_${userId}` }
        ]
      ]
    }
  };
  
  await telegramService.sendKeyboard(process.env.ADMIN_ID, message, keyboard.reply_markup);
}

// Подтверждение оплаты админом
async function approvePayment(userId, type) {
  const db = getDb();
  const user = await UserModel.getById(userId);
  const prices = await SettingModel.getAllPrices();
  const subscriptionDays = parseInt(prices.subscription_days);
  
  if (!user) {
    await telegramService.sendMessage(process.env.ADMIN_ID, `❌ Пользователь ${userId} не найден`);
    return false;
  }
  
  await db.run(`
    UPDATE payment_requests 
    SET status = 'approved', admin_action = 'approved', processed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `, [userId]);
  
  let newEndDate;
  let message = '';
  let needInvite = false;
  
  switch (type) {
    case 'entry':
      newEndDate = moment().add(subscriptionDays, 'days').format('YYYY-MM-DD');
      await UserModel.updateSubscription(userId, newEndDate, true);
      message = `✅ Оплата подтверждена!\n\nВаш вход в клуб активирован!\nПодписка до: ${newEndDate}\n\n🎉 Добро пожаловать!`;
      needInvite = true;
      break;
      
    case 'renew_1m':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays, false);
      message = `✅ Подписка продлена!\n\nНовая дата окончания: ${newEndDate}\n\nСпасибо, что остаетесь с нами!`;
      break;
      
    case 'renew_3m':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays * 3, false);
      message = `✅ Подписка продлена на 3 месяца!\n\nНовая дата окончания: ${newEndDate}`;
      break;
      
    case 'renew_with_penalty':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays, true);
      message = `⚠️ Подписка восстановлена со штрафом\n\nНовая дата окончания: ${newEndDate}\n\nВ следующий раз не опаздывайте!`;
      needInvite = true;
      break;
  }
  
  await telegramService.sendMessage(userId, message);
  
  if (needInvite) {
    const inviteLink = await telegramService.createInviteLink(userId);
    if (inviteLink) {
      await telegramService.sendInviteLink(userId, inviteLink);
    }
  }
  
  await telegramService.sendMessage(
    process.env.ADMIN_ID,
    `✅ Оплата подтверждена для пользователя ${userId} (${type})`
  );
  
  return true;
}

// Отклонение оплаты админом
async function rejectPayment(userId) {
  const db = getDb();
  const user = await UserModel.getById(userId);
  
  if (!user) {
    await telegramService.sendMessage(process.env.ADMIN_ID, `❌ Пользователь ${userId} не найден`);
    return false;
  }
  
  await db.run(`
    UPDATE payment_requests 
    SET status = 'rejected', admin_action = 'rejected', processed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `, [userId]);
  
  await telegramService.sendMessage(
    userId,
    `❌ Ваша заявка на оплату отклонена\n\nПожалуйста, свяжитесь с администратором для уточнения деталей.\nПричина: оплата не подтверждена.`
  );
  
  await telegramService.sendMessage(
    process.env.ADMIN_ID,
    `❌ Заявка отклонена для пользователя ${userId}`
  );
  
  return true;
}

module.exports = { 
  initPaymentHandler, 
  createPaymentRequest, 
  notifyAdminAboutPayment,
  approvePayment,
  rejectPayment
};