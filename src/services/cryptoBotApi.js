const axios = require('axios');
const crypto = require('crypto');

class CryptoBotAPI {
  constructor() {
    this.token = process.env.CRYPTOPAY_TOKEN;
    this.apiUrl = process.env.CRYPTOPAY_API_URL || 'https://pay.crypt.bot/api';
  }

  // Создание счета на оплату
  async createInvoice(amount, currency = 'USD', description = 'Subscription payment') {
    try {
      const response = await axios.post(
        `${this.apiUrl}/createInvoice`,
        {
          asset: 'USDT',
          amount: amount.toString(),
          description: description,
          paid_btn_name: 'callback',
          paid_btn_url: 'https://t.me/your_bot',
        },
        {
          headers: {
            'Crypto-Pay-API-Token': this.token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.ok) {
        return {
          success: true,
          invoice_id: response.data.result.invoice_id,
          pay_url: response.data.result.pay_url,
          status: response.data.result.status,
        };
      } else {
        throw new Error('Failed to create invoice');
      }
    } catch (error) {
      console.error('Crypto Bot API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  // Проверка статуса инвойса
  async getInvoiceStatus(invoiceId) {
    try {
      const response = await axios.get(`${this.apiUrl}/getInvoices`, {
        headers: {
          'Crypto-Pay-API-Token': this.token,
        },
        params: {
          invoice_ids: invoiceId,
        },
      });

      if (response.data && response.data.ok && response.data.result.items.length > 0) {
        const invoice = response.data.result.items[0];
        return {
          success: true,
          status: invoice.status,
          amount: invoice.amount,
          asset: invoice.asset,
          paid_at: invoice.paid_at,
        };
      }
      return {
        success: false,
        status: 'not_found',
      };
    } catch (error) {
      console.error('Get invoice status error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Валидация вебхука (проверка подписи)
  verifyWebhookSignature(body, signature, token) {
    const secret = crypto.createHash('sha256').update(token).digest('hex');
    const checkString = JSON.stringify(body);
    const hash = crypto
      .createHmac('sha256', secret)
      .update(checkString)
      .digest('hex');
    
    return hash === signature;
  }
}

module.exports = new CryptoBotAPI();