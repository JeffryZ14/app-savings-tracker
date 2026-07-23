# Seguridad

## Reportar una vulnerabilidad

1. **No** abras un issue público.
2. Escribe a `jeffryzavala@hotmail.com` con asunto `[SECURITY] app-savings-tracker`.
3. Incluye: descripción, pasos para reproducir, impacto.

Respuesta esperada en 48 horas.

## Contexto de la app

App personal de un solo usuario con persistencia en un archivo JSON plano (`data/db.json`). No expone ni almacena datos de terceros — el modelo de amenaza es distinto al de una app multiusuario:

- Por defecto **no hay autenticación**: si se expone públicamente, cualquiera con la URL puede leer/editar los datos. El deploy en Railway asume acceso restringido (URL no publicitada, uso personal).
- **Puerta opcional**: definiendo la variable de entorno `APP_ACCESS_PASSWORD` (usuario en `APP_ACCESS_USER`, por defecto `ahorros`) se activa Basic Auth a nivel de servidor (`src/middleware.ts`), que protege también las Server Actions y el acceso directo a la URL. Recomendado antes de compartir el link.
- El **PIN local** (candado de UI por dispositivo, `usePinLock`) sólo oculta la pantalla en el navegador; **no** protege los datos en el servidor. No lo confundas con la puerta anterior.
- El archivo `data/db.json` no debe commitearse con datos reales (ver `.gitignore`).

## Prácticas

- Sin secrets embebidos en el bundle de cliente.
- Cabeceras de seguridad (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) en `next.config.js`.
- Dependencias auditadas por Dependabot (semanal, `npm` + `github-actions`).
- CI corre lint, typecheck, tests y build en cada push/PR a `main`/`master`/`develop`.
