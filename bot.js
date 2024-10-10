import { Telegraf } from 'telegraf'
import { myGroup, tgToken } from './config.js'
import {
  downloadAndSendMedia,
  getUnreadMessages,
  validateChannelOrGroup,
  watchNewMessages,
  watchNewMessagesAi
} from './mediaHandler.js'
import { clearState, updateState } from './stateManager.js'

export const bot = new Telegraf(tgToken)
let currentProcess = null

// Функция для остановки текущего процесса
async function stopCurrentProcess(ctx) {
  if (currentProcess) {
    await currentProcess()
    await ctx.reply('Текущий процесс был остановлен.')
    currentProcess = null
    clearState()
  }
}

// Команда для наблюдения за новыми сообщениями
bot.command('watch', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1)
  if (args.length === 0) {
    return ctx.reply('Вы не указали ID каналов/групп')
  }

  const chat = await validateChannelOrGroup(args[0], ctx)
  if (!chat) return

  await stopCurrentProcess(ctx)
  clearState()

  try {
    currentProcess = await watchNewMessages(args, ctx)
    ctx.reply(
      `Наблюдение за новыми сообщениями из каналов/групп: ${args.join(', ')}`
    )
    updateState('watch', args)
  } catch (error) {
    console.error('Ошибка в процессе /watch:', error)
    await stopCurrentProcess(ctx)
  }
})

// Команда для наблюдения за новыми сообщениями с обработкой AI
bot.command('watchAi', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1)
  if (args.length === 0) {
    return ctx.reply('Вы не указали ID каналов/групп')
  }

  const chat = await validateChannelOrGroup(args[0], ctx)
  if (!chat) return

  await stopCurrentProcess(ctx)
  clearState()

  try {
    currentProcess = await watchNewMessagesAi(args, ctx)
    ctx.reply(
      `Наблюдение с обработкой AI за новыми сообщениями из каналов/групп: ${args.join(
        ', '
      )}`
    )
    updateState('watchAi', args)
  } catch (error) {
    console.error('Ошибка в процессе /watchAi:', error)
    await stopCurrentProcess(ctx)
  }
})

// Команда для получения непрочитанных сообщений
bot.command('sum', async (ctx) => {
  const args = ctx.message.text.split(' ')
  const channelId = args[1]
  const count = parseInt(args[2], 10) || 1
  const interval = parseInt(args[3], 10) || 5

  if (!channelId) return ctx.reply('Вы не указали ID канала')

  const chat = await validateChannelOrGroup(channelId, ctx)
  if (!chat) return

  await stopCurrentProcess(ctx)

  try {
    let messages = await getUnreadMessages(channelId, count, ctx)
    if (Array.isArray(messages) && messages.length > 0) {
      messages = messages.reverse()

      currentProcess = async () => {
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
      }

      await currentProcess()
      ctx.reply('Все сообщения отправлены.')
    } else {
      ctx.reply('Непрочитанных сообщений не найдено.')
    }
  } catch (error) {
    console.error('Ошибка в процессе /sum:', error)
    await stopCurrentProcess(ctx)
  }
})

// Команда для остановки текущего процесса
bot.command('stop', async (ctx) => {
  if (currentProcess) {
    await currentProcess()
    await ctx.reply('Текущий процесс был остановлен.')
    currentProcess = null
    clearState()
  } else {
    await ctx.reply('Нет активных процессов для остановки.')
  }
})

// Приветственное сообщение бота
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

// Обработка неизвестных команд и обычного текста
bot.on('text', (ctx) => {
  const messageText = ctx.message.text

  // Проверяем, если сообщение начинается с "/"
  if (messageText.startsWith('/')) {
    ctx.reply(
      `Команда "${messageText}" не распознана. Пожалуйста, используйте /start для просмотра доступных команд.`
    )
  } else {
    ctx.reply(
      `Ваше сообщение "${messageText}" не распознано как команда. Используйте /start для просмотра доступных команд.`
    )
  }
})

export default bot
