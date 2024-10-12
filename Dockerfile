# Строим проект в отдельном слое
FROM node:18-slim AS builder

WORKDIR /app

COPY package*.json ./ 
COPY yarn.lock ./ 

RUN yarn install --frozen-lockfile

COPY . .

# Устанавливаем ffmpeg и ffprobe в финальном образе
FROM node:18-slim

WORKDIR /app

# Устанавливаем ffmpeg и ffprobe
RUN apt-get update && apt-get install -y ffmpeg

COPY --from=builder /app ./

EXPOSE 3000

CMD ["yarn", "start"]
