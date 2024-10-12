# Строим проект в отдельном слое
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./ 
COPY yarn.lock ./ 

RUN yarn install --frozen-lockfile

COPY . .

# Устанавливаем ffmpeg и ffprobe в финальном образе
FROM node:18-alpine

WORKDIR /app

# Устанавливаем ffmpeg и ffprobe
RUN apk update && apk add --no-cache ffmpeg

COPY --from=builder /app ./

EXPOSE 3000

CMD ["yarn", "start"]
