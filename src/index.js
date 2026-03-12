const bot = require('./bot');
const { startSubscriptionCheck } = require('./services/subscriptionCheck');
const ReminderService = require('./services/reminderService');

// Создаём сервис напоминаний
const reminderService = new ReminderService(bot);

// Запуск ежедневной проверки подписок
startSubscriptionCheck();

// Запуск напоминаний
reminderService.start();

// Запуск бота
bot.launch().then(() => {
    console.log('🚀 Бот запущен');
}).catch((err) => {
    console.error('Ошибка запуска бота:', err);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));