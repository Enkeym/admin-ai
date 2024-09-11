import axios from 'axios'
import qs from 'qs'
import https from 'https'
import { v4 as uuidv4 } from 'uuid'
import { gigaAuth, gigaScope } from '../config.js'

let cachedToken = null
let tokenExpiresAt = null

// Функция для получения токена доступа
async function getToken() {
  if (cachedToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
    return { accessToken: cachedToken, expiresAt: tokenExpiresAt }
  }

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
    if (
      response.data &&
      response.data.access_token &&
      response.data.expires_at
    ) {
      const { access_token: accessToken, expires_at: expiresAt } = response.data
      cachedToken = accessToken
      tokenExpiresAt = new Date(expiresAt * 1000)
      return { accessToken, expiresAt: tokenExpiresAt }
    } else {
      throw new Error(
        'Не удалось получить access_token или expires_at из ответа'
      )
    }
  } catch (error) {
    console.error(
      'Ошибка при получении токена:',
      error.response ? error.response.data : error.message
    )
    throw error
  }
}

// Функция для взаимодействия с GigaChat API
async function giga(content = '', system = '') {
  try {
    let token = await getToken()

    const messages = []
    if (system) {
      messages.push({ role: 'system', content: system })
    }

    const data = JSON.stringify({
      model: 'GigaChat',
      messages: messages.concat([{ role: 'user', content }]),
      temperature: 0.2,
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
    if (
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message
    ) {
      return response.data.choices[0].message.content
    } else {
      throw new Error('Не удалось получить корректный ответ от GigaChat API')
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Токен истек, получаем новый токен...')
      cachedToken = null
      try {
        const token = await getToken()
        return await giga(content, system)
      } catch (err) {
        console.error(
          'Не удалось получить новый токен или повторить запрос:',
          err.message
        )
        throw err
      }
    } else {
      console.error(
        'Ошибка в функции giga:',
        error.response ? error.response.data : error.message
      )
      throw error
    }
  }
}

// Функция для проверки наличия рекламы в тексте
async function checkForAds(text) {
  const prompt = `
    Пожалуйста, внимательно проанализируй следующее сообщение и определи, содержит ли оно рекламу. 
    Под рекламой понимается любое сообщение, которое:
    - Прямо предлагает покупку товаров или услуг.
    - Содержит ссылки на коммерческие сайты или продукты.
    - Включает упоминания брендов или компаний в контексте их продвижения.
    - Пытается убедить пользователя совершить какое-либо действие, связанное с покупкой или подпиской.

    Если реклама обнаружена, ответь "Да". Если рекламы нет, ответь "Нет".

    Сообщение для анализа:
    "${text}"
  `

  try {
    return await giga(prompt, 'Определение рекламы в тексте сообщения')
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Токен истек при проверке рекламы, получаем новый...')
      return await checkForAds(text)
    } else {
      console.error(
        'Ошибка при проверке рекламы:',
        error.response ? error.response.data : error.message
      )
      throw error
    }
  }
}

// Функция для обработки политического контента
async function requestForAi(text) {
  const prompt = `
  Перепиши следующий текст, сохранив его смысл полностью, но заменив некоторые слова синонимами. Не добавляй новую информацию и не повторяй содержание текста.
  
  Исходный текст: ${text}

  Пожалуйста, просто перепиши текст, не добавляя лишних деталей.
  `

  try {
    return await giga(prompt)
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Токен истек, получаем новый токен...')
      return await requestForAi(text)
    } else {
      console.error('Ошибка при обработке контента:', error.message)
      throw error
    }
  }
}

export { giga, checkForAds, requestForAi }
