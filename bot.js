import { Telegraf } from 'telegraf'
import { tgToken, myGroup } from './config.js'
import {
  downloadAndSendMedia,
  getUnreadMessages,
  watchNewMessages,
  watchNewMessagesAi,
  validateChannelOrGroup
} from './mediaHandler.js'

export const bot = new Telegraf(tgToken)
let currentProcess = null

async function notifyProcessStopped(ctx) {
  await ctx.reply('Процесс был остановлен.')
}

bot.command('watch', async (ctx) => {
  if (currentProcess) {
    currentProcess()
    await notifyProcessStopped(ctx)
  }
  const args = ctx.message.text.split(' ').slice(1)
  if (args.length > 0) {
    const chat = await validateChannelOrGroup(args[0], ctx)
    if (!chat) return

    try {
      currentProcess = await watchNewMessages(args, ctx)
      ctx.reply(
        `Наблюдение за новыми сообщениями из каналов/групп: ${args.join(', ')}`
      )
    } catch (error) {
      console.error('Ошибка в процессе /watch:', error)
      await notifyProcessStopped(ctx)
    }
  } else {
    ctx.reply('Вы не указали ID каналов/групп')
  }
})

bot.command('watchAi', async (ctx) => {
  if (currentProcess) {
    currentProcess()
    await notifyProcessStopped(ctx)
  }
  const args = ctx.message.text.split(' ').slice(1)

  if (args.length > 0) {
    const chat = await validateChannelOrGroup(args[0], ctx)
    if (!chat) return

    try {
      currentProcess = await watchNewMessagesAi(args, ctx)
      ctx.reply(
        `Наблюдение с обработкой AI за новыми сообщениями из каналов/групп: ${args.join(
          ', '
        )}`
      )
    } catch (error) {
      console.error('Ошибка в процессе /watchAi:', error)
      await notifyProcessStopped(ctx)
    }
  } else {
    ctx.reply('Вы не указали ID каналов/групп')
  }
})

bot.command('sum', async (ctx) => {
  if (currentProcess) {
    currentProcess()
    await notifyProcessStopped(ctx)
  }
  const args = ctx.message.text.split(' ')
  const channelId = args[1]
  const count = parseInt(args[2], 10) || 1
  const interval = parseInt(args[3], 10) || 5

  if (!channelId) return ctx.reply('Вы не указали ID канала')

  const chat = await validateChannelOrGroup(channelId, ctx)
  if (!chat) return

  try {
    let messages = await getUnreadMessages(channelId, count, ctx)
    if (Array.isArray(messages) && messages.length > 0) {
      messages = messages.reverse()
      await Promise.all(
        messages.map((message, i) => {
          return new Promise((resolve) => {
            setTimeout(async () => {
              if (message.media) {
                await downloadAndSendMedia(myGroup, message, ctx)
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
    console.error('Ошибка в процессе /sum:', error)
    await notifyProcessStopped(ctx)
  }
})

bot.command('start', (ctx) => {
  const startMessage = `
Привет! Я бот, который может выполнять следующие действия:

1. /watch [ID канала/группы] - Начать наблюдение за новыми сообщениями из указанного канала или группы.
2. /watchAi [ID канала/группы] - Начать наблюдение за новыми сообщениями с обработкой AI из указанного канала или группы.
3. /sum [ID канала/группы] [количество] [интервал] - Получить непрочитанные сообщения из указанного канала или группы, отправляя их с заданным интервалом.
4. /stop - Остановить текущий процесс наблюдения за сообщениями.

Просто введите нужную команду для начала работы. Если у вас есть вопросы, не стесняйтесь задавать их! @Enkeym
  `
  ctx.reply(startMessage)
})

bot.command('stop', (ctx) => {
  if (currentProcess) {
    currentProcess()
    currentProcess = null
    ctx.reply('Текущий процесс остановлен.')
  } else {
    ctx.reply('Нет активного процесса наблюдения.')
  }
})

export default bot
