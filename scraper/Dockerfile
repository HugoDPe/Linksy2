FROM mcr.microsoft.com/playwright:v1.51.0-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx playwright install
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
