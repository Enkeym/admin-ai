import { apiHash, apiId, tgSessions } from './config.js'
import { TelegramClient } from 'telegram'

export const client = new TelegramClient(tgSessions, apiId, apiHash, {})
