import { describe, expect, it } from "vitest";
import { listAttendeeSlots, BUYER_ATTENDEE_SLOT } from "./db";

/* Ventana "Editar nombres" de Ventas Web: de acá salen las personas que el
 * dueño puede corregir. Lo que no aparezca acá no se puede arreglar. */

const json = (campos: Record<string, string>) => JSON.stringify({ acceso: "duo", cantidad: 2, campos });

describe("listAttendeeSlots", () => {
  it("devuelve al comprador primero y luego los acompañantes, cada uno con su RUT", () => {
    const out = listAttendeeSlots(json({
      buyer__nombre: "Juan",
      buyer__rut: "12.345.678-5",
      acceso__acomp1_nombre: "Ana Soto",
      acceso__acomp1_rut: "9.876.543-3",
    }), "Juan");
    expect(out.map((p) => p.slot)).toEqual([BUYER_ATTENDEE_SLOT, "acceso__acomp1"]);
    expect(out[0]).toEqual({ slot: "buyer_", fullName: "Juan", rut: "12.345.678-5" });
    expect(out[1]).toEqual({ slot: "acceso__acomp1", fullName: "Ana Soto", rut: "9.876.543-3" });
  });

  it("incluye acompañantes con el nombre vacío (justo los que hay que corregir)", () => {
    const out = listAttendeeSlots(json({
      buyer__nombre: "Juan Perez",
      acceso__acomp1_nombre: "",
      acceso__acomp1_rut: "9.876.543-3",
    }), "Juan Perez");
    expect(out).toHaveLength(2);
    expect(out[1].fullName).toBe("");
  });

  it("aunque el comprador venga primero o último en el JSON, sale primero", () => {
    const out = listAttendeeSlots(json({
      acceso__acomp1_nombre: "Ana",
      buyer__nombre: "Juan",
    }), "Juan");
    expect(out[0].slot).toBe(BUYER_ATTENDEE_SLOT);
  });

  it("órdenes viejas sin attendeeData: el comprador sale con orders.buyerName", () => {
    expect(listAttendeeSlots(null, "Maria Gonzalez")).toEqual([
      { slot: "buyer_", fullName: "Maria Gonzalez", rut: "" },
    ]);
  });

  it("JSON dañado no rompe la lista: queda solo el comprador", () => {
    expect(listAttendeeSlots("{no es json", "Pedro")).toEqual([
      { slot: "buyer_", fullName: "Pedro", rut: "" },
    ]);
  });

  it("ignora campos que no son nombre/RUT", () => {
    const out = listAttendeeSlots(json({ buyer__nombre: "Juan", buyer__instagram: "@juan", buyer__email: "j@x.cl" }), "Juan");
    expect(out).toHaveLength(1);
  });
});
