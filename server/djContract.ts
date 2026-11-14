/* Contrato digital para DJs/artistas (shared/djContract.ts). Flujo:
 *  1. El dueño crea el contrato (borrador) con el monto y los horarios.
 *  2. «Enviar» deja un pedido en Cross check; recién al «Reportar» le llega el link a la artista.
 *  3. Ella lo lee y firma desde el celular (nombre, RUT, datos bancarios y firma dibujada). Queda el texto exacto, su hash,
 *     la fecha, la IP y la firma; se arma el PDF y se manda a ella con copia a contacto@.
 *  4. Al firmar queda como «por pagar» en el Staff del evento. Todo lo que sale después (recordatorio, confirmación de
 *     horario, marcar el pago) también espera «Reportar». */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { djContracts, producerSignatures, type DjContractRow } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { CrossCheckRetry, requestCrossCheck, endOfChileDay } from "./crossCheck";
import { buildAnniversaryBlastEmail } from "./emailAniversario";
import { EMAIL_BASE_URL } from "./emailLayout";
import { buildDjContractPdf } from "./djContractPdf";
import { PRODUCERS, buildDjContract, djContractPlainText, djPayment, isSignaturePng, validateSignature, type DjContract, type DjContractTerms, type ProducerKey, type ProducersStamp } from "../shared/djContract";
import { isValidRut, normalizeRut } from "../shared/rut";
import { chileDateKey, formatChileDate, formatChileDateTime, startOfChileDay } from "../shared/chileDate";

export const DJ_KIND_PREFIX = "dj-contract:";
const REPLY_TO = "contacto@mansionplayroom.cl";
const HOUR = 3_600_000;

export type DjContractStatus = "borrador" | "enviado" | "visto" | "firmado" | "anulado";

/* ── Tabla (se crea sola la primera vez; ver drizzle/0151_dj_contracts.sql) ─────────────────── */

let tableOk = false;
async function dbReady() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  if (!tableOk) {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`djContracts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`eventId\` int NOT NULL, \`status\` varchar(10) NOT NULL DEFAULT 'borrador', \`artistName\` varchar(120) NOT NULL, \`email\` varchar(320) NOT NULL, \`phone\` varchar(40), \`terms\` json NOT NULL, \`legalName\` varchar(160), \`rut\` varchar(20), \`bank\` varchar(300), \`clauseVersion\` varchar(16), \`clauseHash\` varchar(64), \`bodyText\` mediumtext, \`signatureImage\` mediumtext, \`signedAt\` timestamp NULL, \`signedIp\` varchar(64), \`signedUserAgent\` varchar(255), \`staffShiftId\` int, \`producersSig\` mediumtext, \`sentAt\` timestamp NULL, \`viewedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`djContracts_id\` PRIMARY KEY(\`id\`), KEY \`dj_contracts_event_idx\` (\`eventId\`))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`producerSignatures\` (\`key\` varchar(16) NOT NULL, \`image\` mediumtext NOT NULL, \`signedAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`producerSignatures_key\` PRIMARY KEY(\`key\`))`);
    tableOk = true;
  }
  return db;
}

/* ── Link privado: el id firmado con HMAC (se puede regenerar siempre, no se puede adivinar) ── */

