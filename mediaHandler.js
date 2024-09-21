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

// Максимальный размер файла для Telegram (50 МБ)
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// --- Вспомогательные функции ---

// Функция для проверки доступа к чату
export async function checkChatAccess(chatId) {
  if (chatAccessCache.has(chatId)) {
    console.log(`Использование кэша для чата: ${chatId}`)
    return chatAccessCache.get(chatId)
  }

  try {
    const chat = await client.getEntity(chatId)

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

// Функция для проверки существования канала/группы
export async function validateChannelOrGroup(channelId, ctx) {
  try {
    const chat = await client.getEntity(channelId)

    if (!foundChannelsCache.has(channelId)) {
      console.log(`Канал/группа с ID ${channelId} успешно найден.`)
      foundChannelsCache.add(channelId)
    }

    return chat
  } catch (error) {
    const errorMessage = `Канал или группа с ID ${channelId} не найдены. Пожалуйста, проверьте правильность введённого ID.`
    console.error(errorMessage)

    if (ctx) ctx.reply(errorMessage)

    return null
  }
}

// Функция для проверки размера файла
function isFileSizeAcceptable(filePath) {
  const stats = fs.statSync(filePath)
  return stats.size <= MAX_FILE_SIZE
}

// --- Основные функции для обработки сообщений ---

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
    await bot.telegram.sendMessage(chatId, message)
    console.log('Сообщение успешно отправлено в чат.')
  } catch (error) {
    console.error('Ошибка при отправке сообщения:', error.message)
    if (ctx) ctx.reply('Ошибка при отправке сообщения.')
  }
}

// Функция для отправки медиа по типу
async function sendMediaByType(
  chatId,
  message,
  mediaPath,
  mediaType,
  params,
  ctx
) {
  if (!(await checkChatAccess(chatId))) {
    const accessErrorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    console.error(accessErrorMessage)
    if (ctx) ctx.reply(accessErrorMessage)
    return
  }

  if (!fs.existsSync(mediaPath)) {
    console.error(`Файл не найден: ${mediaPath}`)
    if (ctx) ctx.reply(`Файл не найден: ${mediaPath}`)
    return
  }

  try {
    console.log(`Попытка отправки медиа в чат ${chatId}`)

    // Используем стриминг видео, если это видеофайл
    if (mediaType === 'video') {
      const fileStream = fs.createReadStream(mediaPath)
      await bot.telegram.sendVideo(chatId, { source: fileStream }, params)
    } else {
      switch (mediaType) {
        case 'photo':
          await bot.telegram.sendPhoto(chatId, { source: mediaPath }, params)
          break
        case 'document':
          await bot.telegram.sendDocument(chatId, { source: mediaPath }, params)
          break
        case 'animation':
          await bot.telegram.sendAnimation(
            chatId,
            { source: mediaPath },
            params
          )
          break
        default:
          await bot.telegram.sendDocument(chatId, { source: mediaPath }, params)
      }
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

// Функция для скачивания и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  if (!message.message || !message.message.trim()) {
    console.log('Сообщение не содержит текста, медиа не будет отправлено.')
    return
  }

  if (!(await checkChatAccess(chatId))) {
    const accessErrorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    console.error(accessErrorMessage)
    if (ctx) ctx.reply(accessErrorMessage)
    return
  }

  const fileExtension = getMediaFileExtension(message.media)

  if (fileExtension === 'bin') {
    console.log('Неизвестный формат файла (bin), медиа пропущено.')
    return
  }

  const filePath = path.resolve(__dirname, `${message.id}.${fileExtension}`)
  console.log(`Скачивание медиа: ${filePath}`)

  try {
    // Использование асинхронного стрима для загрузки файла
    const fileStream = fs.createWriteStream(filePath)
    await client.downloadMedia(message.media, { outputStream: fileStream })

    if (message.media.video && fileExtension !== 'mp4') {
      console.log('Неподдерживаемый формат видео, отправка невозможна.')
      if (ctx)
        ctx.reply('Неподдерживаемый формат видео. Пожалуйста, используйте mp4.')
      return
    }

    // Проверка размера файла
    if (!isFileSizeAcceptable(filePath)) {
      console.log('Размер файла превышает допустимый лимит.')
      if (ctx) ctx.reply('Размер файла превышает допустимый лимит (50 МБ).')
      return
    }

    let mediaType = 'document'
    let params = { caption: message.message }

    // Определение типа медиа и извлечение параметров
    if (message.media.video) {
      mediaType = 'video'
      const {
        duration,
        w: width,
        h: height
      } = message.media.document.attributes.find(
        (attr) => attr.className === 'DocumentAttributeVideo'
      )

      // Добавление миниатюры для видео
      const thumbnail = message.media.document.thumbs?.find(
        (thumb) => thumb.className === 'PhotoSize'
      )
      if (thumbnail) {
        params.thumb = { source: thumbnail }
      }

      params = {
        caption: message.message,
        duration,
        width,
        height,
        supports_streaming: true
      }
    } else if (message.media.photo) {
      mediaType = 'photo'
    } else if (message.media.document) {
      mediaType = 'document'
    }

    console.log(`Тип медиа из сообщения: ${mediaType}`)
    await sendMediaByType(chatId, message, filePath, mediaType, params)
  } catch (error) {
    console.error('Ошибка при скачивании медиа:', error.message)
    if (ctx) ctx.reply('Ошибка при скачивании медиа.')
    return
  }

  // Удаляем временные файлы
  fs.unlink(filePath, (err) => {
    if (err) console.error(`Не удалось удалить файл: ${filePath}`, err)
    else console.log(`Файл удален: ${filePath}`)
  })
}

// --- Функции для работы с AI ---

// Функция для проверки наличия сообщения с ошибкой ИИ
function containsAiErrorMessage(response) {
  const normalizedResponse = response.trim().toLowerCase()

  const isAiErrorMessage = aiErrorMessages.some((errorMsg) => {
    const normalizedErrorMsg = errorMsg.toLowerCase()
    return normalizedResponse.includes(normalizedErrorMsg)
  })

  if (isAiErrorMessage) {
    console.log('Сообщение полностью совпадает с известной ошибкой ИИ.')
    return true
  }

  const containsAdditionalPatterns = additionalPatterns.some((pattern) => {
    const regex = new RegExp(pattern, 'i')
    return regex.test(normalizedResponse)
  })

  if (containsAdditionalPatterns) {
    console.log('Сообщение содержит чувствительные ключевые слова или шаблоны.')
  }

  return containsAdditionalPatterns
}

// Функция для обработки сообщения с ИИ
async function processMessageWithAi(message) {
  try {
    console.log('Запрос к ИИ для обработки сообщения.')

    if (containsAiErrorMessage(message.message)) {
      console.log(
        'Исходное сообщение содержит признаки ошибки или чувствительной информации. Пропускаем обработку ИИ.'
      )
      return message.message
    }

    const processedMessage = await requestForAi(message.message)

    if (containsAiErrorMessage(processedMessage)) {
      console.log(
        'Ответ ИИ содержит ошибку или чувствительный ответ. Возвращаем исходное сообщение.'
      )
      return message.message
    }

    console.log('Ответ ИИ получен и обработан.')
    return processedMessage
  } catch (error) {
    console.error('Ошибка при запросе к ИИ:', error.message)
    return message.message
  }
}

// --- Функции для мониторинга сообщений ---

// Функция для наблюдения за новыми сообщениями
export async function watchNewMessages(channelIds, ctx) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const chat = await validateChannelOrGroup(channelId, ctx)
    if (!chat) {
      continue
    }

    const handler = async (event) => {
      try {
        const message = event.message

        if (message.media) {
          await downloadAndSendMedia(myGroup, message, ctx)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await sendMessageToChat(myGroup, message.message, ctx)
        }
      } catch (error) {
        console.error('Ошибка при обработке нового сообщения:', error.message)
        if (ctx) ctx.reply('Ошибка при обработке нового сообщения.')
      }
    }

    client.addEventHandler(
      handler,
      new NewMessage({ chats: [parseInt(channelId) || channelId] })
    )
    currentHandlers.push({
      handler,
      event: new NewMessage({ chats: [parseInt(channelId) || channelId] })
    })
  }

  if (ctx) ctx.reply('Начато наблюдение за новыми сообщениями.')

  return (ctx) => {
    currentHandlers.forEach(({ handler, event }) => {
      client.removeEventHandler(handler, event)
    })
    console.log('Прекращено наблюдение за новыми сообщениями.')
    if (ctx) ctx.reply('Прекращено наблюдение за новыми сообщениями.')
  }
}

