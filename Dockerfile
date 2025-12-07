FROM node:20-slim
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
