FROM node:20.19-alpine

# 安装基础依赖（满足 Hermes CLI 需要）
RUN apk add --no-cache python3 py3-pip make g++

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装项目依赖（严格匹配项目要求）
RUN npm install

# 复制全部项目代码
COPY . .

# 构建生产版本
RUN npm run build

# 暴露官方端口
EXPOSE 3001

# 生产启动命令（官方命令）
CMD ["npm", "run", "start"]
