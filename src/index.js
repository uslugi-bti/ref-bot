const bot = require('./bot');
const { startSubscriptionCheck } = require('./services/subscriptionCheck');

startSubscriptionCheck();

bot.launch().then(() => {
    console.log('Бот запущен');
}).catch((err) => {
    console.error('Ошибка запуска бота:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));