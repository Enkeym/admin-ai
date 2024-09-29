import axios from 'axios'
import https from 'https'
import qs from 'qs'
import { v4 as uuidv4 } from 'uuid'
import { gigaAuth, gigaScope } from '../config.js'
import { containsAiErrorMessage } from '../utils/aiChecker.js'
import { logWithTimestamp } from '../utils/logger.js'

let cachedToken = null
let tokenExpiresAt = null
const responseCache = new Map()
let tokenUpdateInterval = null

// Функция для получения токена доступа
async function getToken() {
  if (cachedToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
    return { accessToken: cachedToken, expiresAt: tokenExpiresAt }
  }

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    timeout: 30000,
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
      scheduleTokenUpdate()
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

// Планирование автоматического обновления токена
function scheduleTokenUpdate() {
  if (tokenUpdateInterval) clearTimeout(tokenUpdateInterval)
  const timeUntilExpiry = tokenExpiresAt - Date.now()

  if (timeUntilExpiry > 0) {
    tokenUpdateInterval = setTimeout(async () => {
      await getToken()
      scheduleTokenUpdate() // Перепланируем следующий апдейт
    }, Math.min(timeUntilExpiry - 60000, 2147483647)) // Устанавливаем безопасный тайм-аут
  }
}

// Вспомогательная функция для задержки
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Проверка кеша ответов
async function checkResponseCache(text) {
  const cachedResponse = responseCache.get(text)
  if (cachedResponse) {
    logWithTimestamp('Ответ взят из кеша.', 'info')
    return cachedResponse
  }
  return null
}

// Сохранение ответа в кеш
async function saveResponseToCache(text, response) {
  responseCache.set(text, response)
  logWithTimestamp('Ответ сохранен в кеш.', 'info')
}

// Очистка кеша ответов AI
export function clearResponseCache() {
  responseCache.clear()
  logWithTimestamp('Кеш ответов AI очищен перед завершением работы.', 'info')
}

// Функция для взаимодействия с GigaChat API с обработкой ошибки 429
async function giga(content = '', system = '', retryCount = 3) {
  const cachedResponse = await checkResponseCache(content)
  if (cachedResponse) return cachedResponse

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
      max_tokens: 1024,
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
      const aiResponse = response.data.choices[0].message.content
      await saveResponseToCache(content, aiResponse) // Сохраняем ответ в кеш
      return aiResponse
    } else {
      throw new Error('Не удалось получить корректный ответ от GigaChat API')
    }
  } catch (error) {
    if (error.response && error.response.status === 429 && retryCount > 0) {
      logWithTimestamp(
        'Слишком много запросов. Ожидание перед повторной попыткой...',
        'warn'
      )
      await delay(5000)
      return await giga(content, system, retryCount - 1)
    } else if (error.response && error.response.status === 401) {
      logWithTimestamp('Токен истек, получаем новый токен...', 'warn')
      cachedToken = null
      try {
        const token = await getToken()
        return await giga(content, system)
      } catch (err) {
        logWithTimestamp(
          'Не удалось получить новый токен или повторить запрос: ' +
            err.message,
          'error'
        )
        throw err
      }
    } else {
      logWithTimestamp(
        'Ошибка в функции giga: ' +
          (error.response ? error.response.data : error.message),
        'error'
      )
      throw error
    }
  }
}

