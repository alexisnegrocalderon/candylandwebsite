import { formatChileDateTime } from '../shared/chileDate';
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { csvEscape, toCsv, parseCsv } from "./csv";
import { buildVentasReportPdf, buildGastosReportPdf } from "./caja/reportsPdf";

/** Exportada para que otras rutas Express crudas (fuera de tRPC) reusen el
 * mismo chequeo -- ver server/blobUpload.ts. */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
}

export function registerAdminRoutes(app: Express) {
  // Export de órdenes a CSV, filtrable por evento / rango de fechas / estado de pago.
  app.get("/api/admin/orders/export.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { eventId, dateFrom, dateTo, status, channel } = req.query as Record<string, string | undefined>;
    const rows = await db.getOrdersForExport({
      eventId: eventId ? Number(eventId) : undefined,
      dateFrom,
      dateTo,
      status,
      channel: channel === 'web' || channel === 'caja' ? channel : undefined,
    });

    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt ? formatChileDateTime(r.createdAt) : "",
      })),
      [
        { key: "orderNumber", label: "N° Orden" },
        { key: "createdAt", label: "Fecha" },
        { key: "eventTitle", label: "Evento" },
        { key: "buyerName", label: "Comprador" },
        { key: "buyerEmail", label: "Email" },
        { key: "buyerPhone", label: "WhatsApp" },
        { key: "subtotal", label: "Subtotal" },
        { key: "discount", label: "Descuento" },
        { key: "total", label: "Total" },
        { key: "paymentStatus", label: "Estado de pago" },
        { key: "paymentMethod", label: "Método de pago" },
        { key: "ambassadorCode", label: "Código embajador" },
      ],
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ordenes-${new Date().toISOString().slice(0, 10)}.csv"`);
    // BOM para que Excel abra los acentos correctamente.
    res.send("﻿" + csv);
  });

  // Export de clientes a CSV, mismos filtros que customers.listAll.
  app.get("/api/admin/customers/export.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { search, accessType, tag } = req.query as Record<string, string | undefined>;
    const rows = await db.listCustomers({ search, accessType, tag });

    const csv = toCsv(
      rows.map((c: any) => ({
        ...c,
        accessTypes: Array.isArray(c.accessTypes) ? c.accessTypes.join(";") : "",
        tags: Array.isArray(c.tags) ? c.tags.join(";") : "",
        firstSeenAt: c.firstSeenAt ? formatChileDateTime(c.firstSeenAt) : "",
        lastSeenAt: c.lastSeenAt ? formatChileDateTime(c.lastSeenAt) : "",
      })),
      [
        { key: "email", label: "Email" },
        { key: "fullName", label: "Nombre" },
        { key: "phone", label: "Teléfono" },
        { key: "rut", label: "RUT" },
        { key: "instagram", label: "Instagram" },
        { key: "accessTypes", label: "Tipos de acceso" },
        { key: "tags", label: "Etiquetas" },
        { key: "totalOrders", label: "Compras" },
        { key: "totalSpent", label: "Total gastado" },
        { key: "playcoins", label: "Playcoins" },
        { key: "notes", label: "Notas" },
        { key: "firstSeenAt", label: "Primera compra" },
        { key: "lastSeenAt", label: "Última compra" },
      ],
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  });

  // Import de clientes desde CSV (email es la clave; accessTypes/tags separados por ";").
  app.post("/api/admin/customers/import.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const csvText = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csvText.trim()) {
      res.status(400).json({ error: "CSV vacío" });
      return;
    }

    const parsedRows = parseCsv(csvText);
    if (parsedRows.length < 2) {
      res.status(400).json({ error: "El CSV no tiene filas de datos" });
      return;
    }

    const header = parsedRows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((idx) => idx !== -1) ?? -1;
    const idxEmail = col("email");
    if (idxEmail === -1) {
      res.status(400).json({ error: 'Falta la columna "Email"' });
      return;
    }

    // Export de Shopify (Customer ID, First Name, Last Name, Total Spent...): nombre
    // viene separado en 2 columnas y "Tags" es ruido interno de Shopify (Login with
    // Shop, STAFF, etc.) -- nunca se mapea a nuestras etiquetas libres.
    const idxFirstName = col("first name");
    const idxLastName = col("last name");
    const isShopifyExport = idxFirstName !== -1 || idxLastName !== -1 || col("customer id") !== -1;

    const idxName = isShopifyExport ? -1 : col("nombre", "fullname");
    const idxPhone = col("teléfono", "telefono", "phone");
    const idxDefaultPhone = col("default address phone");
    const idxRut = col("rut");
    const idxInstagram = col("instagram");
    const idxAccessTypes = col("tipos de acceso", "accesstypes");
    const idxTags = isShopifyExport ? -1 : col("etiquetas", "tags");
    const idxNotes = col("notas", "notes");
    const idxTotalOrders = col("total orders");
    const idxTotalSpent = col("total spent");

    const splitList = (value: string | undefined) =>
      value ? value.split(";").map((s) => s.trim()).filter(Boolean) : undefined;

    const rows = parsedRows
      .slice(1)
      .map((r) => {
        const fullName = isShopifyExport
          ? [idxFirstName !== -1 ? r[idxFirstName]?.trim() : "", idxLastName !== -1 ? r[idxLastName]?.trim() : ""]
              .filter(Boolean)
              .join(" ") || undefined
          : idxName !== -1
            ? r[idxName]?.trim() || undefined
            : undefined;
        const phone =
          (idxPhone !== -1 && r[idxPhone]?.trim()) ||
          (idxDefaultPhone !== -1 && r[idxDefaultPhone]?.trim()) ||
          undefined;
        const totalOrders = idxTotalOrders !== -1 ? Number(r[idxTotalOrders]) : undefined;
        const totalSpent = idxTotalSpent !== -1 ? Number(r[idxTotalSpent]) : undefined;

        return {
          email: r[idxEmail]?.trim() ?? "",
          fullName,
          phone,
          rut: idxRut !== -1 ? r[idxRut]?.trim() || undefined : undefined,
          instagram: idxInstagram !== -1 ? r[idxInstagram]?.trim() || undefined : undefined,
          accessTypes: idxAccessTypes !== -1 ? splitList(r[idxAccessTypes]) : undefined,
          tags: idxTags !== -1 ? splitList(r[idxTags]) : undefined,
          notes: idxNotes !== -1 ? r[idxNotes]?.trim() || undefined : undefined,
          totalOrders: Number.isFinite(totalOrders) ? totalOrders : undefined,
          totalSpent: Number.isFinite(totalSpent) ? totalSpent : undefined,
        };
      })
      .filter((r) => r.email);

    const result = await db.importCustomers(rows);
    res.json(result);
  });

  // Export de cierres de turno (cuadre de caja) a CSV -- pedido explícito
  // del usuario, para comparar entre eventos fuera del admin.
  app.get("/api/admin/shifts/export.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const { eventId } = req.query as Record<string, string | undefined>;
    const rows = await db.getShiftClosingsForExport(eventId ? Number(eventId) : undefined);

    const csv = toCsv(
      rows.map((r: any) => ({
        ...r,
        openedAt: r.openedAt ? formatChileDateTime(r.openedAt) : "",
        closedAt: r.closedAt ? formatChileDateTime(r.closedAt) : "",
        topCustomers: (r.topCustomers ?? []).map((c: any) => `${c.name} ($${c.total})`).join(" · "),
        topProducts: (r.topProducts ?? []).map((p: any) => `${p.name} (${p.quantity}x)`).join(" · "),
      })),
      [
        { key: "eventTitle", label: "Evento" },
        { key: "registerName", label: "Caja" },
        { key: "operatorName", label: "Abrió" },
        { key: "closedByName", label: "Cerró" },
        { key: "openedAt", label: "Apertura" },
        { key: "closedAt", label: "Cierre" },
        { key: "openingCash", label: "Efectivo inicial (fondo)" },
        { key: "expectedCash", label: "Ventas en efectivo del turno" },
        { key: "cashPaidOut", label: "Gastos pagados del cajón" },
        // Sin esta columna, en Excel "Contado - Esperado" no daba nunca la
        // "Diferencia efectivo" de la columna siguiente: la brecha era
        // exactamente el fondo inicial, que el esperado exportado no incluía
        // pero la diferencia sí restaba. Ésta es la cifra contra la que se
        // compara de verdad lo que hay en el cajón.
        { key: "expectedCashWithOpening", label: "Esperado total (con fondo)" },
        { key: "countedCash", label: "Efectivo contado" },
        { key: "cashDiff", label: "Diferencia efectivo" },
        { key: "countedDebit", label: "Débito contado" },
        { key: "expectedDebit", label: "Débito esperado" },
        { key: "debitDiff", label: "Diferencia débito" },
        { key: "countedCredit", label: "Crédito contado" },
        { key: "expectedCredit", label: "Crédito esperado" },
        { key: "creditDiff", label: "Diferencia crédito" },
        // QR / transferencia: se cobraba y se guardaba, pero no salía en
        // ningún export -- al cuadrar desde el admin esa plata parecía
        // haberse evaporado.
        { key: "countedQr", label: "QR/transferencia contado" },
        { key: "expectedQr", label: "QR/transferencia esperado" },
        { key: "qrDiff", label: "Diferencia QR/transferencia" },
        { key: "salesCount", label: "N° ventas" },
        { key: "redeemsCount", label: "N° canjes" },
        { key: "topCustomers", label: "Top clientes (evento)" },
        { key: "topProducts", label: "Top productos (evento)" },
      ],
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="cierres-turno-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  });

  // Reporte consolidado del sub-tab "Ventas" de Gastos y P&L (pedido
  // explícito del usuario: un solo botón por sub-tab en vez de uno por
  // tabla) -- CSV y PDF comparten los mismos datos que se ven en pantalla.
  app.get("/api/admin/gastos/ventas.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) { res.status(400).json({ error: "eventId requerido" }); return; }
    const rows = await db.getProfitReport(eventId);
    const csv = toCsv(rows, [
      { key: "name", label: "Producto" },
      { key: "category", label: "Categoría" },
      { key: "groupName", label: "Grupo" },
      { key: "unitsSold", label: "Unidades" },
      { key: "revenue", label: "Ingresos" },
      { key: "cost", label: "Costo" },
      { key: "profit", label: "Utilidad" },
      { key: "marginPercent", label: "Margen %" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  });

  app.get("/api/admin/gastos/ventas.pdf", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) { res.status(400).json({ error: "eventId requerido" }); return; }
    const [event, rows] = await Promise.all([db.getEventById(eventId), db.getProfitReport(eventId)]);
    const pdf = await buildVentasReportPdf(event?.title ?? `Evento #${eventId}`, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });

  // Mismo criterio para "Gastos".
  app.get("/api/admin/gastos/gastos.csv", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) { res.status(400).json({ error: "eventId requerido" }); return; }
    const rows = await db.listExpenses({ eventId });
    const csv = toCsv(
      rows.map((r: any) => ({ ...r, expenseDate: r.expenseDate ? formatChileDateTime(r.expenseDate) : "" })),
      [
        { key: "expenseDate", label: "Fecha" },
        { key: "category", label: "Categoría" },
        { key: "description", label: "Descripción" },
        { key: "supplier", label: "Proveedor" },
        { key: "amountTotal", label: "Monto" },
        { key: "paymentMethod", label: "Medio de pago" },
      ],
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gastos-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  });

  app.get("/api/admin/gastos/gastos.pdf", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) { res.status(400).json({ error: "eventId requerido" }); return; }
    const [event, rows] = await Promise.all([db.getEventById(eventId), db.listExpenses({ eventId })]);
    const pdf = await buildGastosReportPdf(event?.title ?? `Evento #${eventId}`, rows as any);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gastos-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });
}
