# Seguridad

## Reportar una vulnerabilidad

1. **No** abras un issue público.
2. Escribe a `jeffryzavala@hotmail.com` con asunto `[SECURITY] app-savings-tracker`.
3. Incluye: descripción, pasos para reproducir, impacto.

Respuesta esperada en 48 horas.

## Contexto de la app

App personal de un solo usuario, **sin autenticación** y con persistencia en un archivo JSON plano (`data/db.json`). No expone ni almacena datos de terceros — el modelo de amenaza es distinto al de una app multiusuario:

- No hay login ni sesiones que proteger.
- El archivo `data/db.json` no debe commitearse con datos reales (ver `.gitignore`).
- Si se expone públicamente, cualquiera con la URL puede leer/editar los datos — el deploy en Railway asume acceso restringido (URL no publicitada, uso personal).

## Prácticas

- Sin secrets embebidos en el bundle de cliente.
- Dependencias auditadas por Dependabot (semanal, `npm` + `github-actions`).
- CI corre lint + build en cada push/PR a `main`/`master`/`develop`.
