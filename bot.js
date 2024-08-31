import { Telegraf } from 'telegraf'
import { tgToken, myGroup } from './config.js'
import {
  downloadAndSendMedia,
  getUnreadMessages,
  watchNewMessages,
  watchNewMessagesAi
} from './mediaHandler.js'

export const bot = new Telegraf(tgToken)
let currentProcess = null

bot.command('watch', async (ctx) => {
  if (currentProcess) currentProcess()
  const args = ctx.message.text.split(' ').slice(1)
  if (args.length > 0) {
    currentProcess = await watchNewMessages(args)
    ctx.reply(
      `Наблюдение за новыми сообщениями из каналов/групп: ${args.join(', ')}`
    )
  } else {
    ctx.reply('Вы не указали ID каналов/групп')
  }
})

bot.command('watchAi', async (ctx) => {
  if (currentProcess) currentProcess()
  const args = ctx.message.text.split(' ').slice(1)

  if (args.length > 0) {
    currentProcess = await watchNewMessagesAi(args)
    ctx.reply(
      `Наблюдение с обработкой AI за новыми сообщениями из каналов/групп: ${args.join(
        ', '
      )}`
    )
  } else {
    ctx.reply('Вы не указали ID каналов/групп')
  }
})

bot.command('sum', async (ctx) => {
  if (currentProcess) currentProcess()
  const args = ctx.message.text.split(' ')
  const channelId = args[1]
  const count = parseInt(args[2], 10) || 1
  const interval = parseInt(args[3], 10) || 5

  if (!channelId) return ctx.reply('Вы не указали ID канала')

  try {
    let messages = await getUnreadMessages(channelId, count)
    if (Array.isArray(messages) && messages.length > 0) {
      messages = messages.reverse()
      await Promise.all(
        messages.map((message, i) => {
          return new Promise((resolve) => {
            setTimeout(async () => {
              if (message.media) {
                await downloadAndSendMedia(myGroup, message)
              } else {
                console.log('Медиа не найдено, отправка текстового сообщения')
                await bot.telegram.sendMessage(myGroup, message.message)
              }
              resolve()
            }, i * interval * 1000)
          })
        })
      )
      ctx.reply('Все сообщения отправлены.')
    } else {
      ctx.reply('Непрочитанных сообщений не найдено')
    }
  } catch (error) {
    console.error('An error occurred:', error)
    ctx.reply('Произошла ошибка при обработке запроса.')
  }
})
export default bot
