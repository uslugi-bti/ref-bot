require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { initDatabase } = require('./src/database/db');
const { setupBotCommands } = require('./src/bot');
const { startSubscriptionCheck } = require('./src/services/subscriptionService');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Инициализация БД и запуск бота
(async () => {
  await initDatabase();
  await setupBotCommands(bot);
  
  // Запуск проверки подписок по крону
  startSubscriptionCheck(bot);
  
  // Запуск бота
  await bot.launch();
  console.log('🤖 Bot started successfully');
  console.log('💳 Payment system: Manual (admin approval)');
  console.log('📡 Bot is running...');
})();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));