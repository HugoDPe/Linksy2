# Build the Vue front app
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
ARG VITE_SCRAPER_API_URL
ENV VITE_SCRAPER_API_URL=$VITE_SCRAPER_API_URL
RUN npm run build

# Serve the built assets with a Node server
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copie les assets buildés ET le serveur
COPY --from=build /app/dist ./dist
COPY server.cjs ./
COPY package.json package-lock.json ./

# Installe uniquement les dépendances de production pour server.cjs
RUN npm clean-install --omit=dev

ENV PORT=80
EXPOSE 80

CMD ["node", "server.cjs"]
