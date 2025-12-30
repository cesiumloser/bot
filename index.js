const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  console.error("ОШИБКА: Не заданы TOKEN или CHAT_ID в .env файле!");
  process.exit(1);
}

const MESSAGES = {
  welcome: (firstName) => `Привет, ${firstName}! Это бот для заявок на ремонт в компанию [Ваше название](https://ваш сайт/)\n\nУкажите модель техники (если есть возможность, укажите год выпуска):`,
  askProblem: 'Опишите проблему или симптомы поломки:',
  askPhotos: 'Отправьте фотографии блока/модуля (если есть):',
  askPhone: 'Укажите номер телефона для связи:',
  success: '✅ Заявка отправлена! Скоро мы с вами свяжемся.',
  error: '❌ Произошла ошибка. Пожалуйста, попробуйте позже или свяжитесь с нами напрямую.'
};

const bot = new TelegramBot(TOKEN, { polling: true });
const userStates = {};

function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Функция для очистки состояния пользователя
function cleanupUserState(chatId) {
  if (userStates[chatId] && userStates[chatId].photoTimeout) {
    clearTimeout(userStates[chatId].photoTimeout);
  }
  delete userStates[chatId];
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Пользователь';

  // Очищаем предыдущее состояние
  cleanupUserState(chatId);

  userStates[chatId] = { 
    step: 1, 
    data: { 
      photos: [],
      receivedPhotos: new Set(),
      userId: msg.from.id,
      username: msg.from.username || 'Без username'
    } 
  };

  bot.sendMessage(
    chatId,
    MESSAGES.welcome(firstName),
    { parse_mode: 'Markdown' }
  );
});

// Обработчик команды /cancel
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  cleanupUserState(chatId);
  bot.sendMessage(chatId, '❌ Заявка отменена. Используйте /start чтобы начать заново.');
});

// Основной обработчик сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  
  // Пропускаем служебные команды
  if (msg.text && msg.text.startsWith('/')) return;
  
  const state = userStates[chatId];
  if (!state) return;

  try {
    switch (state.step) {
      case 1: // Шаг 1: Модель техники
        state.data.model = msg.text.trim();
        state.step = 2;
        bot.sendMessage(chatId, MESSAGES.askProblem);
        break;

      case 2: // Шаг 2: Описание проблемы
        state.data.problem = msg.text.trim();
        state.step = 3;
        bot.sendMessage(chatId, MESSAGES.askPhotos, {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Пропустить фото', callback_data: 'skip_photos' }
            ]]
          }
        });
        break;

      case 3: // Шаг 3: Фотографии
        if (msg.photo) {
          const bestPhoto = msg.photo[msg.photo.length - 1];
          
          if (!state.data.receivedPhotos.has(bestPhoto.file_id)) {
            state.data.photos.push(bestPhoto.file_id);
            state.data.receivedPhotos.add(bestPhoto.file_id);
            
            // Сбрасываем таймер
            clearTimeout(state.photoTimeout);
            state.photoTimeout = setTimeout(() => {
              if (state.step === 3) {
                proceedToPhoneStep(chatId, state);
              }
            }, 5000); // 5 секунд ожидания
          }
        }
        break;

      case 4: // Шаг 4: Телефон
        state.data.phone = msg.text.trim();
        state.data.timestamp = new Date();
        
        sendApplication(chatId, state.data);
        cleanupUserState(chatId);
        break;
    }
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    bot.sendMessage(chatId, MESSAGES.error);
    cleanupUserState(chatId);
  }
});

// Обработчик callback_query (кнопки)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const state = userStates[chatId];
  if (!state) return;

  if (query.data === 'skip_photos' && state.step === 3) {
    clearTimeout(state.photoTimeout);
    proceedToPhoneStep(chatId, state);
    bot.answerCallbackQuery(query.id);
    
    // Удаляем сообщение с кнопкой
    try {
      bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      console.log('Не удалось удалить сообщение:', e.message);
    }
  }
});

// Функция перехода к шагу с телефоном
function proceedToPhoneStep(chatId, state) {
  state.step = 4;
  bot.sendMessage(chatId, MESSAGES.askPhone);
}

// Функция отправки заявки
function sendApplication(chatId, data) {
  try {
    const currentTime = formatDate(data.timestamp);
    const requestText = `📋 Новая заявка (${currentTime})
👤 ID: ${data.userId} (@${data.username})
🔧 Модель: ${data.model}
⚠️ Проблема: ${data.problem}
📞 Контакт: ${data.phone}
🖼️ Фото: ${data.photos.length} шт.`;

    if (data.photos.length > 0) {
      const mediaGroup = data.photos.map((photoId, index) => ({
        type: 'photo',
        media: photoId,
        caption: index === 0 ? requestText : undefined
      }));
      
      bot.sendMediaGroup(CHAT_ID, mediaGroup)
        .then(() => {
          bot.sendMessage(chatId, MESSAGES.success);
        })
        .catch(err => {
          console.error('Ошибка отправки фото:', err);
          bot.sendMessage(chatId, MESSAGES.success + '\n(Фото не удалось отправить)');
        });
    } else {
      bot.sendMessage(CHAT_ID, requestText)
        .then(() => {
          bot.sendMessage(chatId, MESSAGES.success);
        })
        .catch(err => {
          console.error('Ошибка отправки текста:', err);
          bot.sendMessage(chatId, MESSAGES.error);
        });
    }

    // Логирование в файл
    const logEntry = `[${currentTime}] Заявка от ID:${data.userId}
Модель: ${data.model}
Проблема: ${data.problem}
Телефон: ${data.phone}
Фото: ${data.photos.length}
-------------------\n`;
    
    fs.appendFile('logs.txt', logEntry, (err) => {
      if (err) console.error('Ошибка записи лога:', err);
    });

  } catch (error) {
    console.error('Ошибка при отправке заявки:', error);
    bot.sendMessage(chatId, MESSAGES.error);
  }
}

// Обработчик ошибок
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Обработчик остановки приложения
process.on('SIGINT', () => {
  console.log('Бот остановлен');
  process.exit();
});

console.log('🤖 Бот запущен...');
