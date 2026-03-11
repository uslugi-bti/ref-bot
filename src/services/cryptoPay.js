const axios = require('axios');
const config = require('../config');

const api = axios.create({
    baseURL: config.CRYPTOPAY_API_URL,
    headers: {
        'Crypto-Pay-API-Token': config.CRYPTOPAY_TOKEN,
        'Content-Type': 'application/json'
    }
});

const CryptoPay = {
    createInvoice: async (amount, description) => {
        try {
            const response = await api.post('createInvoice', {
                asset: 'USDT',
                amount: amount,
                description: description,
                paid_btn_name: 'openBot'
            });
            return response.data.result;
        } catch (error) {
            console.error('Ошибка создания счёта:', error.response?.data || error.message);
            throw error;
        }
    },

    getInvoiceStatus: async (invoiceId) => {
        try {
            const response = await api.post('getInvoices', {
                invoice_ids: [invoiceId]
            });
            const invoice = response.data.result.items[0];
            return invoice ? invoice.status : null;
        } catch (error) {
            console.error('Ошибка проверки статуса:', error.response?.data || error.message);
            throw error;
        }
    },

    getActiveInvoices: async () => {
        try {
            const response = await api.post('getInvoices', {
                status: 'active'
            });
            return response.data.result.items;
        } catch (error) {
            console.error('Ошибка получения активных счетов:', error.response?.data || error.message);
            return [];
        }
    },

    getBalance: async () => {
        try {
            const response = await api.post('getBalance');
            return response.data.result;
        } catch (error) {
            console.error('Ошибка получения баланса:', error.response?.data || error.message);
            throw error;
        }
    }
};

module.exports = CryptoPay;