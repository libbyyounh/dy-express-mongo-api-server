FROM node:18-alpine

WORKDIR /app

# 安装时区数据并设置为北京时间
RUN apk add --no-cache tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

COPY package*.json ./

# 设置国内npm源
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm install --production

# 复制整个项目目录
COPY . .

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

EXPOSE 3000

CMD ["sh", "-c", "npm run init && npm start"]