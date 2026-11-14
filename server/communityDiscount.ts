/* Código personal del 30% en el acceso a PLAYMORE para los clientes de Dalmore (membresía Community), con visto bueno en
 * Cross check. Un pedido: el dueño revisa «Ver el correo» y toca «Reportar». Recién ahí, por cada persona: crea su código
 * (30 %, un solo uso, solo sobre accesos, hasta el día del evento), la deja en Clientes con la etiqueta «cliente-dalmore»
 * y le manda el correo PLAYMORE con su link. El código nace apagado y se prende SOLO si el correo salió.
 *
 * Ojo: el código NO lleva `applicableTicketTypeIds`: con eso el sistema lo trata como promo relámpago y la aplica a todo
 * el mundo. El descuento ya se calcula solo sobre accesos (nunca sobre extras). */
import { randomInt } from "crypto";
import { and, eq } from "drizzle-orm";
import { discountCodes, customers, rateLimits } from "../drizzle/schema";
import { endOfChileDay, CrossCheckRetry, requestCrossCheck } from "./crossCheck";
import { COMMUNITY_DISCOUNT_EMAILS } from "./communityDiscountList";
import { normalizeRecipients, appInviteBlock } from "./privateMembers";
import { buildAnniversaryBlastEmail } from "./emailAniversario";
import { EMAIL_BASE_URL } from "./emailLayout";
import { COLAB_HOSTS } from "../shared/colabHosts";

export const COMMUNITY_DISCOUNT_KIND = "community-discount";
export const COMMUNITY_DISCOUNT_PERCENT = 30;
export const COMMUNITY_DISCOUNT_TAGS = ["cliente-dalmore", "descuento-30"] as const;
export const COMMUNITY_DISCOUNT_SUBJECT = "Tu código exclusivo para PLAYMORE | Dalmore x Mansión Playroom (4 de diciembre)";
export const COMMUNITY_DISCOUNT_DAY = "2026-11-14";
const REPLY_TO = "contacto@mansionplayroom.cl";
const CODE_PREFIX = "DALMORE30-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I

export const communityRecipients = () => normalizeRecipients(COMMUNITY_DISCOUNT_EMAILS);

export function generateCommunityCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return CODE_PREFIX + s;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const descriptionFor = (email: string) => `Community Dalmore 30% PLAYMORE · ${email}`.slice(0, 255);

export function buildCommunityDiscountEmail(opts: { name?: string | null; code: string; checkoutUrl: string }): string {
  const code = esc(opts.code);
  return buildAnniversaryBlastEmail({
    theme: "playmore",
    buyerName: esc((opts.name ?? "").trim().split(/\s+/)[0] ?? ""),
    preheader: `Tu código exclusivo del ${COMMUNITY_DISCOUNT_PERCENT}% para PLAYMORE · viernes 4 de diciembre · Providencia.`,
    headline: "Tu código exclusivo para PLAYMORE",
    highlightLabel: `Tu código · ${COMMUNITY_DISCOUNT_PERCENT}% de descuento en tu acceso`,
    highlightValue: code,
    paragraphs: [
      "<strong>AMIG@S</strong>, por ser parte de la membresía <strong>Community</strong> de Dalmore, tienes acceso a un beneficio exclusivo para nuestra próxima edición.",
      "El <strong>viernes 4 de diciembre</strong> nos trasladamos a Providencia para vivir <strong>PLAYMORE</strong>, una experiencia inédita que une lo mejor de <strong>Mansión Playroom</strong> de la Quinta Región y <strong>Dalmore Music &amp; Experiences</strong> de Santiago.",
      `Canjea tu código al momento de adquirir tu entrada, <strong>antes de que se agoten los cupos</strong>. Es personal, de un solo uso y vale para el acceso que quieras.`,
    ],
    ctaText: `Comprar con mi ${COMMUNITY_DISCOUNT_PERCENT}%`,
    ctaUrl: opts.checkoutUrl,
    eventInfo: { title: "PLAYMORE · Dalmore × Mansión Playroom", dateText: "Viernes 4 de diciembre de 2026", venue: "Providencia, Santiago · Formato Open Air" },
    eventSections: { banner: false, details: true },
    closing: `
      <p style="color:#C4B3A6;font-size:15px;line-height:1.65;margin:0 0 18px;text-align:center;">👗 <strong style="color:#F3E9D2;">Dress code:</strong> Neón / Fluorescente</p>
      ${appInviteBlock("email-community-dalmore")}
      <p style="color:#F3E9D2;font-size:15px;font-weight:800;letter-spacing:1.5px;text-align:center;margin:0 0 8px;">TE ESPERAMOS</p>`,
  });
}

/* ── Pedido de Cross check ────────────────────────────────────────────── */

export const communityDiscountExpiry = () => endOfChileDay(new Date(`${COMMUNITY_DISCOUNT_DAY}T15:00:00Z`));

export async function ensureCommunityDiscountRequest(now: Date = new Date()): Promise<number> {
  const expiresAt = communityDiscountExpiry();
  const n = communityRecipients().length;
  if (n === 0 || now.getTime() >= expiresAt.getTime()) return 0;
  const ok = await requestCrossCheck({
    kind: COMMUNITY_DISCOUNT_KIND,
    dedupeKey: `${COMMUNITY_DISCOUNT_KIND}:${COMMUNITY_DISCOUNT_DAY}`,
    title: `Código del ${COMMUNITY_DISCOUNT_PERCENT}% · Community Dalmore (${n})`,
    summary: `Correo PLAYMORE a ${n} clientes de Dalmore con su código personal del ${COMMUNITY_DISCOUNT_PERCENT}% (un solo uso, todos los accesos, vale hasta el día del evento) y su link para comprar. Al reportar se crea un código por persona, se guardan en Clientes con la etiqueta «cliente-dalmore» y sale el correo. Toca «Ver el correo completo» para revisarlo antes.`,
    expiresAt,
    pushBody: `Community Dalmore (${n}): revisa el correo y toca Reportar`,
  });
  return ok ? 1 : 0;
}

