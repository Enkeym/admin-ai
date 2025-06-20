import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { NewMessage } from 'telegram/events/NewMessage.js'
import { fileURLToPath } from 'url'
import { requestForAi } from './ai/giga.js'
import { bot } from './bot.js'
import { myGroup } from './config.js'
import { client } from './telegramClient.js'
import { containsAiErrorMessage } from './utils/aiChecker.js'
import { containsAdContent } from './utils/filterChecker.js'
import { logWithTimestamp } from './utils/logger.js'
import { getMediaFileExtension } from './utils/mediaUtils.js'

// Установка путей к ffmpeg и ffprobe
const ffmpegPath =
  process.platform === 'win32'
    ? 'C:\\ffmpeg\\bin\\ffmpeg.exe'
    : '/usr/bin/ffmpeg'
const ffprobePath =
  process.platform === 'win32'
    ? 'C:\\ffmpeg\\bin\\ffprobe.exe'
    : '/usr/bin/ffprobe'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Проверка существования файлов ffmpeg и ffprobe
if (!fs.existsSync(ffmpegPath)) {
  logWithTimestamp(`Ошибка: ffmpeg не найден по пути: ${ffmpegPath}`, 'error')
}
if (!fs.existsSync(ffprobePath)) {
  logWithTimestamp(`Ошибка: ffprobe не найден по пути: ${ffprobePath}`, 'error')
}

const chatAccessCache = new Map()
const foundChannelsCache = new Set()

// --- Кэширование доступа к чатам ---
export function clearCache() {
  chatAccessCache.clear()
  foundChannelsCache.clear()
  logWithTimestamp('Кэш очищен.', 'info')
}

// Проверка доступа к чату с кэшированием
export async function checkChatAccess(chatId) {
  if (chatAccessCache.has(chatId)) {
    return chatAccessCache.get(chatId)
  }

  try {
    const chat = await client.getEntity(chatId)
    if (!foundChannelsCache.has(chatId)) {
      logWithTimestamp(
        `Бот имеет доступ к чату: ${chat.title || chat.username}`,
        'info'
      )
      foundChannelsCache.add(chatId)
    }

    chatAccessCache.set(chatId, true)
    return true
  } catch (error) {
    logWithTimestamp(
      `Ошибка: Чат с ID ${chatId} не найден или бот не имеет доступа: ${error.message}`,
      'error'
    )
    chatAccessCache.set(chatId, false)
    return false
  }
}

// Проверка наличия канала или группы
export async function validateChannelOrGroup(channelId, ctx) {
  if (foundChannelsCache.has(channelId)) {
    logWithTimestamp(`Канал/группа с ID ${channelId} взяты из кеша.`, 'info')
    return await client.getEntity(channelId)
  }

  try {
    const chat = await client.getEntity(channelId)
    foundChannelsCache.add(channelId)
    logWithTimestamp(
      `Канал/группа с ID ${channelId} успешно найдены и добавлены в кеш.`,
      'info'
    )
    return chat
  } catch (error) {
    const errorMessage = `Канал или группа с ID ${channelId} не найдены.`
    logWithTimestamp(errorMessage, 'error')

    if (ctx) ctx.reply(errorMessage)
    return null
  }
}

// --- Обработка медиа и текстов ---

// Удаление файла
export function deleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        logWithTimestamp(
          `Не удалось удалить файл: ${filePath} - ${err.message}`,
          'error'
        )
      } else {
        logWithTimestamp(`Файл удален: ${filePath}`, 'info')
      }
    })
  }
}

// --- Конвертация видео ---

// Функция конвертации видео с использованием ffmpeg
async function convertVideoForStreaming(inputPath, outputPath, width, height) {
  return new Promise((resolve, reject) => {
    const command = `${ffmpegPath} -i ${inputPath} -vf "scale=${width}:${height}" -c:v libx264 -c:a aac -b:v 1M -pix_fmt yuv420p -movflags +faststart -g 60 -vsync 0 -f mp4 ${outputPath}`

    exec(command, (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(`Ошибка конвертации видео: ${stderr}`, 'error')
        return reject(error)
      }
      logWithTimestamp(
        `Видео успешно конвертировано для стриминга: ${outputPath}`,
        'info'
      )
      resolve(outputPath)
    })
  })
}

