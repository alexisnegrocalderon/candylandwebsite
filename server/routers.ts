import { COOKIE_NAME, ONE_YEAR_MS, CAJA_COOKIE_NAME, CAJA_SESSION_MS, CAJA_DEVICE_COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk, ADMIN_LOCAL_OPEN_ID } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, operatorProcedure, supervisorProcedure, deviceProcedure, doorProcedure, kitchenProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { getMission300Status, evaluateMission300, processCardPaymentForOrder, confirmFreeOrder, resendConfirmationEmail } from "./webhooks";
import { hashPin, verifyPin, signOperatorSession } from "./caja/auth";
import { generateEnrollCode, enrollCodeExpiry, generateDeviceToken, hashDeviceToken, signDeviceSession, DEVICE_SESSION_MS } from "./caja/deviceAuth";
import { redeemDisplayCode } from "./caja/redeem";
import { checkInTicket } from "./caja/checkin";
import { AVATARS_PER_GENDER, PARTY_GENDERS, PARTY_ZONES, partyEntryDenial, sanitizeAlias, sanitizeGiftMessage, sanitizeMessage } from "../shared/party";
import * as ambassadorProgram from "./ambassadorProgram";
import { monthKeyFor } from "../shared/ambassadorProgram";
import * as applications from "./ambassadorApplications";
import {
  AMBASSADOR_REQUIREMENTS, AMBASSADOR_TASKS, instagramLinkFor, sanitizeApplicantName,
  sanitizeApplicationMessage, sanitizeFollowers, sanitizeInstagram, sanitizeWhatsapp, whatsappLinkFor,
} from "../shared/ambassadorApplication";
import { buildAmbassadorApplicationEmail, buildAmbassadorWelcomeEmail, buildApplicationReceivedEmail } from "./email";

/** Puerta de entrada a "Caramelo": resuelve al que llama por su ticketCode
 * y revalida, en cada llamada, que entró de verdad por la puerta y que la
 * fiesta está abierta. Todos los endpoints de `party` pasan por acá. */
async function requirePartyActor(ticketCode: string) {
  const actor = await db.getPartyActor(ticketCode);
  const denial = partyEntryDenial(actor?.ticket, actor?.event, new Date());
  if (denial || !actor) {
    const message =
      denial === 'no_ingreso' ? 'Tu entrada todavía no fue escaneada en la puerta'
      : denial === 'fuera_de_horario' ? 'La fiesta no está abierta en este momento'
      : 'No encontramos tu entrada';
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
  return actor;
}

/** Igual que la anterior, pero además exige tener el perfil creado. */
async function requirePartyProfile(ticketCode: string) {
  const actor = await requirePartyActor(ticketCode);
  if (!actor.profile) throw new TRPCError({ code: 'FORBIDDEN', message: 'Todavía no creaste tu perfil' });
  return { ...actor, profile: actor.profile };
}
import { createCajaSale } from "./caja/sale";
import { listKitchenTickets, updateKitchenTicket } from "./kitchen";
import { voidTicketCode } from "./caja/void";
import { sendEmail, buildShiftCloseEmail, buildMailingBlastEmail } from "./email";
import { generateMailingTemplate, sendMailingBatch, getMailingEventInfo, createAutoMailingCampaign, MailingContentSchema, MAILING_BATCH_MAX } from "./mailing";
import { sendPendingReminders, generateReminderCopy } from "./orderReminders";
import { parseCsv, extractEmailColumn } from "./csv";
import QRCode from "qrcode";
import { consumeBackupCode, createTotpSecret, generateBackupCodes, parseBackupCodes, safeCompare, totpUri, verifyTotp } from "./adminSecurity";

const SHIFT_CLOSE_REPORT_EMAIL = 'contacto@mansionplayroom.cl';
const APPLICATIONS_EMAIL = 'contacto@mansionplayroom.cl';
const APPLICATION_MAX_PER_HOUR = 5;

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  return next({ ctx });
});

// Qué bloques de la tarjeta de evento incluir en un mail de mailing masivo --
// mismo shape usado por mailing.renderPreview, mailing.sendBatch y
// mailing.createAutoCampaign (server/email.ts MailingEventSections).
const mailingEventSectionsSchema = z.object({
  banner: z.boolean(),
  details: z.boolean(),
  mission300: z.boolean(),
  venueGrid: z.boolean(),
});


/** Verifica el PIN de un operador aplicando los dos límites que ya existen:
 * por IP (para que nadie enumere operadores probando pocos intentos en cada
 * uno) y por operador (5 fallos lo bloquean 5 minutos). Lo comparten el
 * login de /caja y el de /puerta -- una sola implementación para que un
 * arreglo de seguridad no se aplique en un lado y se olvide en el otro. */
