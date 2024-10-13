export const client = new TelegramClient(tgSessions, apiId, apiHash, {
  requestRetries: 10,
  retryDelay: 5000,
  timeout: 30,
  autoReconnect: true
})
