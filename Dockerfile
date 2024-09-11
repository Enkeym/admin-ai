FROM node:18-alpine

WORKDIR /index

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["yarn", "start"]