import fs from 'fs'
import path from 'path'
import { bot } from './bot.js'
import { client } from './telegramClient.js'
import { fileURLToPath } from 'url'
import { NewMessage } from 'telegram/events/NewMessage.js'
import { myGroup } from './config.js'
import { checkForAds, requestForAi } from './ai/alice.js'

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
async function sendMessageToChat(chatId, message) {
  if (!(await checkChatAccess(chatId))) {
    console.error(
      `Бот не имеет доступа к чату с ID ${chatId}. Сообщение не отправлено.`
    )
    return
  }

  try {
    console.log(`Попытка отправки сообщения в чат ${chatId}`)
    await bot.telegram.sendMessage(chatId, message)
    console.log('Сообщение успешно отправлено в чат.')
  } catch (error) {
    console.error('Ошибка при отправке сообщения:', error)
  }
}

// Функция для скачивания и отправки медиа
export async function downloadAndSendMedia(chatId, message) {
  if (!(await checkChatAccess(chatId))) {
    console.error(
      `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    )
    return
  }

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
  if (!(await checkChatAccess(chatId))) {
    console.error(
      `Бот не имеет доступа к чату с ID ${chatId}. Медиа не отправлено.`
    )
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
    console.error('Ошибка при отправке медиа:', error)
  }
}

// Функция для наблюдения за новыми сообщениями
export async function watchNewMessages(channelIds) {
  if (!client.connected) await client.connect()

  const currentHandlers = []

  for (const channelId of channelIds) {
    const handler = async (event) => {
      try {
        const message = event.message
        if (message.media) {
          await downloadAndSendMedia(myGroup, message)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await sendMessageToChat(myGroup, message.message)
        }
      } catch (error) {
        console.error('Ошибка при обработке нового сообщения:', error)
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
      try {
        const message = event.message

        const containsAds = await checkForAds(message.message)
        if (containsAds) {
          console.log('Сообщение содержит рекламу, пропуск...')
          return
        }

        // Обработка текста AI
        let processedMessage = await requestForAi(message.message)

        const aiErrorMessages = [
          'К сожалению, иногда генеративные языковые модели могут создавать некорректные ответы...'
          // ... (остальные сообщения)
        ]

        if (
          aiErrorMessages.some((errorMsg) =>
            processedMessage.includes(errorMsg)
          )
        ) {
          console.log(
            'Сообщение содержит предупреждение ИИ, отправка без обработки AI'
          )
          processedMessage = message.message
        }

        if (message.media) {
          message.message = processedMessage
          await downloadAndSendMedia(myGroup, message)
        } else {
          console.log('Медиа не найдено, отправка текстового сообщения')
          await sendMessageToChat(myGroup, processedMessage)
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщения AI:', error)
        await sendMessageToChat(
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
