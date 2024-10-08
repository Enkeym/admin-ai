import { logWithTimestamp } from './logger.js'

// ANSI escape codes for red color
const colors = {
  red: '\x1b[31m',
  reset: '\x1b[0m'
}

export function containsAdContent(text) {
  const urlPattern = /https?:\/\/[^\s]+/g
  const subscriptionPattern =
    /подписаться|акция|скидка|предложение|купить|покупка|заказ|доставка|выгодно|продажа|продаем/i
  const mentionPattern = /@\w+/g
  const callToActionPattern =
    /присоединяйтесь|сделайте заказ|поддержите|помогите/i
  const charityPattern =
    /благотворительность|сбор подарков|пожертвования|санаторий|дети/i

  // Проверка наличия ссылок
  const urlMatch = text.match(urlPattern)
  if (urlMatch) {
    logWithTimestamp(
      `Сообщение заблокировано из-за ссылки: "${colors.red}${urlMatch[0]}${colors.reset}"`,
      'info'
    )
    return true
  }

  // Проверка на рекламные термины
  const subscriptionMatch = text.match(subscriptionPattern)
  if (subscriptionMatch) {
    logWithTimestamp(
      `Сообщение заблокировано из-за рекламного термина: "${colors.red}${subscriptionMatch[0]}${colors.reset}"`,
      'info'
    )
    return true
  }

  // Проверка на наличие упоминаний через @
  const mentionMatch = text.match(mentionPattern)
  if (mentionMatch) {
    logWithTimestamp(
      `Сообщение заблокировано из-за упоминания аккаунта: "${colors.red}${mentionMatch[0]}${colors.reset}"`,
      'info'
    )
    return true
  }

  // Проверка на призывы к действию
  const callToActionMatch = text.match(callToActionPattern)
  if (callToActionMatch) {
    logWithTimestamp(
      `Сообщение заблокировано из-за призыва к действию: "${colors.red}${callToActionMatch[0]}${colors.reset}"`,
      'info'
    )
    return true
  }

  // Проверка на благотворительные термины (не считается рекламой)
  if (charityPattern.test(text)) {
    logWithTimestamp(
      `Сообщение содержит благотворительные термины, блокировка не требуется.`,
      'info'
    )
    return false
  }

  return false
}
