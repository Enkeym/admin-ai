import { bot } from './bot.js'
import { myGroup } from './config.js'
import {
  checkChatAccess,
  clearCache,
  watchNewMessages,
  watchNewMessagesAi
} from './mediaHandler.js'
import { getState, loadState, saveState } from './stateManager.js'
import { client } from './telegramClient.js'

let currentProcess = null

// Функция для безопасного подключения к Telegram с повторными попытками
async function safeConnect(client, retries = 5, delay = 5000) {
  let attempt = 0
  while (attempt < retries) {
    try {
      if (!client.connected) {
        await client.connect()
        console.log('Telegram клиент подключен.')
      }
      return
    } catch (error) {
      attempt++
      if (error.code === -500 && attempt < retries) {
        console.log(
          `Попытка ${attempt} не удалась. Повторное подключение через ${
            delay / 1000
          } секунд...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
  throw new Error('Не удалось подключиться к Telegram после нескольких попыток')
}

async function restoreProcesses(state) {
  if (state.watch.length > 0) {
    console.log('Восстановление процесса наблюдения за каналами:', state.watch)
    currentProcess = await watchNewMessages(state.watch)
  }

  if (state.watchAi.length > 0) {
    console.log(
      'Восстановление процесса наблюдения за AI каналами:',
      state.watchAi
    )
    currentProcess = await watchNewMessagesAi(state.watchAi)
  }
}

;(async function run() {
  try {
    await safeConnect(client)
    clearCache()
    await checkChatAccess(myGroup)
    loadState()
    const state = getState()
    await restoreProcesses(state)

    await bot.launch()
    console.log('Бот запущен.')

    setInterval(async () => {
      if (!client.connected) {
        console.log('Переподключение к Telegram...')
        await safeConnect(client)
      }
    }, 60000)

    const gracefulShutdown = async (signal) => {
      console.log(
        `Получен сигнал ${signal}. Сохраняем состояние и завершаем работу...`
      )
      try {
        await saveState(getState())
        await bot.stop(signal)
        await client.disconnect()
        process.exit(0)
      } catch (error) {
        console.error('Ошибка при завершении работы:', error)
        process.exit(1)
      }
    }

    process.once('SIGINT', () => gracefulShutdown('SIGINT'))
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
  } catch (error) {
    console.error('Ошибка при инициализации бота:', error)
    process.exit(1)
  }
})()

// Глобальные обработчики ошибок
process.on('uncaughtException', (err) => {
  console.error('Произошла непойманная ошибка', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение в:', promise, 'причина:', reason)
})
