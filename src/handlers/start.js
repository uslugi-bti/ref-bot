const UserModel = require('../database/models/userModel');
const config = require('../config');
const { START_MESSAGE } = require('../utils/constants');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const user = ctx.from;
        const userId = user.id;
        
        UserModel.upsert(user, (err) => {
            if (err) console.error('Ошибка upsert пользователя:', err);
        });

        if (userId === config.ADMIN_ID) {
            // Админское приветствие
            await ctx.reply(
                `👑 Здравствуйте, администратор!\n\n` +
                `Вы можете управлять настройками бота через админ-панель.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⚙️ Админ-панель', callback_data: 'admin_panel' }],
                            [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                            [{ text: '💰 Проверить баланс CryptoBot', callback_data: 'admin_balance' }]
                        ]
                    }
                }
            );
        } else {
            await ctx.reply(START_MESSAGE, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Купить подписку', callback_data: 'buy' }],
                        [{ text: '📋 Проверить статус', callback_data: 'status' }]
                    ]
                }
            });
        }
    });
};