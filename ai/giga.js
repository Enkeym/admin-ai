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

// Вспомогательная функция для задержки
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Функция для взаимодействия с GigaChat API с обработкой ошибки 429
async function giga(content = '', system = '', retryCount = 3) {
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
      return response.data.choices[0].message.content
    } else {
      throw new Error('Не удалось получить корректный ответ от GigaChat API')
    }
  } catch (error) {
    if (error.response && error.response.status === 429 && retryCount > 0) {
      console.log(
        'Слишком много запросов. Ожидание перед повторной попыткой...'
      )
      await delay(5000)
      return await giga(content, system, retryCount - 1)
    } else if (error.response && error.response.status === 401) {
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
  const urlPattern = /https?:\/\/[^\s]+/g
  const subscriptionPattern =
    /подпишитесь|присоединяйтесь|канал|группа|чат|следуйте|акция|скидка|предложение|купить|покупка|заказ|доставка|дешевле|выгодно|продажа|продаем|помощь|дарите/i
  const mentionPattern = /@\w+/g
  const callToActionPattern =
    /присоединяйтесь|сделайте заказ|поддержите|приносите|внесите вклад|помогите|призываю|присоединиться/i
  const charityPattern =
    /благотворительность|помощь детям|гуманитарная миссия|гуманитарная помощь|пожертвования|сбор подарков|санаторий|дети/i

  // Проверка наличия ссылок
  if (urlPattern.test(text)) {
    console.log('Обнаружена ссылка, сообщение классифицировано как реклама.')
    return 'Да'
  }

  // Проверка на упоминание каналов, акций или призыва к действию
  if (subscriptionPattern.test(text) || callToActionPattern.test(text)) {
    console.log(
      'Обнаружены рекламные термины или призыв к действию, сообщение классифицировано как реклама.'
    )
    return 'Да'
  }

  // Проверка на наличие упоминаний через @
  if (mentionPattern.test(text)) {
    console.log(
      'Обнаружено упоминание аккаунта, сообщение классифицировано как реклама.'
    )
    return 'Да'
  }

  // Проверка на благотворительность
  if (charityPattern.test(text)) {
    console.log(
      'Обнаружены благотворительные термины, сообщение не классифицировано как реклама.'
    )
    return 'Нет'
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

  try {
    return await giga(prompt, 'Определение рекламы в тексте сообщения')
  } catch (error) {
    console.error(
      'Ошибка при проверке рекламы:',
      error.response ? error.response.data : error.message
    )
    throw error
  }
}

// Функция для обработки политического контента
async function requestForAi(text) {
  const prompt = `
  Перепиши текст ниже, сохранив его смысл и структуру, но заменив некоторые слова на синонимы. Не добавляй никаких новых деталей, объяснений или повторений.

  Убери любые названия источников и ссылки на веб-страницы, если они присутствуют в тексте.
  
  Исходный текст: ${text}

  Перепиши текст только с минимальными изменениями.
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
