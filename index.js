const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Наша компания';
const COMPANY_URL = process.env.COMPANY_URL || 'https://example.com';
const LOG_FILE = process.env.LOG_FILE || 'requests.log';

if (!TOKEN || !CHAT_ID) {
  console.error("❌ ОШИБКА: Задайте TELEGRAM_BOT_TOKEN и CHAT_ID в .env файле!");
  console.error("Создайте .env файл на основе .env.example");
  process.exit(1);
}

const MESSAGES = {
  welcome: (firstName) => `Привет, ${firstName}! Это бот для заявок в ${COMPANY_NAME}.\n\nУкажите модель устройства или название оборудования:`,
  askProblem: 'Опишите проблему или что нужно сделать:',
  askPhotos: 'Отправьте фотографии (если есть):',
  askPhone: 'Укажите номер телефона для связи:',
  askEmail: 'Укажите email для связи (необязательно):',
  askName: 'Как к вам обращаться?',
  success: '✅ Заявка отправлена! Мы свяжемся с вами в ближайшее время.',
  error: '❌ Произошла ошибка. Пожалуйста, попробуйте позже.',
  cancel: '❌ Заявка отменена. Начните заново командой /start.',
  help: `📋 Доступные команды:
/start - начать новую заявку
/cancel - отменить текущую заявку
/help - показать эту справку`
};

const bot = new TelegramBot(TOKEN, { polling: true });
const userStates = {};

function formatDate(date) {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function cleanupUserState(chatId) {
  if (userStates[chatId] && userStates[chatId].photoTimeout) {
    clearTimeout(userStates[chatId].photoTimeout);
  }
  delete userStates[chatId];
}

function logRequest(data) {
  const logEntry = `[${formatDate(data.timestamp)}] Заявка #${data.userId}
👤 Пользователь: ${data.name || 'Не указано'} (@${data.username})
📞 Телефон: ${data.phone}
📧 Email: ${data.email || 'Не указан'}
🔧 Устройство: ${data.model}
⚠️ Проблема: ${data.problem}
🖼️ Фотографий: ${data.photos.length}
-------------------\n`;
  
  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) console.error('Ошибка записи лога:', err);
  });
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Пользователь';
  
  cleanupUserState(chatId);
  
  userStates[chatId] = {
    step: 1,
    data: {
      photos: [],
      receivedPhotos: new Set(),
      userId: msg.from.id,
      username: msg.from.username || 'без_username',
      name: '',
      email: ''
    }
  };
  
  bot.sendMessage(chatId, MESSAGES.welcome(firstName), { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, MESSAGES.help);
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  cleanupUserState(chatId);
  bot.sendMessage(chatId, MESSAGES.cancel);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && msg.text.startsWith('/')) return;
  
  const state = userStates[chatId];
  if (!state) return;
  
  try {
    const text = msg.text ? msg.text.trim() : '';
    
    switch (state.step) {
      case 1:
        state.data.model = text;
        state.step = 2;
        bot.sendMessage(chatId, MESSAGES.askProblem);
        break;
        
      case 2:
        state.data.problem = text;
        state.step = 3;
        bot.sendMessage(chatId, MESSAGES.askPhotos, {
          reply_markup: {
            inline_keyboard: [[
              { text: '📷 Отправить фото', callback_data: 'send_photos' },
              { text: '⏭️ Пропустить', callback_data: 'skip_photos' }
            ]]
          }
        });
        break;
        
      case 3:
        break;
        
      case 4:
        state.data.name = text;
        state.step = 5;
        bot.sendMessage(chatId, MESSAGES.askPhone);
        break;
        
      case 5:
        state.data.phone = text;
        state.step = 6;
        bot.sendMessage(chatId, MESSAGES.askEmail);
        break;
        
      case 6:
        state.data.email = text || 'Не указан';
        state.data.timestamp = new Date();
        
        sendApplication(chatId, state.data);
        cleanupUserState(chatId);
        break;
    }
    
  } catch (error) {
    console.error('Ошибка:', error);
    bot.sendMessage(chatId, MESSAGES.error);
    cleanupUserState(chatId);
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const state = userStates[chatId];
  if (!state) return;
  
  if (query.data === 'skip_photos') {
    state.step = 4;
    bot.sendMessage(chatId, MESSAGES.askName);
    bot.answerCallbackQuery(query.id);
    
    try {
      bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {}
    
  } else if (query.data === 'send_photos') {
    bot.sendMessage(chatId, "Отправьте фотографии. После отправки всех фото нажмите 'Продолжить'", {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Продолжить', callback_data: 'photos_done' }
        ]]
      }
    });
    bot.answerCallbackQuery(query.id);
    
  } else if (query.data === 'photos_done') {
    state.step = 4;
    bot.sendMessage(chatId, MESSAGES.askName);
    bot.answerCallbackQuery(query.id);
    
    try {
      bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {}
  }
});

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  
  if (state && state.step === 3) {
    const bestPhoto = msg.photo[msg.photo.length - 1];
    
    if (!state.data.receivedPhotos.has(bestPhoto.file_id)) {
      state.data.photos.push(bestPhoto.file_id);
      state.data.receivedPhotos.add(bestPhoto.file_id);
      
      bot.sendMessage(chatId, `✅ Фото добавлено (всего: ${state.data.photos.length})`);
    }
  }
});

function sendApplication(chatId, data) {
  try {
    const requestText = `📋 Новая заявка (${formatDate(data.timestamp)})
👤 Клиент: ${data.name} (@${data.username})
📞 Телефон: ${data.phone}
📧 Email: ${data.email}
🔧 Устройство: ${data.model}
⚠️ Проблема: ${data.problem}
🖼️ Фото: ${data.photos.length} шт.
👁️ ID пользователя: ${data.userId}`;
    
    if (data.photos.length > 0) {
      const mediaGroup = data.photos.map((photoId, index) => ({
        type: 'photo',
        media: photoId,
        caption: index === 0 ? requestText : undefined
      }));
      
      bot.sendMediaGroup(CHAT_ID, mediaGroup)
        .catch(err => {
          console.error('Ошибка отправки фото:', err);
          bot.sendMessage(CHAT_ID, `${requestText}\n\n⚠️ Фото не удалось загрузить`);
        });
    } else {
      bot.sendMessage(CHAT_ID, requestText);
    }
    
    bot.sendMessage(chatId, MESSAGES.success);
    
    logRequest(data);
    
  } catch (error) {
    console.error('Ошибка отправки:', error);
    bot.sendMessage(chatId, MESSAGES.error);
  }
}

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Бот запущен...');
console.log(`📊 Компания: ${COMPANY_NAME}`);
console.log(`🌐 Сайт: ${COMPANY_URL}`);
