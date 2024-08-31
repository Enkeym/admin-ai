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
async function requestForAi(text, context = 'Новости') {
  const prompt = `
    Ты - профессиональный редактор и контент-менеджер с большим опытом создания уникального контента для персональных Telegram-каналов. Твоя задача - переписать текст ниже, чтобы он был максимально персонализированным и интересным для конкретной аудитории. 

    Основные требования:
    - Сделай текст личным и дружелюбным, будто ты общаешься напрямую с каждым подписчиком.
    - Используй теплые, непринужденные и доверительные формулировки, чтобы создать чувство близости и взаимопонимания.
    - Добавь элементы юмора или интерактивные вставки, если это уместно, чтобы сделать текст более живым.
    - Подчеркни уникальность и эксклюзивность контента, чтобы подписчики чувствовали себя особенными.
    - Добавляй эмодзи для усиления эмоционального отклика, но не перебарщивай - важен баланс.
    - Избегай слишком формального или официального тона.

    Контекст: ${context}
    
    Исходный текст:
    ${text}
    
    Перепиши текст так, как будто ты общаешься со своей аудиторией в личном Telegram-канале, где каждый подписчик чувствует особую связь с тобой. Добавь в текст нотки индивидуальности и искренности.`

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
