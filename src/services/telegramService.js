const { getDb } = require('../database/db');

class TelegramService {
  constructor(bot) {
    this.bot = bot;
    this.groupChatId = process.env.GROUP_CHAT_ID;
  }

  // Создание пригласительной ссылки (одноразовой)
  async createInviteLink(userId) {
    try {
      // Создаем одноразовую ссылку с ограничением на 1 участника
      const inviteLink = await this.bot.telegram.createChatInviteLink(
        this.groupChatId,
        {
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 3600, // 1 час
        }
      );

      // Сохраняем ссылку в БД
      const db = getDb();
      await db.run(`
        INSERT OR REPLACE INTO invite_links (user_id, link)
        VALUES (?, ?)
      `, [userId, inviteLink.invite_link]);

      return inviteLink.invite_link;
    } catch (error) {
      console.error('Create invite link error:', error);
      return null;
    }
  }

  // Отправить пользователю пригласительную ссылку
  async sendInviteLink(userId, inviteLink) {
    try {
      await this.bot.telegram.sendMessage(
        userId,
        `🎉 *Доступ к каналу получен!*\n\n` +
        `Ваша персональная ссылка для входа (действительна 1 час, только для вас):\n` +
        `${inviteLink}\n\n` +
        `⚠️ Ссылка одноразовая! После использования станет недействительной.`,
        { parse_mode: 'Markdown' }
      );
      return true;
    } catch (error) {
      console.error(`Send invite link to ${userId} error:`, error);
      return false;
    }
  }

  // Кикнуть пользователя из канала
  async kickUser(userId) {
    try {
      await this.bot.telegram.banChatMember(this.groupChatId, userId);
      // Разбан, чтобы можно было пригласить снова
      await this.bot.telegram.unbanChatMember(this.groupChatId, userId);
      console.log(`✅ Kicked user ${userId} from channel`);
      return true;
    } catch (error) {
      console.error(`Kick user ${userId} error:`, error);
      return false;
    }
  }

  async sendMessage(userId, text, parseMode = 'HTML') {
    try {
        await this.bot.telegram.sendMessage(userId, text, { parse_mode: parseMode });
        return true;
    } catch (error) {
        console.error(`Send message to ${userId} error:`, error);
        return false;
    }
    }

  // Проверить, является ли пользователь участником канала
  async isMember(userId) {
    try {
      const chatMember = await this.bot.telegram.getChatMember(this.groupChatId, userId);
      return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
      console.error(`Check member ${userId} error:`, error);
      return false;
    }
  }

  // Отправить уведомление админу
  async notifyAdmin(message) {
    const adminId = process.env.ADMIN_ID;
    try {
      await this.bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Notify admin error:', error);
    }
  }

  // Отправить клавиатуру пользователю
  async sendKeyboard(userId, text, keyboard, parseMode = 'HTML') {
    try {
        await this.bot.telegram.sendMessage(userId, text, {
        parse_mode: parseMode,
        reply_markup: keyboard,
        });
    } catch (error) {
        console.error(`Send keyboard to ${userId} error:`, error);
    }
    }
}

module.exports = TelegramService;