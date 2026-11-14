/* Entradas de cortesía de PLAYMORE para la comunidad PRIVATE MEMBERS de Dalmore, con visto bueno en Cross check.
 *
 * Dos pedidos (mujer sola y pareja): el sistema los deja esperando, el dueño revisa «Ver el correo» y toca «Reportar».
 * Recién ahí, por cada persona: crea su entrada de cortesía (sin el correo estándar), la deja en Clientes con la etiqueta
 * «cliente-dalmore» y le manda UN correo con el look PLAYMORE y su QR. Un reintento no repite nada (ver las claves). */
import { and, eq } from "drizzle-orm";
import { customers, orders, rateLimits, tickets, ticketTypes } from "../drizzle/schema";
import { endOfChileDay, CrossCheckRetry, requestCrossCheck } from "./crossCheck";
import { PRIVATE_MEMBERS_EMAILS, type PrivateMembersGroupKey } from "./privateMembersList";
import { buildAnniversaryBlastEmail } from "./emailAniversario";
import { EMAIL_BASE_URL } from "./emailLayout";

export const PRIVATE_MEMBERS_TAGS = ["cliente-dalmore", "private-members"] as const;
export const PRIVATE_MEMBERS_SUBJECT = "Te enviamos tus entradas para PLAYMORE | Dalmore x Mansión Playroom (4 de diciembre)";
const REPLY_TO = "contacto@mansionplayroom.cl";
/** Día (Chile) en que se pide; pasado ese día el pedido ya no se vuelve a crear. */
export const PRIVATE_MEMBERS_DAY = "2026-11-14";

export interface PrivateMembersGroup {
  key: PrivateMembersGroupKey;
  accesoSlug: "soltera" | "duo";
  /** Lo que dice el correo en «ENTRADA». */
  entradaLabel: string;
  /** Cómo se describe al grupo en el panel. */
  panelLabel: string;
  gender: "mujer" | "pareja";
}

export const PRIVATE_MEMBERS_GROUPS: PrivateMembersGroup[] = [
  { key: "soltera", accesoSlug: "soltera", entradaLabel: "Soltera · 1 persona", panelLabel: "Mujer sola", gender: "mujer" },
  { key: "pareja", accesoSlug: "duo", entradaLabel: "Dúo · 2 personas (pareja)", panelLabel: "Pareja", gender: "pareja" },
];

export const PRIVATE_MEMBERS_KIND_PREFIX = "private-members:";
const groupOfKind = (kind: string) => PRIVATE_MEMBERS_GROUPS.find((g) => PRIVATE_MEMBERS_KIND_PREFIX + g.key === kind) ?? null;
export const isPrivateMembersKind = (kind: string) => groupOfKind(kind) !== null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Minúsculas, sin espacios, sin repetidos ni correos inválidos (la planilla trae mayúsculas sueltas). */
export function normalizeRecipients(list: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of list) {
    const e = raw.trim().toLowerCase();
    if (EMAIL_RE.test(e)) seen.add(e);
  }
  return Array.from(seen);
}

