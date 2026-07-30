import { describe, it, expect } from 'vitest';
import { formatChileDate, formatChileTime, formatChileShortDate } from '../shared/chileDate';
import { EVENTO } from '../client/src/config/candyland';

/* El caso real que rompió: Candyland es el SÁBADO 8 de agosto a las 21:00 en
 * Chile, que como instante es el 9 de agosto a las 01:00 UTC. El servidor
 * corre en UTC, así que formatear sin zona horaria mostraba "domingo, 9 de
 * agosto" en los correos.
 *
 * Estos tests corren en UTC igual que Vercel, así que fallan si alguien vuelve
 * a formatear sin `timeZone`. */

const SABADO_8_AGOSTO_21H = new Date('2026-08-08T21:00:00-04:00');

describe('formatChileDate', () => {
  it('el evento cae sábado 8, no domingo 9 (el bug que se vio en producción)', () => {
    const texto = formatChileDate(SABADO_8_AGOSTO_21H);
    expect(texto).toContain('sábado');
    expect(texto).toContain('8 de agosto');
    expect(texto).not.toContain('domingo');
    expect(texto).not.toContain('9 de agosto');
  });

  it('sin la zona horaria daría domingo 9 — deja constancia de por qué hace falta', () => {
    const sinZona = SABADO_8_AGOSTO_21H.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    // Confirma que el entorno de test corre en UTC como Vercel; si esto deja
    // de cumplirse, el test de arriba ya no estaría probando nada.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    expect(sinZona).toContain('domingo');
  });

  it('acepta un string ISO además de un Date', () => {
    expect(formatChileDate('2026-08-09T01:00:00.000Z')).toContain('8 de agosto');
  });

  it('incluye el año solo si se pide', () => {
    expect(formatChileDate(SABADO_8_AGOSTO_21H, { withYear: true })).toContain('2026');
    expect(formatChileDate(SABADO_8_AGOSTO_21H)).not.toContain('2026');
  });
});

describe('formatChileTime', () => {
  it('muestra 21:00 y no 01:00', () => {
    expect(formatChileTime(SABADO_8_AGOSTO_21H)).toBe('21:00');
  });
});

describe('formatChileShortDate', () => {
  it('no corre el día', () => {
    expect(formatChileShortDate(SABADO_8_AGOSTO_21H)).toContain('08');
  });
});

describe('la configuración del evento', () => {
  it('EVENTO.eventDate y EVENTO.fechaTexto dicen lo mismo', () => {
    const formateado = formatChileDate(EVENTO.eventDate);
    // fechaTexto es "Sábado 08 de Agosto"; se comparan en minúsculas y sin el
    // cero a la izquierda, que es solo cosmético.
    expect(formateado.toLowerCase()).toContain('sábado');
    expect(formateado.toLowerCase()).toContain('agosto');
    expect(EVENTO.fechaTexto.toLowerCase()).toContain('sábado');
    expect(EVENTO.fechaTexto.toLowerCase()).toContain('agosto');
    expect(formatChileDate(EVENTO.eventDate).replace(/\D/g, ''))
      .toBe(EVENTO.fechaTexto.replace(/\D/g, '').replace(/^0/, ''));
  });

  it('la hora del evento coincide con horarioTexto', () => {
    expect(EVENTO.horarioTexto).toContain(formatChileTime(EVENTO.eventDate));
  });
});
