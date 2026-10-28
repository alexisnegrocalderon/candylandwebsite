/* Ensayo de carga de Playmatch: simula `--users` personas con la App abierta toda la noche contra el EVENTO DE PRUEBA
 * (entradas MP-TEST-0001…), con la misma cadencia de pedidos que la App real (shared/loadStats.ts POLL_PLAN), y entrega un
 * informe con latencia p50/p95/p99, errores por endpoint y el veredicto contra las metas de la noche.
 *
 * Cómo usarlo
 *   1. Admin → Noche → «Probar Playmatch» → crear invitados de prueba (hasta 10) y «Entrar» a cada uno.
 *   2. pnpm exec tsx scripts/loadtest-playmatch.ts --base https://mansionplayroom.cl --users 120 --minutes 5
 *      (los códigos MP-TEST-0001… se toman de --codes, por defecto MP-TEST-0001..0010; las personas simuladas se reparten entre ellos).
 *   3. Al terminar: admin → «Borrar datos de prueba».
 *
 * Seguridad: solo acepta códigos de prueba (MP-TEST-####); nunca toca entradas reales. Solo lee y, con --writes, hace swipes
 * a los perfiles de prueba. No imprime ni guarda nada sensible. */
import { isTestTicketCode } from '../shared/playmatchTest';
import { POLL_PLAN, expectedRps, summarize, verdict, type Sample } from '../shared/loadStats';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const USERS = Math.max(1, Math.min(500, Number(arg('users', '120'))));
const MINUTES = Math.max(0.2, Math.min(60, Number(arg('minutes', '5'))));
const RAMP_S = Math.max(0, Number(arg('ramp', '30')));
const WRITES = flag('writes');
const CODES = (arg('codes', Array.from({ length: 10 }, (_, i) => `MP-TEST-${String(i + 1).padStart(4, '0')}`).join(',')))
  .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

if (CODES.length === 0 || !CODES.every(isTestTicketCode)) {
  console.error('Solo se aceptan códigos de prueba (MP-TEST-0001…). Revisa --codes.');
  process.exit(1);
}
if (/mansionplayroom\.cl/.test(BASE) && !flag('yes-production')) {
  console.error(`Vas a apuntar a PRODUCCIÓN (${BASE}). Es seguro (solo usa el evento de prueba) pero genera carga real: confirma con --yes-production.`);
  process.exit(1);
}

const samples: Sample[] = [];
let stop = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una consulta tRPC (GET con superjson). Devuelve el JSON de `data` o null. */
async function query(endpoint: string, input: Record<string, unknown>): Promise<any> {
  const url = `${BASE}/api/trpc/${endpoint}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const t0 = performance.now();
  let status = 0, ok = false, data: any = null;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    status = res.status;
    const body: any = await res.json().catch(() => null);
    ok = res.ok && !body?.error;
    data = body?.result?.data?.json ?? null;
    // Una respuesta de negocio (FORBIDDEN «todavía no creaste tu perfil») no es una falla del servidor.
    if (!ok && status >= 400 && status < 500) ok = true;
  } catch { status = 0; }
  samples.push({ endpoint, ms: Math.round(performance.now() - t0), ok, status });
  return data;
}

async function mutate(endpoint: string, input: Record<string, unknown>): Promise<any> {
  const t0 = performance.now();
  let status = 0, ok = false, data: any = null;
  try {
    const res = await fetch(`${BASE}/api/trpc/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json: input }), signal: AbortSignal.timeout(15_000) });
    status = res.status;
    const body: any = await res.json().catch(() => null);
    ok = (res.ok && !body?.error) || (status >= 400 && status < 500);
    data = body?.result?.data?.json ?? null;
  } catch { status = 0; }
  samples.push({ endpoint, ms: Math.round(performance.now() - t0), ok, status });
  return data;
}

/** Una persona: repite cada consulta con su cadencia (con un desfase al azar para que no sincronicen). */
async function person(n: number): Promise<void> {
  const ticketCode = CODES[n % CODES.length];
  await sleep(Math.random() * RAMP_S * 1000);
  const timers = POLL_PLAN.map((p) => ({ ...p, next: Date.now() + Math.random() * p.everyS * 1000 }));
  let matches: any[] = [];
  let chatNext = Date.now() + 5_000;
  const hasChat = n % 5 === 0; // 1 de cada 5 con un chat abierto (pide mensajes cada 3 s)
  while (!stop) {
    const now = Date.now();
    for (const t of timers) {
      if (now < t.next) continue;
      t.next = now + t.everyS * 1000;
      const data = await query(t.endpoint, { ticketCode });
      if (t.endpoint === 'party.myMatches' && Array.isArray(data)) matches = data;
      if (WRITES && t.endpoint === 'party.swipeDeck') {
        const card = Array.isArray(data?.deck) ? data.deck[0] : data?.deck?.cards?.[0];
        if (card?.id && Math.random() < 0.5) await mutate('party.swipe', { ticketCode, targetProfileId: Number(card.id), liked: Math.random() < 0.5 });
      }
    }
    if (hasChat && matches[0]?.connectionId && Date.now() >= chatNext) {
      chatNext = Date.now() + 3_000;
      await query('party.getMessages', { ticketCode, connectionId: Number(matches[0].connectionId) });
    }
    await sleep(250);
  }
}

async function main() {
  console.log(`Ensayo de carga → ${BASE}\n  ${USERS} personas · ${MINUTES} min · subida ${RAMP_S}s · códigos ${CODES.length} · escrituras ${WRITES ? 'sí' : 'no'}`);
  console.log(`  Carga esperada con todos conectados: ~${expectedRps(USERS).toFixed(0)} pedidos/s\n`);
  const started = Date.now();
  const people = Array.from({ length: USERS }, (_, n) => person(n));
  const tick = setInterval(() => {
    const recent = samples.slice(-500);
    const errors = recent.filter((s) => !s.ok).length;
    const secs = (Date.now() - started) / 1000;
    process.stdout.write(`\r  ${secs.toFixed(0)}s · ${samples.length} pedidos · ${(samples.length / secs).toFixed(1)}/s · errores recientes ${errors}   `);
  }, 2000);
  await sleep(MINUTES * 60_000);
  stop = true;
  await Promise.all(people);
  clearInterval(tick);

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\n\nResultado (${samples.length} pedidos en ${elapsed.toFixed(0)} s, ${(samples.length / elapsed).toFixed(1)}/s):\n`);
  console.log('endpoint'.padEnd(26) + 'pedidos'.padStart(8) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'máx'.padStart(8) + 'errores'.padStart(9));
  for (const e of summarize(samples)) {
    console.log(e.endpoint.padEnd(26) + String(e.count).padStart(8) + `${e.p50}`.padStart(8) + `${e.p95}`.padStart(8) + `${e.p99}`.padStart(8) + `${e.max}`.padStart(8) + `${e.errors}`.padStart(9));
  }
  const v = verdict(samples);
  console.log(`\n${v.pass ? '✅ APRUEBA' : '❌ NO APRUEBA'} las metas de la noche (p95 < 1000 ms, errores < 1 %).`);
  for (const r of v.reasons) console.log(`  - ${r}`);
  const statuses = new Map<string, number>();
  for (const s of samples) if (!s.ok) statuses.set(String(s.status), (statuses.get(String(s.status)) ?? 0) + 1);
  if (statuses.size) console.log('  Errores por código:', Object.fromEntries(statuses));
  process.exit(v.pass ? 0 : 2);
}

main().catch((err) => { console.error(err); process.exit(1); });
