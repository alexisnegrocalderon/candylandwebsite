import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Requiere un dispositivo enrolado (pedido explícito del usuario) -- antes
// de siquiera ver la pantalla de PIN, la tablet debe haber canjeado un
// código de enrolamiento generado por un admin. Ver server/caja/deviceAuth.ts.
export const deviceProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.device) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Este dispositivo no está enrolado" });
    }

    return next({
      ctx: {
        ...ctx,
        device: ctx.device,
      },
    });
  }),
);

// Requiere una sesión de operador de /caja válida (login por PIN, no admin)
// EN un dispositivo enrolado -- ambos, no solo uno. Una sesión de operador
// robada no sirve de nada sin también tener el dispositivo enrolado.
export const operatorProcedure = deviceProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de caja requerida" });
    }

    return next({
      ctx: {
        ...ctx,
        operator: ctx.operator,
      },
    });
  }),
);

// Como operatorProcedure, pero solo para supervisor/admin -- anulaciones y
// resolución de conflictos (docs/ARQUITECTURA-CAJA.md §3.2).
export const supervisorProcedure = operatorProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator || (ctx.operator.role !== 'supervisor' && ctx.operator.role !== 'admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Se requiere rol de supervisor" });
    }

    return next({
      ctx: {
        ...ctx,
        operator: ctx.operator,
      },
    });
  }),
);
