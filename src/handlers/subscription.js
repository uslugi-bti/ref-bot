const UserModel = require('../database/models/userModel');
const CryptoPay = require('../services/cryptoPay');
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
            UserModel.setInvoice(userId, invoice.invoice_id, (err) => {
                if (err) console.error('Ошибка сохранения invoice:', err);
            });

            // Отправляем ссылку на оплату
            await ctx.reply(
                `Оплатите подписку (${config.SUBSCRIPTION_PRICE}$) по ссылке:\n${invoice.pay_url}\n\nПосле оплаты нажмите "Я оплатил"`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Я оплатил', callback_data: `check_payment_${invoice.invoice_id}` }],
                            [{ text: 'Отмена', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
        } catch (error) {
            await ctx.reply('Ошибка при создании счёта. Попробуйте позже.');
        }
    });

    // Команда /status
    bot.command('status', (ctx) => {
        UserModel.get(ctx.from.id, (err, user) => {
            if (err || !user || !user.subscription_end) {
                ctx.reply('У вас нет активной подписки.');
            } else {
                const endDate = new Date(user.subscription_end).toLocaleDateString();
                ctx.reply(`Ваша подписка активна до ${endDate}.`);
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
                ctx.reply(`✅ Тестовая дата окончания: через ${days} дней (${endDate})`);
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

    // Команда для ручной оплаты (если нужно пропустить 10 секунд)
    bot.command('forcepay', async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return;
        
        ctx.reply('Используйте кнопку "Принудительно оплатить" при оплате');
    });
};