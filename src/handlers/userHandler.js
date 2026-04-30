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

// Функция для расчета полной цены (продление + штраф)
async function calculateTotalPrice(user) {
  const prices = await SettingModel.getAllPrices();
  const price1m = parseFloat(prices.member_price_1m);
  
  if (!user.subscription_end) {
    return { total: price1m, penalty: 0, daysOverdue: 0, penaltyType: null };
  }
  
  const endDate = moment(user.subscription_end);
  const now = moment();
  
  // Если подписка еще активна
  if (endDate.isAfter(now, 'day')) {
    return { total: price1m, penalty: 0, daysOverdue: 0, penaltyType: null };
  }
  
  // Подписка истекла - считаем дни просрочки
  const daysOverdue = now.diff(endDate, 'days');
  
  // Просрочка от 1 до 5 дней
  if (daysOverdue >= 1 && daysOverdue <= 5) {
    const penalty = parseFloat(prices.penalty_price_1);
    return { total: price1m + penalty, penalty: penalty, daysOverdue: daysOverdue, penaltyType: 'light' };
  }
  
  // Просрочка больше 5 дней
  if (daysOverdue > 5) {
    const penalty = parseFloat(prices.penalty_price_2);
    return { total: price1m + penalty, penalty: penalty, daysOverdue: daysOverdue, penaltyType: 'heavy' };
  }
  
  return { total: price1m, penalty: 0, daysOverdue: 0, penaltyType: null };
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
  const isKicked = user.status === 'kicked';
  const isExpired = user.subscription_end && moment(user.subscription_end).isBefore(moment(), 'day');
  
  // Рассчитываем полную цену
  const priceInfo = await calculateTotalPrice(user);

  const entryPrice = parseFloat(prices.entry_price);
  const price1m = parseFloat(prices.member_price_1m);
  const price3m = parseFloat(prices.member_price_3m);
  const subscriptionDays = parseInt(prices.subscription_days);

  let message = '';
  let keyboardButtons = [];

  if (!user.entry_paid) {
    message = `🔒 Доступ к закрытому каналу\n\nВы еще не оплатили единоразовый вход.\nСтоимость входа: ${entryPrice} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`;
    keyboardButtons = [
      [{ text: `💰 Я оплатил (${entryPrice} USDT)`, callback_data: `submit_payment_entry` }]
    ];
  } 
  else if (isKicked || isExpired) {
    const endDate = user.subscription_end ? moment(user.subscription_end).format('DD.MM.YYYY') : 'неизвестно';
    
    if (priceInfo.penaltyType === null && priceInfo.daysOverdue === 0) {
      // Подписка еще активна (сегодня последний день)
      message = `✅ Ваша подписка активна до ${endDate}\n\n💰 Продление на ${subscriptionDays} дней: ${price1m} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}`;
      keyboardButtons = [
        [{ text: `🔄 Продлить (${price1m} USDT)`, callback_data: `submit_payment_renew_1m` }]
      ];
    }
    else if (priceInfo.penaltyType === 'light') {
      // Просрочка до 5 дней
      message = `⚠️ ВАС ИСКЛЮЧИЛИ ИЗ КАНАЛА!\n\nПодписка истекла ${endDate} (просрочка ${priceInfo.daysOverdue} дней)\n\nУ вас есть льготный период (до ${moment(user.subscription_end).add(5, 'days').format('DD.MM.YYYY')}) для восстановления:\n\n💰 Продление: ${price1m} USDT\n⚠️ Штраф: +${priceInfo.penalty} USDT\n💵 ИТОГО: ${priceInfo.total} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`;
      keyboardButtons = [
        [{ text: `⚠️ Восстановить (${priceInfo.total} USDT)`, callback_data: `submit_payment_penalty_light` }]
      ];
    }
    else if (priceInfo.penaltyType === 'heavy') {
      // Просрочка более 5 дней
      message = `❌ ВАС ИСКЛЮЧИЛИ ИЗ КАНАЛА!\n\nПодписка истекла ${endDate} (просрочка ${priceInfo.daysOverdue} дней)\n\n❗️ Льготный период ПРОШЁЛ!\n\n💰 Продление: ${price1m} USDT\n⚠️ Штраф: +${priceInfo.penalty} USDT\n💵 ИТОГО: ${priceInfo.total} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nПосле оплаты нажмите кнопку "Я оплатил"`;
      keyboardButtons = [
        [{ text: `⚠️ Восстановить (${priceInfo.total} USDT)`, callback_data: `submit_payment_penalty_heavy` }]
      ];
    }
  }
  else if (isActive && user.subscription_end) {
    const endDate = moment(user.subscription_end).format('DD.MM.YYYY');
    const daysLeft = moment(user.subscription_end).diff(moment(), 'days');
    
    message = `✅ ВАШ СТАТУС: АКТИВЕН\n\n👤 Вы в статусе "СВОЙ" (навсегда)\n📅 Подписка до: ${endDate} (осталось ${daysLeft} дней)\n\n💰 ЦЕНЫ ПРОДЛЕНИЯ:\n• На ${subscriptionDays} дней: ${price1m} USDT\n• На ${subscriptionDays * 3} дней: ${price3m} USDT\n\n💳 Реквизиты для оплаты:\n${prices.payment_details}\n\nВыберите период:`;
    
    keyboardButtons = [
      [{ text: `🔄 1 месяц — ${price1m} USDT`, callback_data: `submit_payment_renew_1m` }],
      [{ text: `🔄 3 месяца — ${price3m} USDT`, callback_data: `submit_payment_renew_3m` }]
    ];
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: keyboardButtons
    }
  };

  await telegramService.sendKeyboard(userId, message, keyboard.reply_markup);
}

// Обработка нажатия "Я оплатил"
async function handlePaymentSubmit(userId, paymentType) {
  const canRequest = await UserModel.canRequestPaymentConfirmation(userId, 10);
  if (!canRequest) {
    await telegramService.sendMessage(
      userId,
      `⏳ Вы уже отправляли заявку на оплату недавно\n\nПодождите 10 минут.`
    );
    return;
  }
  
  const prices = await SettingModel.getAllPrices();
  const subscriptionDays = parseInt(prices.subscription_days);
  const user = await UserModel.getById(userId);
  
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
    
    case 'penalty_light':
      const penalty1 = parseFloat(prices.penalty_price_1);
      const price1m = parseFloat(prices.member_price_1m);
      amount = price1m + penalty1;
      type = 'renew_with_penalty_light';
      typeDisplay = `восстановление со штрафом (льготный период)`;
      break;
    
    case 'penalty_heavy':
      const penalty2 = parseFloat(prices.penalty_price_2);
      const price1m2 = parseFloat(prices.member_price_1m);
      amount = price1m2 + penalty2;
      type = 'renew_with_penalty_heavy';
      typeDisplay = `восстановление со штрафом (просрочка >5 дней)`;
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
    `✅ ЗАЯВКА ОТПРАВЛЕНА!\n\nТип: ${typeDisplay}\nСумма: ${amount} USDT\n\n⏳ Администратор проверит оплату.\nПосле подтверждения получите ссылку.\n\n⚠️ Не отправляйте повторно!`
  );
  
  await notifyAdminAboutPayment(userId, type, amount);
}

module.exports = { 
  initUserHandler, 
  showUserMenu, 
  handlePaymentSubmit
};