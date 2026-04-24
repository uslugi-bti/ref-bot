const cron = require('node-cron');
const UserModel = require('../database/models/User');
const TelegramService = require('./telegramService');
const SettingModel = require('./database/models/Setting');
const moment = require('moment');

let cronJob = null;
let telegramService = null;

function startSubscriptionCheck(bot) {
  telegramService = new TelegramService(bot);
  const cronTime = process.env.CHECK_CRON || '0 10 * * *';
  
  cronJob = cron.schedule(cronTime, async () => {
    console.log('🔍 Running subscription check...');
    await checkExpiringSoon(bot);
    await checkExpiredAndKick(bot);
  });
  
  console.log(`✅ Subscription check scheduled: ${cronTime}`);
  
  setTimeout(() => {
    checkExpiringSoon(bot);
    checkExpiredAndKick(bot);
  }, 60000);
}

async function checkExpiringSoon(bot) {
  const expiringUsers = await UserModel.getExpiringSoon(5);
  
  for (const user of expiringUsers) {
    const daysLeft = moment(user.subscription_end).diff(moment(), 'days');
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    
    const message = 
      `⚠️ Внимание! Подписка истекает!\n\n` +
      `Ваша подписка на закрытый канал истекает ${endDate}.\n` +
      `Осталось дней: ${daysLeft}\n\n` +
      `Для продления нажмите /start и выберите удобный вариант.\n\n` +
      `Если не продлить подписку, вы будетете исключены из канала через ${daysLeft} дней.`;
    
    try {
      await telegramService.sendMessage(user.id, message);
      console.log(`📧 Sent expiration warning to ${user.id} (${daysLeft} days left)`);
    } catch (error) {
      if (error.response?.error_code === 403) {
        console.log(`⚠️ Cannot message user ${user.id} - user hasn't started bot`);
      } else {
        console.error(`Error sending to ${user.id}:`, error.message);
      }
    }
  }
}

async function checkExpiredAndKick(bot) {
  const expiredUsers = await UserModel.getExpired();
  const prices = await SettingModel.getAllPrices();
  
  for (const user of expiredUsers) {
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    const daysOverdue = moment().diff(moment(user.subscription_end), 'days');
    
    if (user.status === 'kicked') {
      continue;
    }
    
    try {
      await telegramService.kickUser(user.id);
      await UserModel.kickUser(user.id);
      
      // Если просрочка более 5 дней - устанавливаем штрафной статус
      if (daysOverdue > 5) {
        await UserModel.setPenalty(user.id, 30); // Штрафной статус на 30 дней
      }
      
      let message = '';
      if (daysOverdue <= 5) {
        message = 
          `❌ Вы исключены из канала за неуплату!\n\n` +
          `Ваша подписка истекла ${endDate} (просрочка ${daysOverdue} дней).\n\n` +
          `⚠️ У вас есть 5 дней для восстановления подписки БЕЗ ШТРАФА!\n` +
          `Просто оплатите продление через /start.\n\n` +
          `💰 Стоимость продления: ${prices.member_price_1m} USDT\n\n` +
          `Не тяните!`;
      } else {
        message = 
          `❌ Вы исключены из канала за неуплату!\n\n` +
          `Ваша подписка истекла ${endDate} (просрочка ${daysOverdue} дней).\n\n` +
          `❗️ Вы пропустили льготный период 5 дней!\n` +
          `Теперь стоимость продления составляет ${prices.penalty_price} USDT (фиксированный штраф).\n\n` +
          `Восстановите подписку через /start.`;
      }
      
      await telegramService.sendMessage(user.id, message);
      
      await telegramService.notifyAdmin(
        `⚠️ Автоматический кик\n` +
        `Пользователь: ${user.first_name || user.username || user.id}\n` +
        `ID: ${user.id}\n` +
        `Подписка истекла: ${endDate}\n` +
        `Просрочка: ${daysOverdue} дней\n` +
        `${daysOverdue > 5 ? 'Штрафной тариф активирован' : 'Льготный период 5 дней'}`
      );
      
      console.log(`🔨 Kicked user ${user.id} for expired subscription`);
    } catch (error) {
      console.error(`Error kicking user ${user.id}:`, error.message);
    }
  }
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
  checkExpiredAndKick
};