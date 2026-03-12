const cron = require('node-cron');
const UserModel = require('../database/models/userModel');
const config = require('../config');
const bot = require('../bot');

function kickUser(chatId, userId) {
    bot.telegram.banChatMember(chatId, userId)
        .then(() => {
            console.log(`Пользователь ${userId} кикнут`);
            bot.telegram.unbanChatMember(chatId, userId).catch(() => {});
        })
        .catch(err => console.error('Ошибка кика:', err));
}

function startSubscriptionCheck() {
    const chatId = config.GROUP_CHAT_ID;

    cron.schedule(config.CHECK_CRON, () => {
        const today = new Date().toISOString().split('T')[0];

        UserModel.getExpired(today, (err, users) => {
            if (err) {
                console.error('Ошибка получения просроченных пользователей:', err);
                return;
            }
            users.forEach(user => {
                kickUser(chatId, user.user_id);

                bot.telegram.sendMessage(user.user_id, 'Срок подписки истёк, вы были удалены из группы.')
                    .catch(() => {});
            });
        });
    });

    console.log('Проверка подписок запущена по расписанию');
}

module.exports = { startSubscriptionCheck };