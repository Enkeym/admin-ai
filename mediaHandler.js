import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
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

// Универсальная функция для удаления файлов
function deleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Не удалось удалить файл: ${filePath}`, err)
      } else {
        console.log(`Файл удален: ${filePath}`)
      }
    })
  }
}

// --- Основные функции для обработки сообщений ---

// Универсальная функция для отправки сообщений или медиа
async function sendMessageOrMedia(
  chatId,
  message,
  mediaPath = null,
  mediaType = null,
  ctx
) {
  if (!(await checkChatAccess(chatId))) {
    const errorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Сообщение/медиа не отправлено.`
    console.error(errorMessage)
    if (ctx) await ctx.reply(errorMessage)
    return
  }

  try {
    console.log(`Попытка отправки сообщения или медиа в чат ${chatId}`)

    if (mediaPath && fs.existsSync(mediaPath)) {
      const mediaOptions = { caption: message.message }

      switch (mediaType) {
        case 'video':
          await bot.telegram.sendVideo(
            chatId,
            { source: mediaPath },
            mediaOptions
          )
          break
        case 'photo':
          await bot.telegram.sendPhoto(
            chatId,
            { source: mediaPath },
            mediaOptions
          )
          break
        case 'animation':
          await bot.telegram.sendAnimation(
            chatId,
            { source: mediaPath },
            mediaOptions
          )
          break
        default:
          await bot.telegram.sendDocument(
            chatId,
            { source: mediaPath },
            mediaOptions
          )
      }

      console.log('Медиа успешно отправлено.')
    } else {
      // Отправка текстового сообщения
      await bot.telegram.sendMessage(chatId, message.message)
      console.log('Сообщение успешно отправлено.')
    }
  } catch (error) {
    console.error('Ошибка при отправке:', error.message)
    if (ctx) await ctx.reply('Ошибка при отправке сообщения/медиа.')
  }
}

// Функция для преобразования видео через FFmpeg с сохранением пропорций
async function convertVideo(inputPath, outputPath, width, height) {
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i "${inputPath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p -movflags +faststart -c:a aac "${outputPath}"`

    exec(command, (error) => {
      if (error) {
        console.error(`Ошибка преобразования видео: ${error.message}`)
        return reject(error)
      }
      console.log(`Видео успешно преобразовано: ${outputPath}`)
      resolve(outputPath)
    })
  })
}

// Асинхронная обработка загрузки и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  if (!message.message?.trim()) {
    console.log('Сообщение не содержит текста, медиа не будет отправлено.')
    return
  }

  if (!(await checkChatAccess(chatId))) {
    const accessErrorMessage = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    console.error(accessErrorMessage)
    if (ctx) await ctx.reply(accessErrorMessage)
    return
  }

  const fileExtension = getMediaFileExtension(message.media)
  const filePath = path.resolve(__dirname, `${message.id}.${fileExtension}`)

  console.log(`Скачивание медиа: ${filePath}`)

  try {
    await client.downloadMedia(message.media, { outputFile: filePath })
  } catch (error) {
    console.error('Ошибка при скачивании медиа:', error.message)
    if (ctx) await ctx.reply('Ошибка при скачивании медиа.')
    return
  }

  let mediaType = 'document'
  if (message.media.photo) {
    mediaType = 'photo'
  } else if (message.media.video) {
    mediaType = 'video'
  } else if (message.media.document?.mimeType === 'video/mp4') {
    mediaType = 'animation'
  }

  let convertedVideoPath = null

  if (mediaType === 'video') {
    convertedVideoPath = path.resolve(__dirname, `converted_${message.id}.mp4`)
    const width = 720 // Ширина видео
    const height = 1080 // Высота видео

    try {
      await convertVideo(filePath, convertedVideoPath, width, height)

      // Отправляем видео
      await sendMessageOrMedia(
        chatId,
        message,
        convertedVideoPath,
        mediaType,
        ctx
      )
    } catch (error) {
      console.error('Ошибка преобразования видео:', error.message)
      if (ctx) await ctx.reply('Ошибка преобразования видео.')
    }
  } else {
    // Отправляем без преобразования для других типов медиа
    await sendMessageOrMedia(chatId, message, filePath, mediaType, ctx)
  }

  // Удаляем скачанный медиа-файл и, если есть, конвертированное видео
  deleteFile(filePath)
  deleteFile(convertedVideoPath)
}

// Асинхронная отправка текстовых сообщений
export async function sendMessageToChat(chatId, message, ctx) {
  await sendMessageOrMedia(chatId, { message }, null, null, ctx)
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
