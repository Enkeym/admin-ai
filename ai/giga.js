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
    const { access_token: accessToken, expires_at: expiresAt } = response.data
    cachedToken = accessToken
    tokenExpiresAt = new Date(expiresAt * 1000)
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
    return response.includes('Да')
  } catch (error) {
    console.error('Ошибка при проверке рекламы:', error)
    throw error
  }
}

// Функция для обработки политического контента
async function requestForAi(text, context = 'Политика') {
  const prompt = `
  Перепиши текст ниже в стиле официального заявления или новостного репортажа, подобного тому, как в новостях передаются высказывания политиков или официальных лиц.

Рекомендации:

1. Сохрани формальный и нейтральный тон, характерный для новостных агентств или официальных заявлений.
2. Чётко укажи источник цитаты, используя профессиональный стиль, избегая неформальной лексики.
3. Структурируй текст так, чтобы сначала шла важная информация (кто, что сказал), затем — контекст или цитата.
4. Включи прямые цитаты, выделяя их в тексте, и следи за правильной передачей сути высказанных мнений.
5. Сделай текст лаконичным и информативным, без лишних эмоций и суждений.

Контекст: ${context}

Исходный текст: ${text}

Перепиши текст так, словно это сообщение от новостного агентства или официальный пресс-релиз, сохраняя объективность и формальный стиль.`

  try {
    const response = await giga(
      prompt,
      `Обработка контента для группы: ${context}`
    )
    return response
  } catch (error) {
    console.error('Ошибка при обработке контента для группы:', error)
    throw error
  }
}

export { giga, checkForAds, requestForAi }
