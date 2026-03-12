const config = require('../config');
const UserModel = require('../database/models/userModel');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const csv = require('csv-parser');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function formatDate(dateString) {
    if (!dateString) return 'Нет';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

// ==================== ГЛАВНОЕ МЕНЮ АДМИНА ====================

async function showAdminMainMenu(ctx, edit = false) {
    const text = '👑 **Главное меню администратора**\n\nВыберите раздел:';
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Список пользователей', callback_data: 'admin_list_users' }],
                [{ text: '📤 Экспорт в CSV', callback_data: 'admin_export_csv' }],
                [{ text: '📥 Импорт из CSV', callback_data: 'admin_import_csv' }],
                [{ text: '➕ Добавить пользователя', callback_data: 'admin_add_user' }],
                [{ text: '🗑 Удалить пользователей', callback_data: 'admin_delete_users' }],
                [{ text: '⚙️ Настройки', callback_data: 'admin_settings' }],
                [{ text: '📊 Статистика', callback_data: 'admin_stats' }]
            ]
        }
    };

    if (edit) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
        } catch (e) {
            await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
        }
    } else {
        await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    }
}

// ==================== 1. СПИСОК ПОЛЬЗОВАТЕЛЕЙ ====================

async function showUserList(ctx, page = 0) {
    const pageSize = 10;
    
    UserModel.getAllPaginated(page, pageSize, (err, result) => {
        if (err) {
            return ctx.reply('❌ Ошибка получения списка пользователей');
        }

        const { users, total } = result;
        
        if (users.length === 0) {
            return ctx.reply('📭 Список пользователей пуст');
        }

        let message = `📋 Список пользователей (страница ${page + 1}/${Math.ceil(total / pageSize)})\n\n`;
        
        users.forEach((user, index) => {
            message += `${page * pageSize + index + 1}. `;
            message += `${user.first_name || 'Нет имени'} `;
            if (user.username) message += `@${user.username} `;
            message += `\n   🆔: ${user.user_id}`;
            message += `\n   📅 Подписка до: ${formatDate(user.subscription_end)}`;
            message += `\n   💳 Статус: ${user.payment_status || 'none'}`;
            message += `\n\n`;
        });

        const keyboard = {
            inline_keyboard: []
        };

        const navButtons = [];
        if (page > 0) {
            navButtons.push({ text: '◀️ Назад', callback_data: `admin_list_users_page_${page - 1}` });
        }
        if ((page + 1) * pageSize < total) {
            navButtons.push({ text: 'Вперед ▶️', callback_data: `admin_list_users_page_${page + 1}` });
        }
        if (navButtons.length > 0) {
            keyboard.inline_keyboard.push(navButtons);
        }

        keyboard.inline_keyboard.push([
            { text: '🔄 Обновить', callback_data: `admin_list_users_page_${page}` },
            { text: '🔙 Назад', callback_data: 'admin_back_to_main' }
        ]);

        ctx.reply(message, { reply_markup: keyboard });
    });
}

// ==================== 2. ЭКСПОРТ В CSV ====================

async function exportToCSV(ctx) {
    UserModel.getAll((err, users) => {
        if (err) {
            return ctx.reply('❌ Ошибка получения данных');
        }

        try {
            const fields = ['user_id', 'username', 'first_name', 'subscription_end', 'payment_status', 'created_at'];
            const json2csvParser = new Parser({ fields });
            const csvData = json2csvParser.parse(users);

            const filePath = path.join(__dirname, '../../exports', `users_${Date.now()}.csv`);
            const dir = path.dirname(filePath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, '\uFEFF' + csvData);

            ctx.replyWithDocument({ source: filePath, filename: 'users.csv' })
                .then(() => {
                    fs.unlinkSync(filePath);
                })
                .catch((e) => {
                    console.error('Ошибка отправки файла:', e);
                    ctx.reply('❌ Ошибка при отправке файла');
                });

        } catch (e) {
            console.error('Ошибка создания CSV:', e);
            ctx.reply('❌ Ошибка при создании CSV');
        }
    });
}

// ==================== 3. ИМПОРТ ИЗ CSV ====================

async function startImport(ctx) {
    ctx.reply(
        '📥 **Импорт пользователей**\n\n' +
        'Отправьте CSV-файл со следующими колонками:\n' +
        '`user_id,username,first_name,subscription_end,payment_status`\n\n' +
        '⚠️ **ВНИМАНИЕ**: Это полностью заменит текущую базу данных!',
        { parse_mode: 'Markdown' }
    );
    ctx.session = { awaiting: 'import_csv' };
}

