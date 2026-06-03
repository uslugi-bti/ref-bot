require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initDatabase } = require('./src/database/db');
const { setupBotCommands } = require('./src/bot');
const { startSubscriptionCheck } = require('./src/services/subscriptionService');

const bot = new Telegraf(process.env.BOT_TOKEN);

(async () => {
  await initDatabase();
  await setupBotCommands(bot);
  
  startSubscriptionCheck(bot);
  
  await bot.launch();
  console.log('🤖 БОТ ЗАПУЩЕН');
  console.log('💳 Система оплаты: ручная (подтверждение админом)');
  console.log(`🕐 Текущее время UTC: ${new Date().toUTCString()}`);
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));