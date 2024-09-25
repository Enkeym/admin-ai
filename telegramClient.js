import { TelegramClient } from 'telegram'
import { apiHash, apiId, tgSessions } from './config.js'

export const client = new TelegramClient(tgSessions, apiId, apiHash, {})
