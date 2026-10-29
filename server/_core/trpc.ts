import { canGift, GIFT_DENIED_MESSAGE } from '@shared/gifts';
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { canUseCaja } from "@shared/cajaRoles";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { maskPii } from "../privacy";

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

/** Regalos (plata que no se cobra): solo el administrador dueño (shared/gifts.ts). */
export const giftProcedure = adminProcedure.use(
  t.middleware(async opts => {
    if (!canGift(opts.ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: GIFT_DENIED_MESSAGE });
    return opts.next();
  }),
);

/** Lectura del panel de admin: la abre también al invitado de demostración
 * (`viewer`), enmascarándole los datos personales de los clientes reales.
 *
 * Es un procedure SEPARADO en vez de aflojar `adminProcedure` a propósito:
 * las ~54 mutations siguen colgando del de arriba, así que si algún día se
 * agrega un endpoint nuevo y se olvida clasificarlo, el invitado recibe
 * FORBIDDEN. El modo de falla apunta al lado seguro. */
export const adminReadProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'viewer')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const result = await next({ ctx: { ...ctx, user: ctx.user } });

    if (ctx.user.role === 'viewer' && result.ok) {
      return { ...result, data: maskPii(result.data) };
    }

    return result;
  }),
);

/** Panel de una co-producción (ej. Playroom × Dalmore): lo abren el dueño
 * (`admin`) y el socio (`partner`). Al socio se le fija SU co-producción
 * desde la sesión -- nunca desde el input -- así no puede pedir otra ni ver
 * nada de Playroom. Todo lo demás del panel sigue en `adminProcedure` /
 * `adminReadProcedure`, que rechazan al socio. */
export const partnerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'partner')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    if (ctx.user.role === 'partner' && !ctx.user.coproductionId) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        /** null = el dueño (elige la co-producción por input). */
        partnerCoproductionId: ctx.user.role === 'partner' ? ctx.user.coproductionId! : null,
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

/** Cualquier pantalla de trabajo (Caja, Puerta, Cocina, Guardarropía, Barra): sesión de operador con cualquier rol. Solo para lo
 * que todas comparten y no toca plata ni datos de clientes, como el botón «Llamar a los organizadores». */
export const anyOperatorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Entra con tu PIN para avisar" });
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

/** Pantalla de barra (/barra): conteo de inventario inicial y de cierre del staff de barra. Mismo trade-off que
 * `kitchenProcedure` -- sesión de operador sin exigir dispositivo enrolado (se usa desde el celular), acotado a
 * contar insumos; nunca vende ni cobra. */
export const barraProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de barra requerida" });
    }
    const role = ctx.operator.role;
    if (role !== 'barra' && role !== 'supervisor' && role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso al conteo de barra" });
    }

    return next({ ctx: { ...ctx, operator: ctx.operator } });
  }),
);

/** Id del evento de pruebas de caja (slug fijo 'pruebas-caja'), cacheado
 * una vez encontrado: no cambia mientras el servidor vive. */
let cajaTestEventId: number | null = null;
async function isCajaTestEvent(eventId: number): Promise<boolean> {
  if (cajaTestEventId === null) {
    const { getEventBySlug } = await import("../db");
    const test = await getEventBySlug("pruebas-caja");
    if (test) cajaTestEventId = test.id;
  }
  return cajaTestEventId === eventId;
}

// Requiere una sesión de operador de /caja válida (login por PIN, no admin)
// EN un dispositivo enrolado -- ambos, no solo uno. Una sesión de operador
// robada no sirve de nada sin también tener el dispositivo enrolado.
//
// Además:
// - Rol: solo caja/barra/supervisor/admin. Puerta, cocina y guardarropía
//   usan la MISMA cookie de sesión, y sin esto podían vender desde una
//   tablet de caja.
// - Evento: si el pedido trae `eventId`, tiene que ser el evento del
//   dispositivo o el de pruebas (`activeEvent` usa ese fuera de horario).
//   Antes se aceptaba cualquier id que mandara el cliente.
export const operatorProcedure = deviceProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.operator) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión de caja requerida" });
    }
    if (!canUseCaja(ctx.operator.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tu usuario no usa la caja" });
    }
    const raw = await opts.getRawInput();
    const eventId = raw && typeof raw === "object" ? (raw as { eventId?: unknown }).eventId : undefined;
    if (typeof eventId === "number" && eventId !== ctx.device?.eventId && !(await isCajaTestEvent(eventId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Este evento no corresponde a esta caja" });
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
