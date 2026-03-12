const UserModel = require('../database/models/userModel');
const config = require('../config');
const { START_MESSAGE } = require('../utils/constants');

// Импортируем adminPanel
const adminPanel = require('./adminPanel');

module.exports = (bot) => {
    bot.start(async (ctx) => {
        const user = ctx.from;
        const userId = user.id;
        
        UserModel.upsert(user, (err) => {
            if (err) console.error('Ошибка upsert пользователя:', err);
        });

        if (userId === config.ADMIN_ID) {
            // Показываем расширенное меню из adminPanel
            await adminPanel.showAdminMainMenu(ctx);
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