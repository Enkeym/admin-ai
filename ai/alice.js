import axios from 'axios'
import { yandexIamToken, yandexFolderId } from '../config.js'

// Функция для взаимодействия с YandexGPT API
async function yandexGPT(content = '', system = '') {
  const data = {
    modelUri: `gpt://${yandexFolderId}/yandexgpt-lite`,
    completionOptions: {
      stream: false,
      temperature: 0.6,
      maxTokens: 2000
    },
    messages: [
      {
        role: 'system',
        text: system || 'Анализ текста'
      },
      {
        role: 'user',
        text: content
      }
    ]
  }

  return await makeRequest('completion', data)
}

async function makeRequest(endpoint, data) {
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const config = {
        method: 'post',
        url: `https://llm.api.cloud.yandex.net/foundationModels/v1/${endpoint}`,
        headers: {
          Authorization: `Bearer ${yandexIamToken}`,
          'x-folder-id': yandexFolderId,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(data)
      }

      const response = await axios(config)
      return response.data.result.alternatives[0].message.text
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(
          'Превышен лимит запросов, ожидание перед повторной попыткой...'
        )
        await sleep(5000) // Ожидание 5 секунд перед повторной попыткой
        attempt++
      } else {
        console.error(
          'Ошибка в запросе:',
          error.response?.data || error.message
        )
        throw error
      }
    }
  }
  throw new Error('Превышено количество попыток выполнения запроса.')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkForAds(text) {
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

  return await yandexGPT(prompt, '')
}

async function requestForAi(text, context = 'Политические новости') {
  const prompt = `
    Ты - профессиональный редактор и контент-менеджер с богатым опытом ведения Telegram-каналов. Твоя задача - переписать текст ниже так, чтобы он стал более привлекательным и интересным для читателей. 
    Убедись, что текст соответствует тематике и стилю канала, делает сообщение понятным, цепляющим и легко читаемым.
    
    Основные требования:
    - Сделай текст динамичным и эмоционально насыщенным.
    - Убери любую рекламу или скрытые рекламные сообщения, если они присутствуют, оставив только важные и полезные сведения.
    - Добавь выразительные формулировки и акценты, чтобы текст выделялся среди других постов.
    - Применяй эмодзи в зависимости от содержания, чтобы усилить впечатление и добавить эмоциональную окраску.
    - Используй простой и понятный язык, избегай сложных конструкций.

    Контекст: ${context}
    
    Исходный текст:
    ${text}
    
    Напиши текст так, как будто ты ведешь группу в Telegram, и твоя цель - удержать внимание аудитории и вызвать у неё интерес. Убери лишние кавычки и ненужные символы, добавь дружелюбный и доверительный тон.`

  try {
    const response = await yandexGPT(
      prompt,
      `Обработка контента для группы: ${context}`
    )
    return response
  } catch (error) {
    console.error('Ошибка при обработке контента для группы:', error)
    throw error
  }
}

export { yandexGPT, checkForAds, requestForAi }
