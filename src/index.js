const bot = require('./bot');
const { startSubscriptionCheck } = require('./services/subscriptionCheck');
const ReminderService = require('./services/reminderService');
const UserModel = require('./database/models/userModel');

// 1. Сначала подключаемся к БД (db.js выполняется автоматически при импорте)
// 2. ПОТОМ инициализируем таблицу через UserModel
UserModel.initTable((err) => {
    if (err) {
        console.error('❌ Ошибка инициализации таблицы:', err);
        process.exit(1); // если таблица не создалась, останавливаем бота
    }
    
    console.log('✅ Таблица users готова');
    
    // 3. Только после успешной инициализации запускаем сервисы
    const reminderService = new ReminderService(bot);
    startSubscriptionCheck();
    reminderService.start();

    bot.launch().then(() => {
        console.log('🚀 Бот запущен');
    }).catch((err) => {
        console.error('❌ Ошибка запуска бота:', err);
    });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));