// Функция для наблюдения за новыми сообщениями с AI
export async function watchNewMessagesAi(channelIds, ctx) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const chat = await validateChannelOrGroup(channelId, ctx)
    if (!chat) {
      continue
    }

    const handler = async (event) => {
      try {
        const message = event.message

        const containsAds = await checkForAds(message.message)
        if (containsAds === 'Да') {
          console.log('Сообщение содержит рекламу, пропуск...')
          return
        }

        if (containsAiErrorMessage(message.message)) {
          console.log(
            'Сообщение содержит признаки ошибки или чувствительной информации. Пропускаем обработку AI.'
          )
          await sendMessageToChat(myGroup, message.message, ctx)
          return
        }

        let processedMessage = await processMessageWithAi(message)

        if (message.media) {
          message.message = processedMessage
          await downloadAndSendMedia(myGroup, message, ctx)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await sendMessageToChat(myGroup, processedMessage, ctx)
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщения AI:', error.message)
        await sendMessageToChat(myGroup, message.message, ctx)
      }
    }

    client.addEventHandler(
      handler,
      new NewMessage({ chats: [parseInt(channelId) || channelId] })
    )

    currentHandlers.push({
      handler,
      event: new NewMessage({ chats: [parseInt(channelId) || channelId] })
    })
  }

  if (ctx) ctx.reply('Начато наблюдение за новыми сообщениями с обработкой AI.')

  return (ctx) => {
    currentHandlers.forEach(({ handler, event }) => {
      client.removeEventHandler(handler, event)
    })

    console.log('Прекращено наблюдение за новыми сообщениями с обработкой AI.')
    if (ctx) {
      ctx.reply('Прекращено наблюдение за новыми сообщениями с обработкой AI.')
    }
  }
}

// Функция для получения непрочитанных сообщений
export async function getUnreadMessages(channelId, limit = 1, ctx) {
  if (!client.connected) await client.connect()

  const chat = await validateChannelOrGroup(channelId, ctx)
  if (!chat) {
    return 'Канал или группа не найдены'
  }

  if (ctx) ctx.reply(`Получены непрочитанные сообщения из канала ${channelId}.`)
  return await client.getMessages(chat, { limit })
}
