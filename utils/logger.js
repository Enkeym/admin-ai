import winston from 'winston'

// Создаем формат даты и времени в стиле ru-RU
const timestampFormat = winston.format.printf(
  ({ timestamp, level, message }) => {
    const now = new Date(timestamp)
    const formattedDate = now.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const formattedTime = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    return `[${formattedDate} ${formattedTime}] [${level.toUpperCase()}] ${message}`
  }
)

// Инициализируем Winston логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), timestampFormat),
  transports: [new winston.transports.Console()]
})

// Функция для логирования с временным штампом
export function logWithTimestamp(message, level = 'info') {
  logger.log({ level, message })
}
