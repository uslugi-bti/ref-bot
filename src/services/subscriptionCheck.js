const cron = require('node-cron');
const UserModel = require('../database/models/userModel');
const config = require('../config');
const bot = require('../bot');  // импортируем бота для кика

function kickUser(chatId, userId) {
    if (!chatId) return;
    
    bot.telegram.banChatMember(chatId, userId)
        .then(() => {
            console.log(`Пользователь ${userId} кикнут (истекла подписка)`);
            // Разбаниваем, чтобы мог заново войти после оплаты
            bot.telegram.unbanChatMember(chatId, userId).catch(() => {});
        })
        .catch(err => console.error('Ошибка кика:', err));
}

function startSubscriptionCheck() {
    const chatId = config.GROUP_CHAT_ID;

    if (!chatId) {
        console.warn('⚠️ GROUP_CHAT_ID не указан, кик работать не будет');
    }

    // Проверка каждый день в 00:05 (сразу после полуночи)
    cron.schedule('5 0 * * *', () => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        UserModel.getExpired(today, (err, users) => {
            if (err) {
                console.error('Ошибка получения просроченных пользователей:', err);
                return;
            }
            
            console.log(`🔴 Найдено пользователей с истекшей подпиской: ${users.length}`);
            
            users.forEach(user => {
                if (chatId) {
                    kickUser(chatId, user.user_id);
                }

                // Отправляем уведомление о кике
                bot.telegram.sendMessage(
                    user.user_id, 
                    '❌ **Срок подписки истёк**\n\n' +
                    'Вы были удалены из канала. Чтобы восстановить доступ, оплатите подписку заново.',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💳 Купить подписку', callback_data: 'buy' }]
                            ]
                        }
                    }
                ).catch(() => {});
            });
        });
    });

    console.log('✅ Subscription check started (daily at 00:05)');
}

module.exports = { startSubscriptionCheck };