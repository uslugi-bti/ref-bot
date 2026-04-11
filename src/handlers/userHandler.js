const UserModel = require('../database/models/User');
const SettingModel = require('../database/models/Setting');
const { createPaymentRequest, notifyAdminAboutPayment } = require('./paymentHandler');
const TelegramService = require('../services/telegramService');
const moment = require('moment');

let botInstance = null;
let telegramService = null;

function initUserHandler(bot) {
  botInstance = bot;
  telegramService = new TelegramService(bot);
}

async function showUserMenu(userId) {
  const user = await UserModel.getById(userId);
  const prices = await SettingModel.getAllPrices();
  
  if (!user) {
    const entryPrice = parseFloat(prices.entry_price);
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `🚪 Вход в клуб — ${entryPrice} USDT`, callback_data: 'pay_entry' }]
        ]
      }
    };
    
    await telegramService.sendKeyboard(
      userId,
      `🔒 Доступ к закрытому каналу\n\nВы не являетесь участником нашего клуба.\nДля получения доступа необходимо оплатить единоразовый взнос: ${entryPrice} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`,
      keyboard.reply_markup
    );
    return;
  }

  const isActive = user.status === 'active' && user.is_member === 1;
  const isExpired = user.subscription_end && moment(user.subscription_end).isBefore(moment());
  const isKicked = user.status === 'kicked';
  const isPenalty = user.status === 'penalty';

  const entryPrice = parseFloat(prices.entry_price);
  const price1m = parseFloat(prices.member_price_1m);
  const price3m = parseFloat(prices.member_price_3m);
  const penaltyPrice = parseFloat(prices.penalty_price);
  const subscriptionDays = parseInt(prices.subscription_days);

  let message = '';
  let keyboardButtons = [];

  if (!user.entry_paid) {
    message = `🔒 Доступ к закрытому каналу\n\nВы еще не оплатили единоразовый вход.\nСтоимость входа: ${entryPrice} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`;
    keyboardButtons = [
      [{ text: `💰 Я оплатил (${entryPrice} USDT)`, callback_data: `submit_payment_entry` }]
    ];
  } 
  else if (isKicked || isPenalty || isExpired) {
    const totalPrice = price1m + penaltyPrice;
    message = `⚠️ Ваша подписка истекла / вы были исключены\n\nУ вас есть возможность вернуться, но со штрафом:\n\n💰 Продление на ${subscriptionDays} дней: ${price1m} USDT\n⚡️ Штраф: ${penaltyPrice} USDT\n💵 ИТОГО: ${totalPrice} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`;
    keyboardButtons = [
      [{ text: `⚠️ Я оплатил со штрафом (${totalPrice} USDT)`, callback_data: `submit_payment_penalty` }]
    ];
  }
  else if (isActive && user.subscription_end) {
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    const daysLeft = moment(user.subscription_end).diff(moment(), 'days');
    
    message = `✅ Ваш статус: АКТИВЕН\n\n👤 Вы в статусе "СВОЙ" (навсегда)\n📅 Подписка до: ${endDate} (осталось ${daysLeft} дней)\n\n💰 Цены продления:\n• На ${subscriptionDays} дней: ${price1m} USDT\n• На ${subscriptionDays * 3} дней: ${price3m} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nВыберите период продления и нажмите "Я оплатил" после перевода:`;
    
    keyboardButtons = [
      [{ text: `🔄 Я оплатил (1 месяц — ${price1m} USDT)`, callback_data: `submit_payment_renew_1m` }],
      [{ text: `🔄 Я оплатил (3 месяца — ${price3m} USDT)`, callback_data: `submit_payment_renew_3m` }]
    ];
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: keyboardButtons
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

async function handlePaymentSubmit(userId, paymentType) {
  const canRequest = await UserModel.canRequestPaymentConfirmation(userId, 10);
  if (!canRequest) {
    await telegramService.sendMessage(
      userId,
      `⏳ Вы уже отправляли заявку на оплату недавно\n\nПожалуйста, подождите 10 минут перед повторной отправкой.\nЕсли вы уже оплатили, администратор скоро проверит вашу оплату.`
    );
    return;
  }
  
  const prices = await SettingModel.getAllPrices();
  const subscriptionDays = parseInt(prices.subscription_days);
  
  let amount = 0;
  let type = '';
  let typeDisplay = '';

  switch (paymentType) {
    case 'entry':
      amount = parseFloat(prices.entry_price);
      type = 'entry';
      typeDisplay = 'вход в клуб';
      break;
    
    case 'renew_1m':
      amount = parseFloat(prices.member_price_1m);
      type = 'renew_1m';
      typeDisplay = `продление на ${subscriptionDays} дней`;
      break;
    
    case 'renew_3m':
      amount = parseFloat(prices.member_price_3m);
      type = 'renew_3m';
      typeDisplay = `продление на ${subscriptionDays * 3} дней`;
      break;
    
    case 'penalty':
      amount = parseFloat(prices.member_price_1m) + parseFloat(prices.penalty_price);
      type = 'renew_with_penalty';
      typeDisplay = `восстановление со штрафом (${subscriptionDays} дней)`;
      break;
    
    default:
      await telegramService.sendMessage(userId, '❌ Неизвестный тип оплаты');
      return;
  }
  
  await UserModel.updateLastPaymentRequest(userId);
  
  const request = await createPaymentRequest(userId, type, amount);
  
  if (!request.success) {
    await telegramService.sendMessage(userId, `❌ ${request.error}`);
    return;
  }
  
  await telegramService.sendMessage(
    userId,
    `✅ Заявка на оплату отправлена!\n\nТип: ${typeDisplay}\nСумма: ${amount} USDT\n\n⏳ Администратор проверит оплату в ближайшее время.\nПосле подтверждения вы получите уведомление и доступ к каналу.\n\n⚠️ Не отправляйте повторную заявку, чтобы не сбить очередь.`
  );
  
  await notifyAdminAboutPayment(userId, type, amount);
}

module.exports = { 
  initUserHandler, 
  showUserMenu, 
  handlePaymentSubmit
};