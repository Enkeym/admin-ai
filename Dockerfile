# Используем более легкий образ node и строим проект в отдельном слое
FROM node:18-slim AS builder

WORKDIR /app

# Копируем package.json и yarn.lock для установки зависимостей
COPY package*.json ./ 
COPY yarn.lock ./

# Устанавливаем зависимости без создания кэша
RUN yarn install --frozen-lockfile

# Копируем остальную часть кода после установки зависимостей
COPY . .

# Используем финальный легкий образ для выполнения приложения
FROM node:18-slim

WORKDIR /app

# Устанавливаем ffmpeg с минимальными зависимостями
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Копируем файлы из слоя сборки
COPY --from=builder /app .

# Открываем порт для приложения
EXPOSE 3000

# Команда запуска
CMD ["yarn", "start"]
