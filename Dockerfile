# Используем минимальный образ node и создаем слой для сборки проекта
FROM node:18-slim AS builder

WORKDIR /app

# Копируем package.json и yarn.lock для установки зависимостей
COPY package*.json ./ 
COPY yarn.lock ./

# Устанавливаем зависимости с заморозкой версий
RUN yarn install --frozen-lockfile

# Копируем остальной исходный код
COPY . .

# Используем финальный легкий образ для выполнения приложения
FROM node:18-slim

WORKDIR /app

# Устанавливаем ffmpeg и ffprobe с минимальными зависимостями
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Копируем результат сборки из предыдущего слоя
COPY --from=builder /app .

# Копируем файл .env внутрь контейнера
COPY .env .env

# Открываем порт для приложения
EXPOSE 3000

# Запуск приложения
CMD ["yarn", "start"]
