import { COOKIE_NAME, ONE_YEAR_MS, CAJA_COOKIE_NAME, CAJA_SESSION_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk, ADMIN_LOCAL_OPEN_ID } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, operatorProcedure, supervisorProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { getMission300Status, evaluateMission300, processCardPaymentForOrder, confirmFreeOrder, resendConfirmationEmail } from "./webhooks";
import { hashPin, verifyPin, signOperatorSession } from "./caja/auth";
import { redeemDisplayCode } from "./caja/redeem";
import { createCajaSale } from "./caja/sale";
import { voidTicketCode } from "./caja/void";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  return next({ ctx });
});

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
    adminLogin: publicProcedure.input(z.object({ password: z.string() })).mutation(async ({ input, ctx }) => {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || input.password !== adminPassword) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Contraseña incorrecta' });
      }
      await db.upsertUser({ openId: ADMIN_LOCAL_OPEN_ID, name: 'Admin', role: 'admin', lastSignedIn: new Date() });
      // sdk.createSessionToken() mete ENV.appId (VITE_APP_ID) en el JWT, que no
      // está configurado en este deploy standalone — firmamos directo con un
      // appId fijo para no depender de esa variable de la plataforma original.
      const sessionToken = await sdk.signSession({ openId: ADMIN_LOCAL_OPEN_ID, appId: 'candyland-admin', name: 'Admin' }, { expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true } as const;
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
      category: z.enum(['acceso', 'extra']).optional(),
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
    })).mutation(async ({ input }) => {
      return db.createTicketType(input);
    }),
    updateTicketType: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      accesoSlug: z.enum(['duo', 'duo_mujeres', 'soltera', 'soltero', 'trio', 'grupo', 'cumpleaneros']).optional(),
      category: z.enum(['acceso', 'extra']).optional(),
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
    }).optional()).query(async ({ input }) => {
      return db.getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status);
    }),
    getStats: adminProcedure.query(async () => {
      return db.getOrderStats();
    }),
    getTickets: adminProcedure.input(z.object({ orderId: z.number() })).query(async ({ input }) => {
      return db.getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure.input(z.object({ orderNumber: z.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    }),
  }),

  mission300: router({
    status: adminProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    }),
  }),

  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z.object({ ticketCode: z.string() })).query(async ({ input }) => {
      return db.getTicketByCode(input.ticketCode);
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

  // Módulo /caja — login por PIN de operadores (docs/ARQUITECTURA-CAJA.md
  // Fase 0). Sesión separada de auth.adminLogin: no toca `users` ni COOKIE_NAME.
  caja: router({
    // Pantalla "toca tu nombre" (§10.2) — nunca expone pinHash.
    listOperators: publicProcedure.query(async () => {
      return db.listActiveOperatorsPublic();
    }),
    login: publicProcedure.input(z.object({ operatorId: z.number(), pin: z.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await db.getOperatorById(input.operatorId);
      if (!operator || !operator.active || !verifyPin(input.pin, operator.pinHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'PIN incorrecto' });
      }
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
      ops: z.array(z.discriminatedUnion('type', [
        z.object({ type: z.literal('redeem'), opId: z.string(), displayCode: z.string(), clientAt: z.string() }),
        z.object({ type: z.literal('sale'), opId: z.string(), items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1) })).min(1), paymentMethod: z.enum(['efectivo', 'debito', 'credito']), clientAt: z.string() }),
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
              operatorId: ctx.operator.operatorId, clientAt: new Date(op.clientAt),
            });
          } else {
            results[op.opId] = await createCajaSale(rawDb, {
              opId: op.opId, eventId: input.eventId, operatorId: ctx.operator.operatorId,
              items: op.items, paymentMethod: op.paymentMethod, clientAt: new Date(op.clientAt),
            });
          }
        } catch (err) {
          results[op.opId] = { result: 'rejected', conflictNote: err instanceof Error ? err.message : 'Error al sincronizar' };
        }
      }
      return results;
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
    sale: operatorProcedure.input(z.object({
      opId: z.string(),
      eventId: z.number(),
      items: z.array(z.object({ ticketTypeId: z.number(), quantity: z.number().min(1) })).min(1),
      paymentMethod: z.enum(['efectivo', 'debito', 'credito']),
      registerId: z.number().optional(),
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
      role: z.enum(['admin', 'supervisor', 'caja', 'barra', 'acceso']),
    })).mutation(async ({ input }) => {
      const id = await db.createOperator({ name: input.name, pinHash: hashPin(input.pin), role: input.role });
      return { id };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      pin: z.string().min(4).max(8).optional(),
      role: z.enum(['admin', 'supervisor', 'caja', 'barra', 'acceso']).optional(),
      active: z.number().min(0).max(1).optional(),
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await db.updateOperator(id, { ...rest, ...(pin ? { pinHash: hashPin(pin) } : {}) });
      return { success: true } as const;
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
  }),
});

export type AppRouter = typeof appRouter;
