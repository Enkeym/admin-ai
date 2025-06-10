# Telegram Bot

## Functionality

## 📌 TL;DR
Телеграм-бот, который позволяет копировать, модифицировать и отслеживать сообщения в каналах с возможностью подключения AI для изменения текста. Поддерживает несколько режимов, state-менеджмент, защиту от RIA-новостей и dockerized-деплой.

---

## 🎯 Зачем
Этот бот помогает администраторам каналов:
- Автоматизировать репостинг с задержкой и фильтрацией
- Подключать AI-модификацию текстов (например, перефразировать новости)
- Работать через авторизацию Telegram API как клиент

This bot provides several commands and capabilities:

1. **/sum "channelD" "quantity" "time"** - Copies messages in reverse order from the specified channel. Arguments:

   - `channelD`: Channel identifier.
   - `quantity`: Number of messages.
   - `time`: Time of message sending.

2. **/watch "channelD"** - Adds channels for monitoring. A maximum of three channels can be added. Format:

   - `/watch "channelD" "channelD" "channelD"`

3. **/watchAi "channelD"** - Adds channels for monitoring with message text modification. The format is similar to the `/watch` command.

## Variables

To get `API_ID` and `API_HASH`, refer to the instructions below!

- **TG_TOKEN** - Issued by BotFather.
- **TG_SESSIONS** - Telegram session obtained during authorization using the command `node auth.js`.
- **MY_GROUP** - Send a message from your group to the bot [getmyid_bot](https://t.me/getmyid_bot) to get your group ID.
- **CLIENT_SECRET** - Issued when connecting to the GigaChat API.
- **GIGA_AUTH** - Issued when connecting to the GigaChat API.

## Useful Links

- Creating a Telegram bot: [BotFather](https://t.me/BotFather)
- Bot to determine the channel ID: [getmyid_bot](https://t.me/getmyid_bot)

## Instructions for Obtaining API_ID and API_HASH

1. Log in to your Telegram account: [my.telegram.org](https://my.telegram.org/auth)
2. Click on "API Development Tools" and fill in the details of your application (only the application name and short name are required).
3. Finally, click "Create Application".

Happy bot development!