// Функция для проверки наличия рекламы в тексте
async function checkForAds(text) {
  const urlPattern = /https?:\/\/[^\s]+/g
  const subscriptionPattern =
    /подписаться|подпишитесь|присоединяйтесь|канал|группа|акция|скидка|предложение|купить|покупка|заказ|доставка|дешевле|выгодно|продажа|продаем|помощь|дарите/i

  const mentionPattern = /@\w+/g
  const callToActionPattern =
    /присоединяйтесь|сделайте заказ|поддержите|приносите|внесите вклад|помогите|призываю/i
  const charityPattern =
    /благотворительность|помощь детям|гуманитарная миссия|пожертвования|сбор подарков|санаторий|дети/i

  // Проверка наличия ссылок
  if (urlPattern.test(text)) {
    const matchedWord = text.match(urlPattern)
    logWithTimestamp(
      `Обнаружена ссылка (${matchedWord}), сообщение классифицировано как реклама. Сработал паттерн: URL.`,
      'info'
    )
    return 'Да'
  }

  // Проверка на упоминание каналов, акций или призыва к действию
  if (subscriptionPattern.test(text)) {
    const matchedWord = text.match(subscriptionPattern)
    logWithTimestamp(
      `Обнаружены рекламные термины (${matchedWord}), сообщение классифицировано как реклама. Сработал паттерн: Subscription.`,
      'info'
    )
    return 'Да'
  }

  // Проверка на наличие упоминаний через @
  if (mentionPattern.test(text)) {
    const matchedWord = text.match(mentionPattern)
    logWithTimestamp(
      `Обнаружено упоминание аккаунта (${matchedWord}), сообщение классифицировано как реклама. Сработал паттерн: Mention (@).`,
      'info'
    )
    return 'Да'
  }

  // Проверка на благотворительность
  if (charityPattern.test(text)) {
    const matchedWord = text.match(charityPattern)
    logWithTimestamp(
      `Обнаружены благотворительные термины (${matchedWord}), сообщение не классифицировано как реклама. Сработал паттерн: Charity.`,
      'info'
    )
    return 'Нет'
  }

  // Проверка сообщения на ошибки и паттерны
  if (containsAiErrorMessage(text)) {
    logWithTimestamp('Сообщение содержит чувствительную информацию.', 'warn')
    return 'Да'
  }

  // AI-проверка содержания текста
  const prompt = `
    Пожалуйста, проанализируй следующее сообщение и определи, содержит ли оно прямую или косвенную рекламу. Под рекламой понимается любое сообщение, которое:
    - Призывает к покупке, заказу или подписке.
    - Включает в себя ссылки или контактные данные для связи.
    - Содержит прямые призывы к действию (например, "сделайте заказ", "подпишитесь", "приходите", "приносите").
    - Продвигает коммерческие, благотворительные или другие организации и их деятельность.

    Сообщение для анализа:
    "${text}"

    Если сообщение содержит рекламу, ответь "Да". Если рекламы нет, ответь "Нет".
  `

  logWithTimestamp(`Текст, отправляемый на AI-проверку: ${text}`, 'info')

  try {
    const result = await giga(prompt, 'Определение рекламы в тексте сообщения')
    logWithTimestamp(`Результат AI-проверки: ${result}`, 'info')
    return result
  } catch (error) {
    logWithTimestamp(
      'Ошибка при проверке рекламы через AI: ' + error.message,
      'error'
    )
    throw error
  }
}

// Параллельная обработка сообщений
async function processMessagesInParallel(messages) {
  try {
    const processedMessages = await Promise.all(
      messages.map(async (message) => {
        return await giga(message)
      })
    )
    logWithTimestamp('Все сообщения обработаны параллельно.', 'info')
    return processedMessages
  } catch (error) {
    logWithTimestamp(
      'Ошибка при параллельной обработке сообщений: ' + error.message,
      'error'
    )
    throw error
  }
}

// Функция для обработки политического контента
async function requestForAi(text) {
  const prompt = `
  Перепиши текст ниже, сохранив его общий смысл и структуру, но замени некоторые слова на синонимы. Убери все названия каналов, источников и любые ссылки на веб-страницы или социальные сети, если они присутствуют в тексте. Также убери любые упоминания через '@' или упоминания каналов, хештегов, и названий групп.
  
  Исходный текст: ${text}
  
  Перепиши текст только с минимальными изменениями, без добавления новых деталей, объяснений или повторений.
  `

  try {
    return await giga(prompt)
  } catch (error) {
    if (error.response && error.response.status === 401) {
      logWithTimestamp('Токен истек, получаем новый токен...', 'warn')
      return await requestForAi(text)
    } else {
      logWithTimestamp(
        'Ошибка при обработке контента: ' + error.message,
        'error'
      )
      throw error
    }
  }
}

export { checkForAds, giga, processMessagesInParallel, requestForAi }
