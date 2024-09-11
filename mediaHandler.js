import fs from 'fs'
import path from 'path'
import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { fileURLToPath } from 'url'
import { NewMessage } from 'telegram/events/NewMessage.js'
import { myGroup } from './config.js'
import { aiErrorMessages } from './utils/aiErrorMessages.js'
import { checkForAds, requestForAi } from './ai/giga.js'
import ffmpeg from 'fluent-ffmpeg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Кэш для доступа к чатам
const chatAccessCache = new Map()

// Функция для проверки доступа к чату
export async function checkChatAccess(chatId) {
  if (chatAccessCache.has(chatId)) {
    return chatAccessCache.get(chatId)
  }
  try {
    const chat = await bot.telegram.getChat(chatId)
    console.log(`Бот имеет доступ к чату: ${chat.title || chat.username}`)
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
    console.error(
      'Ошибка при отправке сообщения:',
      error.response ? error.response.data : error.message
    )
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

  const filePath = path.join(__dirname, `${message.id}.mp4`)
  console.log(`Скачивание медиа: ${filePath}`)
  await client.downloadMedia(message.media, { outputFile: filePath })

  let mediaType = 'document'
  if (message.media.photo) mediaType = 'photo'
  else if (message.media.video) mediaType = 'video'
  else if (message.media.audio) mediaType = 'audio'
  else if (message.media.document) {
    mediaType =
      message.media.document.mimeType === 'video/mp4' ? 'animation' : 'document'
  }

  console.log(`Тип медиа из сообщения: ${mediaType}`)

  if (mediaType === 'video') {
    const convertedFilePath = path.join(
      __dirname,
      `${message.id}-converted.mp4`
    )
    await convertVideoToMP4(filePath, convertedFilePath)

    await sendMediaByType(chatId, message, convertedFilePath, 'video', ctx)

    fs.unlink(filePath, (err) => {
      if (err) console.error(`Не удалось удалить файл: ${filePath}`, err)
      else console.log(`Файл удален: ${filePath}`)
    })

    fs.unlink(convertedFilePath, (err) => {
      if (err)
        console.error(`Не удалось удалить файл: ${convertedFilePath}`, err)
      else console.log(`Файл удален: ${convertedFilePath}`)
    })
  } else {
    await sendMediaByType(chatId, message, filePath, mediaType, ctx)

    fs.unlink(filePath, (err) => {
      if (err) console.error(`Не удалось удалить файл: ${filePath}`, err)
      else console.log(`Файл удален: ${filePath}`)
    })
  }
}

// Функция для конвертации видео с использованием FFmpeg
async function convertVideoToMP4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions([
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-vf "scale=1280:720"'
      ])
      .on('end', () => {
        console.log(`Видео успешно конвертировано: ${outputPath}`)
        resolve(outputPath)
      })
      .on('error', (err) => {
        console.error('Ошибка при конвертации видео:', err)
        reject(err)
      })
      .run()
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
          { caption: message.message, supports_streaming: true }
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
        console.log('Отправка как документ')
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          { caption: message.message }
        )
    }
    console.log('Медиа успешно отправлено.')
  } catch (error) {
    console.error(
      'Ошибка при отправке медиа:',
      error.response ? error.response.data : error.message
    )
    if (ctx) ctx.reply('Ошибка при отправке медиа.')
  }
}

// Функция для проверки существования канала/группы
export async function validateChannelOrGroup(channelId, ctx) {
  try {
    const chat = await client.getEntity(channelId)
    console.log(`Канал/группа с ID ${channelId} успешно найден.`)
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
        console.error(
          'Ошибка при обработке нового сообщения:',
          error.response ? error.response.data : error.message
        )
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
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    console.log('Прекращено наблюдение за новыми сообщениями.')
    if (ctx) ctx.reply('Прекращено наблюдение за новыми сообщениями.')
  }
}

// Функция для обработки сообщения с ИИ с повторными попытками
async function processMessageWithAi(message, maxAttempts = 3) {
  let processedMessage = null
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      console.log(`Попытка ${attempts + 1}: запрос к ИИ`)

      processedMessage = await requestForAi(message.message)

      const normalizedMessage = processedMessage
        .replace(/\s+/g, '')
        .toLowerCase()
      const errorDetected = aiErrorMessages.some((errorMsg) =>
        normalizedMessage.includes(errorMsg.replace(/\s+/g, '').toLowerCase())
      )

      if (errorDetected) {
        console.log(
          'Сообщение содержит предупреждение ИИ, возвращаем оригинальное сообщение.'
        )
        return message.message
      }

      if (processedMessage) {
        console.log('Ответ ИИ получен.')
        return processedMessage // Возвращаем обработанное сообщение
      }
    } catch (error) {
      attempts++
      console.error(
        `Ошибка при запросе к ИИ (попытка ${attempts}):`,
        error.message
      )

      if (attempts >= maxAttempts) {
        console.log('Все попытки исчерпаны, используем исходное сообщение.')
        return message.message // Возвращаем исходное сообщение в случае неудачи
      }
    }
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

        // Проверка на рекламу
        const containsAds = await checkForAds(message.message)
        if (containsAds === 'Да') {
          console.log('Сообщение содержит рекламу, пропуск...')
          return
        }

        // Обработка сообщения с AI с повторными попытками
        let processedMessage = await processMessageWithAi(message)

        // Отправка сообщения
        if (message.media) {
          message.message = processedMessage
          await downloadAndSendMedia(myGroup, message, ctx)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await sendMessageToChat(myGroup, processedMessage, ctx)
        }
      } catch (error) {
        console.error(
          'Ошибка при обработке сообщения AI:',
          error.response ? error.response.data : error.message
        )
        // Если ошибка, отправляем оригинальное сообщение
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
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
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