// Функция отправки медиа с поддержкой стриминга
async function sendMedia(
  chatId,
  mediaPath,
  mediaType,
  message,
  ctx,
  isConverted = false,
  width = null,
  height = null
) {
  const MAX_CAPTION_LENGTH = 1024
  const caption = message.message.slice(0, MAX_CAPTION_LENGTH)
  const mediaOptions = { caption }

  try {
    switch (mediaType) {
      case 'video': {
        const videoAttributes = message.media.document.attributes.find(
          (attr) => attr.className === 'DocumentAttributeVideo'
        )

        // Если видео было конвертировано, используем новые размеры
        const videoWidth = isConverted ? width : videoAttributes?.w || 720
        const videoHeight = isConverted ? height : videoAttributes?.h || 1080

        await bot.telegram.sendVideo(
          chatId,
          { source: mediaPath },
          {
            ...mediaOptions,
            supports_streaming: true,
            width: videoWidth,
            height: videoHeight
          }
        )
        break
      }
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
      case 'audio':
        await bot.telegram.sendAudio(
          chatId,
          { source: mediaPath },
          mediaOptions
        )
        break
      case 'document':
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          mediaOptions
        )
        break
      case 'sticker':
        await bot.telegram.sendSticker(chatId, { source: mediaPath })
        break
      default:
        logWithTimestamp(`Неизвестный тип медиа: ${mediaType}`, 'error')
    }
  } catch (error) {
    logWithTimestamp(`Ошибка при отправке медиа: ${error.message}`, 'error')
  }
}

// Проверка размера файла
function isFileTooLarge(filePath, maxSizeMB) {
  const stats = fs.statSync(filePath)
  const fileSizeInMB = stats.size / (1024 * 1024)
  return fileSizeInMB > maxSizeMB
}

// Функция загрузки и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  // Убираем проверку на наличие текста для отправки медиа
  if (!message.media) {
    logWithTimestamp('Медиа или документ в сообщении отсутствуют.', 'warn')
    return
  }

  // Проверка на наличие текста в медиа. Если текста нет, то пропускаем сообщение
  if (!message.message || message.message.trim() === '') {
    logWithTimestamp('Медиа не содержит текста. Пропуск отправки.', 'warn')
    return
  }

  if (!(await checkChatAccess(chatId))) {
    const errorMsg = `Бот не имеет доступа к чату с ID ${chatId}. Пропуск отправки медиа.`
    logWithTimestamp(errorMsg, 'error')
    return
  }

  const media = message.media

  const fileExtension = getMediaFileExtension(media)
  const filePath = path.resolve(__dirname, `${message.id}.${fileExtension}`)
  logWithTimestamp(`Сохранение медиа в файл по пути: ${filePath}`, 'info')

  try {
    await client.downloadMedia(media, { outputFile: filePath })
    logWithTimestamp(`Медиа успешно загружено в файл: ${filePath}`, 'info')
  } catch (error) {
    logWithTimestamp(`Ошибка загрузки медиа: ${error.message}`, 'error')
    return
  }

  const mimeType = media.document?.mimeType || 'image/jpeg'
  logWithTimestamp(`MIME тип медиа: ${mimeType}`, 'info')

  const fileSizeInBytes = media.document?.size || 0
  const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2)
  logWithTimestamp(`Размер медиа: ${fileSizeInMB} МБ`, 'info')

  if (isFileTooLarge(filePath, 50)) {
    logWithTimestamp('Медиа превышает лимит в 50 МБ. Пропуск отправки.', 'warn')
    return
  }

  // Определение типа медиа
  let mediaType = 'document'
  if (media.photo) {
    mediaType = 'photo'
    logWithTimestamp('Тип медиа: фото.', 'info')
  } else if (media.animation) {
    mediaType = 'animation'
    logWithTimestamp('Тип медиа: анимация (GIF).', 'info')
  } else if (media.video) {
    mediaType = 'video'
    logWithTimestamp('Тип медиа: видео.', 'info')
  } else if (media.audio) {
    mediaType = 'audio'
    logWithTimestamp('Тип медиа: аудио.', 'info')
  } else if (media.sticker) {
    mediaType = 'sticker'
    logWithTimestamp('Тип медиа: стикер.', 'info')
  }

  let convertedVideoPath = null
  if (mediaType === 'video') {
    const videoAttributes = media.document?.attributes?.find(
      (attr) => attr.className === 'DocumentAttributeVideo'
    )
    const width = videoAttributes?.w || 720
    const height = videoAttributes?.h || 1080

    logWithTimestamp(
      `Размеры видео: ширина ${width}px, высота ${height}px`,
      'info'
    )

    // Прямо конвертируем видео
    convertedVideoPath = path.resolve(__dirname, `converted_${message.id}.mp4`)

    try {
      await convertVideoForStreaming(
        filePath,
        convertedVideoPath,
        width,
        height
      )

      if (isFileTooLarge(convertedVideoPath, 50)) {
        logWithTimestamp(
          'Конвертированное видео превышает лимит в 50 МБ. Пропуск отправки.',
          'warn'
        )
        deleteFile(convertedVideoPath)
        return
      }

      // Отправляем конвертированное видео
      await sendMedia(
        chatId,
        convertedVideoPath,
        'video',
        message,
        ctx,
        true,
        width,
        height
      )
      logWithTimestamp('Конвертированное видео успешно отправлено.', 'info')
    } catch (error) {
      logWithTimestamp(`Ошибка конвертации видео: ${error.message}`, 'error')
    }
  } else {
    await sendMedia(chatId, filePath, mediaType, message, ctx)
  }

  deleteFile(filePath)
  if (convertedVideoPath) deleteFile(convertedVideoPath)
}

