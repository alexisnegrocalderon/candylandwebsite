import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';

/* Regresión del 08/10: `sanitize-html` trajo `htmlparser2@12`, que es solo ESM.
 * El runtime de Vercel carga las dependencias con require() sin soporte para
 * módulos ESM, así que la función entera se caía al arrancar (ERR_REQUIRE_ESM)
 * y con ella TODO el servidor: ingreso al admin, cron, sitemap. Los tests no lo
 * vieron porque Node 22+ sí permite require() de ESM y vitest no usa ese camino.
 *
 * Esta prueba carga la librería como la carga Vercel (CommonJS, sin require de
 * ESM). Si una actualización vuelve a traer una dependencia solo-ESM, falla acá
 * y no en producción. */
describe('dependencias del servidor en Vercel', () => {
  it('sanitize-html carga con require() sin soporte de ESM', () => {
    const run = spawnSync(
      process.execPath,
      ['--no-experimental-require-module', '-e', "const s=require('sanitize-html');process.stdout.write(s('<b onclick=x>ok</b>'))"],
      { encoding: 'utf8' },
    );
    // Node sin esa bandera (versiones viejas) no puede hacer la prueba.
    if (/bad option/i.test(run.stderr)) return;
    expect(run.stderr).not.toMatch(/ERR_REQUIRE_ESM/);
    expect(run.stdout).toBe('<b>ok</b>');
  });
});
