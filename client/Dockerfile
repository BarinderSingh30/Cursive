FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY shared shared
COPY client client
WORKDIR /repo/client
ARG VITE_SYNC_URL
ARG VITE_CHAT_SOCKET_URL
ARG VITE_BOARD_CHAT_SOCKET_URL
ARG VITE_API_URL
ARG VITE_LIVEKIT_URL
ENV VITE_SYNC_URL=$VITE_SYNC_URL
ENV VITE_CHAT_SOCKET_URL=$VITE_CHAT_SOCKET_URL
ENV VITE_BOARD_CHAT_SOCKET_URL=$VITE_BOARD_CHAT_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /repo/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
