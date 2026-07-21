import { describe, expect, it } from "vitest";
import { parseCsv, extractEmailColumn } from "./csv";

describe("parseCsv", () => {
  it("parses a simple comma-separated CSV with a header", () => {
    const rows = parseCsv("a,b\n1,2\n3,4");
    expect(rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv('subject,to\n"Hola, mundo","a@b.com"');
    expect(rows).toEqual([["subject", "to"], ["Hola, mundo", "a@b.com"]]);
  });
});

describe("extractEmailColumn", () => {
  it("extracts unique, lowercased emails from a Resend-style export using the 'to' column", () => {
    const rows = parseCsv(
      "id,created_at,subject,from,to,cc,bcc\n" +
      "1,2026-01-01,Hola,noreply@x.com,Marchant.Bastian@gmail.com,,\n" +
      "2,2026-01-02,Otro,noreply@x.com,negro.mindfitness@gmail.com,,\n" +
      "3,2026-01-03,Repetido,noreply@x.com,marchant.bastian@gmail.com,,\n"
    );
    const emails = extractEmailColumn(rows, ["to", "email"]);
    expect(emails.sort()).toEqual(["marchant.bastian@gmail.com", "negro.mindfitness@gmail.com"]);
  });

  it("returns an empty array when none of the hinted columns exist", () => {
    const rows = parseCsv("nombre,telefono\nJuan,123456");
    expect(extractEmailColumn(rows, ["to", "email", "correo"])).toEqual([]);
  });

  it("skips empty values in the matched column", () => {
    const rows = parseCsv("to\na@b.com\n\nc@d.com");
    expect(extractEmailColumn(rows, ["to"])).toEqual(["a@b.com", "c@d.com"]);
  });

  it("returns an empty array for an empty CSV", () => {
    expect(extractEmailColumn([], ["to"])).toEqual([]);
  });
});
