const { Telegraf, session } = require('telegraf');
const config = require('./config');

const bot = new Telegraf(config.BOT_TOKEN);

bot.use(session());

require('./handlers/start')(bot);
require('./handlers/subscription')(bot);
require('./handlers/admin')(bot);
require('./handlers/callback')(bot);
require('./handlers/adminPanel')(bot);

module.exports = bot;