// --- Обработка сообщений с AI ---

async function processMessageWithAi(message) {
  if (!message?.message?.trim()) {
    logWithTimestamp(
      'Ошибка: Сообщение отсутствует или не содержит текста.',
      'error'
    )
    return message.message || 'Текст отсутствует'
  }

  try {
    logWithTimestamp('Запрос к ИИ для обработки сообщения.', 'info')

    if (containsAiErrorMessage(message.message)) {
      logWithTimestamp(
        'Исходное сообщение содержит признаки ошибки или чувствительной информации. Пропускаем обработку ИИ.',
        'warn'
      )
      return { message: message.message }
    }

    const processedMessage = await requestForAi(message.message)

    if (!processedMessage || containsAiErrorMessage(processedMessage)) {
      logWithTimestamp(
        'Ответ ИИ содержит ошибку или чувствительный ответ. Возвращаем исходное сообщение.',
        'warn'
      )
      return { message: message.message }
    }

    logWithTimestamp('Ответ ИИ получен и обработан.', 'info')
    return { message: processedMessage }
  } catch (error) {
    logWithTimestamp(`Ошибка при запросе к ИИ: ${error.message}`, 'error')
    return { message: message.message || 'Ошибка обработки сообщения ИИ' }
  }
}

// --- Функции для мониторинга сообщений ---

