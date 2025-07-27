FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# 设置国内npm源
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --production

# 复制整个项目目录
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "npm run init && npm start"]