FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "server.js"]
