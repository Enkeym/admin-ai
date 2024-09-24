// Обработка сообщения с временным штампом
export function logWithTimestamp(message) {
  const now = new Date()
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

  console.log(`[${formattedDate} ${formattedTime}] ${message}`)
}
