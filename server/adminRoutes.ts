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

/** Parser CSV sin dependencias: soporta campos entre comillas con comas y
 * saltos de línea adentro, y comillas escapadas (""). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignorado, el \n que sigue cierra la fila
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
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
        firstSeenAt: c.firstSeenAt ? new Date(c.firstSeenAt).toLocaleString("es-CL") : "",
        lastSeenAt: c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString("es-CL") : "",
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
    const idxName = col("nombre", "fullname");
    const idxPhone = col("teléfono", "telefono", "phone");
    const idxRut = col("rut");
    const idxInstagram = col("instagram");
    const idxAccessTypes = col("tipos de acceso", "accesstypes");
    const idxTags = col("etiquetas", "tags");
    const idxNotes = col("notas", "notes");

    const splitList = (value: string | undefined) =>
      value ? value.split(";").map((s) => s.trim()).filter(Boolean) : undefined;

    const rows = parsedRows
      .slice(1)
      .map((r) => ({
        email: r[idxEmail]?.trim() ?? "",
        fullName: idxName !== -1 ? r[idxName]?.trim() || undefined : undefined,
        phone: idxPhone !== -1 ? r[idxPhone]?.trim() || undefined : undefined,
        rut: idxRut !== -1 ? r[idxRut]?.trim() || undefined : undefined,
        instagram: idxInstagram !== -1 ? r[idxInstagram]?.trim() || undefined : undefined,
        accessTypes: idxAccessTypes !== -1 ? splitList(r[idxAccessTypes]) : undefined,
        tags: idxTags !== -1 ? splitList(r[idxTags]) : undefined,
        notes: idxNotes !== -1 ? r[idxNotes]?.trim() || undefined : undefined,
      }))
      .filter((r) => r.email);

    const result = await db.importCustomers(rows);
    res.json(result);
  });
}
