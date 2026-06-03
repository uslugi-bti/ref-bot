const { getDb } = require('../database/db');

class TelegramService {
  constructor(bot) {
    this.bot = bot;
    this.groupChatId = process.env.GROUP_CHAT_ID;
  }

  // Создание НОВОЙ пригласительной ссылки (каждый раз новая)
  async createInviteLink(userId) {
    try {
      // Создаем новую одноразовую ссылку
      const inviteLink = await this.bot.telegram.createChatInviteLink(
        this.groupChatId,
        {
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 3600, // 1 час
        }
      );

      // Удаляем старую ссылку, если была (делаем недействительной)
      const db = getDb();
      const oldLink = await db.get('SELECT link FROM invite_links WHERE user_id = ?', [userId]);
      if (oldLink && oldLink.link) {
        try {
          await this.bot.telegram.revokeChatInviteLink(this.groupChatId, oldLink.link);
        } catch (e) {
          console.log(`Could not revoke old link for ${userId}`);
        }
      }

      // Сохраняем новую ссылку
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

  async sendInviteLink(userId, inviteLink) {
    try {
      await this.bot.telegram.sendMessage(
        userId,
        `🎉 Доступ к каналу получен!\n\nВаша персональная ссылка для входа (действительна 1 час, только для вас):\n${inviteLink}\n\n⚠️ Ссылка одноразовая! После использования станет недействительной.`
      );
      return true;
    } catch (error) {
      console.error(`Send invite link to ${userId} error:`, error);
      return false;
    }
  }

  // Кик пользователя из канала с проверкой прав
  async kickUser(userId) {
    try {
      // Проверяем, является ли бот администратором
      const botId = this.bot.botInfo.id;
      const botMember = await this.bot.telegram.getChatMember(this.groupChatId, botId);
      
      if (!['administrator', 'creator'].includes(botMember.status)) {
        console.error(`Bot is not an administrator in channel ${this.groupChatId}`);
        return false;
      }
      
      // Проверяем, есть ли право ban_members
      if (botMember.status === 'administrator' && !botMember.can_restrict_members) {
        console.error(`Bot does not have ban_members permission in channel ${this.groupChatId}`);
        return false;
      }
      
      // Кикаем пользователя
      await this.bot.telegram.banChatMember(this.groupChatId, userId);
      await this.bot.telegram.unbanChatMember(this.groupChatId, userId);
      console.log(`✅ Kicked user ${userId} from channel`);
      return true;
    } catch (error) {
      console.error(`Kick user ${userId} error:`, error.description || error.message);
      return false;
    }
  }

  async sendMessage(userId, text) {
    try {
      await this.bot.telegram.sendMessage(userId, text);
      return true;
    } catch (error) {
      console.error(`Send message to ${userId} error:`, error.description || error.message);
      return false;
    }
  }

  // Проверка, является ли пользователь участником канала
  async isMember(userId) {
    try {
      const chatMember = await this.bot.telegram.getChatMember(this.groupChatId, userId);
      return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
      if (error.response?.error_code === 400) {
        // Пользователь не найден в чате (не участник)
        return false;
      }
      console.error(`Check member ${userId} error:`, error.description || error.message);
      return false;
    }
  }

  async notifyAdmin(message) {
    const adminId = process.env.ADMIN_ID;
    try {
      await this.bot.telegram.sendMessage(adminId, message);
    } catch (error) {
      console.error('Notify admin error:', error);
    }
  }

  async sendKeyboard(userId, text, keyboard) {
    try {
      await this.bot.telegram.sendMessage(userId, text, {
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error(`Send keyboard to ${userId} error:`, error.description || error.message);
    }
  }
}

module.exports = TelegramService;