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
      return { accessToken, expiresAt }
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
    if (response.data && response.data.choices && response.data.choices[0]) {
      const message = response.data.choices[0].message
      return message.content
    } else {
      throw new Error('Не удалось получить корректный ответ от GigaChat API')
    }
  } catch (error) {
    console.error(
      'Ошибка в функции giga:',
      error.response ? error.response.data : error.message
    )
    throw error
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
    const response = await giga(
      prompt,
      'Определение рекламы в тексте сообщения'
    )
    if (response) {
      return response.includes('Да')
    } else {
      throw new Error('GigaChat не вернул корректный ответ')
    }
  } catch (error) {
    console.error(
      'Ошибка при проверке рекламы:',
      error.response ? error.response.data : error.message
    )
    throw error
  }
}

// Функция для обработки политического контента
async function requestForAi(text, context = 'Политика') {
  const prompt = `
  Перепиши текст ниже в стиле новостного репортажа, при этом:

1. Минимально измени формулировки, чтобы сохранить смысл сообщения неизменным. Изменения должны быть настолько незначительными, чтобы основная идея текста осталась полностью сохраненной.
2. Удали все упоминания о подписях, рекламных сообщениях и любых других несвязанных элементах.
3. Убедись, что в тексте не добавляются новые детали, мнения или интерпретации. Текст должен быть максимально точным и соответствовать исходному.
4. Используй нейтральный и формальный тон, характерный для новостных агентств, избегая личных мнений и субъективных оценок.
5. Сделай текст лаконичным и информативным, сохраняя фокус на важной информации.

Контекст: ${context}

Исходный текст: ${text}

Перепиши текст так, чтобы он выглядел как новостная лента, с минимальными изменениями формулировок, сохраняя оригинальный смысл и убирая лишние элементы.`

  try {
    const response = await giga(
      prompt,
      `Обработка контента для группы: ${context}`
    )
    if (response) {
      return response
    } else {
      throw new Error('GigaChat не вернул корректный ответ на запрос')
    }
  } catch (error) {
    console.error(
      'Ошибка при обработке контента для группы:',
      error.response ? error.response.data : error.message
    )
    throw error
  }
}

export { giga, checkForAds, requestForAi }
