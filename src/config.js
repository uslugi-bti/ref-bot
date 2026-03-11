require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CRYPTOPAY_TOKEN: process.env.CRYPTOPAY_TOKEN,
    CRYPTOPAY_API_URL: process.env.CRYPTOPAY_API_URL,
    ADMIN_ID: parseInt(process.env.ADMIN_ID),
    DB_PATH: process.env.DB_PATH || './database.sqlite',
    CHECK_CRON: process.env.CHECK_CRON || '0 10 * * *',
    SUBSCRIPTION_PRICE: parseFloat(process.env.SUBSCRIPTION_PRICE) || 5,
    SUBSCRIPTION_DAYS: parseInt(process.env.SUBSCRIPTION_DAYS) || 30,
    GROUP_CHAT_ID: process.env.GROUP_CHAT_ID
};