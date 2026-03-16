const UserModel = require('../database/models/userModel');
let CryptoPay;
try {
    CryptoPay = require('../services/mockCryptoPay');
    console.log('🧪 Тестовый режим: используется MOCK CryptoPay');
} catch (e) {
    CryptoPay = require('../services/cryptoPay');
}
const config = require('../config');
const { addDays } = require('../utils/helpers');

module.exports = (bot) => {
    bot.on('callback_query', async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        const userId = ctx.from.id;

        // Сразу отвечаем на callback, чтобы не было таймаута
        try {
            await ctx.answerCbQuery();
        } catch (e) {
            console.log('Ошибка answerCbQuery (можно игнорировать):', e.message);
        }

        // Пропускаем admin_* колбэки
        if (data.startsWith('admin_')) {
            return next();
        }

        // Принудительная оплата
        if (data.startsWith('force_pay_')) {
            const invoiceId = data.replace('force_pay_', '');
            await ctx.reply('💰 Эмуляция принудительной оплаты...');
            
            const endDate = addDays(new Date(), config.SUBSCRIPTION_DAYS).toISOString().split('T')[0];

            UserModel.setSubscription(userId, endDate, async (err) => {
                if (err) {
                    await ctx.reply('❌ Ошибка активации подписки.');
                } else {
                    UserModel.clearInvoice(invoiceId, () => {});
                    await ctx.reply(`✅ [ТЕСТ] Оплата эмулирована! Подписка до ${endDate}.`);

                    try {
                        const inviteLink = await bot.telegram.createChatInviteLink(config.GROUP_CHAT_ID, {
                            member_limit: 1,
                            expire_date: Math.floor(new Date(endDate).getTime() / 1000)
                        });
                        await ctx.reply(`🔗 Ссылка для входа: ${inviteLink.invite_link}`);
                    } catch (e) {
                        console.error('Ошибка ссылки:', e);
                        await ctx.reply('⚠️ Ошибка при создании ссылки.');
                    }
                }
            });
            return;
        }

        // Проверка оплаты
        if (data.startsWith('check_payment_')) {
            const invoiceId = data.replace('check_payment_', '');
            
            await ctx.reply('⏱ Проверка статуса оплаты...');
            
            const status = await CryptoPay.getInvoiceStatus(invoiceId);
            console.log(`Статус счёта ${invoiceId}: ${status}`);

            if (status === 'paid') {
                const endDate = addDays(new Date(), config.SUBSCRIPTION_DAYS).toISOString().split('T')[0];

                UserModel.setSubscription(userId, endDate, async (err) => {
                    if (err) {
                        await ctx.reply('❌ Ошибка активации подписки.');
                    } else {
                        UserModel.clearInvoice(invoiceId, () => {});
                        await ctx.reply(`✅ Оплата прошла! Подписка до ${endDate}.`);

                        try {
                            const inviteLink = await bot.telegram.createChatInviteLink(config.GROUP_CHAT_ID, {
                                member_limit: 1,
                                expire_date: Math.floor(new Date(endDate).getTime() / 1000)
                            });
                            await ctx.reply(`🔗 Ссылка для входа: ${inviteLink.invite_link}`);
                        } catch (e) {
                            console.error('Ошибка ссылки:', e);
                            await ctx.reply('⚠️ Ошибка при создании ссылки.');
                        }
                    }
                });
            } else if (status === 'expired') {
                await ctx.reply('⏳ Счёт просрочен. Создайте новый с помощью /buy.');
            } else {
                await ctx.reply('⏱ Оплата ещё не поступила. Попробуйте позже.');
            }
            return;
        }

        // Обычные команды
        if (data === 'buy') {
            await ctx.reply('Используйте команду /buy');
        } else if (data === 'status') {
            await ctx.reply('Используйте команду /status');
        } else if (data === 'cancel') {
            await ctx.reply('❌ Действие отменено.');
        } else {
            return next();
        }
    });
};