import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { myGroup } from './config.js'
import { checkChatAccess } from './mediaHandler.js'

// Функция для безопасного подключения с повторными попытками
async function safeConnect(client, retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!client.connected) {
        await client.connect()
        console.log('Telegram client connected.')
        return
      }
    } catch (error) {
      if (error.code === -500 && attempt < retries) {
        console.log(
          `Attempt ${attempt} failed. Retrying in ${delay / 1000} seconds...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
  throw new Error('Unable to connect to Telegram after multiple attempts')
}

;(async function run() {
  try {
    await safeConnect(client)

    // Проверка доступа к основному чату при инициализации
    await checkChatAccess(myGroup)

    await bot.launch()
    console.log('Bot launched.')

    // Периодическая проверка соединения и переподключение
    setInterval(async () => {
      if (!client.connected) {
        console.log('Reconnecting to Telegram...')
        await safeConnect(client)
      }
    }, 60000) // Каждую минуту проверяем соединение

    const gracefulShutdown = async (signal) => {
      try {
        console.log(`Received ${signal}. Shutting down gracefully...`)
        bot.stop(signal)
        await client.disconnect()
        process.exit(0)
      } catch (error) {
        console.error(`Error during shutdown:`, error)
        process.exit(1)
      }
    }

    process.once('SIGINT', () => gracefulShutdown('SIGINT'))
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
  } catch (error) {
    console.error('Error during bot initialization:', error)
    process.exit(1)
  }
})()

// Глобальные обработчики ошибок
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
