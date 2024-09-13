import fs from 'fs'
import path from 'path'
import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { fileURLToPath } from 'url'
import { NewMessage } from 'telegram/events/NewMessage.js'
import { myGroup } from './config.js'
import { checkForAds, requestForAi } from './ai/giga.js'
import { additionalPatterns, aiErrorMessages } from './utils/aiErrorMessages.js'
import { getMediaFileExtension } from './utils/mediaUtils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const chatAccessCache = new Map()
const foundChannelsCache = new Set()

// Функция для ожидания (задержки)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Функция для повторных попыток с экспоненциальной задержкой
async function retryWithBackoff(fn, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.code === -500 && i < retries - 1) {
        console.log(`Ошибка -500, попытка повтора через ${delay} мс...`)
        await sleep(delay)
        delay *= 2 // Экспоненциальная задержка
      } else {
        throw error
      }
    }
  }
}

// Функция для проверки доступа к чату
export async function checkChatAccess(chatId) {
  if (chatAccessCache.has(chatId)) {
    return chatAccessCache.get(chatId)
  }
  try {
    const chat = await retryWithBackoff(() => client.getEntity(chatId))

    if (!foundChannelsCache.has(chatId)) {
      console.log(`Бот имеет доступ к чату: ${chat.title || chat.username}`)
      foundChannelsCache.add(chatId)
    }

    chatAccessCache.set(chatId, true)
    return true
  } catch (error) {
    console.error(
      `Ошибка: Чат с ID ${chatId} не найден или бот не имеет доступа.`,
      error
    )
    chatAccessCache.set(chatId, false)
    return false
  }
}

// Функция для отправки сообщений
async function sendMessageToChat(chatId, message, ctx) {
  if (!(await checkChatAccess(chatId))) {
    const errorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Сообщение не отправлено.`
    console.error(errorMessage)
    if (ctx) ctx.reply(errorMessage)
    return
  }

  try {
    console.log(`Попытка отправки сообщения в чат ${chatId}`)
    await retryWithBackoff(() => bot.telegram.sendMessage(chatId, message))
    console.log('Сообщение успешно отправлено в чат.')
  } catch (error) {
    console.error('Ошибка при отправке сообщения:', error.message)
    if (ctx) ctx.reply('Ошибка при отправке сообщения.')
  }
}

// Функция для скачивания и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  if (!message.message || !message.message.trim()) {
    const noTextMessage =
      'Сообщение не содержит текста, медиа не будет отправлено.'
    console.log(noTextMessage)
    // Убираем отправку этого сообщения в чат
    return
  }

  if (!(await checkChatAccess(chatId))) {
    const accessErrorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    console.error(accessErrorMessage)
    if (ctx) ctx.reply(accessErrorMessage)
    return
  }

  // Получаем расширение файла на основе MIME-типа медиа
  const fileExtension = getMediaFileExtension(message.media)

  // Создаем путь для файла с правильным расширением
  const filePath = path.resolve(__dirname, `${message.id}.${fileExtension}`)
  console.log(`Скачивание медиа: ${filePath}`)

  // Скачиваем файл с повтором в случае ошибки
  await retryWithBackoff(() =>
    client.downloadMedia(message.media, { outputFile: filePath })
  )

  // Определение типа медиа
  let mediaType = 'document'
  if (message.media.photo) mediaType = 'photo'
  else if (message.media.video) mediaType = 'video'
  else if (message.media.audio) mediaType = 'audio'
  else if (message.media.document) {
    mediaType =
      message.media.document.mimeType === 'video/mp4' ? 'animation' : 'document'
  }

  console.log(`Тип медиа из сообщения: ${mediaType}`)

  // Отправляем медиа по типу
  await sendMediaByType(chatId, message, filePath, mediaType, ctx)

  // Удаляем временный файл после отправки
  fs.unlink(filePath, (err) => {
    if (err) console.error(`Не удалось удалить файл: ${filePath}`, err)
    else console.log(`Файл удален: ${filePath}`)
  })
}

// Функция для отправки медиа по типу
async function sendMediaByType(chatId, message, mediaPath, mediaType, ctx) {
  if (!(await checkChatAccess(chatId))) {
    const accessErrorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    console.error(accessErrorMessage)
    if (ctx) ctx.reply(accessErrorMessage)
    return
  }

  // Проверка существования файла
  if (!fs.existsSync(mediaPath)) {
    console.error(`Файл не найден: ${mediaPath}`)
    if (ctx) ctx.reply(`Файл не найден: ${mediaPath}`)
    return
  }

  try {
    console.log(`Попытка отправки медиа в чат ${chatId}`)
    switch (mediaType) {
      case 'photo':
        await retryWithBackoff(() =>
          bot.telegram.sendPhoto(
            chatId,
            { source: mediaPath },
            { caption: message.message }
          )
        )
        break
      case 'video':
        await retryWithBackoff(() =>
          bot.telegram.sendVideo(
            chatId,
            { source: mediaPath },
            { caption: message.message }
          )
        )
        break
      case 'document':
        await retryWithBackoff(() =>
          bot.telegram.sendDocument(
            chatId,
            { source: mediaPath },
            { caption: message.message }
          )
        )
        break
      case 'animation':
        await retryWithBackoff(() =>
          bot.telegram.sendAnimation(
            chatId,
            { source: mediaPath },
            { caption: message.message }
          )
        )
        break
      default:
        await retryWithBackoff(() =>
          bot.telegram.sendDocument(
            chatId,
            { source: mediaPath },
            { caption: message.message }
          )
        )
    }
    console.log('Медиа успешно отправлено.')
  } catch (error) {
    if (
      error.response &&
      (error.response.error_code === 413 || error.response.error_code === 400)
    ) {
      console.log(
        `Пропуск сообщения с ошибкой ${error.response.error_code}: ${error.message}`
      )
    } else {
      console.error('Ошибка при отправке медиа:', error.message)
      if (ctx) ctx.reply('Ошибка при отправке медиа.')
    }
  }
}
