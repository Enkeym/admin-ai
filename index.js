import { bot } from './bot.js'
import { client } from './telegramClient.js'
;(async function run() {
  try {
    if (!client.connected) {
      await client.connect()
      console.log('Telegram client connected.')
    }

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
