const UserModel = require('../database/models/userModel');
// Временно используем мок для тестов
let CryptoPay;
try {
    CryptoPay = require('../services/mockCryptoPay');
    console.log('🧪 [BUY] Тестовый режим: используется MOCK CryptoPay');
} catch (e) {
    CryptoPay = require('../services/cryptoPay');
}
const config = require('../config');
const { addDays } = require('../utils/helpers');

module.exports = (bot) => {
    // Команда /buy
    bot.command('buy', async (ctx) => {
        const userId = ctx.from.id;

        try {
            const invoice = await CryptoPay.createInvoice(
                config.SUBSCRIPTION_PRICE,
                `Подписка на ${config.SUBSCRIPTION_DAYS} дней`
            );

            // Сохраняем invoice_id в БД
            UserModel.setInvoice(userId, invoice.result.invoice_id, (err) => {
                if (err) console.error('Ошибка сохранения invoice:', err);
            });

            // Отправляем ссылку на оплату
            await ctx.reply(
                `🧪 **ТЕСТОВЫЙ РЕЖИМ**\n\n` +
                `💰 Сумма: ${config.SUBSCRIPTION_PRICE}$\n` +
                `📅 Срок: ${config.SUBSCRIPTION_DAYS} дней\n\n` +
                `Через 10 секунд оплатится автоматически, или нажмите кнопку принудительно.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Я оплатил', callback_data: `check_payment_${invoice.result.invoice_id}` }],
                            [{ text: '⚡ Принудительно оплатить', callback_data: `force_pay_${invoice.result.invoice_id}` }],
                            [{ text: '❌ Отмена', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Ошибка создания счёта:', error);
            await ctx.reply('❌ Ошибка при создании тестового счёта. Попробуйте позже.');
        }
    });

    // Команда /status
    bot.command('status', (ctx) => {
        UserModel.get(ctx.from.id, (err, user) => {
            if (err || !user || !user.subscription_end) {
                ctx.reply('📭 У вас нет активной подписки.');
            } else {
                const endDate = new Date(user.subscription_end).toLocaleDateString('ru-RU');
                ctx.reply(`✅ Ваша подписка активна до **${endDate}**.`, { parse_mode: 'Markdown' });
            }
        });
    });

    // ========== ТЕСТОВЫЕ КОМАНДЫ (только для админа) ==========

    // Команда для тестирования уведомлений
    bot.command('testnotify', async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return;
        
        const days = parseInt(ctx.message.text.split(' ')[1]) || 5;
        
        const endDate = addDays(new Date(), days).toISOString().split('T')[0];
        
        UserModel.setSubscription(ctx.from.id, endDate, async (err) => {
            if (err) {
                ctx.reply('❌ Ошибка установки тестовой даты');
            } else {
                ctx.reply(`✅ Тестовая дата окончания: через **${days}** дней (**${endDate}**)`, { parse_mode: 'Markdown' });
            }
        });
    });

    // Команда для принудительной проверки напоминаний
    bot.command('testremind', async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return;
        
        try {
            const ReminderService = require('../services/reminderService');
            const reminderService = new ReminderService(bot);
            await reminderService.checkReminders();
            ctx.reply('✅ Проверка напоминаний запущена');
        } catch (e) {
            ctx.reply('❌ Ошибка: ' + e.message);
        }
    });
};