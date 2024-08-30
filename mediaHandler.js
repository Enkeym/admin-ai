import fs from 'fs'
import path from 'path'
import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { fileURLToPath } from 'url'
import { NewMessage } from 'telegram/events/NewMessage.js'
import { myGroup } from './config.js'
import { checkForAds, requestForAi } from './ai/giga.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Функция для обрезки текста, если он слишком длинный
function truncateText(text, maxLength = 1024) {
  return text.length > maxLength
    ? text.substring(0, maxLength - 3) + '...'
    : text
}

// Функция для скачивания и отправки медиа
export async function downloadAndSendMedia(chatId, message) {
  const filePath = path.join(__dirname, `${message.id}.gif`)
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
  await sendMediaByType(chatId, message, filePath, mediaType)

  fs.unlink(filePath, (err) => {
    if (err) console.error(`Не удалось удалить файл: ${filePath}`, err)
    else console.log(`Файл удален: ${filePath}`)
  })
}

// Функция для отправки медиа по типу
async function sendMediaByType(chatId, message, mediaPath, mediaType) {
  const truncatedCaption = truncateText(message.message)

  try {
    switch (mediaType) {
      case 'photo':
        await bot.telegram.sendPhoto(
          chatId,
          { source: mediaPath },
          { caption: truncatedCaption }
        )
        break
      case 'video':
        await bot.telegram.sendVideo(
          chatId,
          { source: mediaPath },
          { caption: truncatedCaption }
        )
        break
      case 'animation':
        await bot.telegram.sendAnimation(
          chatId,
          { source: mediaPath },
          { caption: truncatedCaption }
        )
        break
      default:
        console.log('Отправка как документ')
        await bot.telegram.sendDocument(
          chatId,
          { source: mediaPath },
          { caption: truncatedCaption }
        )
    }
  } catch (error) {
    console.error('Ошибка при отправке медиа:', error)
  }
}

// Функция для наблюдения за новыми сообщениями
export async function watchNewMessages(channelIds) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const handler = async (event) => {
      const message = event.message
      if (message.media && !message.fwdFrom) {
        await downloadAndSendMedia(myGroup, message)
      } else if (!message.media && !message.fwdFrom) {
        console.log('Медиа не найдено, отправка текстового сообщения')
        await bot.telegram.sendMessage(myGroup, message.message)
      } else {
        console.log('Сообщение переслано или не содержит медиа, пропуск...')
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

  return () => {
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    console.log('Прекращено наблюдение за новыми сообщениями.')
  }
}

export async function watchNewMessagesNoAds(channelIds) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const handler = async (event) => {
      const message = event.message

      try {
        // Проверка на наличие рекламы
        const containsAds = await checkForAds(message.message)
        if (containsAds) {
          console.log('Сообщение содержит рекламу, пропуск...')
          return
        }

        // Обработка медиа и текстовых сообщений
        if (message.media) {
          await downloadAndSendMedia(myGroup, message)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await bot.telegram.sendMessage(myGroup, message.message)
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщения:', error)
        await bot.telegram.sendMessage(
          myGroup,
          'Произошла ошибка при обработке сообщения.'
        )
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

  return () => {
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    console.log('Прекращено наблюдение за новыми сообщениями.')
  }
}

// Функция для наблюдения за новыми сообщениями с AI
export async function watchNewMessagesAi(channelIds) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const handler = async (event) => {
      const message = event.message

      try {
        const containsAds = await checkForAds(message.message)
        if (containsAds) {
          console.log('Сообщение содержит рекламу, пропуск...')
          return
        }

        // Обработка текста AI
        if (message.media) {
          message.message = await requestForAi(message.message)
          await downloadAndSendMedia(myGroup, message)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          message.message = await requestForAi(message.message)
          await bot.telegram.sendMessage(myGroup, message.message)
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщения AI:', error)
        await bot.telegram.sendMessage(
          myGroup,
          'Произошла ошибка при обработке сообщения AI.'
        )
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

  return () => {
    currentHandlers.forEach(({ handler, event }) =>
      client.removeEventHandler(handler, event)
    )
    console.log('Прекращено наблюдение за новыми сообщениями с обработкой AI.')
  }
}

// Функция для получения непрочитанных сообщений
export async function getUnreadMessages(channelId, limit = 1) {
  if (!client.connected) await client.connect()

  const dialogs = await client.getDialogs({})
  const channel = dialogs.find(
    (d) =>
      d.entity.id === parseInt(channelId) || d.entity.username === channelId
  )

  if (channel) {
    return await client.getMessages(channel.entity, { limit })
  } else {
    console.log('Канал или группа не найдены')
    return 'Канал или группа не найдены'
  }
}
