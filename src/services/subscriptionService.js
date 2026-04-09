const cron = require('node-cron');
const UserModel = require('../database/models/User');
const TelegramService = require('./telegramService');
const moment = require('moment');

let cronJob = null;
let telegramService = null;

function startSubscriptionCheck(bot) {
  telegramService = new TelegramService(bot);
  const cronTime = process.env.CHECK_CRON || '0 10 * * *'; // Каждый день в 10:00
  
  cronJob = cron.schedule(cronTime, async () => {
    console.log('🔍 Running subscription check...');
    await checkExpiringSoon(bot);
    await checkExpiredAndKick(bot);
  });
  
  console.log(`✅ Subscription check scheduled: ${cronTime}`);
  
  // Первый запуск через 1 минуту после старта
  setTimeout(() => {
    checkExpiringSoon(bot);
    checkExpiredAndKick(bot);
  }, 60000);
}

// Проверка подписок, которые истекают через 5 дней
async function checkExpiringSoon(bot) {
  const expiringUsers = await UserModel.getExpiringSoon(5);
  
  for (const user of expiringUsers) {
    const daysLeft = moment(user.subscription_end).diff(moment(), 'days');
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    
    const message = 
      `⚠️ *Внимание! Подписка истекает!*\n\n` +
      `Ваша подписка на закрытый канал истекает *${endDate}*.\n` +
      `Осталось дней: *${daysLeft}*\n\n` +
      `Для продления нажмите /start и выберите удобный вариант.\n\n` +
      `Если не продлить подписку, вы будете исключены из канала через ${daysLeft} дней.`;
    
    await telegramService.sendMessage(user.id, message);
    console.log(`📧 Sent expiration warning to ${user.id} (${daysLeft} days left)`);
  }
}

// Проверка просроченных подписок и кик
async function checkExpiredAndKick(bot) {
  const expiredUsers = await UserModel.getExpired();
  
  for (const user of expiredUsers) {
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    const daysOverdue = moment().diff(moment(user.subscription_end), 'days');
    
    // Проверяем, не был ли уже кикнут
    if (user.status === 'kicked') {
      continue;
    }
    
    // Кикаем пользователя
    await telegramService.kickUser(user.id);
    await UserModel.kickUser(user.id);
    
    // Устанавливаем штрафной период (5 дней на оплату без доп. штрафа)
    await UserModel.setPenalty(user.id, 5);
    
    const message = 
      `❌ *Вы исключены из канала за неуплату!*\n\n` +
      `Ваша подписка истекла *${endDate}* (просрочка ${daysOverdue} дней).\n\n` +
      `⚠️ *У вас есть 5 дней* для восстановления подписки без дополнительного штрафа.\n` +
      `Просто оплатите продление через /start.\n\n` +
      `❗️ *После 5 дней штраф составит ${process.env.PENALTY_PRICE || 1.2} USDT*\n` +
      `(прибавится к стоимости продления)\n\n` +
      `Не тяните!`;
    
    await telegramService.sendMessage(user.id, message);
    
    // Уведомляем админа
    await telegramService.notifyAdmin(
      `⚠️ *Автоматический кик*\n` +
      `Пользователь: ${user.first_name || user.username || user.id}\n` +
      `ID: ${user.id}\n` +
      `Подписка истекла: ${endDate}\n` +
      `Просрочка: ${daysOverdue} дней\n` +
      `Статус: кикнут, штрафной период 5 дней`
    );
    
    console.log(`🔨 Kicked user ${user.id} for expired subscription`);
  }
}

// Ручная проверка пользователя
async function checkUserSubscription(bot, userId) {
  const user = await UserModel.getById(userId);
  if (!user || !user.subscription_end) return false;
  
  const isExpired = moment(user.subscription_end).isBefore(moment());
  const isInPenaltyPeriod = user.penalty_until && moment(user.penalty_until).isAfter(moment());
  
  if (isExpired && !isInPenaltyPeriod && user.status !== 'kicked') {
    await checkExpiredAndKick(bot);
    return true;
  }
  
  return false;
}

function stopSubscriptionCheck() {
  if (cronJob) {
    cronJob.stop();
    console.log('🛑 Subscription check stopped');
  }
}

module.exports = {
  startSubscriptionCheck,
  stopSubscriptionCheck,
  checkExpiringSoon,
  checkExpiredAndKick,
  checkUserSubscription
};