Бот для приема заявок от клиентов через Telegram.

1. Установка

git clone https://github.com/cesiumloser/telegram-repair-bot.git
cd telegram-bot
npm install

2. Настройка .env файла
Создайте файл .env и заполните его:

 === ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ ===

TELEGRAM_BOT_TOKEN= Токен вашего бота (@BotFather)

CHAT_ID= ID чата куда отправлять заявки (@userinfobot)

=== ОПЦИОНАЛЬНЫЕ НАСТРОЙКИ ===

Название вашей компании (отображается в приветствии)
COMPANY_NAME=Моя компания

Сайт компании (для ссылки)
COMPANY_URL=https://мойсайт.ru

Файл для логов (по умолчанию)
LOG_FILE=requests.log
