# syntax=docker/dockerfile:1

# The build stage always runs on the builder's own architecture. The output is
# static files, so both image platforms share one build.
FROM --platform=$BUILDPLATFORM node:20.18-alpine AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM nginxinc/nginx-unprivileged:1.27-alpine
LABEL org.opencontainers.image.source=https://github.com/xraph/fabriq-admin

USER root
RUN apk add --no-cache jq
USER 101

COPY --from=build /src/apps/host/dist /usr/share/nginx/html
COPY deploy/docker/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 deploy/docker/40-fabriq-admin-runtime.sh /docker-entrypoint.d/40-fabriq-admin-runtime.sh

# Only /tmp needs to be writable (run with --read-only --tmpfs /tmp).
EXPOSE 8080
