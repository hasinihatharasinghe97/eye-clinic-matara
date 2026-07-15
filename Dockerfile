# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/

RUN npm ci && npm ci --prefix server && npm ci --prefix client

COPY . .
RUN npm run build --prefix client

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev && npm ci --omit=dev --prefix server

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "server/src/index.js"]
