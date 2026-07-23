#!/bin/sh
set -e
cd /app
DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DIR"

# El contenedor arranca como root (sin USER en el Dockerfile) únicamente para poder ajustar
# los permisos del volumen montado por Railway/Docker Desktop, que puede tener cualquier uid
# de propietario. chown es el ajuste correcto; chmod 777 queda como red de seguridad si el
# volumen no permite cambiar de dueño (algunos backends de volumen lo restringen).
chown -R node:node "$DIR" 2>/dev/null || true
chmod -R 777 "$DIR" 2>/dev/null || true

# A partir de aquí el proceso Node real corre como el usuario sin privilegios "node" (no
# como root) — su-exec deja caer los privilegios antes del exec final.
exec su-exec node node server.js
