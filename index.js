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

    bot.launch()
    console.log('Bot launched.')

    // Обработка сигналов для корректного завершения работы
    process.once('SIGINT', () => {
      console.log('Received SIGINT. Shutting down gracefully...')
      bot.stop('SIGINT')
      client.disconnect()
      process.exit(0)
    })

    process.once('SIGTERM', () => {
      console.log('Received SIGTERM. Shutting down gracefully...')
      bot.stop('SIGTERM')
      client.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error('Error during bot initialization:', error)
    process.exit(1)
  }
})()

// Глобальные обработчики ошибок
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err)
  // Дополнительно можно логировать ошибку или выполнить действия по очистке
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Вы можете логировать это или предпринять иные действия
})
