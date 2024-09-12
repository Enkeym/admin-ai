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

// Функция для проверки доступа к чату
export async function checkChatAccess(chatId) {
  if (chatAccessCache.has(chatId)) {
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

// Функция для скачивания и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  if (!message.message || !message.message.trim()) {
    const noTextMessage =
      'Сообщение не содержит текста, медиа не будет отправлено.'
    console.log(noTextMessage)
    if (ctx) ctx.reply(noTextMessage)
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

  // Скачиваем файл
  await client.downloadMedia(message.media, { outputFile: filePath })

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
        await bot.telegram.sendPhoto(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
        break
      case 'video':
        await bot.telegram.sendVideo(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
        break
      case 'document':
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
        break
      case 'animation':
        await bot.telegram.sendAnimation(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
        break
      default:
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
    }
    console.log('Медиа успешно отправлено.')
  } catch (error) {
    console.error('Ошибка при отправке медиа:', error.message)
    if (ctx) ctx.reply('Ошибка при отправке медиа.')
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

// Функция для проверки наличия сообщения с ошибкой ИИ
function containsAiErrorMessage(response) {
  const normalizedResponse = response.trim().toLowerCase()

  // Проверка на полное или частичное совпадение с известными сообщениями
  const isAiErrorMessage = aiErrorMessages.some((errorMsg) => {
    const normalizedErrorMsg = errorMsg.toLowerCase()
    return normalizedResponse.includes(normalizedErrorMsg)
  })

  // Проверка по дополнительным ключевым словам и шаблонам
  const containsAdditionalPatterns = additionalPatterns.some((pattern) =>
    normalizedResponse.includes(pattern.toLowerCase())
  )

  return isAiErrorMessage || containsAdditionalPatterns
}

// Функция для обработки сообщения с ИИ
async function processMessageWithAi(message) {
  try {
    console.log('Запрос к ИИ для обработки сообщения.')
    const processedMessage = await requestForAi(message.message)

    if (containsAiErrorMessage(processedMessage)) {
      console.log(
        'Ответ ИИ содержит ошибку или чувствительный ответ. Возвращаем исходное сообщение.'
      )
      return message.message
    }

    console.log('Ответ ИИ получен.')
    return processedMessage
  } catch (error) {
    console.error('Ошибка при запросе к ИИ:', error.message)
    return message.message
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
