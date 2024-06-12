import { bot } from './bot.js'
import { client } from './telegramClient.js'

;(async function run() {
  try {
    if (!client.connected) await client.connect()
    bot.launch()
  } catch (error) {
    console.error(error)
  }
})()
