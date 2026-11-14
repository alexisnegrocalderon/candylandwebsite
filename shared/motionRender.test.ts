import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/* La grabación a MP4 corre en una máquina de GitHub que solo descarga una lista de carpetas (sparse-checkout del workflow
 * render-video.yml). Si la composición (motion/) importa un archivo que no está en esa lista, la grabación falla con «Module not
 * found» aunque la vista previa del panel funcione. Esta prueba calcula lo que importa motion/ y revisa que la lista lo cubra. */

const ROOT = join(__dirname, '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/render-video.yml'), 'utf8');
const sparse = (workflow.match(/sparse-checkout: \|\n((?:\s+\S.*\n)+)/)?.[1] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** ¿Lo cubre la lista? (una carpeta con «/» al final, o el archivo exacto). */
const covered = (rel: string): boolean => sparse.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec));
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  return null;
}

describe('grabación a MP4: lo que descarga la máquina de GitHub', () => {
  it('la lista del workflow se pudo leer', () => {
    expect(sparse.length).toBeGreaterThan(3);
    expect(sparse).toContain('motion/');
  });

  it('cubre todo lo que importa la composición (y lo que ellos importan)', () => {
    const seen = new Set<string>();
    const queue = walk(join(ROOT, 'motion'));
    queue.forEach((f) => seen.add(f));
    while (queue.length) {
      const file = queue.pop()!;
      for (const m of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const r = resolveImport(file, m[1]);
        if (r && !seen.has(r)) { seen.add(r); queue.push(r); }
      }
    }
    const missing = [...seen].map((f) => relative(ROOT, f)).filter((rel) => !covered(rel));
    expect(missing, `La grabación a MP4 no encontraría: ${missing.join(', ')}. Agrégalo al sparse-checkout de .github/workflows/render-video.yml`).toEqual([]);
  });

  it('cubre los archivos públicos que pide la composición (música, efectos, fuentes y logos) y todos existen', () => {
    const needed = new Set<string>();
    // Cualquier ruta que apunte a client/public: staticFile(...), las fuentes de theme.ts y los logos de los ternarios.
    for (const file of walk(join(ROOT, 'motion'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/['"`]((?:candyland|studio|motion|fonts)\/[^'"`$]+)/g)) needed.add(m[1]);
    }
    expect(needed.size).toBeGreaterThan(8);
    const rels = [...needed].map((p) => `client/public/${p}`);
    const missing = rels.filter((rel) => !covered(rel));
    expect(missing, `Archivos públicos que la grabación no descarga: ${missing.join(', ')}`).toEqual([]);
    // Y los archivos con nombre fijo existen de verdad (los que terminan en «/» son carpetas de música y efectos).
    const gone = rels.filter((rel) => !rel.endsWith('/') && !existsSync(join(ROOT, rel)));
    expect(gone, `La composición pide archivos que no existen: ${gone.join(', ')}`).toEqual([]);
  });

  it('da tiempo de sobra a un video largo con un estilo pesado', () => {
    const minutes = (name: string) => Number(workflow.match(new RegExp(`${name}[\\s\\S]*?timeout-minutes: (\\d+)`))?.[1]);
    expect(minutes('Grabar y subir')).toBeGreaterThanOrEqual(20);
  });
});
