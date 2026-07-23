# Mis Metas de Ahorro

App personal de seguimiento de metas de ahorro. Next.js 15 (App Router), un solo usuario, sin auth, en español (es-PE). Persistencia en un archivo JSON plano (`data/db.json`), sin base de datos.

Ver `CLAUDE.md` para arquitectura completa.

## Desarrollo local

```
npm install
npm run dev        # http://localhost:3000
npm run build      # build de producción (standalone)
npm start          # corre el build standalone
npm run lint
npm run typecheck  # tsc --noEmit
npm test           # suite de Vitest (lógica financiera)
npm run test:watch # Vitest en modo watch
```

## Funcionalidades

- Metas de ahorro con monto/fecha objetivo, movimientos (depósitos/retiros), historial paginado y proyecciones.
- Reparto del ahorro mensual entre metas (automático o % manual) con proyección en cascada.
- Deudas a tu favor (informativo) y la opción de aplicar un cobro como depósito a una meta.
- Racha mensual, tendencia (12 meses) e insights derivados del historial.
- **Datos y respaldo**: descargar respaldo JSON (fidelidad total), exportar movimientos a CSV e importar un respaldo (reemplaza todo, con confirmación).
- **Deshacer** al eliminar metas, movimientos, deudas o pagos (ventana de unos segundos).
- **PIN local** (candado de UI por dispositivo) — no reemplaza autenticación de servidor.

## Variables de entorno

| Variable | Efecto |
|---|---|
| `DATA_DIR` | Carpeta del `db.json` (por defecto `<cwd>/data`). |
| `APP_ACCESS_PASSWORD` | **Opcional.** Si se define, activa Basic Auth a nivel de servidor (protege también las Server Actions). Sin ella, la app queda sin auth como siempre. |
| `APP_ACCESS_USER` | Usuario para el Basic Auth (por defecto `ahorros`). |

## Docker local

```
docker compose build --no-cache && docker compose up -d
docker compose down
docker compose logs --no-color
```

Siempre `docker compose down` antes de rebuildear — un contenedor viejo corriendo con otro nombre/puerto puede seguir sirviendo la imagen vieja mientras se debuggea contra la nueva.

## Despliegue (Railway)

- **URL**: https://app-savings-tracker-production.up.railway.app
- **Proyecto/servicio Railway**: `app-savings-tracker` (mismo nombre que el repo).
- **Deploy automático**: cada push a `main` en GitHub dispara build + deploy (builder: Dockerfile, no Railpack).
- **Persistencia**: volumen de 5GB montado en `/app/data` — datos de producción viven ahí, no en el `data/` local.
- **Modo sleep**: el servicio duerme tras 10 min sin tráfico y despierta con el siguiente request (equivalente al "serverless" de Railway). Solo funciona bien con 1 réplica — no escalar horizontalmente sin antes resolver la cola de escritura en proceso de `store.ts`.

Detalles completos de cómo se armó el despliegue en `CLAUDE.md` (sección "Deployed on Railway").
