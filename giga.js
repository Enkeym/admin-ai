import axios from 'axios'
import qs from 'qs'
import https from 'https'
import { v4 as uuidv4 } from 'uuid'
import { gigaAuth, gigaScope } from './config.js'

// Функция для получения токена доступа
async function getToken() {
  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: uuidv4(),
      Authorization: `Basic ${gigaAuth}`
    },
    data: qs.stringify({
      scope: gigaScope
    }),
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  }

  try {
    const response = await axios(config)
    const { access_token: accessToken, expires_at: expiresAt } = response.data
    return { accessToken, expiresAt }
  } catch (error) {
    console.error('Ошибка при получении токена:', error)
    throw error
  }
}

// Функция для взаимодействия с GigaChat API
async function giga(content = '', system = '') {
  try {
    const token = await getToken()

    const messages = []
    if (system) {
      messages.push({ role: 'system', content: system })
    }

    const data = JSON.stringify({
      model: 'GigaChat',
      messages: messages.concat([
        {
          role: 'user',
          content
        }
      ]),
      temperature: 1,
      top_p: 0.1,
      n: 1,
      stream: false,
      max_tokens: 512,
      repetition_penalty: 1,
      update_interval: 0
    })

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token.accessToken}`
      },
      data,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    }

    const response = await axios(config)
    const message = response.data.choices[0].message
    return message.content
  } catch (error) {
    console.error('Ошибка в функции giga:', error)
    throw error
  }
}

// Функция для проверки наличия рекламы в тексте
async function checkForAds(text) {
  const prompt = `Пожалуйста, проанализируйте следующее сообщение и определите, содержит ли оно рекламу. Если реклама обнаружена, ответьте "Да", иначе "Нет":\n\n"${text}"`

  try {
    const response = await giga(
      prompt,
      'Определение рекламы в тексте сообщения'
    )
    return response.includes('Да')
  } catch (error) {
    console.error('Ошибка при проверке рекламы:', error)
    throw error
  }
}

// Функция для обработки политического контента
async function processPoliticalContent(text) {
  const prompt = `
    Вы - высококвалифицированный редактор. У вас есть задача - переработать текст, связанный с политикой. 
    1. Уберите всю рекламу.
    2. Перепишите текст, чтобы он звучал более индивидуально и ярко.
    3. Убедитесь, что текст остается информативным и нейтральным.
    
    Вот исходный текст:
    "${text}"
    
    Пожалуйста, предоставьте переработанный текст.`

  try {
    const response = await giga(prompt, 'Обработка политических сообщений')
    return response
  } catch (error) {
    console.error('Ошибка при обработке политических сообщений:', error)
    throw error
  }
}

export { giga, checkForAds, processPoliticalContent }
