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
                `Оплатите подписку (${config.SUBSCRIPTION_PRICE}$) по ссылке:\n${invoice.result.pay_url}\n\n` +
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
            await ctx.reply('Ошибка при создании тестового счёта.');
        }
    });

    // ... остальные команды без изменений
};