const secret = () => {
  if (ENV.cookieSecret) return `djc:${ENV.cookieSecret}`;
  if (ENV.isProduction) throw new Error("Falta JWT_SECRET para firmar el link del contrato");
  return "djc:dev";
};
const mac = (id: number) => createHmac("sha256", secret()).update(String(id)).digest("base64url").slice(0, 32);
export const contractToken = (id: number) => `${id}.${mac(id)}`;
export function contractIdFromToken(token: string): number | null {
  const [idPart, sig] = String(token ?? "").split(".");
  const id = Number(idPart);
  if (!Number.isInteger(id) || id <= 0 || !sig) return null;
  const want = Buffer.from(mac(id)); const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
export const contractUrl = (id: number) => `${EMAIL_BASE_URL}/contrato/${contractToken(id)}`;
export const contractPdfPath = (id: number) => `/api/contrato/${contractToken(id)}.pdf`;

/* ── Firma de la Producción (Alexis y Gino firman una vez en el panel) ───── */

export async function listProducerSignatures() {
  const db = await dbReady();
  const rows = await db.select().from(producerSignatures);
  return PRODUCERS.map((p) => {
    const r = rows.find((x) => x.key === p.key);
    return { key: p.key as ProducerKey, name: p.name, role: p.role, signed: !!r, signedAt: r?.signedAt ?? null, image: r?.image ?? null };
  });
}

export async function saveProducerSignature(key: string, image: string): Promise<void> {
  if (!PRODUCERS.some((p) => p.key === key)) throw new Error("Productor desconocido.");
  if (!isSignaturePng(image)) throw new Error("Dibuja la firma en el recuadro.");
  const db = await dbReady();
  await db.insert(producerSignatures).values({ key, image, signedAt: new Date() }).onDuplicateKeyUpdate({ set: { image, signedAt: new Date() } });
}

/** Las firmas vigentes de los dos productores, o un error claro si falta alguna. */
async function requireProducerSignatures(): Promise<ProducersStamp> {
  const sigs = await listProducerSignatures();
  const missing = sigs.filter((s) => !s.signed).map((s) => s.name);
  if (missing.length) throw new Error(`Falta la firma de ${missing.join(" y ")}. Fírmala en Contratos DJ → Firma de la Producción.`);
  const at = new Date().toISOString();
  return Object.fromEntries(sigs.map((s) => [s.key, { image: s.image!, at }])) as ProducersStamp;
}

const parseStamp = (raw: string | null): ProducersStamp | null => { try { return raw ? (JSON.parse(raw) as ProducersStamp) : null; } catch { return null; } };

/* ── Crear / editar / listar ───────────────────────────────────────────── */

export interface DjContractInput {
  eventId?: number;
  artistName: string;
  email: string;
  phone?: string | null;
  callTime: string;
  soundcheckTime: string;
  setStart?: string;
  setEnd?: string;
  amountClp: number;
  amountMode: "liquido" | "bruto";
  proportionalDiscount: boolean;
  cancellation: { enabled: boolean; noticeDays: number; penaltyPercent: number };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Las fechas y el nombre del evento, tal como salen en el contrato. La dirección exacta nunca va. */
async function termsFor(eventId: number, input: DjContractInput): Promise<DjContractTerms> {
  const { getEventById } = await import("./db");
  const { getEventColabBrand } = await import("./coproduction");
  const event = await getEventById(eventId);
  if (!event) throw new Error("Evento no encontrado");
  const colab = await getEventColabBrand(eventId, { allowNotLive: true });
  const date = new Date(event.eventDate);
  const day = (d: Date, withWeekday: boolean) => formatChileDate(d, { withYear: true, withWeekday }).replace(",", "");
  const next = new Date(startOfChileDay(date).getTime() + 30 * HOUR); // el día siguiente (la madrugada del set)
  return {
    artistName: clean(input.artistName),
    eventName: colab ? `${colab.eventName} · Playroom × Dalmore` : event.title,
    eventDateText: day(date, true),
    setDateText: `madrugada del ${day(next, true)}`,
    setStart: input.setStart || "02:00",
    setEnd: input.setEnd || "04:00",
    callTime: input.callTime,
    soundcheckTime: input.soundcheckTime,
    venueText: colab ? "Providencia, Santiago (formato open air)" : (event.venue || "Santiago"),
    amountClp: Math.round(input.amountClp),
    amountMode: input.amountMode,
    year: Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric" }).format(date)),
    proportionalDiscount: input.proportionalDiscount,
    cancellation: input.cancellation,
  };
}

async function defaultEventId(): Promise<number> {
  const { getCoproductionBySlug } = await import("./coproduction");
  const cp = await getCoproductionBySlug("dalmore");
  if (!cp?.eventId) throw new Error("Elige el evento: todavía no hay uno enlazado a Dalmore.");
  return cp.eventId;
}

export async function createDjContract(input: DjContractInput): Promise<{ id: number }> {
  const db = await dbReady();
  const eventId = input.eventId ?? (await defaultEventId());
  const terms = await termsFor(eventId, input);
  const [res] = await db.insert(djContracts).values({
    eventId, artistName: terms.artistName, email: input.email.trim().toLowerCase(), phone: input.phone?.trim() || null, terms, status: "borrador",
  }) as any;
  return { id: Number(res.insertId) };
}

export async function updateDjContract(id: number, input: DjContractInput): Promise<void> {
  const db = await dbReady();
  const row = await getRow(id);
  if (row.status !== "borrador") throw new Error("Solo se puede editar mientras es borrador. Anúlalo y crea uno nuevo.");
  const terms = await termsFor(row.eventId, input);
  await db.update(djContracts).set({ artistName: terms.artistName, email: input.email.trim().toLowerCase(), phone: input.phone?.trim() || null, terms }).where(eq(djContracts.id, id));
}

async function getRow(id: number): Promise<DjContractRow> {
  const db = await dbReady();
  const [row] = await db.select().from(djContracts).where(eq(djContracts.id, id)).limit(1);
  if (!row) throw new Error("Ese contrato ya no existe.");
  return row;
}

export const termsOf = (row: DjContractRow) => row.terms as unknown as DjContractTerms;

export async function listDjContracts(eventId?: number) {
  const db = await dbReady();
  const rows = await db.select({
    id: djContracts.id, eventId: djContracts.eventId, status: djContracts.status, artistName: djContracts.artistName, email: djContracts.email,
    phone: djContracts.phone, terms: djContracts.terms, signedAt: djContracts.signedAt, sentAt: djContracts.sentAt, viewedAt: djContracts.viewedAt,
    legalName: djContracts.legalName, createdAt: djContracts.createdAt,
  }).from(djContracts).where(eventId ? eq(djContracts.eventId, eventId) : undefined).orderBy(desc(djContracts.createdAt)).limit(100);
  return rows.map((r) => ({ ...r, terms: r.terms as unknown as DjContractTerms, link: contractUrl(r.id), pdfPath: r.status === "firmado" ? contractPdfPath(r.id) : null, payment: djPayment(r.terms as unknown as DjContractTerms) }));
}

export async function voidDjContract(id: number): Promise<void> {
  const db = await dbReady();
  await db.update(djContracts).set({ status: "anulado" }).where(and(eq(djContracts.id, id), inArray(djContracts.status, ["borrador", "enviado", "visto"])));
}

/* ── Cross check: enviar, recordar, confirmar y marcar el pago ─────────── */

export type DjKind = "send" | "remind" | "confirm" | "pay";
const kindOf = (k: DjKind) => `${DJ_KIND_PREFIX}${k}`;

/** El dueño toca «Enviar»: deja el pedido para revisar el correo y reportarlo. */
export async function requestSendDjContract(id: number, now: Date = new Date()): Promise<boolean> {
  const row = await getRow(id);
  if (row.status === "firmado" || row.status === "anulado") throw new Error("Este contrato ya no se puede enviar.");
  await requireProducerSignatures();
  const t = termsOf(row);
  return requestCrossCheck({
    kind: kindOf("send"), dedupeKey: `dj-contract:send:${id}:${chileDateKey(now)}`, eventId: row.eventId,
    title: `Enviar contrato a ${row.artistName}`,
    summary: `Correo PLAYMORE a ${row.email} con el link para revisar y firmar el contrato (set ${t.setStart}–${t.setEnd}, ${djPayment(t).gross.toLocaleString("es-CL")} brutos en boleta de honorarios, pago el mismo día). Toca «Ver el correo completo» para leerlo antes.`,
    payload: { id }, expiresAt: endOfChileDay(new Date(now.getTime() + 3 * 24 * HOUR)), pushBody: `Contrato de ${row.artistName}: revisa el correo y toca Reportar`,
  });
}

/** Cuándo termina el set (instante real), a partir del día del evento. */
export function setEndAt(eventDate: Date, t: DjContractTerms): Date {
  const [h, m] = t.setEnd.split(":").map(Number);
  const startNext = startOfChileDay(new Date(startOfChileDay(eventDate).getTime() + 30 * HOUR));
  return new Date(startNext.getTime() + ((h || 0) * 60 + (m || 0)) * 60_000);
}

/** Desde el cron: deja los pedidos que ya tocan (todos esperan «Reportar»). */
export async function ensureDjContractRequests(now: Date = new Date()): Promise<number> {
  const db = await dbReady();
  const { getEventById } = await import("./db");
  const rows = await db.select().from(djContracts).where(inArray(djContracts.status, ["enviado", "visto", "firmado"]));
  let created = 0;
  for (const row of rows) {
    const t = termsOf(row);
    const event = await getEventById(row.eventId);
    if (!event) continue;
    const eventAt = new Date(event.eventDate);
    if (row.status !== "firmado") {
      if (row.sentAt && now.getTime() - new Date(row.sentAt).getTime() > 48 * HOUR && eventAt.getTime() > now.getTime()) {
        if (await requestCrossCheck({
          kind: kindOf("remind"), dedupeKey: `dj-contract:remind:${row.id}`, eventId: row.eventId, title: `Recordar a ${row.artistName} que firme el contrato`,
          summary: `Pasaron más de 48 horas desde que se envió y ${row.artistName} todavía no firma. Al reportar le llega un recordatorio con el link.`,
          payload: { id: row.id }, expiresAt: eventAt, pushBody: `${row.artistName} no ha firmado el contrato`,
        })) created++;
      }
      continue;
    }
    if (eventAt.getTime() - now.getTime() < 3 * 24 * HOUR && eventAt.getTime() > now.getTime()) {
      if (await requestCrossCheck({
        kind: kindOf("confirm"), dedupeKey: `dj-contract:confirm:${row.id}`, eventId: row.eventId, title: `Confirmar horario con ${row.artistName}`,
        summary: `Faltan menos de 3 días. Al reportar le llega un correo con su set (${t.setStart}–${t.setEnd}), la llegada (${t.callTime}) y la prueba de sonido (${t.soundcheckTime}).`,
        payload: { id: row.id }, expiresAt: eventAt,
      })) created++;
    }
    const end = setEndAt(eventAt, t);
    if (now.getTime() >= end.getTime() - 15 * 60_000) {
      const p = djPayment(t);
      if (await requestCrossCheck({
        kind: kindOf("pay"), dedupeKey: `dj-contract:pay:${row.id}`, eventId: row.eventId, title: `Pagar a ${row.artistName}: ${p.net.toLocaleString("es-CL")} líquidos`,
        summary: `Terminó el set. Contra su boleta de honorarios por $${p.gross.toLocaleString("es-CL")} brutos (retención $${p.retention.toLocaleString("es-CL")}), transfiérele $${p.net.toLocaleString("es-CL")}. Datos bancarios en el contrato firmado. Al reportar queda MARCADO COMO PAGADO en Staff y ella recibe el aviso; la transferencia la haces tú.`,
        payload: { id: row.id }, expiresAt: new Date(end.getTime() + 36 * HOUR), pushBody: `Paga a ${row.artistName} al terminar su set`,
      })) created++;
    }
  }
  return created;
}

/* ── Correos ───────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const firstName = (s: string) => esc(s.trim().split(/\s+/)[0] ?? "");
const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export function buildDjEmail(kind: DjKind, row: Pick<DjContractRow, "id" | "artistName" | "legalName">, t: DjContractTerms): { subject: string; html: string } {
  const name = row.legalName || row.artistName;
  const p = djPayment(t);
  const base = { theme: "playmore" as const, buyerName: firstName(name), footer: false, ctaUrl: contractUrl(row.id), eventInfo: { title: t.eventName, dateText: t.eventDateText, venue: t.venueText } };
  if (kind === "send" || kind === "remind") {
    return {
      subject: kind === "send" ? `Tu contrato para ${t.eventName.split(" · ")[0]} · ${t.eventDateText}` : `Recordatorio: tu contrato de ${t.eventName.split(" · ")[0]} espera tu firma`,
      html: buildAnniversaryBlastEmail({
        ...base,
        preheader: `Revisa y firma tu contrato desde el celular. Tu set: ${t.setStart} a ${t.setEnd} hrs.`,
        headline: kind === "send" ? "Tu contrato está listo para firmar" : "Tu contrato espera tu firma",
        highlightLabel: "Tu set · cierre de la noche", highlightValue: `${t.setStart} – ${t.setEnd} hrs`,
        paragraphs: [
          `${kind === "send" ? "Gracias por sumarte" : "Te recordamos"}: te compartimos el contrato para <strong>${esc(t.eventName)}</strong>, el <strong>${esc(t.eventDateText)}</strong>. Tienes el cierre de la noche, el estallido final de perreo de <strong>${t.setStart} a ${t.setEnd} hrs</strong>.`,
          `El pago es de <strong>${clp(p.gross)} brutos</strong> en boleta de honorarios (${clp(p.net)} líquidos), el <strong>100 % el mismo día, al terminar el set</strong>.`,
          "Ábrelo desde tu celular, léelo con calma, completa tus datos y firma con el dedo. Te llega el PDF firmado por correo.",
        ],
        ctaText: "Revisar y firmar", closing: `<p style="color:#C4B3A6;font-size:14px;text-align:center;margin:0 0 12px;">¿Dudas? Responde a este correo y te escribimos.</p>`,
      }),
    };
  }
  if (kind === "confirm") {
    return {
      subject: `Tu set en ${t.eventName.split(" · ")[0]}: horarios para el viernes`,
      html: buildAnniversaryBlastEmail({
        ...base, ctaUrl: contractUrl(row.id), preheader: `Llegada ${t.callTime} · prueba de sonido ${t.soundcheckTime} · set ${t.setStart}–${t.setEnd}`,
        headline: "Ya casi: tus horarios", highlightLabel: "Tu set", highlightValue: `${t.setStart} – ${t.setEnd} hrs`,
        paragraphs: [
          `Faltan pocos días para <strong>${esc(t.eventName)}</strong>. Te dejamos todo claro:`,
          `<strong>Llegada:</strong> ${t.callTime} hrs<br /><strong>Prueba de sonido:</strong> ${t.soundcheckTime} hrs<br /><strong>Tu set:</strong> ${t.setStart} a ${t.setEnd} hrs (${esc(t.setDateText)})`,
          "Te escribimos por WhatsApp con la dirección exacta del recinto. Recuerda tener lista tu boleta de honorarios para el pago al terminar.",
        ],
        ctaText: "Ver mi contrato",
      }),
    };
  }
  return {
    subject: `Pago registrado · ${t.eventName.split(" · ")[0]}`,
    html: buildAnniversaryBlastEmail({
      ...base, ctaUrl: contractUrl(row.id), preheader: "Registramos tu pago. ¡Gracias por tu set!",
      headline: "¡Gracias por el estallido final!", highlightLabel: "Pago registrado", highlightValue: clp(p.net),
      paragraphs: [`Registramos el pago de <strong>${clp(p.net)} líquidos</strong> (boleta por ${clp(p.gross)} brutos, retención ${clp(p.retention)}). Si no lo ves en tu cuenta, respóndenos y lo revisamos.`, "Fue una noche increíble con tu set. ¡Nos vemos en la próxima!"],
      ctaText: "Ver mi contrato",
    }),
  };
}

export async function previewDjCrossCheck(kind: string, payload: unknown) {
  const id = Number((payload as { id?: number } | null)?.id);
  const k = kind.slice(DJ_KIND_PREFIX.length) as DjKind;
  if (!id || !["send", "remind", "confirm", "pay"].includes(k)) return null;
  const row = await getRow(id);
  const { subject, html } = buildDjEmail(k, row, termsOf(row));
  return { to: row.email, replyTo: REPLY_TO, subject, html };
}

/** Lo que corre al «Reportar» un pedido de contrato. */
export async function executeDjCrossCheck(kind: string, payload: unknown): Promise<string> {
  const id = Number((payload as { id?: number } | null)?.id);
  const k = kind.slice(DJ_KIND_PREFIX.length) as DjKind;
  if (!id) throw new Error("Falta el contrato.");
  const { sendEmail } = await import("./email");
  const db = await dbReady();
  const row = await getRow(id);
  if (row.status === "anulado") throw new Error("Este contrato fue anulado.");
  const t = termsOf(row);

  if (k === "pay") {
    if (row.status !== "firmado") throw new Error("El contrato no está firmado.");
    if (row.staffShiftId) await (await import("./staff")).updateShift(row.staffShiftId, { paid: true });
  } else if ((k === "send" || k === "remind") && row.status === "firmado") {
    throw new Error("Ya firmó: no hace falta enviarlo.");
  }
  // Al enviar, la Producción firma: se copian sus firmas al contrato (un cambio posterior no altera lo enviado).
  const stamp = k === "send" ? await requireProducerSignatures() : null;
  const { subject, html } = buildDjEmail(k, row, t);
  const res = await sendEmail({ to: row.email, subject, html, replyTo: REPLY_TO, cc: k === "pay" ? undefined : REPLY_TO });
  if (!res.success) throw new CrossCheckRetry(`No se pudo enviar el correo a ${row.email}. Toca Reportar para reintentar.`);
  if (k === "send") await db.update(djContracts).set({ status: row.status === "visto" ? "visto" : "enviado", sentAt: new Date(), producersSig: JSON.stringify(stamp) }).where(eq(djContracts.id, id));
  return k === "pay" ? `Pago marcado como hecho en Staff y aviso enviado a ${row.email}.` : `Correo enviado a ${row.email}.`;
}

/* ── Lo que ve y hace la artista (link privado) ───────────────────────── */

export interface PublicContract {
  status: DjContractStatus; canSign: boolean; artistName: string; contract: DjContract;
  signed: { legalName: string; signedAtText: string } | null; pdfPath: string | null;
  /** La firma de la Producción, estampada al enviar (null mientras es borrador). */
  producers: { name: string; role: string; image: string; signedAtText: string }[] | null;
}

function producersView(row: DjContractRow): PublicContract["producers"] {
  const stamp = parseStamp(row.producersSig);
  if (!stamp) return null;
  return PRODUCERS.filter((p) => stamp[p.key]).map((p) => ({ name: p.name, role: p.role, image: stamp[p.key].image, signedAtText: formatChileDateTime(stamp[p.key].at) }));
}

export async function viewDjContract(token: string): Promise<PublicContract> {
  const id = contractIdFromToken(token);
  if (!id) throw new Error("Este link no es válido. Pide uno nuevo.");
  const db = await dbReady();
  const row = await getRow(id);
  if (row.status === "anulado") throw new Error("Este contrato fue anulado. Pide uno nuevo.");
  if (row.status === "enviado") await db.update(djContracts).set({ status: "visto", viewedAt: new Date() }).where(and(eq(djContracts.id, id), eq(djContracts.status, "enviado")));
  const signed = row.status === "firmado";
  return {
    status: row.status === "enviado" ? "visto" : (row.status as DjContractStatus),
    canSign: row.status === "enviado" || row.status === "visto",
    artistName: row.artistName,
    contract: buildDjContract(termsOf(row), signed ? { legalName: row.legalName, rut: row.rut } : {}),
    signed: signed ? { legalName: row.legalName ?? "", signedAtText: formatChileDateTime(row.signedAt!) } : null,
    pdfPath: signed ? contractPdfPath(id) : null,
    producers: producersView(row),
  };
}

export interface SignInput { legalName: string; rut: string; bank: string; phone?: string; accept: boolean; signature: string; ip: string; userAgent: string }

export async function signDjContract(token: string, input: SignInput): Promise<{ pdfPath: string }> {
  const id = contractIdFromToken(token);
  if (!id) throw new Error("Este link no es válido. Pide uno nuevo.");
  const problem = validateSignature(input, isValidRut);
  if (problem) throw new Error(problem);
  const db = await dbReady();
  const row = await getRow(id);
  if (row.status === "firmado") throw new Error("Este contrato ya está firmado.");
  if (row.status !== "enviado" && row.status !== "visto") throw new Error("Este contrato todavía no está disponible para firmar.");

  const rut = normalizeRut(input.rut);
  const legalName = clean(input.legalName).slice(0, 160);
  const contract = buildDjContract(termsOf(row), { legalName, rut });
  const bodyText = djContractPlainText(contract);
  const hash = createHash("sha256").update(bodyText).digest("hex");
  const now = new Date();
  // Una sola firma: el que llega primero se lleva el contrato.
  const claim = await db.update(djContracts).set({
    status: "firmado", legalName, rut, bank: input.bank.trim().slice(0, 300), phone: input.phone?.trim() || row.phone, clauseVersion: contract.version, clauseHash: hash,
    bodyText, signatureImage: input.signature, signedAt: now, signedIp: input.ip.slice(0, 64), signedUserAgent: input.userAgent.slice(0, 255),
  }).where(and(eq(djContracts.id, id), inArray(djContracts.status, ["enviado", "visto"])));
  const affected = Number((Array.isArray(claim) ? (claim[0] as any)?.affectedRows : (claim as any)?.affectedRows) ?? 0);
  if (affected === 0) throw new Error("Este contrato ya está firmado.");

  // Lo que sigue nunca deshace la firma.
  await linkToStaff(id, row, legalName, rut).catch((err) => console.error("[DjContract] staff:", err));
  await sendSignedCopy(id).catch((err) => console.error("[DjContract] correo firmado:", err));
  await import("./push").then((m) => m.sendPushToAdminsAlways({ title: "Contrato firmado ✍️", body: `${row.artistName} firmó su contrato`, url: "/admin?section=contratos-dj" })).catch(() => {});
  return { pdfPath: contractPdfPath(id) };
}

/** Deja a la artista en Staff con su monto «por pagar» (boleta de honorarios). */
async function linkToStaff(id: number, row: DjContractRow, legalName: string, rut: string) {
  const staff = await import("./staff");
  const db = await dbReady();
  const t = termsOf(row);
  const members = await staff.listStaff();
  const existing = members.find((m: any) => m.rut && normalizeRut(m.rut) === rut) ?? members.find((m: any) => m.name.toLowerCase() === t.artistName.toLowerCase());
  const staffId = existing?.id ?? (await staff.saveStaff({ name: t.artistName, role: "DJ", cargo: "dj", defaultRateClp: t.amountClp, rut, phone: row.phone, notes: `${legalName} · contrato digital #${id}` })).id;
  let shiftId: number | null = null;
  try {
    shiftId = (await staff.addShift({ eventId: row.eventId, staffId, amountClp: t.amountClp, paymentType: "boleta_honorarios", amountMode: t.amountMode, hours: 2, note: `Contrato DJ #${id}` })).id;
  } catch {
    const { shifts } = await staff.listShifts(row.eventId);
    shiftId = (shifts as any[]).find((s) => s.staffId === staffId)?.id ?? null;
  }
  if (shiftId) await db.update(djContracts).set({ staffShiftId: shiftId }).where(eq(djContracts.id, id));
}

export async function djContractPdf(token: string): Promise<{ pdf: Buffer; fileName: string } | null> {
  const id = contractIdFromToken(token.replace(/\.pdf$/, ""));
  if (!id) return null;
  const row = await getRow(id);
  if (row.status !== "firmado" || !row.bodyText) return null;
  const contract = buildDjContract(termsOf(row), { legalName: row.legalName, rut: row.rut });
  const png = row.signatureImage ? Buffer.from(row.signatureImage.replace(/^data:image\/png;base64,/, ""), "base64") : null;
  const stamp = parseStamp(row.producersSig);
  const pdf = await buildDjContractPdf({
    contract, sentAtText: row.sentAt ? formatChileDateTime(row.sentAt) : null,
    producers: PRODUCERS.map((p) => ({
      name: p.name, role: p.role,
      signaturePng: stamp?.[p.key] ? Buffer.from(stamp[p.key].image.replace(/^data:image\/png;base64,/, ""), "base64") : null,
      signedAtText: stamp?.[p.key] ? formatChileDateTime(stamp[p.key].at) : null,
    })),
    signer: { legalName: row.legalName ?? "", rut: row.rut ?? "", signedAtText: formatChileDateTime(row.signedAt!), ip: row.signedIp ?? "", hash: row.clauseHash ?? "", signaturePng: png },
  });
  return { pdf, fileName: `contrato-${row.artistName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf` };
}

async function sendSignedCopy(id: number) {
  const out = await djContractPdf(contractToken(id));
  if (!out) return;
  const row = await getRow(id);
  const t = termsOf(row);
  const { sendEmail } = await import("./email");
  const html = buildAnniversaryBlastEmail({
    theme: "playmore", buyerName: firstName(row.legalName || row.artistName), footer: false, ctaUrl: contractUrl(id), ctaText: "Ver mi contrato",
    preheader: "Tu contrato firmado va adjunto en PDF.", headline: "¡Contrato firmado!", highlightLabel: "Tu set", highlightValue: `${t.setStart} – ${t.setEnd} hrs`,
    paragraphs: [`Recibimos tu firma. Te dejamos el contrato en PDF, con la constancia de fecha y hora. Te vemos el <strong>${esc(t.eventDateText)}</strong> para el estallido final de <strong>${esc(t.eventName)}</strong>.`],
    eventInfo: { title: t.eventName, dateText: t.eventDateText, venue: t.venueText },
  });
  await sendEmail({ to: row.email, cc: REPLY_TO, subject: `Contrato firmado · ${t.eventName.split(" · ")[0]}`, html, replyTo: REPLY_TO, attachments: [{ filename: out.fileName, content: out.pdf }] });
}