export const recipientsOf = (group: PrivateMembersGroup) => normalizeRecipients(PRIVATE_MEMBERS_EMAILS[group.key]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Invitación a bajar la app (acceso a mano + Playmatch), con el look PLAYMORE. La usan los correos de la comunidad de Dalmore. */
export function appInviteBlock(src = "email-private-members"): string {
  return `
    <div style="background-color:#25102B;border:1px solid #4A2A4E;border-radius:20px;padding:22px 18px;margin:0 0 24px;text-align:center;">
      <p style="color:#F7E7A8;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Lleva la fiesta en tu celular</p>
      <p style="color:#F3E9D2;font-size:18px;font-weight:800;line-height:1.3;margin:0 0 10px;">Descarga la app de Playroom</p>
      <p style="color:#C4B3A6;font-size:14px;line-height:1.6;margin:0 0 16px;">Ten tu acceso siempre a mano y vive <strong style="color:#F3E9D2;">Playmatch</strong>: arma tu perfil, descubre quién está en la fiesta, mira tu afinidad con cada persona y entérate al tiro cuando hay match. Instálala antes del viernes y entra con este mismo correo.</p>
      <a href="${EMAIL_BASE_URL}/app?src=${src}" style="display:inline-block;background-color:#E477EA;color:#16060F;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:15px;">📲 Descargar la app</a>
    </div>
`;
}

/** El correo de la comunidad. `qrCodes` = los QR reales de su entrada; sin ellos (vista previa) va una caja de ejemplo. */
export function buildPrivateMembersEmail(group: PrivateMembersGroup, opts: { name?: string | null; qrCodes?: string[] } = {}): string {
  const qr = opts.qrCodes?.length
    ? opts.qrCodes.map((c) => `<img src="${EMAIL_BASE_URL}/api/qr/${esc(c)}.png" alt="Código QR de tu entrada" style="width:200px;height:200px;border-radius:12px;background:#fff;padding:8px;display:block;margin:0 auto 12px;" />`).join("")
    : `<div style="width:200px;height:200px;border:2px dashed #4A2A4E;border-radius:12px;margin:0 auto 12px;color:#C4B3A6;font-size:13px;line-height:200px;text-align:center;">Aquí va tu código QR</div>`;
  const closing = `
    <div style="text-align:center;margin:4px 0 22px;">
      <p style="color:#D6B25E;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Tu entrada · preséntala en la puerta</p>
      ${qr}
      <p style="color:#C4B3A6;font-size:13px;line-height:1.5;margin:0;">También la encuentras siempre en <strong>Mi cuenta → Mis entradas</strong>, entrando con este mismo correo.</p>
    </div>
    ${appInviteBlock()}
    <p style="color:#F3E9D2;font-size:15px;font-weight:800;letter-spacing:1.5px;text-align:center;margin:0 0 8px;">NOS VEMOS EL VIERNES 4 DE DICIEMBRE</p>`;
  return buildAnniversaryBlastEmail({
    theme: "playmore",
    buyerName: esc((opts.name ?? "").trim().split(/\s+/)[0] ?? ""),
    preheader: `Tus entradas de cortesía para PLAYMORE · viernes 4 de diciembre · Providencia. Amig@s de la comunidad PRIVATE MEMBERS.`,
    headline: "Te enviamos tus entradas para PLAYMORE",
    highlightLabel: "Entrada de cortesía 🙏 · Amig@s de la comunidad PRIVATE MEMBERS",
    highlightValue: group.entradaLabel,
    paragraphs: [
      "<strong>AMIG@S</strong>, por ser parte de la membresía <strong>PRIVATE MEMBERS</strong> Dalmore tienes acceso exclusivo para nuestra próxima edición.",
      "El <strong>viernes 4 de diciembre</strong> nos trasladamos a Providencia para vivir <strong>PLAYMORE</strong>, una experiencia inédita que une lo mejor de <strong>Mansión Playroom</strong> de la Quinta Región y <strong>Dalmore Music &amp; Experiences</strong> de Santiago.",
    ],
    ctaText: "Ver mi entrada",
    ctaUrl: `${EMAIL_BASE_URL}/cuenta`,
    eventInfo: { title: "PLAYMORE · Dalmore × Mansión Playroom", dateText: "Viernes 4 de diciembre de 2026", venue: "Providencia, Santiago · Formato Open Air" },
    eventSections: { banner: false, details: true },
    closing: `<p style="color:#C4B3A6;font-size:15px;line-height:1.65;margin:0 0 18px;text-align:center;">👗 <strong style="color:#F3E9D2;">Dress code:</strong> Neón / Fluorescente</p>${closing}`,
  });
}

/* ── Pedidos de Cross check ───────────────────────────────────────────── */

export const privateMembersExpiry = () => endOfChileDay(new Date(`${PRIVATE_MEMBERS_DAY}T15:00:00Z`));

/** Deja un pedido por grupo (una sola vez por grupo, aunque se descarte o se envíe). Solo el día pedido. */
export async function ensurePrivateMembersRequests(now: Date = new Date()): Promise<number> {
  const expiresAt = privateMembersExpiry();
  if (now.getTime() >= expiresAt.getTime()) return 0;
  let created = 0;
  for (const g of PRIVATE_MEMBERS_GROUPS) {
    const n = recipientsOf(g).length;
    if (n === 0) continue; // lista ya usada y vaciada
    const ok = await requestCrossCheck({
      kind: PRIVATE_MEMBERS_KIND_PREFIX + g.key,
      dedupeKey: `${PRIVATE_MEMBERS_KIND_PREFIX}${g.key}:${PRIVATE_MEMBERS_DAY}`,
      title: `Entradas PRIVATE MEMBERS · ${g.panelLabel} (${n})`,
      summary: `Correo PLAYMORE a ${n} ${g.panelLabel === "Pareja" ? "parejas" : "mujeres solas"} de la comunidad PRIVATE MEMBERS de Dalmore, con su entrada de cortesía (${g.entradaLabel}) y su QR. Al reportar se crean las entradas, se guardan en Clientes con la etiqueta «cliente-dalmore» y sale el correo. Toca «Ver el correo completo» para revisarlo antes.`,
      expiresAt,
      pushBody: `PRIVATE MEMBERS · ${g.panelLabel} (${n}): revisa el correo y toca Reportar`,
    });
    if (ok) created++;
  }
  return created;
}

export function getPrivateMembersPreview(kind: string) {
  const g = groupOfKind(kind);
  if (!g) return null;
  const list = recipientsOf(g);
  return { to: `${list.length} destinatarios`, replyTo: REPLY_TO, subject: PRIVATE_MEMBERS_SUBJECT, html: buildPrivateMembersEmail(g, { name: "Camila" }), recipients: list };
}

/* ── Ejecución al «Reportar» ──────────────────────────────────────────── */

const sentKey = (slug: string, email: string) => `pm-sent:${slug}:${email}`.slice(0, 200);
const orderKey = (slug: string, email: string) => `pm-order:${slug}:${email}`.slice(0, 200);

async function claim(db: any, key: string): Promise<boolean> {
  try { await db.insert(rateLimits).values({ key, attempts: 1 }); return true; } catch { return false; }
}

/** Etiqueta de origen: queda en Clientes como «cliente-dalmore». No pisa el origen ni el género que ya tenía. */
async function tagDalmoreCustomer(db: any, email: string, gender: PrivateMembersGroup["gender"]) {
  const [c] = await db.select({ id: customers.id, tags: customers.tags, source: customers.source, gender: customers.gender }).from(customers).where(eq(customers.email, email)).limit(1);
  if (!c) return;
  const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
  await db.update(customers).set({
    tags: [...tags, ...PRIVATE_MEMBERS_TAGS.filter((t) => !tags.includes(t))],
    source: c.source || "dalmore",
    gender: c.gender || gender,
  }).where(eq(customers.id, c.id));
}

/** Lo que corre «Reportar»: por cada persona, entrada + etiqueta + correo. Devuelve el resumen del resultado. */
export async function sendPrivateMembers(kind: string): Promise<string> {
  const g = groupOfKind(kind);
  if (!g) throw new Error("Ese envío ya no existe en el sistema.");
  const { getDb, getEventById, getTicketTypesByEventId, createManualOrder, getCustomerByEmail } = await import("./db");
  const { getCoproductionBySlug } = await import("./coproduction");
  const { confirmFreeOrder } = await import("./webhooks");
  const { sendEmail, resendTagValue } = await import("./email");

  const db = await getDb();
  if (!db) throw new CrossCheckRetry("Base de datos no disponible. Toca Reportar para reintentar.");
  const cp = await getCoproductionBySlug("dalmore");
  const event = cp?.eventId ? await getEventById(cp.eventId) : null;
  if (!cp || !event) throw new Error("Todavía no hay evento enlazado a la co-producción de Dalmore.");
  const tt = (await getTicketTypesByEventId(event.id)).find((t: any) => t.category === "acceso" && t.accesoSlug === g.accesoSlug);
  if (!tt) throw new Error(`El evento no tiene el acceso «${g.accesoSlug}». Créalo en Entradas y vuelve a reportar.`);

  const approved = await db.select({ email: orders.buyerEmail }).from(orders).where(and(eq(orders.eventId, event.id), eq(orders.paymentStatus, "approved")));
  const hasTicket = new Set(approved.map((o: any) => (o.email ?? "").toLowerCase()));
  const tags = [{ name: "campaign", value: resendTagValue("private-members-playmore") }];

  let sent = 0, failed = 0, alreadyHad = 0, optedOut = 0;
  const errors: string[] = [];
  for (const email of recipientsOf(g)) {
    try {
      const [done] = await db.select({ key: rateLimits.key }).from(rateLimits).where(eq(rateLimits.key, sentKey(cp.slug, email))).limit(1);
      if (done) { sent++; continue; }
      const [ours] = await db.select({ key: rateLimits.key }).from(rateLimits).where(eq(rateLimits.key, orderKey(cp.slug, email))).limit(1);
      if (!ours && hasTicket.has(email)) { alreadyHad++; continue; }

      const known = await getCustomerByEmail(email);
      const name = known?.fullName ?? null;
      if (!ours) {
        const r = await createManualOrder({
          eventSlug: event.slug, buyerName: name || email.split("@")[0], buyerEmail: email,
          items: [{ ticketTypeId: tt.id, quantity: 1, unitPrice: 0 }], kind: "invitation",
        });
        await claim(db, orderKey(cp.slug, email));
        await confirmFreeOrder(r.orderNumber, { silent: true });
      }
      await tagDalmoreCustomer(db, email, g.gender);

      const [ord] = await db.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.eventId, event.id), eq(orders.buyerEmail, email), eq(orders.paymentStatus, "approved"))).limit(1);
      const rows = ord ? await db.select({ code: tickets.ticketCode, cat: ticketTypes.category }).from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId)).where(eq(tickets.orderId, ord.id)) : [];
      const qrCodes = rows.filter((x: any) => x.cat === "acceso").map((x: any) => x.code as string);

      const res = await sendEmail({ to: email, subject: PRIVATE_MEMBERS_SUBJECT, html: buildPrivateMembersEmail(g, { name, qrCodes }), replyTo: REPLY_TO, marketing: true, tags });
      if (res.success) { await claim(db, sentKey(cp.slug, email)); sent++; }
      else if ("reason" in res && res.reason === "Pidió no recibir correos") optedOut++;
      else { failed++; errors.push(email); }
    } catch (err) {
      failed++; errors.push(email);
      console.error(`[PrivateMembers] ${email}:`, err instanceof Error ? err.message : err);
    }
  }
  const total = recipientsOf(g).length;
  if (sent === 0 && alreadyHad < total && optedOut < total) throw new CrossCheckRetry(`No salió ningún correo (${failed} con error). Toca Reportar para reintentar.`);
  return `${sent} enviado${sent === 1 ? "" : "s"}${failed ? `, ${failed} con error (${errors.slice(0, 5).join(", ")})` : ""}${alreadyHad ? `, ${alreadyHad} ya tenían entrada` : ""}${optedOut ? `, ${optedOut} pidieron no recibir correos (su entrada queda en Mi cuenta)` : ""}.`;
}
