import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Получаем текущий файл и директорию для ES-модулей
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const stateFilePath = path.resolve(__dirname, 'state.json')

let currentState = { watch: [], watchAi: [] } 

// Функция для загрузки состояния из файла
export function loadState() {
  if (fs.existsSync(stateFilePath)) {
    const stateData = fs.readFileSync(stateFilePath, 'utf8')
    try {
      currentState = JSON.parse(stateData)
      console.log('Состояние успешно загружено.')
    } catch (error) {
      console.error('Ошибка при парсинге файла состояния:', error)
      currentState = { watch: [], watchAi: [] }
    }
  }
}

// Функция для сохранения состояния в файл
export function saveState() {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(currentState, null, 2))
    console.log('Состояние сохранено.')
  } catch (error) {
    console.error('Ошибка при сохранении состояния:', error)
  }
}

// Функция для обновления состояния в памяти
export function updateState(command, channels) {
  currentState[command] = channels
  saveState() 
}

// Функция для получения текущего состояния
export function getState() {
  return currentState
}

// Функция для очистки состояния
export function clearState() {
  currentState = { watch: [], watchAi: [] }
  saveState()
}
