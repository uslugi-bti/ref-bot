const cron = require('node-cron');
const UserModel = require('../database/models/userModel');
const config = require('../config');

class ReminderService {
    constructor(bot) {
        this.bot = bot;
        this.reminders = {};
    }

    // Запуск проверки напоминаний
    start() {
        // Проверяем каждый день в 9:00 утра
        cron.schedule('0 9 * * *', () => {
            this.checkReminders();
        });
        
        // Также проверяем при запуске
        setTimeout(() => this.checkReminders(), 5000);
        
        console.log('✅ Reminder service started');
    }

    // Проверка всех пользователей
    async checkReminders() {
        console.log('🔍 Checking subscription reminders...');
        
        UserModel.getAll((err, users) => {
            if (err) {
                console.error('Ошибка получения пользователей для напоминаний:', err);
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            users.forEach(user => {
                if (!user.subscription_end) return;

                const endDate = new Date(user.subscription_end);
                endDate.setHours(0, 0, 0, 0);
                
                // Разница в днях
                const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

                // Отправляем напоминания
                this.sendReminder(user, daysLeft);
            });
        });
    }

    // Отправка напоминания в зависимости от дней до окончания
    async sendReminder(user, daysLeft) {
        // Не отправляем если подписка уже истекла
        if (daysLeft < 0) return;

        // Ключ для отслеживания отправленных напоминаний
        const reminderKey = `${user.user_id}_${daysLeft}`;
        
        // Проверяем, не отправляли ли уже сегодня
        if (this.reminders[reminderKey] === this.getTodayDate()) {
            return;
        }

        // Определяем статус пользователя для сообщения
        const userType = user.is_member ? '🟢 свой' : '🔴 посторонний';
        
        let message = '';
        let needReminder = false;

        // За 5 дней до окончания
        if (daysLeft === 5) {
            message = `⚠️ **Напоминание**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `Ваша подписка закончится через **5 дней** (${new Date(user.subscription_end).toLocaleDateString('ru-RU')}).\n\n` +
                     `💰 Цена продления для вас: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Продлите подписку, чтобы не потерять доступ к каналу.`;
            needReminder = true;
        }
        // За 4 дня
        else if (daysLeft === 4) {
            message = `⚠️ **Напоминание**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `До окончания подписки осталось **4 дня**.\n\n` +
                     `💰 Цена продления: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Не забудьте продлить доступ.`;
            needReminder = true;
        }
        // За 3 дня
        else if (daysLeft === 3) {
            message = `⚠️ **Напоминание**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `Осталось **3 дня** подписки.\n\n` +
                     `💰 Цена продления: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Продлите сейчас, чтобы избежать перерыва в доступе.`;
            needReminder = true;
        }
        // За 2 дня
        else if (daysLeft === 2) {
            message = `⚠️ **Срочно!**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `До окончания подписки осталось **2 дня**.\n\n` +
                     `💰 Цена продления: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Если не продлить, через 2 дня вы будете удалены из канала.`;
            needReminder = true;
        }
        // За 1 день
        else if (daysLeft === 1) {
            message = `🚨 **Последний день!**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `Ваша подписка заканчивается **ЗАВТРА**.\n\n` +
                     `💰 Цена продления: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Продлите сегодня, чтобы остаться в канале.`;
            needReminder = true;
        }
        // В последний день (0 дней)
        else if (daysLeft === 0) {
            message = `⏰ **Сегодня последний день!**\n\n` +
                     `👤 Статус: ${userType}\n` +
                     `Ваша подписка истекает **сегодня**.\n\n` +
                     `💰 Цена продления: **${user.is_member ? config.MEMBER_PRICE : config.REGULAR_PRICE} USD**\n\n` +
                     `Если не продлите до полуночи, вы будете автоматически удалены из канала.`;
            needReminder = true;
        }

        if (needReminder) {
            try {
                await this.bot.telegram.sendMessage(user.user_id, message, { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💳 Продлить подписку', callback_data: 'buy' }],
                            [{ text: '📋 Проверить статус', callback_data: 'status' }]
                        ]
                    }
                });
                
                // Запоминаем, что сегодня уже отправляли
                this.reminders[`${user.user_id}_${daysLeft}`] = this.getTodayDate();
                
                console.log(`✅ Reminder sent to user ${user.user_id} (${daysLeft} days left, ${user.is_member ? 'member' : 'regular'})`);
            } catch (e) {
                console.error(`Ошибка отправки напоминания пользователю ${user.user_id}:`, e.message);
            }
        }
    }

    // Получить сегодняшнюю дату в формате YYYY-MM-DD
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    // Очистка старых записей
    cleanupReminders() {
        const today = this.getTodayDate();
        for (const key in this.reminders) {
            if (this.reminders[key] !== today) {
                delete this.reminders[key];
            }
        }
    }
}

module.exports = ReminderService;