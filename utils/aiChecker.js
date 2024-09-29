import { additionalPatterns, aiErrorMessages } from './aiErrorMessages.js'
import { logWithTimestamp } from './logger.js'

export function containsAiErrorMessage(response) {
  const normalizedResponse = response.trim().toLowerCase()

  // Проверяем на ошибки ИИ
  const isAiErrorMessage = aiErrorMessages.some((errorMsg) =>
    normalizedResponse.includes(errorMsg.toLowerCase())
  )
  if (isAiErrorMessage) {
    logWithTimestamp(
      'Сообщение полностью совпадает с известной ошибкой ИИ.',
      'warn'
    )
    return true
  }

  // Проверяем на дополнительные паттерны
  const containsAdditionalPatterns = additionalPatterns.some((pattern) =>
    new RegExp(pattern, 'i').test(normalizedResponse)
  )
  if (containsAdditionalPatterns) {
    logWithTimestamp(
      'Сообщение содержит чувствительные ключевые слова или шаблоны.',
      'warn'
    )
  }

  return containsAdditionalPatterns
}
