/* Qué base de datos usa la app.
 *
 * Producción y todo lo demás (desarrollo local, scripts): `DATABASE_URL`, como siempre.
 *
 * Excepción: un Preview de Vercel con la variable `PREVIEW_DATABASE_URL` puesta usa esa base, la de PRUEBAS. Vercel no deja
 * guardar una segunda `DATABASE_URL` solo para Preview mientras la de producción también cubra Preview, y esa es secreta
 * (no se puede releer ni reponer): por eso la de pruebas lleva otro nombre. Así, una compra de prueba hecha en un Preview
 * nunca ensucia las órdenes, entradas ni clientes reales.
 *
 * A prueba de fallos, en este orden:
 *  - Solo cambia si Vercel dice que el entorno es `preview` (`VERCEL_ENV`). En producción (`production`) nunca se mira
 *    `PREVIEW_DATABASE_URL`, aunque alguien la dejara puesta.
 *  - Si `VERCEL_ENV` no viene (proyecto sin variables del sistema) o `PREVIEW_DATABASE_URL` está vacía, usa `DATABASE_URL`:
 *    el mismo comportamiento de antes. */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const preview = env.PREVIEW_DATABASE_URL?.trim();
  if (env.VERCEL_ENV === 'preview' && preview) return preview;
  return env.DATABASE_URL;
}

/** ¿Este proceso está usando la base de pruebas? (solo para el aviso en los registros). */
export function usingPreviewDatabase(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'preview' && !!env.PREVIEW_DATABASE_URL?.trim();
}
