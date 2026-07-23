import { NextResponse, type NextRequest } from "next/server";

// Puerta de acceso OPCIONAL a nivel de servidor. Por defecto la app sigue sin auth (uso
// personal, ver CLAUDE.md): sólo se activa si defines la variable de entorno
// APP_ACCESS_PASSWORD (usuario opcional en APP_ACCESS_USER, "ahorros" por defecto).
//
// A diferencia del PIN local (que sólo oculta la UI en el navegador), esto sí bloquea las
// Server Actions y cualquier acceso directo a la URL — necesario antes de compartir el link.
//
// Nota: se lee con notación de corchetes y DENTRO de la función a propósito. Next "inlinea"
// los accesos `process.env.FOO` (por punto) en el bundle del middleware en tiempo de build;
// el acceso por corchetes queda dinámico y se resuelve en cada request en el runtime Node.
export function middleware(req: NextRequest) {
  const password = process.env["APP_ACCESS_PASSWORD"];
  if (!password) return NextResponse.next();
  const user = process.env["APP_ACCESS_USER"] ?? "ahorros";

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(header.slice(6)).split(":");
      if (u === user && p === password) return NextResponse.next();
    } catch {
      // credenciales mal formadas -> se trata como no autorizado
    }
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mis Metas de Ahorro", charset="UTF-8"' },
  });
}

// Protege las páginas y Server Actions; excluye assets estáticos e íconos para no re-pedir
// credenciales en cada subrecurso.
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
