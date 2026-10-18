FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/.next ./.next
COPY --from=build /app/data ./data
# Non-root user; the app is stateless and writes nothing to disk.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
# Railway injects PORT; `next start` reads it. 3000 is the local default.
EXPOSE 3000
CMD ["npm", "start"]