async function verifyOperatorPinOrThrow(ctx: any, operatorId: number, pin: string) {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  const clientIp = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
  const ipKey = `pin-login:${clientIp}`;
  if (!(await db.checkIpRateLimit(ipKey))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos desde este dispositivo. Intenta de nuevo más tarde.' });
  }

  const operator = await db.getOperatorById(operatorId);
  if (!operator || !operator.active) {
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'PIN incorrecto' });
  }

  if (operator.lockedUntil && new Date(operator.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(operator.lockedUntil).getTime() - Date.now()) / 60_000);
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Demasiados intentos. Intenta de nuevo en ${minutesLeft} min.` });
  }

  if (!verifyPin(pin, operator.pinHash)) {
    await db.recordFailedPinAttempt(operator.id);
    await db.recordIpFailedAttempt(ipKey);
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'PIN incorrecto' });
  }

  await db.resetPinAttempts(operator.id);
  return operator;
}

/** Igual que la anterior pero solo para quienes trabajan en la puerta. */
async function verifyDoorPinOrThrow(ctx: any, operatorId: number, pin: string) {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  if (operator.role !== 'acceso' && operator.role !== 'supervisor' && operator.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu usuario no trabaja en la puerta' });
  }
  return operator;
}

/** Igual que las anteriores pero solo para quienes trabajan en cocina. */
async function verifyKitchenPinOrThrow(ctx: any, operatorId: number, pin: string) {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  if (operator.role !== 'cocina' && operator.role !== 'supervisor' && operator.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu usuario no trabaja en cocina' });
  }
  return operator;
}


/** Clave de límite por IP del panel de administración, separada de la del
 * PIN de caja para que un ataque a uno no bloquee al otro. */
function adminIpKey(ctx: any): string {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
  return `admin-login:${ip}`;
}

/** IP del cliente, misma extracción que ya usan adminIpKey y
 * verifyOperatorPinOrThrow, pero sin el prefijo -- cada llamador arma su
 * propia clave de rate limit. */
function clientIp(ctx: any): string {
  const forwardedFor = ctx.req.headers['x-forwarded-for'];
  return (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || 'unknown';
}

/** Vale de corta vida que acredita haber pasado el primer paso (la
 * contraseña). Va firmado y dura 5 minutos: sin él, el segundo paso
 * tendría que confiar en la palabra del cliente. */
async function signAdminStepTicket(): Promise<string> {
  return sdk.signSession({ openId: `${ADMIN_LOCAL_OPEN_ID}:step1`, appId: 'candyland-admin-2fa', name: 'step1' }, { expiresInMs: 5 * 60 * 1000 });
}

async function requireAdminStepTicket(ticket: string) {
  try {
    const payload = await sdk.verifySession(ticket);
    if (payload?.openId !== `${ADMIN_LOCAL_OPEN_ID}:step1`) throw new Error('bad ticket');
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Vuelve a ingresar tu contraseña' });
  }
}

/** La sesión de admin baja de UN AÑO a 7 días. Un año era demasiado para
 * el panel que puede borrarlo todo, y con segundo factor volver a entrar
 * cuesta diez segundos. */
const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

async function issueAdminSession(ctx: any) {
  await db.upsertUser({ openId: ADMIN_LOCAL_OPEN_ID, name: 'Admin', role: 'admin', lastSignedIn: new Date() });
  const sessionToken = await sdk.signSession({ openId: ADMIN_LOCAL_OPEN_ID, appId: 'candyland-admin', name: 'Admin' }, { expiresInMs: ADMIN_SESSION_MS });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ADMIN_SESSION_MS });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // Login simple por contraseña para el panel admin — no depende de ningún
    // OAuth externo, solo de la variable de entorno ADMIN_PASSWORD.
    // Paso 1 de 2: la contraseña NO entrega sesión por sí sola. Antes
    // este endpoint firmaba la cookie de una, sin ningún límite de
    // intentos -- un script podía probar miles de contraseñas por minuto
    // contra el panel que puede borrar compras y exportar la base entera.
    adminLogin: publicProcedure.input(z.object({ password: z.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
      }

      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || !safeCompare(input.password, adminPassword)) {
        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Contraseña incorrecta' });
      }

      // Vale de un solo uso para el segundo paso: sin esto habría que
      // volver a mandar la contraseña, o peor, confiar en que el cliente
      // dice la verdad sobre haberla pasado.
      await db.resetIpRateLimit(ipKey);

      // Válvula de escape que NO depende de la base de datos: con
      // ADMIN_2FA_DISABLED=1 en Vercel, la contraseña basta. Existe porque
      // un segundo factor que deja al dueño fuera de su propio negocio es
      // peor que no tenerlo, y tocar variables de entorno es más rápido
      // que entrar a la consola de la base a medianoche.
      if (process.env.ADMIN_2FA_DISABLED === '1') {
        await issueAdminSession(ctx);
        return { ticket: '', needsSetup: false, skipped2fa: true } as const;
      }

      const ticket = await signAdminStepTicket();
      const totp = await db.getAdminTotp();
      return { ticket, needsSetup: !totp?.confirmedAt } as const;
    }),

    // Genera el secreto y el QR para configurar la app de autenticación.
    // No activa nada todavía: recién se activa cuando el dueño confirma
    // con un código real (adminConfirmTotp).
    adminSetupTotp: publicProcedure.input(z.object({ ticket: z.string() })).mutation(async ({ input }) => {
      await requireAdminStepTicket(input.ticket);
      const existing = await db.getAdminTotp();
      if (existing?.confirmedAt) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'El segundo factor ya está configurado' });
      }
      // Reusa el secreto sin confirmar si ya existe: regenerarlo invalida
      // el QR que el dueño ya escaneó y lo deja sin poder confirmar nunca.
      const secret = await db.getOrCreateUnconfirmedAdminTotp(createTotpSecret());
      const qrImageUrl = await QRCode.toDataURL(totpUri(secret), { width: 320, margin: 2 });
      return { secret, qrImageUrl } as const;
    }),

    // Confirma la configuración y devuelve los códigos de respaldo. Es la
    // ÚNICA vez que se muestran legibles: después solo queda su hash.
    adminConfirmTotp: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireAdminStepTicket(input.ticket);
        const totp = await db.getAdminTotp();
        if (!totp) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Primero escanea el código QR' });
        if (totp.confirmedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Ya está configurado' });

        const res = verifyTotp({ secret: totp.secret, token: input.code });
        if (!res.ok) {
          await db.recordIpFailedAttempt(adminIpKey(ctx));
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Ese código no coincide. Revisa que el reloj de tu teléfono esté en hora.' });
        }

        const { plain, hashed } = generateBackupCodes();
        await db.confirmAdminTotp(totp.id, hashed, res.timeStep);
        await issueAdminSession(ctx);
        return { backupCodes: plain } as const;
      }),

    // Paso 2 de 2: el código de la app (o uno de respaldo). Recién acá se
    // firma la sesión.
    adminVerifyCode: publicProcedure.input(z.object({ ticket: z.string(), code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const ipKey = adminIpKey(ctx);
        if (!(await db.checkIpRateLimit(ipKey))) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos.' });
        }
        await requireAdminStepTicket(input.ticket);

        const totp = await db.getAdminTotp();
        if (!totp?.confirmedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El segundo factor no está configurado' });

        const res = verifyTotp({ secret: totp.secret, token: input.code, lastUsedStep: totp.lastUsedStep });
        if (res.ok) {
          await db.recordAdminTotpStep(totp.id, res.timeStep);
          await db.resetIpRateLimit(ipKey);
          await issueAdminSession(ctx);
          return { success: true } as const;
        }

        // Si no era un código de la app, puede ser uno de respaldo.
        const backup = consumeBackupCode(parseBackupCodes(totp.backupCodes), input.code);
        if (backup.ok) {
          await db.consumeAdminBackupCodes(totp.id, backup.remaining);
          await db.resetIpRateLimit(ipKey);
          await issueAdminSession(ctx);
          return { success: true, backupCodeUsed: true, backupCodesLeft: backup.remaining.length } as const;
        }

        await db.recordIpFailedAttempt(ipKey);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: res.reason === 'reusado' ? 'Ese código ya se usó. Espera al siguiente.' : 'Código incorrecto',
        });
      }),
  }),

  events: router({
    listPublished: publicProcedure.query(async () => {
      return db.getPublishedEvents();
    }),
    // Para la sección "Próximos Eventos" de la home: incluye publicados y pasados
    // (para mostrar el historial en blanco y negro junto a los próximos a color).
    listForHome: publicProcedure.query(async () => {
      return db.getHomeEvents();
    }),
    getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      return db.getEventBySlug(input.slug);
    }),
    getTicketTypes: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      const event = await db.getEventBySlug(input.slug);
      if (!event) return [];
      return db.getTicketTypesByEventId(event.id);
    }),
    // Admin
    listAll: adminProcedure.query(async () => {
      return db.getAllEvents();
    }),
    create: adminProcedure.input(z.object({
      title: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      imageUrl: z.string().optional(),
      venue: z.string().optional(),
      address: z.string().optional(),
      mapsUrl: z.string().optional(),
      eventDate: z.string(),
      doorsOpen: z.string().optional(),
      status: z.enum(['draft', 'published', 'soldout', 'cancelled', 'past']).optional(),
      featured: z.number().optional(),
    })).mutation(async ({ input }) => {
      return db.createEvent(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      title: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      imageUrl: z.string().optional(),
      venue: z.string().optional(),
      address: z.string().optional(),
      mapsUrl: z.string().optional(),
      eventDate: z.string().optional(),
      doorsOpen: z.string().optional(),
      status: z.enum(['draft', 'published', 'soldout', 'cancelled', 'past']).optional(),
      featured: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateEvent(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteEvent(input.id);
    }),
    // Ticket types management
    listTicketTypes: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getTicketTypesByEventId(input.eventId);
    }),
    createTicketType: adminProcedure.input(z.object({
      eventId: z.number(),
      name: z.string(),
      accesoSlug: z.enum(['duo', 'duo_mujeres', 'soltera', 'soltero', 'trio', 'grupo', 'cumpleaneros']).optional(),
      category: z.enum(['acceso', 'extra', 'consumo', 'locker', 'merch']).optional(),
      description: z.string().optional(),
      price: z.number(),
      originalPrice: z.number().optional(),
      totalStock: z.number(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
      costPrice: z.number().optional(),
      color: z.string().optional(),
      internalCode: z.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z.string().max(8).optional(),
      groupName: z.string().max(50).optional(),
      toKitchen: z.number().min(0).max(1).optional(),
    })).mutation(async ({ input }) => {
      return db.createTicketType(input);
    }),
    updateTicketType: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      accesoSlug: z.enum(['duo', 'duo_mujeres', 'soltera', 'soltero', 'trio', 'grupo', 'cumpleaneros']).optional(),
      category: z.enum(['acceso', 'extra', 'consumo', 'locker', 'merch']).optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      originalPrice: z.number().optional(),
      totalStock: z.number().optional(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
      costPrice: z.number().optional(),
      color: z.string().optional(),
      internalCode: z.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z.string().max(8).optional(),
      groupName: z.string().max(50).optional(),
      toKitchen: z.number().min(0).max(1).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateTicketType(id, data);
    }),
    deleteTicketType: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteTicketType(input.id);
    }),
  }),

  orders: router({
    validateDiscount: publicProcedure.input(z.object({
      code: z.string(),
      eventId: z.number(),
    })).mutation(async ({ input }) => {
      return db.validateDiscountCode(input.code, input.eventId);
    }),
    /** Un solo campo de código en el checkout: la persona no sabe (ni le
     * importa) si lo que tiene es un código de descuento o el código de quien
     * la invitó -- este endpoint decide por ella. Se prueba primero contra
     * embajadores y después contra descuentos: cuando más adelante un código
     * de embajador también traiga descuento propio, esta rama es la que va a
     * empezar a incluirlo, sin tocar la rama de descuento puro. */
    validateCode: publicProcedure.input(z.object({
      code: z.string(),
      eventId: z.number(),
    })).mutation(async ({ input }) => {
      const clean = input.code.trim();
      if (!clean) return { type: 'none' as const, message: 'Escribe un código' };

      const ambassador = await db.getActiveExclusiveAmbassadorByCode(clean);
      if (ambassador) {
        return { type: 'ambassador' as const, name: ambassador.name, code: ambassador.code };
      }

      const discountResult = await db.validateDiscountCode(clean, input.eventId);
      if (discountResult.valid && discountResult.discount) {
        return { type: 'discount' as const, discount: discountResult.discount };
      }

      return { type: 'none' as const, message: 'No encontramos ese código' };
    }),
    create: publicProcedure.input(z.object({
      eventSlug: z.string(),
      buyerName: z.string(),
      buyerEmail: z.string().email(),
      buyerPhone: z.string().optional(),
      items: z.array(z.object({
        ticketTypeId: z.number(),
        quantity: z.number().min(1),
      })),
      discountCode: z.string().optional(),
      ambassadorCode: z.string().optional(),
      communityCode: z.string().optional(),
      // Datos por asistente/tipo de acceso (JSON serializado). Se adjunta a la
      // preferencia de Mercado Pago como metadata; no requiere migración de schema.
      attendeeData: z.string().optional(),
    })).mutation(async ({ input }) => {
      const result = await db.createOrder(input);
      // Descuento del 100%: la orden ya quedó aprobada en createOrder (sin
      // pasar por Mercado Pago) — acá solo falta el email de bienvenida+QR.
      if (result.isFree) await confirmFreeOrder(result.orderNumber);
      return result;
    }),
    // Cobra una orden ya creada con el Payment Brick (tarjeta embebida, sin
    // modal/redirect de Mercado Pago). El monto se calcula server-side a
    // partir de la orden guardada, nunca del cliente.
    processCardPayment: publicProcedure.input(z.object({
      orderNumber: z.string(),
      token: z.string(),
      paymentMethodId: z.string(),
      issuerId: z.union([z.string(), z.number()]).optional(),
      installments: z.number().optional(),
      identificationType: z.string().optional(),
      identificationNumber: z.string().optional(),
    })).mutation(async ({ input }) => {
      return processCardPaymentForOrder(input);
    }),
    // Admin
    listAll: adminProcedure.input(z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
      status: z.string().optional(),
      channel: z.enum(['web', 'caja']).optional(),
    }).optional()).query(async ({ input }) => {
      return db.getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status, input?.channel);
    }),
    getStats: adminProcedure.input(z.object({ channel: z.enum(['web', 'caja']).optional() }).optional()).query(async ({ input }) => {
      return db.getOrderStats(input?.channel);
    }),
    // Mismos filtros y mismas columnas que el CSV (server/adminRoutes.ts) --
    // alimenta la vista de impresión/PDF, para que ambos formatos muestren
    // exactamente lo mismo.
    forPrint: adminProcedure.input(z.object({
      eventId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.string().optional(),
      channel: z.enum(['web', 'caja']).optional(),
    }).optional()).query(async ({ input }) => {
      return db.getOrdersForExport(input ?? {});
    }),
    getTickets: adminProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return db.getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure.input(z.object({ orderNumber: z.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    }),

    // Recordatorio a quien dejó la compra a medio camino (server/orderReminders.ts).
    // La selección es manual a propósito: nunca "mandar a todos".
    // No hace falta un `listPending`: `listAll` con status='pending' ya trae
    // todas las columnas de la orden, incluidas reminderSentAt/reminderCount.
    sendReminders: adminProcedure.input(z.object({
      orderIds: z.array(z.number()).min(1).max(200),
      customBody: z.string().max(4000).optional(),
    })).mutation(async ({ input }) => {
      return sendPendingReminders(input);
    }),
    generateReminderCopy: adminProcedure.input(z.object({
      idea: z.string().min(5).max(1000),
    })).mutation(async ({ input }) => {
      try {
        return await generateReminderCopy(input.idea);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el texto.' });
      }
    }),
    // Accesos manuales desde /admin (pedido explícito del usuario):
    // invitaciones gratis o accesos ya pagados por transferencia/efectivo
    // directo, sin pasar por Mercado Pago -- misma info del comprador que el
    // checkout público, y el mismo mail final con QR (confirmFreeOrder ya lo
    // usa el checkout público para el caso de descuento 100%).
    createManual: adminProcedure.input(z.object({
      eventSlug: z.string(),
      buyerName: z.string().min(1),
      buyerEmail: z.string().email(),
      buyerPhone: z.string().optional(),
      items: z.array(z.object({
        ticketTypeId: z.number(),
        quantity: z.number().min(1),
        // Monto que el admin escribió a mano para este tipo de entrada
        // (pedido explícito del usuario) -- si no viene, se usa el precio de
        // catálogo/abono Misión 300 por defecto (ver priceManualOrderItems).
        unitPrice: z.number().min(0).optional(),
      })).min(1),
      kind: z.enum(['invitation', 'paid']),
      paymentMethod: z.string().optional(),
      attendeeData: z.string().optional(),
    })).mutation(async ({ input }) => {
      try {
        const result = await db.createManualOrder(input);
        await confirmFreeOrder(result.orderNumber);
        return result;
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear el acceso manual.' });
      }
    }),
    listManual: adminProcedure.query(async () => {
      return db.listManualOrders();
    }),
    // "Invitación especial instantánea" de Accesos Manuales (pedido explícito
    // del usuario): sin ningún dato salvo la cantidad de personas -- para
    // cuando llega un invitado del dueño a la puerta sin QR. Un solo
    // ticket/QR representa a todas las personas (ver createInstantInvite).
    createInstantInvite: adminProcedure.input(z.object({
      eventSlug: z.string(),
      personas: z.number().int().min(1).max(20),
    })).mutation(async ({ input }) => {
      try {
        return await db.createInstantInvite(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la invitación.' });
      }
    }),
    // "Invitar consumo gratis a staff" de Accesos Manuales (pedido explícito
    // del usuario): el dueño elige un producto de la Carta de la Fiesta,
    // cuántas unidades y para quién es -- la cajera lo ve y lo canjea en /caja.
    createStaffComp: adminProcedure.input(z.object({
      eventSlug: z.string(),
      ticketTypeId: z.number(),
      quantity: z.number().int().min(1).max(20),
      staffName: z.string().min(1),
    })).mutation(async ({ input }) => {
      try {
        return await db.createStaffComp(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la invitación de consumo.' });
      }
    }),
    listStaffComps: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listStaffComps(input.eventId);
    }),
    // Eliminar una compra (pedido explícito del usuario): irreversible, la
    // confirmación con ventana de diálogo vive en el admin, acá solo se
    // ejecuta el borrado en cascada.
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteOrderCascade(input.id);
    }),
  }),

  mission300: router({
    status: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    }),
    // Contador público de Home (pedido explícito del usuario): cuántas
    // personas de abonos de Misión 300 todavía NO están resueltas (ni
    // "aprobadas del todo"), para que el contador público las reste y solo
    // muestre lo que ya está confirmado -- sin datos sensibles, solo un número.
    pendingPersonas: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      const event = await db.getEventBySlug(input.slug);
      if (!event) return { personas: 0 };
      return { personas: await db.getUnresolvedDepositPersonas(event.id) };
    }),
  }),

  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      return db.getTicketByCode(input.ticketCode);
    }),
  }),

  // --- Puerta: el anfitrión en la entrada del estacionamiento ---
  // Pantalla aparte de /caja a propósito: el anfitrión no es cajero, no
  // debería ver el menú de venta, y escanea con su propio teléfono. Lo
  // único que puede hacer con esta sesión es marcar entradas.
  puerta: router({
    // Público como el de caja: solo devuelve nombres y roles, nunca PINs.
    listOperators: publicProcedure.query(async () => {
      const all = await db.listActiveOperatorsPublic();
      return all.filter((o: any) => o.role === 'acceso' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyDoorPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    activeEvent: doorProcedure.query(async () => {
      return db.getActiveEventForCaja();
    }),

    // Mismo snapshot que la caja: la puerta lo guarda en el mismo IndexedDB
    // y por eso funciona sin señal.
    snapshot: doorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getCajaSnapshot(input.eventId);
    }),

    checkin: doorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketCode: z.string().min(1),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
      });
    }),

    // Vaciado de la cola offline. Solo acepta operaciones de check-in: la
    // puerta no vende ni canjea, aunque comparta la cola con la caja.
    sync: doorProcedure.input(z.object({
      eventId: z.number(),
      ops: z.array(z.object({
        type: z.literal('checkin'), opId: z.string(), ticketCode: z.string(), clientAt: z.string(),
      })).max(50),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });

      const results: Record<string, { result: string; conflictNote?: string }> = {};
      for (const op of input.ops) {
        try {
          results[op.opId] = await checkInTicket(rawDb, {
            opId: op.opId, ticketCode: op.ticketCode, eventId: input.eventId,
            operatorId: ctx.operator.operatorId, clientAt: new Date(op.clientAt),
          });
        } catch (err) {
          results[op.opId] = { result: 'rejected', conflictNote: err instanceof Error ? err.message : 'Error al sincronizar' };
        }
      }
      return results;
    }),
  }),

  // --- Cocina: la pantalla que recibe los pedidos de comida de /caja ---
  // Pantalla propia, aparte de /caja y /puerta: el equipo de cocina no
  // vende ni marca entradas, solo prepara y entrega. A diferencia de esas
  // dos, esta pantalla SÍ necesita red -- el pedido nace en otra tablet
  // (la caja) y no hay forma de que cocina se entere sin consultar al
  // servidor, así que no tiene sentido una cola offline acá.
  cocina: router({
    listOperators: publicProcedure.query(async () => {
      const all = await db.listActiveOperatorsPublic();
      return all.filter((o: any) => o.role === 'cocina' || o.role === 'supervisor' || o.role === 'admin');
    }),

    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) }))
      .mutation(async ({ input, ctx }) => {
        const operator = await verifyKitchenPinOrThrow(ctx, input.operatorId, input.pin);
        const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
        return { id: operator.id, name: operator.name, role: operator.role };
      }),

    me: publicProcedure.query(({ ctx }) => ctx.operator),

    activeEvent: kitchenProcedure.query(async () => {
      return db.getActiveEventForCaja();
    }),

    // Polling cada 4s desde el cliente -- pendientes/aprobadas más viejas
    // primero, y las entregadas de la última hora aparte (para "deshacer").
    list: kitchenProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return listKitchenTickets(input.eventId);
    }),

    update: kitchenProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketNumber: z.string(),
      to: z.enum(['pendiente', 'aprobado', 'entregado']),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return updateKitchenTicket(rawDb, {
        opId: input.opId,
        eventId: input.eventId,
        ticketNumber: input.ticketNumber,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
        to: input.to,
      });
    }),
  }),

  // --- Caramelo: la fiesta dentro del celular ---
  // Todo público porque el `ticketCode` ES el token (igual que la página de
  // la entrada): no hay cuentas ni contraseñas. Cada llamada revalida las
  // tres condiciones desde cero contra la base -- esconder un botón en el
  // cliente no protege nada.
  party: router({
    getSession: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await db.getPartyActor(input.ticketCode);
      if (!actor) return { denial: 'sin_ticket' as const, event: null, profile: null };

      const denial = partyEntryDenial(actor.ticket, actor.event, new Date());
      return {
        denial,
        event: {
          id: actor.event.id,
          title: actor.event.title,
          eventDate: actor.event.eventDate,
          doorsOpen: actor.event.doorsOpen,
          eventEnd: actor.event.eventEnd,
        },
        profile: actor.profile
          ? { id: actor.profile.id, alias: actor.profile.alias, gender: actor.profile.gender, avatarId: actor.profile.avatarId, zone: actor.profile.zone }
          : null,
      };
    }),

    createProfile: publicProcedure.input(z.object({
      ticketCode: z.string(),
      alias: z.string(),
      gender: z.enum(PARTY_GENDERS),
      avatarId: z.number().int().min(1).max(AVATARS_PER_GENDER),
      zone: z.enum(PARTY_ZONES),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyActor(input.ticketCode);
      if (actor.profile) return { id: actor.profile.id };

      // El alias lo ve toda la fiesta: se valida en el servidor, no solo en
      // el formulario.
      const check = sanitizeAlias(input.alias);
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });

      const profile = await db.createPartyProfile({
        eventId: actor.event.id,
        ticketId: actor.ticket.id,
        alias: check.alias,
        gender: input.gender,
        avatarId: input.avatarId,
        zone: input.zone,
      });
      return { id: profile!.id };
    }),

    listMansion: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listPartyMansion(actor.profile.id, actor.event.id);
    }),

    setZone: publicProcedure.input(z.object({ ticketCode: z.string(), zone: z.enum(PARTY_ZONES) }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        await db.updatePartyProfile(actor.profile.id, { zone: input.zone });
        return { ok: true };
      }),

    touch: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.touchPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    respondTouch: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number(), accept: z.boolean() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.respondToPartyTouch(actor.profile.id, input.connectionId, input.accept);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    getMessages: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number() }))
      .query(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.listPartyMessages(actor.profile.id, input.connectionId);
        if (!res) throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta conversación no está abierta' });
        return res;
      }),

    sendMessage: publicProcedure.input(z.object({ ticketCode: z.string(), connectionId: z.number(), body: z.string() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const check = sanitizeMessage(input.body);
        if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });

        const res = await db.sendPartyMessage(actor.profile.id, input.connectionId, check.body);
        if (!res.ok) throw new TRPCError({ code: 'FORBIDDEN', message: res.reason });
        return { ok: true };
      }),

    block: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        await db.blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        return { ok: true };
      }),

    report: publicProcedure.input(z.object({ ticketCode: z.string(), targetProfileId: z.number(), reason: z.string().min(3).max(500) }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        // Denunciar también bloquea: quien denuncia no debería seguir
        // viendo a esa persona mientras el equipo revisa.
        await db.reportPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id, input.reason.trim());
        await db.blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
        return { ok: true };
      }),

    // --- Invitar un trago ---
    // Tres pasos porque el destinatario puede rechazar y nadie paga por un
    // trago rechazado: invitar (gratis) -> responder -> pagar.
    listDrinks: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listPartyDrinks(actor.event.id);
    }),

    sendGift: publicProcedure.input(z.object({
      ticketCode: z.string(),
      targetProfileId: z.number(),
      ticketTypeId: z.number(),
      message: z.string().optional(),
    })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);

      const check = sanitizeGiftMessage(input.message ?? '');
      if (!check.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason });

      const res = await db.createGiftInvitation({
        eventId: actor.event.id,
        fromProfileId: actor.profile.id,
        toProfileId: input.targetProfileId,
        ticketTypeId: input.ticketTypeId,
        message: check.body,
      });
      if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
      return res;
    }),

    respondGift: publicProcedure.input(z.object({ ticketCode: z.string(), giftId: z.number(), accept: z.boolean() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        const res = await db.respondToGiftInvitation(actor.profile.id, input.giftId, input.accept);
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    // Crea la orden del regalo y devuelve su número. El cobro después va
    // por `orders.processCardPayment`, el mismo endpoint que las entradas.
    payGift: publicProcedure.input(z.object({ ticketCode: z.string(), giftId: z.number() }))
      .mutation(async ({ input }) => {
        const actor = await requirePartyProfile(input.ticketCode);
        // El comprador es el dueño del acceso con el que entró: su email ya
        // está en la orden de su entrada, no se le vuelve a pedir nada.
        const contact = await db.getPartyProfileContact(actor.profile.id);
        if (!contact?.email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No pudimos identificar tu correo' });

        const res = await db.createGiftOrder(actor.profile.id, input.giftId, { name: contact.alias, email: contact.email });
        if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: res.reason });
        return res;
      }),

    myGifts: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return db.listMyGifts(actor.profile.id);
    }),

    // Para el equipo del local, durante la fiesta.
    listReports: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listPartyReports(input.eventId);
    }),
    listGifts: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.listPartyGiftsForEvent(input.eventId);
    }),
  }),

  discounts: router({
    listAll: adminProcedure.query(async () => {
      return db.getAllDiscountCodes();
    }),
    create: adminProcedure.input(z.object({
      code: z.string(),
      description: z.string().optional(),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number(),
      minPurchase: z.number().optional(),
      maxUses: z.number().optional(),
      eventId: z.number().optional(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
    })).mutation(async ({ input }) => {
      return db.createDiscountCode(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().optional(),
      description: z.string().optional(),
      discountType: z.enum(['percentage', 'fixed']).optional(),
      discountValue: z.number().optional(),
      maxUses: z.number().optional(),
      isActive: z.number().optional(),
      validUntil: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateDiscountCode(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteDiscountCode(input.id);
    }),
  }),

  settings: router({
    get: publicProcedure.query(async () => {
      return db.getSiteSettings();
    }),
    update: adminProcedure.input(z.object({
      instagramFollowers: z.number().optional(),
      instagramPosts: z.number().optional(),
      serviceFeePercent: z.number().min(0).max(100).optional(),
    })).mutation(async ({ input }) => {
      return db.updateSiteSettings(input);
    }),
    // Mismo número que llega en el correo de las 3am (server/cronRoutes.ts),
    // pero en vivo para revisarlo manual desde Ajustes.
    checkinCount: adminProcedure.query(async () => {
      const event = await db.getActiveEventForCaja();
      if (!event) return null;
      const dashboard = await db.getCajaDashboard(event.id);
      if (!dashboard) return null;
      return { eventTitle: event.title, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount };
    }),
  }),

  communityCodes: router({
    validate: publicProcedure.input(z.object({
      code: z.string(),
    })).mutation(async ({ input }) => {
      return db.validateCommunityCode(input.code);
    }),
    // Admin
    listAll: adminProcedure.query(async () => {
      return db.getAllCommunityCodes();
    }),
    create: adminProcedure.input(z.object({
      code: z.string(),
      label: z.string().optional(),
      maxUses: z.number().optional(),
    })).mutation(async ({ input }) => {
      return db.createCommunityCode(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().optional(),
      label: z.string().optional(),
      maxUses: z.number().optional(),
      isActive: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateCommunityCode(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteCommunityCode(input.id);
    }),
  }),

  referrals: router({
    getStats: adminProcedure.query(async () => {
      return db.getReferralStats();
    }),
    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserReferrals(ctx.user.id);
    }),
    // Público, sin login: el mismo código de embajador que llega por email
    // es lo que valida el acceso a las propias estadísticas.
    getByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return db.getReferralsByCode(input.code);
    }),
    // Público, para el Hall de la Fama -- solo primer nombre + código +
    // cantidad de ventas, nunca montos ni apellido (ver db.getReferralLeaderboard).
    getLeaderboard: publicProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getReferralLeaderboard(input.eventId);
    }),
  }),

  // Embajadores exclusivos con comisión (pedido explícito del usuario) --
  // tab aparte de "Referidos" (arriba), para embajadores dados de alta a
  // mano que cobran una comisión en plata por venta, no descuento.
  ambassadors: router({
    listAll: adminProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.listExclusiveAmbassadors(input?.eventId);
    }),
    create: adminProcedure.input(z.object({
      // Opcional: el código es permanente y de la persona, no del evento.
      eventId: z.number().optional(),
      name: z.string().min(1),
      code: z.string().min(1),
      // `null` = usar la escala global del programa (lo normal).
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      instagram: z.string().optional(),
    })).mutation(async ({ input }) => {
      return db.createExclusiveAmbassador(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      code: z.string().optional(),
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      instagram: z.string().optional(),
      active: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateExclusiveAmbassador(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.deleteExclusiveAmbassador(input.id);
    }),
    // Reporte histórico por evento (el del PR original). Se conserva porque
    // sigue siendo la forma de saber cuánto se pagó en una fiesta puntual.
    getReport: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getAmbassadorCommissionReport(input.eventId);
    }),

    // --- Programa VIP automatizado ---

    /** Valida el código en el checkout. Público, igual que
     * communityCodes.validate: hasta ahora el campo se mandaba sin verificar
     * nada, así que un código mal tecleado se perdía en silencio. */
    validate: publicProcedure.input(z.object({ code: z.string() })).mutation(async ({ input }) => {
      const clean = input.code.trim().toUpperCase();
      if (!clean) return { valid: false as const, message: 'Escribe un código' };
      const ambassador = await db.getActiveExclusiveAmbassadorByCode(clean);
      if (!ambassador) return { valid: false as const, message: 'No encontramos ese código' };
      return { valid: true as const, name: ambassador.name, code: ambassador.code };
    }),

    /** Panel público del embajador (/embajador/<CODIGO>). El código hace de
     * llave -- no hay login de embajadores, mismo criterio que /mis-referidos. */
    getPanelByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return ambassadorProgram.getAmbassadorPanel(input.code);
    }),

    getConfig: adminProcedure.query(async () => {
      return ambassadorProgram.getProgramConfig();
    }),
    updateConfig: adminProcedure.input(z.object({
      launchDate: z.string().optional(),
      commissionScale: z.array(z.object({
        minSales: z.number().int().min(1),
        maxSales: z.number().int().min(1).nullable(),
        percent: z.number().min(0).max(100),
      })).optional(),
      existingClientPercent: z.number().min(0).max(100).optional(),
      benefits: z.array(z.object({
        minSales: z.number().int().min(1),
        items: z.array(z.string()),
        bonusClp: z.number().min(0),
      })).optional(),
      weeklyEmailEnabled: z.boolean().optional(),
      weeklyEmailWeekday: z.number().int().min(0).max(6).optional(),
      weeklyEmailHourChile: z.number().int().min(0).max(23).optional(),
    })).mutation(async ({ input }) => {
      const { launchDate, ...rest } = input;
      return ambassadorProgram.updateProgramConfig({
        ...rest,
        ...(launchDate ? { launchDate: new Date(launchDate) } : {}),
      });
    }),

    /** `monthKey` en formato "2026-08"; si no viene, el mes actual de Chile. */
    getSummary: adminProcedure.input(z.object({ monthKey: z.string().optional() }).optional()).query(async ({ input }) => {
      return ambassadorProgram.getAmbassadorAdminSummary(input?.monthKey || monthKeyFor(new Date()));
    }),
    getRanking: adminProcedure.input(z.object({ monthKey: z.string().optional() }).optional()).query(async ({ input }) => {
      return ambassadorProgram.getAmbassadorRanking(input?.monthKey || monthKeyFor(new Date()));
    }),
    getProfile: adminProcedure.input(z.object({ id: z.number(), monthKey: z.string().optional() })).query(async ({ input }) => {
      const monthKey = input.monthKey || monthKeyFor(new Date());
      return {
        stats: await ambassadorProgram.getAmbassadorStats(input.id, monthKey),
        sales: await ambassadorProgram.getAmbassadorSales(input.id),
      };
    }),
    listReferredClients: adminProcedure.query(async () => {
      return ambassadorProgram.listReferredClients();
    }),

    // --- Beneficios entregados ---
    listBenefitDeliveries: adminProcedure.input(z.object({ monthKey: z.string().optional() }).optional()).query(async ({ input }) => {
      return ambassadorProgram.listBenefitDeliveries(input?.monthKey || monthKeyFor(new Date()));
    }),
    markBenefitDelivered: adminProcedure.input(z.object({
      ambassadorId: z.number(),
      monthKey: z.string(),
      benefitKey: z.string(),
      note: z.string().optional(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.markBenefitDelivered(input);
    }),
    unmarkBenefitDelivered: adminProcedure.input(z.object({
      ambassadorId: z.number(),
      monthKey: z.string(),
      benefitKey: z.string(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.unmarkBenefitDelivered(input);
    }),

    // --- Material de la semana ---
    getWeeklyMaterial: adminProcedure.query(async () => {
      return ambassadorProgram.getWeeklyMaterial();
    }),
    saveWeeklyMaterial: adminProcedure.input(z.object({
      title: z.string().optional(),
      storiesText: z.string().optional(),
      reelText: z.string().optional(),
      postText: z.string().optional(),
      countdownText: z.string().optional(),
      linkUrl: z.string().optional(),
    })).mutation(async ({ input }) => {
      return ambassadorProgram.saveWeeklyMaterial(input);
    }),
    /** Rellena los 5 campos del material a partir de una idea. NO guarda: el
     * dueño revisa y edita antes de apretar "Guardar", igual que en mailing. */
    generateWeeklyMaterial: adminProcedure.input(z.object({
      idea: z.string().min(5).max(1000),
    })).mutation(async ({ input }) => {
      try {
        return await ambassadorProgram.generateWeeklyMaterial(input.idea);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar el material.' });
      }
    }),

    /** Manda el resumen semanal ahora mismo, sin esperar al día configurado --
     * para poder probarlo y para reenviarlo si un lunes falló. */
    sendWeeklyNow: adminProcedure.mutation(async () => {
      return ambassadorProgram.sendWeeklyAmbassadorEmails();
    }),
  }),

  // Postulaciones públicas para ser embajador (página /embajadores).
  ambassadorApplications: router({
    /** Único formulario público del sitio que escribe en la base para que
     * alguien lo revise después, así que es la primera superficie de spam:
     * va con límite por IP y con la validación pura de
     * shared/ambassadorApplication.ts, que el cliente también corre pero en
     * la que no se confía. */
    submit: publicProcedure.input(z.object({
      name: z.string(),
      email: z.string().email('Revisa tu correo'),
      whatsapp: z.string(),
      instagram: z.string(),
      followers: z.string().optional(),
      message: z.string().optional(),
      acceptedTerms: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `postulacion:${clientIp(ctx)}`;
      if (!(await db.checkIpRateLimit(ipKey))) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Ya mandaste varias postulaciones. Espera un rato antes de intentar de nuevo.' });
      }
      // Se cuenta antes de guardar: si no, alguien podría gastar intentos
      // fallando la validación y nunca quedar limitado.
      await db.recordIpAttempt(ipKey, APPLICATION_MAX_PER_HOUR, 60 * 60 * 1000);

      if (!input.acceptedTerms) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tienes que confirmar que cumples los requisitos' });
      }

      const nombre = sanitizeApplicantName(input.name);
      if (!nombre.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: nombre.reason });
      const wsp = sanitizeWhatsapp(input.whatsapp);
      if (!wsp.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: wsp.reason });
      const ig = sanitizeInstagram(input.instagram);
      if (!ig.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: ig.reason });
      if (!input.followers?.trim()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Escribe tu cantidad de seguidores' });
      }
      const seguidores = sanitizeFollowers(input.followers);
      if (!seguidores.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: seguidores.reason });
      const mensaje = sanitizeApplicationMessage(input.message ?? '');
      if (!mensaje.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: mensaje.reason });

      const created = await applications.createApplication({
        name: nombre.value,
        email: input.email,
        whatsapp: wsp.value,
        instagram: ig.value,
        followers: seguidores.value,
        message: mensaje.value,
        acceptedTerms: true,
      });

      if (!created.ok) {
        if (created.reason === 'ya_pendiente') {
          return { ok: true as const, alreadyPending: true as const };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No pudimos guardar tu postulación. Intenta de nuevo.' });
      }

      // Los correos van aparte: si Resend falla, la postulación YA quedó
      // guardada y el dueño la ve igual en el panel.
      try {
        await sendEmail({
          to: APPLICATIONS_EMAIL,
          subject: `[Postulaciones] ${nombre.value} — @${ig.value}`,
          html: buildAmbassadorApplicationEmail({
            name: nombre.value,
            email: input.email.trim().toLowerCase(),
            whatsapp: wsp.value,
            instagram: ig.value,
            followers: seguidores.value,
            message: mensaje.value,
            whatsappLink: whatsappLinkFor(wsp.value),
            instagramLink: instagramLinkFor(ig.value),
          }),
        });
        await sendEmail({
          to: input.email.trim().toLowerCase(),
          subject: '👑 Recibimos tu postulación — Mansion Playroom',
          html: buildApplicationReceivedEmail({
            name: nombre.value,
            requirements: [...AMBASSADOR_REQUIREMENTS],
            tasks: [...AMBASSADOR_TASKS],
          }),
        });
      } catch (err) {
        console.error('[Postulaciones] Falló el envío de correos:', err);
      }

      return { ok: true as const, alreadyPending: false as const };
    }),

    listAll: adminProcedure.input(z.object({
      status: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
    }).optional()).query(async ({ input }) => {
      return applications.listApplications(input?.status);
    }),

    countPending: adminProcedure.query(async () => {
      return applications.countPendingApplications();
    }),

    review: adminProcedure.input(z.object({
      id: z.number(),
      status: z.enum(['pendiente', 'aprobada', 'rechazada']),
      note: z.string().optional(),
    })).mutation(async ({ input }) => {
      return applications.reviewApplication(input);
    }),

    /** Aprueba y crea al embajador en un solo paso, con el código que escribe
     * el admin, y le manda su código por correo. */
    approve: adminProcedure.input(z.object({
      id: z.number(),
      code: z.string().min(1),
      commissionPercent: z.number().min(0).max(100).nullable().optional(),
    })).mutation(async ({ input }) => {
      const result = await applications.approveApplication(input);

      try {
        await sendEmail({
          to: result.email,
          subject: `🎉 ¡Quedaste! Tu código es ${result.code}`,
          html: buildAmbassadorWelcomeEmail({
            name: result.name,
            code: result.code,
            panelUrl: `${ambassadorProgram.PANEL_BASE_URL}/embajador/${result.code}`,
            tasks: [...AMBASSADOR_TASKS],
          }),
        });
      } catch (err) {
        console.error('[Postulaciones] Falló el correo de bienvenida:', err);
      }

      return result;
    }),
  }),

  // Módulo /caja — login por PIN de operadores (docs/ARQUITECTURA-CAJA.md
  // Fase 0). Sesión separada de auth.adminLogin: no toca `users` ni COOKIE_NAME.
  caja: router({
    // Enrolamiento de dispositivo (pedido explícito del usuario) -- sin
    // esto, ni siquiera se llega a la pantalla de PIN. publicProcedure a
    // propósito: todavía no hay ni operador ni dispositivo.
    deviceStatus: publicProcedure.query(({ ctx }) => {
      return ctx.device ? { enrolled: true as const, deviceName: ctx.device.name } : { enrolled: false as const };
    }),
    enrollDevice: publicProcedure.input(z.object({ code: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      const code = input.code.trim().toUpperCase();
      const device = await db.getDeviceByEnrollCode(code);
      if (!device || device.enrolled || !device.enrollCodeExpiresAt || new Date(device.enrollCodeExpiresAt).getTime() < Date.now()) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Código de enrolamiento inválido o vencido' });
      }
      const token = generateDeviceToken();
      await db.completeDeviceEnrollment(device.id, hashDeviceToken(token));
      const sessionToken = await signDeviceSession(device.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_DEVICE_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: DEVICE_SESSION_MS });
      return { success: true, deviceName: device.name } as const;
    }),

    // Pantalla "toca tu nombre" (§10.2) — nunca expone pinHash. Requiere
    // dispositivo enrolado (deviceProcedure).
    listOperators: deviceProcedure.query(async () => {
      return db.listActiveOperatorsPublic();
    }),
    login: deviceProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyOperatorPinOrThrow(ctx, input.operatorId, input.pin);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),

    // Pantallas de /caja (docs/ARQUITECTURA-CAJA.md Fase 2) — todas requieren
    // sesión de operador vigente.
    activeEvent: operatorProcedure.query(async () => {
      return db.getActiveEventForCaja();
    }),
    search: operatorProcedure.input(z.object({ eventId: z.number(), query: z.string() })).query(async ({ input }) => {
      return db.searchCajaCustomers(input.eventId, input.query);
    }),
    customerSheet: operatorProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return db.getCajaCustomerSheet(input.orderId);
    }),
    catalog: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getCajaCatalog(input.eventId);
    }),
    dashboard: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getCajaDashboard(input.eventId);
    }),
    // Descarga completa para el modo offline (docs/ARQUITECTURA-CAJA.md
    // §6.2) -- la tablet la guarda en IndexedDB al abrir turno y la
    // refresca cada 60s cuando hay conexión.
    snapshot: operatorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getCajaSnapshot(input.eventId);
    }),
    // Procesa un lote de operaciones encoladas offline (§7) -- reutiliza
    // exactamente la misma lógica idempotente (applyOp) que los endpoints
    // online `redeem`/`sale`, así que reenviar el mismo opId nunca duplica nada.
    sync: operatorProcedure.input(z.object({
      eventId: z.number(),
      registerId: z.number().optional(),
      ops: z.array(z.discriminatedUnion('type', [
        z.object({ type: z.literal('redeem'), opId: z.string(), displayCode: z.string(), clientAt: z.string() }),
        z.object({ type: z.literal('checkin'), opId: z.string(), ticketCode: z.string(), clientAt: z.string() }),
        z.object({
          type: z.literal('sale'), opId: z.string(),
          items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1) })).min(1),
          paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr']),
          buyerEmail: z.string().email().optional(),
          redeemPlaycoins: z.number().int().min(0).optional(),
          discountCode: z.string().optional(),
          lockerTag: z.string().max(16).optional(),
          kitchenTicketNumber: z.string().max(12).optional(),
          customerName: z.string().max(60).optional(),
          clientAt: z.string(),
        }),
      ])).max(50),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });

      const results: Record<string, { result: string; conflictNote?: string }> = {};
      for (const op of input.ops) {
        try {
          if (op.type === 'redeem') {
            results[op.opId] = await redeemDisplayCode(rawDb, {
              opId: op.opId, displayCode: op.displayCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, registerId: input.registerId, clientAt: new Date(op.clientAt),
            });
          } else if (op.type === 'checkin') {
            results[op.opId] = await checkInTicket(rawDb, {
              opId: op.opId, ticketCode: op.ticketCode, eventId: input.eventId,
              operatorId: ctx.operator.operatorId, registerId: input.registerId, clientAt: new Date(op.clientAt),
            });
          } else {
            results[op.opId] = await createCajaSale(rawDb, {
              opId: op.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId, registerId: input.registerId,
              items: op.items, paymentMethod: op.paymentMethod, clientAt: new Date(op.clientAt),
              buyerEmail: op.buyerEmail, redeemPlaycoins: op.redeemPlaycoins,
              discountCode: op.discountCode, lockerTag: op.lockerTag, kitchenTicketNumber: op.kitchenTicketNumber,
              customerName: op.customerName,
            });
          }
        } catch (err) {
          results[op.opId] = { result: 'rejected', conflictNote: err instanceof Error ? err.message : 'Error al sincronizar' };
        }
      }
      return results;
    }),

    // Selección de caja física al abrir turno (§10.2.1).
    listRegisters: operatorProcedure.query(async () => {
      return db.listActiveRegisters();
    }),
    // Apertura de turno con cuadre de caja (pedido explícito del usuario):
    // pide el efectivo inicial declarado por la cajera. Idempotente por
    // evento+caja (un refresh de página no duplica el turno abierto).
    shiftOpen: operatorProcedure.input(z.object({
      opId: z.string(), eventId: z.number(), registerId: z.number().optional(),
      openingCash: z.number().min(0), clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const shiftId = await db.openShift({
        eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, openingCash: input.openingCash,
      });
      const { applyOp } = await import('./caja/ops');
      await applyOp(rawDb, {
        id: input.opId, type: 'shift_open', eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, targetType: 'operator', targetId: String(ctx.operator.operatorId),
        payload: { openingCash: input.openingCash, shiftId }, clientAt: new Date(input.clientAt),
      }, async () => ({ result: 'applied' as const }));
      return { shiftId };
    }),
    // Protocolo de pendientes (§13, riesgo 2): el cliente NO debe llamar esto
    // con ops sin sincronizar -- se bloquea en la UI, no acá, porque cerrar
    // el turno es una decisión operativa, no algo que el servidor pueda ver.
    // Pide efectivo TOTAL contado (no la diferencia) + totales de débito y
    // crédito de las máquinas, hace el cuadre contra las ventas registradas
    // (solo canal caja, nunca web) y manda el informe final por correo.
    shiftClose: operatorProcedure.input(z.object({
      opId: z.string(), eventId: z.number(), registerId: z.number().optional(),
      countedCash: z.number().min(0), countedDebit: z.number().min(0), countedCredit: z.number().min(0),
      countedQr: z.number().min(0).optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const openShift = await db.getOpenShift(input.eventId, input.registerId);
      if (!openShift) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay un turno abierto para cerrar' });

      const report = await db.closeShift({
        shiftId: openShift.id, closedByOperatorId: ctx.operator.operatorId,
        countedCash: input.countedCash, countedDebit: input.countedDebit, countedCredit: input.countedCredit,
        countedQr: input.countedQr,
      });

      const { applyOp } = await import('./caja/ops');
      await applyOp(rawDb, {
        id: input.opId, type: 'shift_close', eventId: input.eventId, operatorId: ctx.operator.operatorId,
        registerId: input.registerId, targetType: 'operator', targetId: String(ctx.operator.operatorId),
        payload: report, clientAt: new Date(input.clientAt),
      }, async () => ({ result: 'applied' as const }));

      // No debe tumbar el cierre de turno si Resend falla -- el reporte ya
      // quedó guardado y disponible en /admin de todas formas.
      try {
        await sendEmail({
          to: SHIFT_CLOSE_REPORT_EMAIL,
          subject: `[Cierre de turno] ${report.eventTitle} — ${report.registerName}`,
          html: buildShiftCloseEmail(report),
        });
      } catch (err) {
        console.error('[shiftClose] Error al enviar el correo de cierre:', err);
      }

      return report;
    }),

    // Anulación con motivo -- solo supervisor/admin (docs/ARQUITECTURA-CAJA.md §3.2).
    voidCode: supervisorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      displayCode: z.string().min(1),
      reason: z.string().min(3, 'El motivo es obligatorio'),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return voidTicketCode(rawDb, {
        opId: input.opId, displayCode: input.displayCode, eventId: input.eventId,
        operatorId: ctx.operator.operatorId, registerId: input.registerId, reason: input.reason,
        clientAt: new Date(input.clientAt),
      });
    }),

    // Cola de conflictos para el supervisor (§8): canjes dobles todavía sin
    // revisar. "Resuelto" = existe un op manual_adjust posterior que lo referencia.
    conflictQueue: supervisorProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getConflictQueue(input.eventId);
    }),
    resolveConflict: supervisorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      conflictOpId: z.string(),
      note: z.string().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return db.resolveConflict(rawDb, {
        opId: input.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId,
        conflictOpId: input.conflictOpId, note: input.note, clientAt: new Date(input.clientAt),
      });
    }),
    redeem: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      displayCode: z.string().min(1),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return redeemDisplayCode(rawDb, {
        opId: input.opId,
        displayCode: input.displayCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt),
      });
    }),
    // Marca la entrada de un acceso en la puerta (mismo ledger idempotente
    // que `redeem`, pero por ticketCode y solo para category='acceso').
    checkin: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      ticketCode: z.string().min(1),
      registerId: z.number().optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      return checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt),
      });
    }),
    sale: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1) })).min(1),
      paymentMethod: z.enum(['efectivo', 'debito', 'credito', 'qr']),
      registerId: z.number().optional(),
      buyerEmail: z.string().email().optional(),
      redeemPlaycoins: z.number().int().min(0).optional(),
      discountCode: z.string().optional(),
      lockerTag: z.string().max(16).optional(),
      kitchenTicketNumber: z.string().max(12).optional(),
      customerName: z.string().max(60).optional(),
      clientAt: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      try {
        return await createCajaSale(rawDb, {
          opId: input.opId,
          eventId: input.eventId,
          operatorId: ctx.operator.operatorId,
          registerId: input.registerId,
          items: input.items,
          paymentMethod: input.paymentMethod,
          buyerEmail: input.buyerEmail,
          redeemPlaycoins: input.redeemPlaycoins,
          discountCode: input.discountCode,
          lockerTag: input.lockerTag,
          kitchenTicketNumber: input.kitchenTicketNumber,
          customerName: input.customerName,
          clientAt: new Date(input.clientAt),
        });
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo registrar la venta' });
      }
    }),
  }),

  // Gestión de operadores desde /admin (docs/ARQUITECTURA-CAJA.md §11).
  operators: router({
    listAll: adminProcedure.query(async () => {
      return db.listAllOperators();
    }),
    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      pin: z.string().min(4).max(8),
      role: z.enum(['admin', 'supervisor', 'caja', 'barra', 'acceso', 'cocina']),
    })).mutation(async ({ input }) => {
      const id = await db.createOperator({ name: input.name, pinHash: hashPin(input.pin), role: input.role });
      return { id };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      pin: z.string().min(4).max(8).optional(),
      role: z.enum(['admin', 'supervisor', 'caja', 'barra', 'acceso', 'cocina']).optional(),
      active: z.number().min(0).max(1).optional(),
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await db.updateOperator(id, { ...rest, ...(pin ? { pinHash: hashPin(pin) } : {}) });
      return { success: true } as const;
    }),
  }),

  // Base de datos de clientes desde /admin (pedido explícito del usuario).
  customers: router({
    listAll: adminProcedure.input(z.object({
      search: z.string().optional(),
      accessType: z.string().optional(),
      tag: z.string().optional(),
      excludeTags: z.array(z.string()).optional(),
      eventId: z.number().optional(),
    }).optional()).query(async ({ input }) => {
      return db.listCustomers(input ?? {});
    }),
    // Etiquetas existentes con su conteo -- alimenta los selectores de
    // "incluir/excluir etiqueta" al armar una campaña de mailing, para no
    // tener que escribir el nombre exacto de memoria.
    listTags: adminProcedure.query(async () => {
      return db.listCustomerTags();
    }),
    addTag: adminProcedure.input(z.object({ customerId: z.number(), tag: z.string().min(1) })).mutation(async ({ input }) => {
      await db.addCustomerTag(input.customerId, input.tag);
      return { success: true } as const;
    }),
    // Marcar como "ya enviado" en masa desde un CSV externo (pedido
    // explícito del usuario, ej. el reporte de entregados de Resend, que
    // trae la columna "to") -- no crea clientes nuevos, solo taguea los que
    // ya existen; los que no matchean se devuelven en notFound.
    bulkTagFromCsv: adminProcedure.input(z.object({
      csv: z.string().min(1),
      tag: z.string().min(1),
    })).mutation(async ({ input }) => {
      const rows = parseCsv(input.csv);
      const emails = extractEmailColumn(rows, ['to', 'email', 'correo']);
      if (emails.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se encontró una columna "to"/"email" en el CSV.' });
      }
      return db.bulkAddTagByEmails(emails, input.tag);
    }),
    removeTag: adminProcedure.input(z.object({ customerId: z.number(), tag: z.string() })).mutation(async ({ input }) => {
      await db.removeCustomerTag(input.customerId, input.tag);
      return { success: true } as const;
    }),
    updateNotes: adminProcedure.input(z.object({ customerId: z.number(), notes: z.string() })).mutation(async ({ input }) => {
      await db.updateCustomerNotes(input.customerId, input.notes);
      return { success: true } as const;
    }),
    // Ajuste manual de Playcoins (pedido explícito del usuario) -- para
    // migrar saldos de Shopify a mano o corregir.
    adjustPlaycoins: adminProcedure.input(z.object({ customerId: z.number(), delta: z.number().int(), note: z.string().optional() })).mutation(async ({ input }) => {
      await db.adjustPlaycoinsManually(input.customerId, input.delta, input.note ?? '');
      return { success: true } as const;
    }),
  }),

  // Mailing masivo desde /admin → Clientes (pedido explícito del usuario):
  // la IA solo genera texto estructurado (server/mailing.ts), el HTML de
  // marca se arma siempre acá con buildMailingBlastEmail.
  mailing: router({
    generateTemplate: adminProcedure.input(z.object({
      objective: z.string().min(5).max(1000),
      audienceDescription: z.string(),
    })).mutation(async ({ input }) => {
      try {
        return await generateMailingTemplate(input.objective, input.audienceDescription);
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'No se pudo generar la plantilla.' });
      }
    }),
    renderPreview: adminProcedure.input(z.object({
      content: MailingContentSchema,
      ctaUrl: z.string(),
      sampleName: z.string().optional(),
      eventSections: mailingEventSectionsSchema,
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      return {
        html: buildMailingBlastEmail({ ...input.content, buyerName: input.sampleName || 'Camila', ctaUrl: input.ctaUrl, eventInfo, eventSections: input.eventSections }),
      };
    }),
    sendBatch: adminProcedure.input(z.object({
      customerIds: z.array(z.number()).min(1).max(MAILING_BATCH_MAX),
      content: MailingContentSchema,
      ctaUrl: z.string(),
      campaignTag: z.string().optional(),
      eventSections: mailingEventSectionsSchema,
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      return {
        results: await sendMailingBatch(input.customerIds, input.content, input.ctaUrl, input.campaignTag, eventInfo, input.eventSections),
      };
    }),
    // Cola de envío automática (pedido explícito del usuario): a diferencia
    // de sendBatch (manda ya mismo desde el navegador), esto solo guarda la
    // campaña -- el cron diario (server/cronRoutes.ts) la va drenando.
    createAutoCampaign: adminProcedure.input(z.object({
      name: z.string().min(1),
      audienceDescription: z.string(),
      customerIds: z.array(z.number()).min(1),
      content: MailingContentSchema,
      ctaUrl: z.string(),
      eventSections: mailingEventSectionsSchema,
    })).mutation(async ({ input }) => {
      try {
        return await createAutoMailingCampaign(input);
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la campaña.' });
      }
    }),
    listCampaigns: adminProcedure.query(async () => {
      return db.listMailingCampaigns();
    }),
    getCampaignRecipients: adminProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
      return db.getMailingCampaignRecipients(input.campaignId);
    }),
  }),

  // Consulta pública de saldo de Playcoins (pedido explícito del usuario) --
  // sin login, igual que referrals.getByCode: el sitio no tiene cuentas de
  // comprador, el email es lo único necesario.
  playcoins: router({
    getBalanceByEmail: publicProcedure.input(z.object({ email: z.string().email() })).query(async ({ input }) => {
      return db.getPlaycoinsBalance(input.email);
    }),
  }),

  // Enrolamiento de dispositivos desde /admin (pedido explícito del usuario).
  devices: router({
    listAll: adminProcedure.query(async () => {
      return db.listAllDevices();
    }),
    // Genera un código de un solo uso (vence a las 24h) para enrolar una
    // tablet nueva -- se muestra una sola vez en el admin, no se puede
    // recuperar después (mismo criterio que un PIN).
    create: adminProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ input }) => {
      const code = generateEnrollCode();
      const id = await db.createDeviceEnrollment(input.name, code, enrollCodeExpiry());
      return { id, enrollCode: code };
    }),
    setActive: adminProcedure.input(z.object({ id: z.number(), active: z.number().min(0).max(1) })).mutation(async ({ input }) => {
      await db.updateDeviceActive(input.id, input.active as 0 | 1);
      return { success: true } as const;
    }),
  }),

  // Cajas físicas ("Caja 1", "Caja 2"...) desde /admin.
  registers: router({
    listAll: adminProcedure.query(async () => {
      return db.listAllRegisters();
    }),
    create: adminProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ input }) => {
      const id = await db.createRegister(input.name);
      return { id };
    }),
  }),

  // Reportes y auditoría de /caja desde /admin (docs/ARQUITECTURA-CAJA.md §11, Fase 4).
  cajaReports: router({
    profit: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getProfitReport(input.eventId);
    }),
    eventComparison: adminProcedure.query(async () => {
      return db.getEventComparison();
    }),
    peakHours: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return db.getPeakHours(input.eventId);
    }),
    ledger: adminProcedure.input(z.object({
      eventId: z.number(),
      operatorId: z.number().optional(),
      type: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })).query(async ({ input }) => {
      const { eventId, ...filters } = input;
      return db.getLedger(eventId, filters);
    }),
    // Cuadres de caja guardados (pedido explícito del usuario) -- sin
    // eventId trae los de todos los eventos, para comparar entre fiestas.
    shiftClosings: adminProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ input }) => {
      return db.listShiftClosings(input?.eventId);
    }),
    // Eliminar un cierre de turno (pedido explícito del usuario, para sacar
    // pruebas/cierres de práctica de los reportes reales) -- doble
    // verificación: además del diálogo de confirmación en el admin, pide la
    // misma clave que auth.adminLogin.
    deleteShiftClosing: adminProcedure.input(z.object({
      shiftId: z.number(),
      password: z.string(),
    })).mutation(async ({ input }) => {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || input.password !== adminPassword) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Contraseña incorrecta' });
      }
      return db.deleteShiftClosing(input.shiftId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
