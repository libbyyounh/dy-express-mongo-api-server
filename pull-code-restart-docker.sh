#!/bin/bash

docker-compose down

# 拉取最新代码
if git pull; then
    echo "Git pull succeeded, restarting Docker containers..."
    # 重启Docker容器
    sh ./docker-compose-build.sh
else
    echo "Error: Git pull failed, aborting container restart."
    exit 1
fi