FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY . .
EXPOSE 8000
CMD ["node", "server.js"]
