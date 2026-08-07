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

/** Pantalla de puerta (/puerta): sesión de operador con rol de acceso,
 * SIN exigir dispositivo enrolado.
 *
 * Es la única puerta de entrada del sistema que renuncia a esa segunda
 * barrera, y es a propósito: el anfitrión escanea con su propio teléfono
 * en la entrada del estacionamiento, y hacerlo emparejar el dispositivo
 * ahí, con autos llegando, garantizaba que la función no se usara.
 *
 * El riesgo queda acotado porque lo único que se puede hacer con esta
 * sesión es MARCAR ENTRADAS: no vende, no cobra y no anula. Cada marca
 * queda firmada con el nombre del operador en el ledger `ops`, y el login
 * pasa por el mismo límite por IP que el de caja. */
export const doorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de puerta requerida" });
    }
    const role = ctx.operator.role;
    if (role !== 'acceso' && role !== 'supervisor' && role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la puerta" });
    }

    return next({ ctx: { ...ctx, operator: ctx.operator } });
  }),
);

/** Pantalla de cocina (/cocina): sesión de operador con rol de cocina,
 * SIN exigir dispositivo enrolado -- mismo trade-off que `doorProcedure`
 * (§13 del doc de arquitectura, ya asumido ahí): el equipo de cocina usa la
 * pantalla que haya, y forzar enrolamiento con pedidos entrando garantiza
 * que la pantalla no se use. El riesgo queda acotado porque esta sesión
 * SOLO puede cambiar el estado de un pedido de comida: no vende, no cobra,
 * no anula, y cada cambio queda firmado en el ledger `ops`. */
export const kitchenProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de cocina requerida" });
    }
    const role = ctx.operator.role;
    if (role !== 'cocina' && role !== 'supervisor' && role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la pantalla de cocina" });
    }

    return next({ ctx: { ...ctx, operator: ctx.operator } });
  }),
);

/** Pantalla de guardarropía (/guardarropia): mismo trade-off que
 * `kitchenProcedure` -- sesión de operador sin exigir dispositivo
 * enrolado, acotado a solo poder cambiar el estado de una prenda
 * (recibir/entregar), nunca vender ni cobrar. */
export const guardarropiaProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de guardarropía requerida" });
    }
    const role = ctx.operator.role;
    if (role !== 'guardarropia' && role !== 'supervisor' && role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la pantalla de guardarropía" });
    }

    return next({ ctx: { ...ctx, operator: ctx.operator } });
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
