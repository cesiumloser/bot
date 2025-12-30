Бот для приема заявок от клиентов через Telegram.

1. Установка

git clone https://github.com/ваш-repo/telegram-bot.git
cd telegram-bot
npm install

2. Настройка .env файла
Создайте файл .env и заполните его:

env
# === ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ ===

# Токен вашего бота (получите у @BotFather)
TELEGRAM_BOT_TOKEN=

# ID чата куда отправлять заявки (узнайте у @userinfobot)
CHAT_ID=

# === ОПЦИОНАЛЬНЫЕ НАСТРОЙКИ ===

# Название вашей компании (отображается в приветствии)
COMPANY_NAME=Моя компания

# Сайт компании (для ссылки)
COMPANY_URL=https://мойсайт.ru

# Файл для логов (по умолчанию: requests.log)
LOG_FILE=requests.log
