FROM node:24-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Outside conf.d/ on purpose: every *.conf in conf.d/ is loaded as a
# top-level config, and a bare add_header fragment there would not parse.
COPY security/nginx-security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