async function processImport(ctx) {
    const file = ctx.message.document;
    
    if (!file.file_name.endsWith('.csv')) {
        return ctx.reply('❌ Пожалуйста, отправьте файл с расширением .csv');
    }

    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const filePath = path.join(__dirname, '../../imports', `import_${Date.now()}.csv`);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const writer = fs.createWriteStream(filePath);
    const response = await fetch(fileLink.href);
    response.body.pipe(writer);

    writer.on('finish', () => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    const validUsers = results.filter(u => u.user_id && !isNaN(parseInt(u.user_id)));
                    
                    if (validUsers.length === 0) {
                        return ctx.reply('❌ Не найдено валидных пользователей в CSV');
                    }

                    UserModel.replaceAll(validUsers, (err) => {
                        if (err) {
                            console.error('Ошибка импорта:', err);
                            ctx.reply('❌ Ошибка при импорте данных');
                        } else {
                            ctx.reply(`✅ Импорт завершен! Загружено ${validUsers.length} пользователей.`);
                        }
                        
                        fs.unlinkSync(filePath);
                    });

                } catch (e) {
                    console.error('Ошибка обработки CSV:', e);
                    ctx.reply('❌ Ошибка при обработке CSV');
                    fs.unlinkSync(filePath);
                }
            });
    });

    writer.on('error', () => {
        ctx.reply('❌ Ошибка при скачивании файла');
    });
}

// ==================== 4. УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ====================

async function startDeleteUsers(ctx) {
    ctx.reply(
        '🗑 **Удаление пользователей**\n\n' +
        'Введите ID пользователей через запятую (или по одному в каждой строке):\n' +
        'Пример: `123456789, 987654321`\n\n' +
        'Или отправьте `/cancel` для отмены',
        { parse_mode: 'Markdown' }
    );
    ctx.session = { awaiting: 'delete_users' };
}

async function processDeleteUsers(ctx, text, bot) {
    const ids = text
        .split(/[,\s]+/)
        .map(id => id.trim())
        .filter(id => id && !isNaN(parseInt(id)))
        .map(id => parseInt(id));

    if (ids.length === 0) {
        return ctx.reply('❌ Не найдено корректных ID');
    }

    UserModel.deleteMany(ids, (err, deletedCount) => {
        if (err) {
            ctx.reply('❌ Ошибка при удалении');
        } else {
            ctx.reply(`✅ Удалено пользователей: ${deletedCount}`);
            
            if (config.GROUP_CHAT_ID) {
                ids.forEach(userId => {
                    bot.telegram.banChatMember(config.GROUP_CHAT_ID, userId)
                        .then(() => {
                            bot.telegram.unbanChatMember(config.GROUP_CHAT_ID, userId).catch(() => {});
                        })
                        .catch(() => {});
                });
            }
        }
        ctx.session = null;
    });
}

// ==================== 5. ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ====================

async function startAddUser(ctx) {
    ctx.reply(
        '➕ **Добавление нового пользователя**\n\n' +
        'Введите данные в формате:\n' +
        '`ID, Имя, Username, Дата окончания (ГГГГ-ММ-ДД)`\n\n' +
        'Пример: `123456789, Иван Петров, ivan123, 2025-12-31`\n\n' +
        'Username и дату можно пропустить (поставьте `-`):\n' +
        '`123456789, Иван Петров, -, -`',
        { parse_mode: 'Markdown' }
    );
    ctx.session = { awaiting: 'add_user' };
}

async function processAddUser(ctx, text, bot) {
    const parts = text.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
        return ctx.reply('❌ Неверный формат. Используйте: ID, Имя, Username, Дата');
    }

    const userId = parseInt(parts[0]);
    if (isNaN(userId)) {
        return ctx.reply('❌ ID должен быть числом');
    }

    const userData = {
        user_id: userId,
        first_name: parts[1] || 'Unknown',
        username: parts[2] && parts[2] !== '-' ? parts[2] : null,
        subscription_end: parts[3] && parts[3] !== '-' ? parts[3] : null,
        payment_status: 'manual'
    };

    UserModel.upsert(userData, (err) => {
        if (err) {
            ctx.reply('❌ Ошибка при добавлении пользователя');
        } else {
            ctx.reply(`✅ Пользователь ${userId} (${userData.first_name}) добавлен`);
            
            if (userData.subscription_end) {
                bot.telegram.sendMessage(
                    userId,
                    `Вам открыт доступ до ${formatDate(userData.subscription_end)}.`
                ).catch(() => {});
            }
        }
        ctx.session = null;
    });
}

