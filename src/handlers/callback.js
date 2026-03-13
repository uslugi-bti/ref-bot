const UserModel = require('../database/models/userModel');
// Временно используем мок для тестов
let CryptoPay;
try {
    // Пробуем загрузить мок (он есть только локально)
    CryptoPay = require('../services/mockCryptoPay');
    console.log('🧪 Тестовый режим: используется MOCK CryptoPay');
} catch (e) {
    // Если мока нет - используем реальный
    CryptoPay = require('../services/cryptoPay');
}
const config = require('../config');
const { addDays } = require('../utils/helpers');

module.exports = (bot) => {
    bot.on('callback_query', async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        const userId = ctx.from.id;

        // Пропускаем все admin_* колбэки — они обрабатываются в adminPanel.js
        if (data.startsWith('admin_')) {
            return next(); // передаём обработку дальше
        }

        // ==================== ОБРАБОТКА ПРИНУДИТЕЛЬНОЙ ОПЛАТЫ (ТЕСТОВЫЙ РЕЖИМ) ====================
        if (data.startsWith('force_pay_')) {
            const invoiceId = data.replace('force_pay_', '');
            await ctx.reply('💰 Эмуляция принудительной оплаты...');
            
            // Имитируем успешную оплату
            const endDate = addDays(new Date(), config.SUBSCRIPTION_DAYS).toISOString().split('T')[0];

            UserModel.setSubscription(userId, endDate, async (err) => {
                if (err) {
                    await ctx.reply('❌ Ошибка активации подписки.');
                } else {
                    UserModel.clearInvoice(invoiceId, () => {});
                    await ctx.reply(`✅ [ТЕСТ] Оплата эмулирована! Подписка активирована до ${endDate}.`);

                    try {
                        const inviteLink = await bot.telegram.createChatInviteLink(config.GROUP_CHAT_ID, {
                            member_limit: 1,
                            expire_date: Math.floor(new Date(endDate).getTime() / 1000)
                        });
                        await ctx.reply(`🔗 Ссылка для входа в группу: ${inviteLink.invite_link}`);
                    } catch (e) {
                        console.error('Ошибка создания ссылки:', e);
                        await ctx.reply('⚠️ Ошибка при создании ссылки. Но подписка активирована.');
                    }
                }
            });
            
            ctx.answerCbQuery();
            return;
        }

        // ==================== ОБЫЧНАЯ ПРОВЕРКА ОПЛАТЫ ====================
        if (data.startsWith('check_payment_')) {
            const invoiceId = data.replace('check_payment_', '');
            
            // Показываем что проверяем
            await ctx.reply('⏱ Проверка статуса оплаты...');
            
            const status = await CryptoPay.getInvoiceStatus(invoiceId);
            console.log(`Статус счёта ${invoiceId}: ${status}`);

            if (status === 'paid') {
                const endDate = addDays(new Date(), config.SUBSCRIPTION_DAYS).toISOString().split('T')[0];

                UserModel.setSubscription(userId, endDate, async (err) => {
                    if (err) {
                        await ctx.reply('❌ Ошибка активации подписки. Свяжитесь с поддержкой.');
                    } else {
                        UserModel.clearInvoice(invoiceId, () => {});

                        await ctx.reply(`✅ Оплата прошла успешно! Подписка активирована до ${endDate}.`);

                        try {
                            const inviteLink = await bot.telegram.createChatInviteLink(config.GROUP_CHAT_ID, {
                                member_limit: 1,
                                expire_date: Math.floor(new Date(endDate).getTime() / 1000)
                            });
                            await ctx.reply(`🔗 Ссылка для входа в группу: ${inviteLink.invite_link}`);
                        } catch (e) {
                            console.error('Не удалось создать ссылку:', e);
                            await ctx.reply('⚠️ Ошибка при создании ссылки. Но подписка активирована. Обратитесь к администратору.');
                        }
                    }
                });
            } else if (status === 'expired') {
                await ctx.reply('⏳ Счёт просрочен. Создайте новый с помощью /buy.');
            } else {
                await ctx.reply('⏱ Оплата ещё не поступила. Попробуйте позже или нажмите кнопку ещё раз.');
            }

            ctx.answerCbQuery();
            return;
        }

        // ==================== ОСТАЛЬНЫЕ КОМАНДЫ ====================
        if (data === 'buy') {
            ctx.answerCbQuery();
            ctx.reply('Используйте команду /buy');
        }
        else if (data === 'status') {
            ctx.answerCbQuery();
            ctx.reply('Используйте команду /status');
        }
        else if (data === 'cancel') {
            await ctx.reply('❌ Действие отменено.');
            ctx.answerCbQuery();
        } else {
            // Если колбэк не наш — передаём дальше
            return next();
        }
    });
};