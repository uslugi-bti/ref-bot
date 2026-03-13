// Эмуляция CryptoPay для локального тестирования

const mockInvoices = {};

const MockCryptoPay = {
    createInvoice: async (amount, description) => {
        const invoiceId = 'mock_' + Date.now() + '_' + Math.random().toString(36).substring(7);
        
        mockInvoices[invoiceId] = {
            invoice_id: invoiceId,
            status: 'active',
            amount: amount,
            created_at: new Date().toISOString()
        };
        
        console.log('🧪 [MOCK] Создан тестовый счёт:', invoiceId);
        
        return {
            result: {
                invoice_id: invoiceId,
                pay_url: 'https://t.me/mockpay?start=' + invoiceId,
                status: 'active'
            }
        };
    },

    getInvoiceStatus: async (invoiceId) => {
        if (invoiceId.startsWith('mock_')) {
            const invoice = mockInvoices[invoiceId];
            if (!invoice) return null;
            
            // Автоматически "оплачиваем" через 10 секунд
            const age = Date.now() - new Date(invoice.created_at).getTime();
            if (age > 10000) {
                invoice.status = 'paid';
                console.log('🧪 [MOCK] Счёт оплачен:', invoiceId);
            }
            
            return invoice.status;
        }
        return null;
    },

    getBalance: async () => {
        return [{ currency_code: 'USDT', available: '9999.99' }];
    }
};

module.exports = MockCryptoPay;