// ==================== СОХРАНЕНИЕ НАСТРОЕК ====================

function saveSettings() {
    const settingsPath = path.join(__dirname, '../settings.json');
    const settings = {
        price: config.SUBSCRIPTION_PRICE,
        days: config.SUBSCRIPTION_DAYS
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================

module.exports = (bot) => {
    // Обработчики callback_query
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const userId = ctx.from.id;

        // Проверка на админа
        if (data.startsWith('admin_') && userId !== config.ADMIN_ID) {
            return ctx.answerCbQuery('⛔ Недостаточно прав');
        }

        // Главное меню
        if (data === 'admin_back_to_main') {
            await showAdminMainMenu(ctx, true);
        }
        // Список пользователей
        else if (data === 'admin_list_users') {
            await showUserList(ctx, 0);
        }
        else if (data.startsWith('admin_list_users_page_')) {
            const page = parseInt(data.split('_').pop());
            await showUserList(ctx, page);
        }
        // Экспорт CSV
        else if (data === 'admin_export_csv') {
            await exportToCSV(ctx);
        }
        // Импорт CSV
        else if (data === 'admin_import_csv') {
            await startImport(ctx);
        }
        // Удаление пользователей
        else if (data === 'admin_delete_users') {
            await startDeleteUsers(ctx);
        }
        // Добавление пользователя
        else if (data === 'admin_add_user') {
            await startAddUser(ctx);
        }
        // Статистика
        else if (data === 'admin_stats') {
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
        }
        // Настройки
        else if (data === 'admin_settings') {
            ctx.reply(
                '⚙️ **Настройки**\n\n' +
                `💰 Цена: ${config.SUBSCRIPTION_PRICE} USD\n` +
                `📅 Срок: ${config.SUBSCRIPTION_DAYS} дней\n\n` +
                'Используйте кнопки ниже:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💰 Изменить цену', callback_data: 'admin_change_price' }],
                            [{ text: '📅 Изменить срок', callback_data: 'admin_change_days' }],
                            [{ text: '🔙 Назад', callback_data: 'admin_back_to_main' }]
                        ]
                    }
                }
            );
        }
        // Изменение цены
        else if (data === 'admin_change_price') {
            ctx.reply('💰 Введите **новую цену** в USD (только число, например 10):', { parse_mode: 'Markdown' });
            ctx.session = { awaiting: 'change_price' };
        }
        // Изменение срока
        else if (data === 'admin_change_days') {
            ctx.reply('📅 Введите **новый срок** подписки в днях (только число, например 30):', { parse_mode: 'Markdown' });
            ctx.session = { awaiting: 'change_days' };
        }

        ctx.answerCbQuery();
    });

    // Обработчики текста
    bot.on('text', async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return;
        if (!ctx.session?.awaiting) return;

        const text = ctx.message.text;

        if (text === '/cancel') {
            ctx.session = null;
            return ctx.reply('❌ Действие отменено');
        }

        if (ctx.session.awaiting === 'delete_users') {
            await processDeleteUsers(ctx, text, bot);
        }
        else if (ctx.session.awaiting === 'add_user') {
            await processAddUser(ctx, text, bot);
        }
        else if (ctx.session.awaiting === 'change_price') {
            const price = parseFloat(text);
            if (isNaN(price) || price <= 0) {
                return ctx.reply('❌ Введите положительное число');
            }
            config.SUBSCRIPTION_PRICE = price;
            saveSettings();
            ctx.reply(`✅ Цена изменена на ${price} USD`);
            ctx.session = null;
        }
        else if (ctx.session.awaiting === 'change_days') {
            const days = parseInt(text);
            if (isNaN(days) || days <= 0) {
                return ctx.reply('❌ Введите положительное целое число');
            }
            config.SUBSCRIPTION_DAYS = days;
            saveSettings();
            ctx.reply(`✅ Срок изменён на ${days} дней`);
            ctx.session = null;
        }
    });

    // Обработчик документов
    bot.on('document', async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return;
        if (ctx.session?.awaiting === 'import_csv') {
            await processImport(ctx);
        }
    });

    console.log('✅ Admin panel loaded with full features');
};

// Экспортируем функцию для использования в start.js
module.exports.showAdminMainMenu = showAdminMainMenu;