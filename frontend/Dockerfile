FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_API_BASE 는 비워둔다 — nginx.conf 가 같은 오리진에서 /api/* 를 백엔드로 라우팅하므로
# 프론트는 상대경로(fetch(BASE + path), BASE="")로 호출한다.
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
