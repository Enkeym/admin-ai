import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import readline from 'readline'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { apiHash, apiId } from './config.js'
import dotenv from 'dotenv'

dotenv.config()

const stringSession = new StringSession(process.env.TG_SESSIONS || '')

// Получаем __filename и __dirname для модуля ES6
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Проверка значений API ID и API Hash
if (!apiId || !apiHash) {
  throw new Error(
    'API ID и Hash не могут быть пустыми или неопределёнными. Проверьте файл config.js.'
  )
}

;(async () => {
  console.log('Загружаем интерактивный пример...')
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5
  })

  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question('Пожалуйста, введите свой номер: ', resolve)
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question('Пожалуйста, введите свой пароль: ', resolve)
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question('Пожалуйста, введите код, который вы получили: ', resolve)
      ),
    onError: (err) => console.log(err)
  })

  console.log('Вы должны быть подключены.')

  const sessionString = client.session.save()
  console.log(sessionString)

  // Оборачиваем sessionString в кавычки и записываем в файл .env без изменения содержимого
  const envPath = path.join(__dirname, '.env')
  fs.writeFileSync(envPath, `TG_SESSIONS='${sessionString}'\n`, { flag: 'a' })

  await client.sendMessage('me', { message: 'Сессия сохранена!' })

  rl.close()
})()
