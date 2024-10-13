import { logWithTimestamp } from './logger.js'

// ANSI escape codes for red color
const colors = {
  red: '\x1b[31m',
  reset: '\x1b[0m'
}

export function containsAdContent(text) {
  const urlPattern = /https?:\/\/[^\s]+/g
  const mentionPattern = /@\w+/g
  const hashtagPattern = /^#\w+/
  const subscriptionPattern =
    /подписаться|подпишитесь|подпишись|подписка|подпишем|акция|акции|акцион|скидка|скидки|скидочная|скидочной|скидочную|скидочный|выгода|выгодно|предложение|предложения|предложений|оферта|купить|покупка|покупки|приобрести|приобретение|заказ|заказы|заказать|закажем|доставка|доставить|доставки|доставим|доставим|продажа|продажи|продать|продаем|реализация|продается|предоставим|реализуем|выгодный|выгодная|выгодные|выгоднее|дешевле|дёшево|выгодней|со скидкой/i
  const callToActionPattern =
    /присоединяйтесь|вступите|вступай|присоединяйся|сделайте заказ|оформите заказ|совершите заказ|поддержите|поддержи|помогите|помоги|заказывайте|закажи|оформляйте заказ|закажите|приобретайте|советуем|рекомендуем|зайдите в магазин|зайдите на сайт|посетите|попробуйте|покупайте|приобретайте|оформите покупку|совершите покупку/i
  const charityPattern =
    /благотворительность|благотворительный|сбор средств|сбор денег|сбор подарков|сбор на лечение|сбор на лекарства|пожертвования|жертвовать|пожертвовать|жертвование|пожертвуем|санаторий|реабилитация|дети|детский дом|помощь детям|поддержка детей|помощь нуждающимся|помогите детям|поддержите детей|сбор для детей|волонтёрство|волонтёрский|волонтёр|поддержка больных детей|сбор для больных/i

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

  // Проверка, начинается ли сообщение с #
  if (hashtagPattern.test(text)) {
    logWithTimestamp(
      `Сообщение заблокировано из-за хештега: "${colors.red}${text}${colors.reset}"`,
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
