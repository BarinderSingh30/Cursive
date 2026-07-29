FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci

FROM deps AS runtime
COPY shared shared
COPY server server
WORKDIR /repo/server
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
