import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { bot } from './bot.js'
import { myGroup } from './config.js'
import {
  checkChatAccess,
  clearCache,
  deleteFile,
  watchNewMessages,
  watchNewMessagesAi
} from './mediaHandler.js'
import { getState, loadState, saveState } from './stateManager.js'
import { client } from './telegramClient.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let currentProcess = null

// Функция для безопасного подключения к Telegram с повторными попытками
async function safeConnect(client, retries = 10, delay = 10000) {
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
      console.log(`Попытка ${attempt} не удалась: ${error.message}`)
      if (attempt < retries) {
        console.log(`Повторное подключение через ${delay / 1000} секунд...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        throw new Error(
          'Не удалось подключиться к Telegram после нескольких попыток'
        )
      }
    }
  }
}

async function restoreProcesses(state) {
  if (state.watchAi.length > 0) {
    console.log(
      'Восстановление процесса наблюдения за AI каналами:',
      state.watchAi
    )
    currentProcess = await watchNewMessagesAi(state.watchAi)
  } else if (state.watch.length > 0) {
    console.log('Восстановление процесса наблюдения за каналами:', state.watch)
    currentProcess = await watchNewMessages(state.watch)
  }
}

// Функция для удаления видео файлов после ошибок
function cleanUpFiles(directory) {
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error('Ошибка при чтении директории:', err)
      return
    }

    files.forEach((file) => {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(directory, file)
        deleteFile(filePath)
        console.log(`Удален файл .mp4: ${filePath}`)
      }
    })
  })
}

;(async function run() {
  try {
    const mediaDirectory = path.resolve(__dirname)
    cleanUpFiles(mediaDirectory)
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
