#!/bin/bash

docker-compose down

# 拉取最新代码
git pull

# 重启Docker容器
sh ./docker-compose-build.sh