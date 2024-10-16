import axios from 'axios'
import https from 'https'
import pLimit from 'p-limit'
import qs from 'qs'
import { v4 as uuidv4 } from 'uuid'
import { gigaAuth, gigaScope } from '../config.js'
import { containsAiErrorMessage } from '../utils/aiChecker.js'
import { containsAdContent } from '../utils/filterChecker.js'
import { logWithTimestamp } from '../utils/logger.js'

// Функция для получения токена доступа без кэширования
async function getToken() {
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
    if (response.data && response.data.access_token) {
      return { accessToken: response.data.access_token }
    } else {
      throw new Error('Не удалось получить access_token')
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
      logWithTimestamp(
        'Слишком много запросов. Ожидание перед повторной попыткой...',
        'warn'
      )
      await delay(5000)
      return await giga(content, system, retryCount - 1)
    } else if (error.response && error.response.status === 401) {
      logWithTimestamp('Токен истек, получаем новый токен...', 'warn')
      return await giga(content, system, retryCount - 1)
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
  // Сначала выполняем проверку с помощью фильтрации без ИИ
  let containsAds = containsAdContent(text)

  // Если реклама найдена на этапе без ИИ, сразу возвращаем результат
  if (containsAds === 'Да') {
    return containsAds
  }

  // Проверяем сообщение на ошибки ИИ
  if (containsAiErrorMessage(text)) {
    logWithTimestamp('Сообщение содержит чувствительную информацию.', 'warn')
    return 'Да'
  }

  // Если не найдено рекламное содержание и нет ошибок ИИ, обращаемся к ИИ
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
    const result = await giga(prompt, 'Определение рекламы в тексте сообщения')
    return result
  } catch (error) {
    logWithTimestamp(
      'Ошибка при проверке рекламы через AI: ' + error.message,
      'error'
    )
    throw error
  }
}

const limit = pLimit(5)

async function processMessagesInParallel(messages) {
  try {
    const processedMessages = await Promise.all(
      messages.map((message) =>
        limit(async () => {
          return await giga(message)
        })
      )
    )
    logWithTimestamp(
      'Все сообщения обработаны с ограничением параллельности.',
      'info'
    )
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
  Перепиши текст ниже, изменив каждое предложение. Сохрани основной смысл, но переформулируй так, чтобы текст выглядел полностью уникальным. Используй синонимы для большинства слов и изменяй структуру предложений. Избегай точного повторения фраз из исходного текста.

  Удали все упоминания о людях, местах, городах, компаниях, источниках, корреспондентах, веб-сайтах и социальных сетях. Убери любые ссылки на каналы или другие медиа.

  Сделай текст существенно отличающимся от исходного, используя следующие подходы:
  - Замени почти каждое слово на синоним.
  - Измени длину предложений.
  - Перестрой структуру предложений, используя другие синтаксические конструкции.

  Исходный текст: "${text}"

  Твоя задача — переписать текст так, чтобы он выглядел абсолютно новым, сохраняя только общий смысл. Замени большинство слов и полностью измени структуру предложений, чтобы результат сильно отличался от оригинала.
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
