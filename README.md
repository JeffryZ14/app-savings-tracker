# Mis Metas de Ahorro

App personal de seguimiento de metas de ahorro. Next.js 15 (App Router), un solo usuario, sin auth, en español (es-PE). Persistencia en un archivo JSON plano (`data/db.json`), sin base de datos.

Ver `CLAUDE.md` para arquitectura completa.

## Desarrollo local

```
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción (standalone)
npm start        # corre el build standalone
npm run lint
npx tsc --noEmit
```

## Docker local

```
docker compose build --no-cache && docker compose up -d
docker compose down
docker compose logs --no-color
```

Siempre `docker compose down` antes de rebuildear — un contenedor viejo corriendo con otro nombre/puerto puede seguir sirviendo la imagen vieja mientras se debuggea contra la nueva.

## Despliegue (Railway)

- **URL**: https://app-savings-tracker.up.railway.app
- **Proyecto/servicio Railway**: `app-savings-tracker` (mismo nombre que el repo).
- **Deploy automático**: cada push a `main` en GitHub dispara build + deploy (builder: Dockerfile, no Railpack).
- **Persistencia**: volumen de 5GB montado en `/app/data` — datos de producción viven ahí, no en el `data/` local.
- **Modo sleep**: el servicio duerme tras 10 min sin tráfico y despierta con el siguiente request (equivalente al "serverless" de Railway). Solo funciona bien con 1 réplica — no escalar horizontalmente sin antes resolver la cola de escritura en proceso de `store.ts`.

Detalles completos de cómo se armó el despliegue en `CLAUDE.md` (sección "Deployed on Railway").
