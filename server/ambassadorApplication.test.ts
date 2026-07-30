import { describe, expect, it } from "vitest";
import {
  AMBASSADOR_REQUIREMENTS,
  AMBASSADOR_TASKS,
  MAX_APPLICANT_NAME_LENGTH,
  MAX_APPLICATION_MESSAGE_LENGTH,
  MIN_INSTAGRAM_FOLLOWERS,
  instagramLinkFor,
  sanitizeApplicantName,
  sanitizeApplicationMessage,
  sanitizeFollowers,
  sanitizeInstagram,
  sanitizeWhatsapp,
  whatsappLinkFor,
} from "../shared/ambassadorApplication";

describe("sanitizeInstagram", () => {
  it("acepta las cuatro formas en que la gente escribe su Instagram", () => {
    for (const entrada of [
      'sofia',
      '@sofia',
      'instagram.com/sofia',
      'https://www.instagram.com/sofia/',
    ]) {
      const r = sanitizeInstagram(entrada);
      expect(r.ok, entrada).toBe(true);
      if (r.ok) expect(r.value).toBe('sofia');
    }
  });

  it("ignora parámetros de seguimiento que trae el link copiado desde la app", () => {
    const r = sanitizeInstagram('https://instagram.com/sofia?igsh=abc123');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('sofia');
  });

  it("acepta puntos y guion bajo, que son válidos en Instagram", () => {
    const r = sanitizeInstagram('@so.fia_playroom');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('so.fia_playroom');
  });

  it("saca varias arrobas si alguien las repite", () => {
    const r = sanitizeInstagram('@@sofia');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('sofia');
  });

  it("rechaza vacío", () => {
    expect(sanitizeInstagram('').ok).toBe(false);
    expect(sanitizeInstagram('   ').ok).toBe(false);
    expect(sanitizeInstagram('@').ok).toBe(false);
  });

  it("rechaza caracteres que Instagram no permite", () => {
    expect(sanitizeInstagram('so fia').ok).toBe(false);
    expect(sanitizeInstagram('sofia!').ok).toBe(false);
    expect(sanitizeInstagram('sofia/otra').ok).toBe(false);
  });

  it("rechaza un handle más largo que el límite de Instagram", () => {
    expect(sanitizeInstagram('a'.repeat(31)).ok).toBe(false);
    expect(sanitizeInstagram('a'.repeat(30)).ok).toBe(true);
  });
});

describe("sanitizeWhatsapp", () => {
  it("normaliza todos los formatos chilenos habituales al mismo número", () => {
    for (const entrada of [
      '+56 9 1234 5678',
      '+56912345678',
      '56912345678',
      '912345678',
      '9 1234 5678',
      '9-1234-5678',
      '(+56) 9 1234 5678',
    ]) {
      const r = sanitizeWhatsapp(entrada);
      expect(r.ok, entrada).toBe(true);
      if (r.ok) expect(r.value, entrada).toBe('+56912345678');
    }
  });

  it("tolera el 0 de larga distancia", () => {
    const r = sanitizeWhatsapp('0912345678');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('+56912345678');
  });

  it("rechaza un número con menos o más dígitos de los que corresponde", () => {
    expect(sanitizeWhatsapp('91234567').ok).toBe(false);
    expect(sanitizeWhatsapp('9123456789').ok).toBe(false);
  });

  it("rechaza un fijo: tiene que ser celular", () => {
    // 322345678 es un fijo de Valparaíso, no empieza con 9.
    const r = sanitizeWhatsapp('322345678');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('celular');
  });

  it("rechaza vacío y texto sin dígitos", () => {
    expect(sanitizeWhatsapp('').ok).toBe(false);
    expect(sanitizeWhatsapp('no tengo').ok).toBe(false);
  });
});

describe("sanitizeApplicantName", () => {
  it("colapsa espacios de más", () => {
    const r = sanitizeApplicantName('  Sofía   Pérez  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Sofía Pérez');
  });

  it("rechaza un nombre demasiado corto", () => {
    expect(sanitizeApplicantName('So').ok).toBe(false);
    expect(sanitizeApplicantName('').ok).toBe(false);
  });

  it("rechaza pasado el tope de largo", () => {
    expect(sanitizeApplicantName('a'.repeat(MAX_APPLICANT_NAME_LENGTH)).ok).toBe(true);
    expect(sanitizeApplicantName('a'.repeat(MAX_APPLICANT_NAME_LENGTH + 1)).ok).toBe(false);
  });
});

describe("sanitizeApplicationMessage", () => {
  it("el mensaje es opcional: vacío es válido", () => {
    const r = sanitizeApplicationMessage('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('');
  });

  it("rechaza pasado el tope, para que nadie use el formulario de bloc de notas", () => {
    expect(sanitizeApplicationMessage('a'.repeat(MAX_APPLICATION_MESSAGE_LENGTH)).ok).toBe(true);
    expect(sanitizeApplicationMessage('a'.repeat(MAX_APPLICATION_MESSAGE_LENGTH + 1)).ok).toBe(false);
  });
});

describe("sanitizeFollowers", () => {
  it("es opcional: vacío, null y undefined dan null", () => {
    for (const entrada of ['', null, undefined]) {
      const r = sanitizeFollowers(entrada);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeNull();
    }
  });

  it("acepta el número escrito con puntos, como lo copia la gente", () => {
    const r = sanitizeFollowers('12.400');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(12400);
  });

  it("NO rechaza a quien declara menos del mínimo: eso lo decide el dueño al revisar", () => {
    const r = sanitizeFollowers(50);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(50);
  });

  it("rechaza texto y cifras absurdas", () => {
    expect(sanitizeFollowers('muchos').ok).toBe(false);
    expect(sanitizeFollowers(999_999_999).ok).toBe(false);
  });
});

describe("links de contacto", () => {
  it("arma el link de WhatsApp solo con dígitos", () => {
    expect(whatsappLinkFor('+56912345678')).toBe('https://wa.me/56912345678');
  });

  it("arma el link de Instagram desde el handle", () => {
    expect(instagramLinkFor('sofia')).toBe('https://instagram.com/sofia');
  });
});

describe("contenido de la página", () => {
  // Si alguien vacía estos arreglos, la página quedaría muda sin que nada
  // falle: la persona no vería requisitos ni tareas y postularía a ciegas.
  it("hay requisitos y tareas cargados", () => {
    expect(AMBASSADOR_REQUIREMENTS.length).toBeGreaterThan(0);
    expect(AMBASSADOR_TASKS.length).toBeGreaterThan(0);
    for (const t of [...AMBASSADOR_REQUIREMENTS, ...AMBASSADOR_TASKS]) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("el mínimo de seguidores aparece en los requisitos, para que no se desincronicen", () => {
    const esperado = MIN_INSTAGRAM_FOLLOWERS.toLocaleString('es-CL');
    expect(AMBASSADOR_REQUIREMENTS.some((r) => r.includes(esperado))).toBe(true);
  });

  it("asistir a la fiesta NO es una tarea obligatoria (decisión del dueño)", () => {
    expect(AMBASSADOR_TASKS.some((t) => /asistir/i.test(t))).toBe(false);
  });
});