export async function watchNewMessages(channelIds, ctx) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const chat = await validateChannelOrGroup(channelId, ctx)
    if (!chat) continue

    const handler = async (event) => {
      try {
        const message = event.message

        // Проверяем на рекламное содержание без использования ИИ
        if (containsAdContent(message.message)) {
          logWithTimestamp(
            'Сообщение классифицировано как реклама, пропуск...',
            'warn'
          )
          return
        }

        // Пропускаем сообщения, содержащие только текст
        /* if (message?.message?.trim() && !message.media) {
          logWithTimestamp(
            'Сообщение содержит только текст без медиа. Пропуск...',
            'warn'
          )
          return
        } */

        if (message.media) {
          await downloadAndSendMedia(myGroup, message, ctx)
        } else if (message.message?.trim()) {
          logWithTimestamp(
            'Медиа не найдено, отправка текстового сообщения',
            'info'
          )
          try {
            await bot.telegram.sendMessage(myGroup, message.message)
            logWithTimestamp('Сообщение успешно отправлено.', 'info')
          } catch (error) {
            logWithTimestamp(
              `Ошибка при отправке сообщения: ${error.message}`,
              'error'
            )
            if (ctx) await ctx.reply('Ошибка при отправке сообщения.')
          }
        } else {
          logWithTimestamp(
            'Сообщение не содержит текста и не является медиа.',
            'warn'
          )
          if (ctx) await ctx.reply('Сообщение пустое или не содержит медиа.')
        }
      } catch (error) {
        logWithTimestamp(
          `Ошибка при обработке нового сообщения: ${error.message}`,
          'error'
        )
        if (ctx) ctx.reply('Ошибка при обработке нового сообщения.')
      }
    }

    const event = new NewMessage({ chats: [parseInt(channelId) || channelId] })
    client.addEventHandler(handler, event)
    currentHandlers.push({ handler, event })
  }

  if (ctx) ctx.reply('Начато наблюдение за новыми сообщениями.')

  return (ctx) => {
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    logWithTimestamp('Прекращено наблюдение за новыми сообщениями.', 'info')
    if (ctx) ctx.reply('Прекращено наблюдение за новыми сообщениями.')
  }
}

// Функция для наблюдения за новыми сообщениями с использованием ИИ
export async function watchNewMessagesAi(channelIds, ctx) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const chat = await validateChannelOrGroup(channelId, ctx)
    if (!chat) continue

    const handler = async (event) => {
      try {
        const message = event.message

        // Проверяем на рекламное содержание
        if (containsAdContent(message.message)) {
          logWithTimestamp(
            'Сообщение классифицировано как реклама, пропуск...',
            'warn'
          )
          return
        }

        // Пропускаем сообщения, содержащие только текст без медиа
        /* if (message?.message?.trim() && !message.media) {
          logWithTimestamp(
            'Сообщение содержит только текст без медиа. Пропуск...',
            'warn'
          )
          return
        } */

        // Проверка на ошибки ИИ и чувствительное содержание
        if (containsAiErrorMessage(message.message)) {
          logWithTimestamp(
            'Сообщение содержит ошибки ИИ или чувствительные паттерны, пропуск...',
            'warn'
          )
          return
        }

        // Если сообщение содержит медиа, отправляем его независимо от текста
        if (message.media) {
          logWithTimestamp(
            'Сообщение содержит медиа, обрабатываем текст с ИИ перед отправкой...',
            'info'
          )

          const processedMessage = await processMessageWithAi(message)

          message.message = processedMessage.message || message.message

          await downloadAndSendMedia(myGroup, message, ctx)
          return
        }

        // Если сообщение содержит только текст, обрабатываем через ИИ
        if (message.message?.trim()) {
          logWithTimestamp('Обрабатываем текстовое сообщение через ИИ.', 'info')
          const processedMessage = await processMessageWithAi(message)
          logWithTimestamp('Сообщение успешно обработано ИИ.', 'info')
          await bot.telegram.sendMessage(myGroup, processedMessage.message)
        } else {
          logWithTimestamp(
            'Сообщение не содержит текста или медиа, пропуск...',
            'warn'
          )
        }
      } catch (error) {
        logWithTimestamp(
          `Ошибка при обработке нового сообщения: ${error.message}`,
          'error'
        )
      }
    }

    const event = new NewMessage({ chats: [parseInt(channelId) || channelId] })
    client.addEventHandler(handler, event)
    currentHandlers.push({ handler, event })
  }

  if (ctx) ctx.reply('Начато наблюдение за новыми сообщениями с обработкой ИИ.')

  return (ctx) => {
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    logWithTimestamp(
      'Прекращено наблюдение за новыми сообщениями с обработкой ИИ.',
      'info'
    )
    if (ctx)
      ctx.reply('Прекращено наблюдение за новыми сообщениями с обработкой ИИ.')
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
