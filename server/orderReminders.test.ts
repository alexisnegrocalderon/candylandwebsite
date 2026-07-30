import { describe, it, expect } from 'vitest';
import { ReminderCopySchema } from './orderReminders';
import { WeeklyMaterialContentSchema } from './ambassadorProgram';

/* Estos schemas son la única barrera entre lo que devuelve la IA y lo que
 * termina en un correo que le llega a un cliente (o en el material que reciben
 * todos los embajadores). Si dejaran pasar basura, se enviaría igual: por eso
 * lo que se prueba acá es sobre todo lo que tienen que RECHAZAR. */

describe('ReminderCopySchema', () => {
  it('acepta una respuesta válida de 1 a 3 párrafos', () => {
    const ok = ReminderCopySchema.safeParse({
      paragraphs: [
        'Vimos que empezaste a sacar tu acceso y quedó a medio camino.',
        'Retomar toma menos de un minuto.',
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('rechaza un arreglo vacío: un correo sin cuerpo no sirve', () => {
    expect(ReminderCopySchema.safeParse({ paragraphs: [] }).success).toBe(false);
  });

  it('rechaza más de 3 párrafos', () => {
    const cuatro = Array(4).fill('Un párrafo de largo suficiente para pasar el mínimo.');
    expect(ReminderCopySchema.safeParse({ paragraphs: cuatro }).success).toBe(false);
  });

  it('rechaza un párrafo demasiado corto (la IA respondió con relleno)', () => {
    expect(ReminderCopySchema.safeParse({ paragraphs: ['ok'] }).success).toBe(false);
  });

  it('rechaza un párrafo que excede el largo máximo', () => {
    expect(ReminderCopySchema.safeParse({ paragraphs: ['a'.repeat(401)] }).success).toBe(false);
  });

  it('rechaza que falte el campo entero', () => {
    expect(ReminderCopySchema.safeParse({}).success).toBe(false);
  });
});

describe('WeeklyMaterialContentSchema', () => {
  const valido = {
    title: 'Semana 2 — cuenta regresiva',
    storiesText: 'Sube una historia mostrando tu outfit y pega el sticker de cuenta regresiva.',
    reelText: 'Parte con un primer plano del outfit y corta al espejo con la música arriba.',
    postText: 'Este sábado nos vemos. Ya tengo mi acceso, el tuyo va con mi código.',
    countdownText: 'Faltan 5 días 🔥',
  };

  it('acepta una respuesta completa', () => {
    expect(WeeklyMaterialContentSchema.safeParse(valido).success).toBe(true);
  });

  it('rechaza si falta cualquiera de los 5 campos', () => {
    for (const campo of Object.keys(valido)) {
      const sinCampo = { ...valido } as Record<string, unknown>;
      delete sinCampo[campo];
      expect(WeeklyMaterialContentSchema.safeParse(sinCampo).success, `faltando ${campo}`).toBe(false);
    }
  });

  it('rechaza un campo vacío: el correo saldría con un hueco', () => {
    expect(WeeklyMaterialContentSchema.safeParse({ ...valido, storiesText: '' }).success).toBe(false);
  });

  it('rechaza un texto que se pasa del largo máximo', () => {
    expect(WeeklyMaterialContentSchema.safeParse({ ...valido, postText: 'a'.repeat(801) }).success).toBe(false);
  });
});
