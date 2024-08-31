import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { myGroup } from './config.js'
import { checkChatAccess } from './mediaHandler.js'
;(async function run() {
  try {
    if (!client.connected) {
      await client.connect()
      console.log('Telegram client connected.')
    }

    // Проверка доступа к основному чату при инициализации
    await checkChatAccess(myGroup)

    await bot.launch()
    console.log('Bot launched.')

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
