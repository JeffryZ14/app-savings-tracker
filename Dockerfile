FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# su-exec: deja caer privilegios de root al usuario "node" tras arreglar permisos del
# volumen (ver entrypoint.sh) — evita correr el proceso Node real como root.
RUN apk add --no-cache su-exec

# --chown=node:node: el usuario "node" (uid 1000) ya viene definido en la imagen oficial de
# Node; el código de la app debe pertenecerle para poder ejecutarlo sin privilegios.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

ENTRYPOINT ["/entrypoint.sh"]
