# 使用輕量級的 Node.js 映像檔
FROM node:18-alpine

# 設定容器內的工作目錄
WORKDIR /usr/src/app

# 複製 package 設定檔 (稍後會建立 app 資料夾)
COPY app/package*.json ./

# 安裝套件
RUN npm install

# 複製所有程式碼
COPY app/ .

# 開放 Port
EXPOSE 3000

# 啟動指令
CMD [ "node", "server.js" ]