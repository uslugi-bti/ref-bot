const UserModel = require('../database/models/userModel');
const CryptoPay = require('../services/cryptoPay');
const config = require('../config');
const { addDays } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');

module.exports = (bot) => {
    // Обработка всех callback_query
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const userId = ctx.from.id;

        // ==================== ОБЫЧНЫЕ ПОЛЬЗОВАТЕЛИ ====================
        
        if (data === 'buy') {
            ctx.answerCbQuery();
            ctx.reply('Используйте команду /buy');
        }
        else if (data === 'status') {
            ctx.answerCbQuery();
            ctx.reply('Используйте команду /status');
        }
        else if (data.startsWith('check_payment_')) {
            const invoiceId = data.replace('check_payment_', '');

            const status = await CryptoPay.getInvoiceStatus(invoiceId);

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
        }
        else if (data === 'cancel') {
            await ctx.reply('❌ Действие отменено.');
            ctx.answerCbQuery();
        }

        // ==================== АДМИНСКИЕ ФУНКЦИИ (только для ADMIN_ID) ====================
        
        else if (data === 'admin_panel') {
            if (userId !== config.ADMIN_ID) {
                return ctx.answerCbQuery('⛔ Недостаточно прав');
            }
            
            await ctx.reply(
                '🔧 **Админ-панель**\n\nВыберите действие:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💰 Изменить цену', callback_data: 'admin_change_price' }],
                            [{ text: '📅 Изменить срок', callback_data: 'admin_change_days' }],
                            [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                            [{ text: '💳 Баланс CryptoBot', callback_data: 'admin_balance' }],
                            [{ text: '◀️ Назад', callback_data: 'admin_back_to_start' }]
                        ]
                    }
                }
            );
            ctx.answerCbQuery();
        }

        else if (data === 'admin_stats') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            // Получаем статистику из БД
            const db = require('../database/db');
            db.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN subscription_end > date('now') THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN subscription_end <= date('now') AND subscription_end IS NOT NULL THEN 1 ELSE 0 END) as expired
                 FROM users`,
                (err, row) => {
                    if (err) {
                        ctx.reply('❌ Ошибка получения статистики');
                    } else {
                        ctx.reply(
                            `📊 **Статистика бота**\n\n` +
                            `👥 Всего пользователей: ${row.total}\n` +
                            `✅ Активных подписок: ${row.active || 0}\n` +
                            `⏳ Истекших подписок: ${row.expired || 0}\n` +
                            `💰 Текущая цена: ${config.SUBSCRIPTION_PRICE} USD\n` +
                            `📅 Текущий срок: ${config.SUBSCRIPTION_DAYS} дней`,
                            { parse_mode: 'Markdown' }
                        );
                    }
                }
            );
            ctx.answerCbQuery();
        }

        else if (data === 'admin_balance') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            try {
                // Запрос к CryptoBot API для получения баланса
                const response = await CryptoPay.getBalance();
                let balanceText = '💰 **Баланс CryptoBot**\n\n';
                
                if (response && response.length > 0) {
                    response.forEach(asset => {
                        balanceText += `• ${asset.available} ${asset.currency_code}\n`;
                    });
                } else {
                    balanceText += 'Нет данных или баланс пуст';
                }
                
                await ctx.reply(balanceText, { parse_mode: 'Markdown' });
            } catch (error) {
                await ctx.reply('❌ Не удалось получить баланс. Проверьте токен CryptoBot.');
                console.error('Balance error:', error);
            }
            ctx.answerCbQuery();
        }

        else if (data === 'admin_change_price') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            await ctx.reply('💰 Введите **новую цену** в USD (только число, например 10):', { parse_mode: 'Markdown' });
            ctx.session = { awaiting: 'price' };
            ctx.answerCbQuery();
        }

        else if (data === 'admin_change_days') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            await ctx.reply('📅 Введите **новый срок** подписки в днях (только число, например 30):', { parse_mode: 'Markdown' });
            ctx.session = { awaiting: 'days' };
            ctx.answerCbQuery();
        }

        else if (data === 'admin_back_to_start') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            // Возвращаем админское меню
            try {
                await ctx.editMessageText(
                    '👑 **Здравствуйте, администратор!**\n\nВы можете управлять настройками бота через админ-панель.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚙️ Админ-панель', callback_data: 'admin_panel' }],
                                [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                                [{ text: '💰 Проверить баланс', callback_data: 'admin_balance' }]
                            ]
                        }
                    }
                );
            } catch (e) {
                // Если не получилось отредактировать (сообщение старое) — шлём новое
                await ctx.reply(
                    '👑 **Здравствуйте, администратор!**',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚙️ Админ-панель', callback_data: 'admin_panel' }],
                                [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                                [{ text: '💰 Проверить баланс', callback_data: 'admin_balance' }]
                            ]
                        }
                    }
                );
            }
            ctx.answerCbQuery();
        }

        else if (data === 'admin_save_settings') {
            if (userId !== config.ADMIN_ID) return ctx.answerCbQuery('⛔ Недостаточно прав');
            
            // Сохраняем текущие настройки в файл
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = {
                price: config.SUBSCRIPTION_PRICE,
                days: config.SUBSCRIPTION_DAYS
            };
            
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            
            await ctx.reply('✅ Настройки сохранены в файл.');
            ctx.answerCbQuery();
        }
    });

    // ==================== ОБРАБОТКА ТЕКСТОВЫХ ВВОДОВ (ДЛЯ АДМИНА) ====================
    
    bot.on('text', async (ctx) => {
        // Проверяем, что это админ и есть ожидание ввода
        if (ctx.from.id !== config.ADMIN_ID) return;
        if (!ctx.session?.awaiting) return;

        const value = parseFloat(ctx.message.text);
        if (isNaN(value) || value <= 0) {
            return ctx.reply('❌ Введите положительное число');
        }

        // Сохраняем настройки
        if (ctx.session.awaiting === 'price') {
            config.SUBSCRIPTION_PRICE = value;
            await ctx.reply(`✅ Цена изменена на **${value} USD**`, { parse_mode: 'Markdown' });
        } 
        else if (ctx.session.awaiting === 'days') {
            config.SUBSCRIPTION_DAYS = value;
            await ctx.reply(`✅ Срок изменён на **${value} дней**`, { parse_mode: 'Markdown' });
        }

        // Автоматически сохраняем в файл
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = {
            price: config.SUBSCRIPTION_PRICE,
            days: config.SUBSCRIPTION_DAYS
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Очищаем состояние
        ctx.session = null;

        // Предлагаем вернуться в админку
        await ctx.reply(
            '🔄 Вернуться в админ-панель?',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⚙️ Админ-панель', callback_data: 'admin_panel' }]
                    ]
                }
            }
        );
    });
};