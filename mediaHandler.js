import ffmpegStatic from '@ffmpeg-installer/ffmpeg'
import ffprobeStatic from '@ffprobe-installer/ffprobe'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Вывести пути для отладки
logWithTimestamp(`Путь к ffmpeg: ${ffmpegStatic.path}`, 'info')
logWithTimestamp(`Путь к ffprobe: ${ffprobeStatic.path}`, 'info')

// Проверка существования файла ffprobe
if (!fs.existsSync(ffprobeStatic.path)) {
  logWithTimestamp(
    `Ошибка: ffprobe не найден по пути: ${ffprobeStatic.path}`,
    'error'
  )
}
const chatAccessCache = new Map()
const foundChannelsCache = new Set()

// --- Кэширование доступа к чатам ---
export function clearCache() {
  chatAccessCache.clear()
  foundChannelsCache.clear()
  logWithTimestamp('Очищаем предыдущий кеш...', 'info')
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
      `Канал/группа с ID ${channelId} успешно найден и добавлен в кеш.`,
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

// Асинхронная отправка текстовых сообщений
export async function sendMessageToChat(chatId, message, ctx) {
  if (!message?.message?.trim()) {
    logWithTimestamp('Сообщение пустое или undefined.', 'warn')
    if (ctx) await ctx.reply('Сообщение пустое или не содержит текста.')
    return
  }

  try {
    await bot.telegram.sendMessage(chatId, message.message)
    logWithTimestamp('Сообщение успешно отправлено.', 'info')
  } catch (error) {
    logWithTimestamp(`Ошибка при отправке текста: ${error.message}`, 'error')
    if (ctx) await ctx.reply('Ошибка при отправке сообщения.')
  }
}

// Асинхронная отправка текстовых сообщений
export async function sendTextMessage(chatId, message, ctx) {
  if (!message?.message?.trim()) {
    logWithTimestamp('Сообщение пустое или undefined.', 'warn')
    if (ctx) await ctx.reply('Сообщение пустое или не содержит текста.')
    return
  }
  try {
    await bot.telegram.sendMessage(chatId, message.message)
    logWithTimestamp('Сообщение успешно отправлено.', 'info')
  } catch (error) {
    logWithTimestamp(`Ошибка при отправке текста: ${error.message}`, 'error')
    if (ctx) await ctx.reply('Ошибка при отправке сообщения.')
  }
}

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

// --- Функции для работы с видео и аудио ---

// --- Проверка кодеков с помощью ffprobe ---
async function checkVideoCompatibility(inputPath) {
  return new Promise((resolve, reject) => {
    const command = `${ffprobeStatic.path} -v error -show_streams -select_streams v:0,a:0 -print_format json ${inputPath}`
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(`Ошибка анализа видео: ${stderr}`, 'error')
        return reject(error)
      }

      const metadata = JSON.parse(stdout)
      const videoCodec = metadata.streams.find(
        (stream) => stream.codec_type === 'video'
      )?.codec_name
      const audioCodec = metadata.streams.find(
        (stream) => stream.codec_type === 'audio'
      )?.codec_name

      logWithTimestamp(
        `Проверка кодеков: видео - ${videoCodec || 'не найден'}, аудио - ${
          audioCodec || 'не найден'
        }`,
        'info'
      )

      if (videoCodec === 'h264' && audioCodec === 'aac') {
        logWithTimestamp('Видео совместимо с H.264 и AAC', 'info')
        resolve(true)
      } else {
        logWithTimestamp(
          'Видео НЕ совместимо с H.264 и AAC, требуется конвертация',
          'warn'
        )
        resolve(false)
      }
    })
  })
}

