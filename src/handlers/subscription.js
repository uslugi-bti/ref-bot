const UserModel = require('../database/models/userModel');
const CryptoPay = require('../services/cryptoPay');
const config = require('../config');
const { addDaysToDate } = require('../utils/helpers');

module.exports = (bot) => {
    bot.command('buy', async (ctx) => {
        const userId = ctx.from.id;

        UserModel.get(userId, async (err, user) => {
            if (err) {
                return ctx.reply('❌ Ошибка получения данных');
            }

            // ВЫБОР ЦЕНЫ
            const price = user?.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE;
            const userType = user?.is_member ? '🟢 СВОЙ' : '🔴 ЧУЖОЙ';

            try {
                const invoice = await CryptoPay.createInvoice(
                    price,
                    `Подписка на ${config.SUBSCRIPTION_DAYS} дней`
                );

                UserModel.setInvoice(userId, invoice.invoice_id, (err) => {
                    if (err) console.error('Ошибка сохранения invoice:', err);
                });

                await ctx.reply(
                    `💰 Сумма к оплате: **${price} USD**\n\n` +
                    `Ссылка на оплату:\n${invoice.pay_url}\n\n` +
                    `После оплаты нажмите "Я оплатил"`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Я оплатил', callback_data: `check_payment_${invoice.invoice_id}` }],
                                [{ text: '❌ Отмена', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Ошибка создания счёта:', error);
                ctx.reply('❌ Ошибка при создании счёта. Попробуйте позже.');
            }
        });
    });

    bot.command('status', (ctx) => {
        UserModel.get(ctx.from.id, (err, user) => {
            if (err || !user || !user.subscription_end) {
                ctx.reply('📭 У вас нет активной подписки.');
            } else {
                const endDate = new Date(user.subscription_end).toLocaleDateString('ru-RU');
                const userType = user.is_member ? '🟢 СВОЙ' : '🔴 ЧУЖОЙ';
                ctx.reply(
                    `📅 Ваша подписка активна до **${endDate}**\n`
                );
            }
        });
    });
};