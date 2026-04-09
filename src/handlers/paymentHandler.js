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
  
  // Проверяем, нет ли уже pending заявки
  const existing = await db.get(`
    SELECT * FROM payment_requests 
    WHERE user_id = ? AND status = 'pending'
  `, [userId]);
  
  if (existing) {
    return { success: false, error: 'У вас уже есть активная заявка. Дождитесь обработки.' };
  }
  
  // Создаем новую заявку
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
  
  const typeText = {
    'entry': '💎 Вход в клуб',
    'renew_1m': '🔄 Продление (1 месяц)',
    'renew_3m': '🔄 Продление (3 месяца)',
    'renew_with_penalty': '⚠️ Восстановление со штрафом'
  }[type] || 'Оплата';
  
  const message = 
    `💰 *НОВАЯ ЗАЯВКА НА ОПЛАТУ*\n\n` +
    `${typeText}\n` +
    `👤 Пользователь: ${user.first_name || 'Без имени'} (@${user.username || 'no_username'})\n` +
    `🆔 ID: ${userId}\n` +
    `💵 Сумма: ${amount} USDT\n\n` +
    `📝 *Реквизиты для оплаты:*\n` +
    `\`\`\`\n${prices.payment_details}\n\`\`\`\n\n` +
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
  await telegramService.sendMessage(process.env.ADMIN_ID, `🔗 Заявка #${type}_${userId}`, 'Markdown');
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
  
  // Обновляем статус заявки
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
      message = `✅ *Оплата подтверждена!*\n\n` +
                `Ваш вход в клуб активирован!\n` +
                `Подписка до: ${newEndDate}\n\n` +
                `🎉 Добро пожаловать!`;
      needInvite = true;
      break;
      
    case 'renew_1m':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays, false);
      message = `✅ *Подписка продлена!*\n\n` +
                `Новая дата окончания: ${newEndDate}\n\n` +
                `Спасибо, что остаетесь с нами!`;
      break;
      
    case 'renew_3m':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays * 3, false);
      message = `✅ *Подписка продлена на 3 месяца!*\n\n` +
                `Новая дата окончания: ${newEndDate}`;
      break;
      
    case 'renew_with_penalty':
      newEndDate = await UserModel.extendSubscription(userId, subscriptionDays, true);
      message = `⚠️ *Подписка восстановлена со штрафом*\n\n` +
                `Новая дата окончания: ${newEndDate}\n\n` +
                `В следующий раз не опаздывайте!`;
      needInvite = true;
      break;
  }
  
  // Отправляем сообщение пользователю
  await telegramService.sendMessage(userId, message);
  
  // Если нужно отправить инвайт ссылку
  if (needInvite) {
    const inviteLink = await telegramService.createInviteLink(userId);
    if (inviteLink) {
      await telegramService.sendInviteLink(userId, inviteLink);
    }
  }
  
  // Уведомляем админа
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
  
  // Обновляем статус заявки
  await db.run(`
    UPDATE payment_requests 
    SET status = 'rejected', admin_action = 'rejected', processed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `, [userId]);
  
  // Уведомляем пользователя
  await telegramService.sendMessage(
    userId,
    `❌ *Ваша заявка на оплату отклонена*\n\n` +
    `Пожалуйста, свяжитесь с администратором для уточнения деталей.\n` +
    `Причина: оплата не подтверждена.`
  );
  
  // Уведомляем админа
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