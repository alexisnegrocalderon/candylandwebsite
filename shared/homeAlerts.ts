/* Franja de alertas de Inicio (admin): junta, en una sola lista ordenada por
 * gravedad, lo que necesita acción hoy. Pura (sin base de datos) para poder
 * testearla; los datos los trae server/homeSummary.ts y el cliente la usa con
 * lo que le llega de los bloques. Cada alerta lleva la sección del admin a la
 * que hay que ir. */

export type AlertLevel = 'danger' | 'warning' | 'info';

export interface HomeAlert {
  id: string;
  level: AlertLevel;
  text: string;
  /** Id de sección del admin (ver ADMIN_SECTIONS) a la que lleva. */
  section: string;
}

export interface HomeAlertInput {
  /** Alertas que ya calcula finance.live (pérdida, margen, caja, sin ventas). */
  liveAlerts?: { level: AlertLevel; text: string }[] | null;
  /** Próximo vencimiento del calendario SII. */
  siiNext?: { title: string; daysLeft: number; status: string | null; kind: string } | null;
  siiEventsToReview?: number;
  /** Movimientos de Mercado Pago / banco por clasificar. */
  cashPending?: number;
  /** Entradas (accesos) del evento. */
  tickets?: { name: string; remaining: number; total: number; status?: string | null }[] | null;
  /** Conteos de `adminBadges.counts`: denuncias, instagram, whatsapp, party-gifts, caja. */
  badges?: Record<string, number>;
  handoffsPending?: number;
  /** Cupo de correos del día. */
  emailDaily?: { remaining: number; cap: number } | null;
  /** Alertas de caja de las últimas horas. */
  cajaAlerts?: { severity: 'info' | 'warning' | 'critical'; title: string }[] | null;
}

/** Con tan pocas entradas o menos (o 90 % vendido) se avisa que se agota. */
export const LOW_TICKETS = 10;
export const SOLD_PCT_WARN = 90;

const ORDER: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildHomeAlerts(input: HomeAlertInput, max = 12): HomeAlert[] {
  const out: HomeAlert[] = [];
  const push = (a: HomeAlert) => out.push(a);

  (input.liveAlerts ?? []).forEach((a, i) => push({ id: `live-${i}`, level: a.level, text: a.text, section: 'overview' }));

  const sii = input.siiNext;
  if (sii && sii.status !== 'pagado' && sii.status !== 'declarado') {
    if (sii.daysLeft < 0) push({ id: 'sii', level: 'danger', text: `${sii.title} venció hace ${plural(Math.abs(sii.daysLeft), 'día', 'días')}.`, section: 'sii' });
    else if (sii.daysLeft <= 5) push({ id: 'sii', level: sii.daysLeft <= 1 ? 'danger' : 'warning', text: sii.daysLeft === 0 ? `Hoy vence ${sii.title}.` : `${sii.title} vence en ${plural(sii.daysLeft, 'día', 'días')}.`, section: 'sii' });
  }
  if ((input.siiEventsToReview ?? 0) > 0) {
    push({ id: 'sii-review', level: 'info', text: `${plural(input.siiEventsToReview!, 'evento', 'eventos')} con el emisor de impuestos por revisar.`, section: 'sii' });
  }

  if ((input.cashPending ?? 0) > 0) {
    push({ id: 'cash-pending', level: 'warning', text: `${plural(input.cashPending!, 'movimiento', 'movimientos')} de Mercado Pago o banco por clasificar.`, section: 'finanzas' });
  }

  for (const t of input.tickets ?? []) {
    if (t.status === 'soldout' || t.status === 'hidden' || t.total <= 0) continue;
    const soldPct = Math.round(((t.total - t.remaining) / t.total) * 100);
    if (t.remaining <= 0) push({ id: `tt-${t.name}`, level: 'warning', text: `${t.name}: agotada.`, section: 'events' });
    else if (t.remaining <= LOW_TICKETS || soldPct >= SOLD_PCT_WARN) push({ id: `tt-${t.name}`, level: 'warning', text: `${t.name}: quedan ${t.remaining} (${soldPct}% vendido).`, section: 'events' });
  }

  const b = input.badges ?? {};
  if ((b['denuncias'] ?? 0) > 0) push({ id: 'denuncias', level: 'danger', text: `${plural(b['denuncias'], 'denuncia', 'denuncias')} sin resolver.`, section: 'denuncias' });
  if ((b['instagram'] ?? 0) > 0) push({ id: 'ig', level: 'info', text: `${plural(b['instagram'], 'chat', 'chats')} de Instagram sin leer.`, section: 'instagram' });
  if ((b['whatsapp'] ?? 0) > 0) push({ id: 'wa', level: 'info', text: `${plural(b['whatsapp'], 'chat', 'chats')} de WhatsApp sin leer.`, section: 'whatsapp' });
  if ((input.handoffsPending ?? 0) > 0) push({ id: 'handoff', level: 'warning', text: `${plural(input.handoffsPending!, 'conversación', 'conversaciones')} esperando que respondas tú.`, section: 'instagram' });
  if ((b['party-gifts'] ?? 0) > 0) push({ id: 'gifts', level: 'info', text: `${plural(b['party-gifts'], 'trago', 'tragos')} pagado${b['party-gifts'] === 1 ? '' : 's'} sin retirar.`, section: 'party-gifts' });

  const mail = input.emailDaily;
  if (mail && mail.cap > 0 && mail.remaining / mail.cap <= 0.1) {
    push({ id: 'email', level: mail.remaining <= 0 ? 'danger' : 'warning', text: mail.remaining <= 0 ? 'Se acabó el cupo de correos de hoy.' : `Quedan ${mail.remaining} correos de hoy.`, section: 'mailing' });
  }

  (input.cajaAlerts ?? []).slice(0, 3).forEach((a, i) => push({ id: `caja-${i}`, level: a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info', text: `Caja: ${a.title}`, section: 'caja' }));

  // Estable: dentro de cada nivel se mantiene el orden en que se agregaron.
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDER[x.a.level] - ORDER[y.a.level] || x.i - y.i)
    .map((x) => x.a)
    .slice(0, max);
}
