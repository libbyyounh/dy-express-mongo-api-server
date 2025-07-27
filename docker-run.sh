#!/bin/bash

# 构建Docker镜像
docker build -t dy-express-mongodb-api .

# 检查构建是否成功
if [ $? -ne 0 ]; then
  echo "Docker镜像构建失败"
  exit 1
fi

# 运行Docker容器
# 注意：请根据需要修改环境变量参数
 docker run -d -p 3000:3000 \
  --name dy-express-api \
  dy-express-mongodb-api

# 检查容器是否成功启动
if [ $? -eq 0 ]; then
  echo "容器已成功启动"
  echo "应用访问地址: http://localhost:3000"
else
  echo "容器启动失败"
  exit 1
fi