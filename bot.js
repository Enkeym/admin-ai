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
  const args = ctx.message.text.split(' ').slice(1, 4) 
  if (args.length > 0) {
    currentProcess = await watchNewMessages(args)
    ctx.reply(`Наблюдение за новыми сообщениями из каналов: ${args.join(', ')}`)
  } else {
    ctx.reply('Вы не указали ID каналов')
  }
})

bot.command('watchAi', async (ctx) => {
  if (currentProcess) currentProcess() 
  const args = ctx.message.text.split(' ').slice(1, 4) 
  const aiRequest =
    'Убери рекламу, перепиши текст ярче, добавь тематические стикеры и сделай его более уникальным'
  if (args.length > 0) {
    currentProcess = await watchNewMessagesAi(args, aiRequest)
    ctx.reply(
      `Наблюдение с обработкой AI за новыми сообщениями из каналов: ${args.join(
        ', '
      )}`
    )
  } else {
    ctx.reply('Вы не указали ID каналов')
  }
})

bot.command('sum', async (ctx) => {
  if (currentProcess) currentProcess() 
  const args = ctx.message.text.split(' ')
  const channelId = args[1]
  const countArg = parseInt(args[2], 10)
  const intervalArg = parseInt(args[3], 10)

  const count = isNaN(countArg) ? 1 : countArg
  const interval = isNaN(intervalArg) ? 5 : intervalArg

  if (!channelId) return ctx.reply('Вы не указали ID канала')

  try {
    let messages = await getUnreadMessages(channelId, count)

    if (Array.isArray(messages) && messages.length > 0) {
      messages = messages.reverse()

      for (let i = 0; i < messages.length; i++) {
        setTimeout(async () => {
          const message = messages[i]

          if (message.media && !message.fwdFrom) {
            await downloadAndSendMedia(myGroup, message)
          } else if (!message.media && !message.fwdFrom) {
            console.log('Медиа не найдено, отправка текстового сообщения')
            await bot.telegram.sendMessage(myGroup, message.message)
          } else {
            console.log('Сообщение переслано или не содержит медиа, пропуск...')
          }
        }, i * interval * 1000)
      }
    } else {
      ctx.reply('Непрочитанных сообщений не найдено')
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('File not found:', error.path)
    } else {
      console.error('An error occurred:', error)
    }
  }
})
