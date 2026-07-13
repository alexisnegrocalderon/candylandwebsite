import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

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
    createTicketType: adminProcedure.input(z.object({
      eventId: z.number(),
      name: z.string(),
      description: z.string().optional(),
      price: z.number(),
      originalPrice: z.number().optional(),
      totalStock: z.number(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
    })).mutation(async ({ input }) => {
      return db.createTicketType(input);
    }),
    updateTicketType: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      originalPrice: z.number().optional(),
      totalStock: z.number().optional(),
      maxPerOrder: z.number().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(['active', 'soldout', 'hidden']).optional(),
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
      return db.createOrder(input);
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
  }),
});

export type AppRouter = typeof appRouter;
