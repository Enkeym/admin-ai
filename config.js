import 'dotenv/config'
import { StringSession } from 'telegram/sessions/index.js'

const tgSessions = new StringSession(process.env.TG_SESSIONS)
const apiId = parseInt(process.env.API_ID)
const apiHash = process.env.API_HASH
const tgToken = process.env.TG_TOKEN
const myGroup = process.env.MY_GROUP
const gigaClientSecret = process.env.CLIENT_SECRET
const gigaAuth = process.env.GIGA_AUTH
const gigaScope = 'GIGACHAT_API_PERS'

export {
  apiId,
  apiHash,
  tgSessions,
  tgToken,
  myGroup,
  gigaClientSecret,
  gigaAuth,
  gigaScope
}