// --- Конвертация видео с помощью ffmpeg ---
async function convertVideoForStreaming(inputPath, outputPath, width, height) {
  return new Promise((resolve, reject) => {
    const command = `${ffmpegStatic.path} -i ${inputPath} -vf "scale=${width}:${height}" -c:v libx264 -c:a aac -preset fast -movflags +frag_keyframe+empty_moov ${outputPath}`
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

// --- Отправка медиа с поддержкой стриминга ---
async function sendMedia(chatId, mediaPath, mediaType, message, ctx) {
  const mediaOptions = { caption: message.message }
  try {
    switch (mediaType) {
      case 'video': {
        const videoAttributes = message.media.document.attributes.find(
          (attr) => attr.className === 'DocumentAttributeVideo'
        )
        const width = videoAttributes?.w || 720
        const height = videoAttributes?.h || 1080

        await bot.telegram.sendVideo(
          chatId,
          { source: mediaPath },
          { ...mediaOptions, supports_streaming: true, width, height }
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
      default:
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          mediaOptions
        )
    }
    logWithTimestamp('Медиа успешно отправлено.', 'info')
  } catch (error) {
    logWithTimestamp(`Ошибка при отправке медиа: ${error.message}`, 'error')
    if (ctx) await ctx.reply('Ошибка при отправке медиа.')
  }
}

// Проверка размера файла
function isFileTooLarge(filePath, maxSizeMB) {
  const stats = fs.statSync(filePath)
  const fileSizeInMB = stats.size / (1024 * 1024)
  return fileSizeInMB > maxSizeMB
}

// Основная функция для загрузки и отправки медиа
export async function downloadAndSendMedia(chatId, message, ctx) {
  if (!message || !message.message?.trim()) {
    logWithTimestamp(
      'Сообщение не содержит текста, медиа не будет отправлено.',
      'warn'
    )
    return
  }

  if (!(await checkChatAccess(chatId))) {
    const errorMsg = `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    logWithTimestamp(errorMsg, 'error')
    return
  }

  const media = message.media
  if (
    !media ||
    (!media.document && !media.photo && !media.animation && !media.video)
  ) {
    logWithTimestamp('Сообщение не содержит медиа или документ.', 'warn')
    return
  }

  const fileExtension = getMediaFileExtension(media)
  const filePath = path.resolve(__dirname, `${message.id}.${fileExtension}`)
  logWithTimestamp(`Путь для сохранения медиа: ${filePath}`, 'info')

  try {
    await client.downloadMedia(media, { outputFile: filePath })
    logWithTimestamp(`Медиа успешно загружено в файл: ${filePath}`, 'info')
  } catch (error) {
    logWithTimestamp(`Ошибка при скачивании медиа: ${error.message}`, 'error')
    return
  }

  const mimeType = media.document?.mimeType || 'image/jpeg'
  logWithTimestamp(`MIME-тип медиа: ${mimeType}`, 'info')

  const fileSizeInBytes = media.document?.size || 0
  const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2)
  logWithTimestamp(`Размер медиа: ${fileSizeInMB} MB`, 'info')

  if (isFileTooLarge(filePath, 50)) {
    logWithTimestamp(
      'Медиа превышает лимит в 50 MB. Отправка пропущена.',
      'warn'
    )
    return
  }

  let mediaType = 'document'
  if (media.photo) {
    mediaType = 'photo'
    logWithTimestamp('Тип медиа — фото.', 'info')
  } else if (media.animation) {
    mediaType = 'animation'
    logWithTimestamp('Тип медиа — анимация (GIF).', 'info')
  } else if (media.video) {
    mediaType = 'video'
    logWithTimestamp('Тип медиа — видео.', 'info')
  }

  let convertedVideoPath = null
  if (mediaType === 'video') {
    const videoAttributes = media.document?.attributes?.find(
      (attr) => attr.className === 'DocumentAttributeVideo'
    )
    const width = videoAttributes?.w || 720
    const height = videoAttributes?.h || 1080

    logWithTimestamp(
      `Получены размеры видео: ширина ${width}px, высота ${height}px`,
      'info'
    )

    // Проверка совместимости с H.264 и AAC
    const isCompatible = await checkVideoCompatibility(filePath)

    if (!isCompatible) {
      logWithTimestamp(
        `Видео не совместимо с H.264 и AAC, требуется конвертация.`,
        'info'
      )
      convertedVideoPath = path.resolve(
        __dirname,
        `converted_${message.id}.mp4`
      )

      try {
        await convertVideoForStreaming(
          filePath,
          convertedVideoPath,
          width,
          height
        )

        if (isFileTooLarge(convertedVideoPath, 50)) {
          logWithTimestamp(
            'Конвертированное видео превышает лимит в 50 MB. Отправка пропущена.',
            'warn'
          )
          deleteFile(convertedVideoPath)
          return
        }

        await sendMedia(chatId, convertedVideoPath, 'video', message, ctx)
        logWithTimestamp('Видео успешно отправлено после конвертации.', 'info')
      } catch (error) {
        logWithTimestamp(
          `Ошибка преобразования видео: ${error.message}`,
          'error'
        )
      }
    } else {
      logWithTimestamp('Видео совместимо, отправляем оригинал.', 'info')
      await sendMedia(chatId, filePath, 'video', message, ctx)
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

        if (message.media) {
          await downloadAndSendMedia(myGroup, message, ctx)
        } else if (message.message) {
          logWithTimestamp(
            'Медиа не найдено, отправка текстового сообщения',
            'info'
          )
          await sendMessageToChat(myGroup, { message: message.message }, ctx)
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

        // Проверка на рекламное содержание (фильтр без ИИ)
        if (containsAdContent(message.message)) {
          logWithTimestamp(
            'Сообщение классифицировано как реклама, пропуск...',
            'warn'
          )
          return
        }

        // Проверка на ошибки ИИ и чувствительное содержание
        if (containsAiErrorMessage(message.message)) {
          logWithTimestamp(
            'Сообщение содержит ошибки ИИ или чувствительные паттерны, пропуск...',
            'warn'
          )
          return
        }

        // Проверка на наличие медиа
        if (message.media) {
          logWithTimestamp(
            'Сообщение содержит медиа, передаем на обработку.',
            'info'
          )
          await downloadAndSendMedia(myGroup, message, ctx)
        } else if (message.message) {
          let processedMessage
          try {
            const result = await processMessageWithAi(message)
            processedMessage = result.message
            logWithTimestamp('Сообщение успешно обработано ИИ.', 'info')
          } catch (error) {
            logWithTimestamp(
              `Ошибка при обработке сообщения ИИ: ${error.message}`,
              'error'
            )
            return
          }

          // Отправляем обработанное сообщение в чат
          await sendMessageToChat(myGroup, { message: processedMessage }, ctx)
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

    client.addEventHandler(
      handler,
      new NewMessage({ chats: [parseInt(channelId) || channelId] })
    )
    currentHandlers.push({
      handler,
      event: new NewMessage({ chats: [parseInt(channelId) || channelId] })
    })
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
