import { describe, expect, it } from 'vitest';
import { barraConteoVentana, barraTareaEstado, type BarraTarea } from './barraConteo';

// Sábado 8 de agosto de 2026: puertas 21:00 y fin 05:00 (Chile UTC-4 en invierno).
const evento = {
  eventDate: new Date('2026-08-09T01:00:00Z'),
  doorsOpen: new Date('2026-08-09T01:00:00Z'),
  eventEnd: new Date('2026-08-09T09:00:00Z'),
};

describe('ventana del conteo de barra', () => {
  it('el inicial abre al comenzar el día del evento y cierra con las puertas', () => {
    expect(barraConteoVentana(evento, new Date('2026-08-08T03:00:00Z')).apertura).toBe('aun_no'); // viernes 23:00
    expect(barraConteoVentana(evento, new Date('2026-08-08T12:00:00Z')).apertura).toBe('abierta'); // sábado 08:00
    expect(barraConteoVentana(evento, new Date('2026-08-09T00:30:00Z')).apertura).toBe('abierta'); // sábado 20:30
    expect(barraConteoVentana(evento, new Date('2026-08-09T01:30:00Z')).apertura).toBe('cerrada'); // con la fiesta andando
  });

  it('el cierre abre cuando termina la fiesta y dura día y medio', () => {
    expect(barraConteoVentana(evento, new Date('2026-08-09T05:00:00Z')).cierre).toBe('aun_no');
    expect(barraConteoVentana(evento, new Date('2026-08-09T09:00:00Z')).cierre).toBe('abierta');
    expect(barraConteoVentana(evento, new Date('2026-08-10T12:00:00Z')).cierre).toBe('abierta');
    expect(barraConteoVentana(evento, new Date('2026-08-11T00:00:00Z')).cierre).toBe('cerrada');
  });

  it('sin hora de término se asume 5 horas después de la hora del evento', () => {
    const sinFin = { eventDate: evento.eventDate };
    expect(barraConteoVentana(sinFin, new Date('2026-08-09T05:59:00Z')).cierre).toBe('aun_no');
    expect(barraConteoVentana(sinFin, new Date('2026-08-09T06:00:00Z')).cierre).toBe('abierta');
  });

  it('sin fecha no hay nada que contar', () => {
    expect(barraConteoVentana({ eventDate: null })).toEqual({ apertura: 'cerrada', cierre: 'cerrada' });
  });
});

describe('estado de una tarea', () => {
  const base: BarraTarea = { kind: 'apertura', label: 'Conteo inicial', ventana: 'abierta', hecho: null };
  it('lo hecho gana sobre la ventana', () => {
    expect(barraTareaEstado({ ...base, ventana: 'cerrada', hecho: { por: 'Ana', a: '2026-08-08T20:00:00Z' } })).toBe('listo');
  });
  it('sin hacer: pendiente dentro de la ventana, antes o después no', () => {
    expect(barraTareaEstado(base)).toBe('pendiente');
    expect(barraTareaEstado({ ...base, ventana: 'aun_no' })).toBe('aun_no');
    expect(barraTareaEstado({ ...base, ventana: 'cerrada' })).toBe('vencida');
  });
});
