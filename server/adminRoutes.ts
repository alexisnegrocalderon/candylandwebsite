import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
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

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
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
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString("es-CL") : "",
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
}