export function getCommunityDiscountPreview() {
  const list = communityRecipients();
  return {
    to: `${list.length} destinatarios`, replyTo: REPLY_TO, subject: COMMUNITY_DISCOUNT_SUBJECT, recipients: list,
    html: buildCommunityDiscountEmail({ name: "Camila", code: `${CODE_PREFIX}EJEMPLO`, checkoutUrl: "https://dalmore.mansionplayroom.cl/checkout/playmore?code=DALMORE30-EJEMPLO" }),
  };
}

/* ── Ejecución al «Reportar» ──────────────────────────────────────────── */

const sentKey = (email: string) => `cd-sent:${COMMUNITY_DISCOUNT_DAY}:${email}`.slice(0, 200);

async function claim(db: any, key: string): Promise<boolean> {
  try { await db.insert(rateLimits).values({ key, attempts: 1 }); return true; } catch { return false; }
}

/** El código de esta persona: el que ya se le creó (reintento) o uno nuevo, apagado hasta que el correo salga. */
async function codeFor(db: any, email: string, eventId: number, validUntil: Date): Promise<{ id: number; code: string }> {
  const [existing] = await db.select({ id: discountCodes.id, code: discountCodes.code }).from(discountCodes)
    .where(eq(discountCodes.description, descriptionFor(email))).limit(1);
  if (existing) return existing;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCommunityCode();
    try {
      const [ins] = await db.insert(discountCodes).values({
        code, description: descriptionFor(email), discountType: "percentage", discountValue: String(COMMUNITY_DISCOUNT_PERCENT),
        maxUses: 1, eventId, validUntil, isActive: 0,
      });
      return { id: (ins as { insertId: number }).insertId, code };
    } catch (err: any) {
      if (!(err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? "")))) throw err;
    }
  }
  throw new Error("No se pudo generar un código único.");
}

/** Etiqueta de origen en Clientes: crea la ficha si no existe y no pisa el origen que ya tenía. */
async function tagDalmoreCustomer(db: any, email: string, name: string | null) {
  const { ensureCustomerIdForEmail } = await import("./db");
  await ensureCustomerIdForEmail(email, name);
  const [c] = await db.select({ id: customers.id, tags: customers.tags, source: customers.source }).from(customers).where(eq(customers.email, email)).limit(1);
  if (!c) return;
  const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
  await db.update(customers).set({
    tags: [...tags, ...COMMUNITY_DISCOUNT_TAGS.filter((t) => !tags.includes(t))],
    source: c.source || "dalmore",
  }).where(eq(customers.id, c.id));
}

export async function sendCommunityDiscount(): Promise<string> {
  const { getDb, getEventById, getCustomerByEmail } = await import("./db");
  const { getCoproductionBySlug } = await import("./coproduction");
  const { sendEmail, resendTagValue } = await import("./email");

  const db = await getDb();
  if (!db) throw new CrossCheckRetry("Base de datos no disponible. Toca Reportar para reintentar.");
  const cp = await getCoproductionBySlug("dalmore");
  const event = cp?.eventId ? await getEventById(cp.eventId) : null;
  if (!cp || !event) throw new Error("Todavía no hay evento enlazado a la co-producción de Dalmore.");
  const validUntil = endOfChileDay(new Date(event.eventDate));
  const tags = [{ name: "campaign", value: resendTagValue("community-dalmore-30") }];
  // El link va a la dirección de la colab: el checkout nace con el look PLAYMORE, sin pasar por el sitio de Playroom.
  const host = Object.entries(COLAB_HOSTS).find(([, slug]) => slug === cp.slug)?.[0] ?? "dalmore.mansionplayroom.cl";

  const list = communityRecipients();
  let sent = 0, failed = 0, optedOut = 0;
  const errors: string[] = [];
  for (const email of list) {
    try {
      const [done] = await db.select({ key: rateLimits.key }).from(rateLimits).where(eq(rateLimits.key, sentKey(email))).limit(1);
      if (done) { sent++; continue; }
      const known = await getCustomerByEmail(email);
      const name = known?.fullName ?? null;
      const { id, code } = await codeFor(db, email, event.id, validUntil);
      await tagDalmoreCustomer(db, email, name);
      const checkoutUrl = `https://${host}/checkout/${event.slug}?code=${encodeURIComponent(code)}`;
      const res = await sendEmail({ to: email, subject: COMMUNITY_DISCOUNT_SUBJECT, html: buildCommunityDiscountEmail({ name, code, checkoutUrl }), replyTo: REPLY_TO, marketing: true, tags });
      if (res.success) {
        await db.update(discountCodes).set({ isActive: 1 }).where(and(eq(discountCodes.id, id), eq(discountCodes.isActive, 0)));
        await claim(db, sentKey(email));
        sent++;
      } else if ("reason" in res && res.reason === "Pidió no recibir correos") optedOut++;
      else { failed++; errors.push(email); }
    } catch (err) {
      failed++; errors.push(email);
      console.error(`[CommunityDiscount] ${email}:`, err instanceof Error ? err.message : err);
    }
  }
  if (sent === 0 && optedOut < list.length) throw new CrossCheckRetry(`No salió ningún correo (${failed} con error). Toca Reportar para reintentar.`);
  return `${sent} enviado${sent === 1 ? "" : "s"}${failed ? `, ${failed} con error (${errors.slice(0, 5).join(", ")})` : ""}${optedOut ? `, ${optedOut} pidieron no recibir correos (su código no se activó)` : ""}.`;
}
