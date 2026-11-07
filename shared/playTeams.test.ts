import { describe, expect, it } from 'vitest';
import { cleanPoints, cleanStationCode, describeTeams, leader, otherTeam, peopleForAcceso, scoreShare } from './playTeams';
import { firstTeamFor, teamsForTicket } from '../server/playTeams';

const SECRET = 'clave-de-prueba';

describe('equipos de PLAYMORE', () => {
  it('cuenta las personas de cada acceso', () => {
    expect(peopleForAcceso('soltera')).toBe(1);
    expect(peopleForAcceso('soltero')).toBe(1);
    expect(peopleForAcceso('duo')).toBe(2);
    expect(peopleForAcceso('duo_mujeres')).toBe(2);
    expect(peopleForAcceso('trio')).toBe(3);
    expect(peopleForAcceso('duo', 5)).toBe(5);
    expect(peopleForAcceso(null)).toBe(1);
  });

  it('el color de un ticket es siempre el mismo y no depende de mayúsculas ni espacios', () => {
    const a = firstTeamFor('MP-ABC123', SECRET);
    expect(firstTeamFor('mp-abc123 ', SECRET)).toBe(a);
    expect(firstTeamFor('MP-ABC123', SECRET)).toBe(a);
  });

  it('con otra clave el color cambia: nadie lo puede calcular sin la clave del servidor', () => {
    const codes = Array.from({ length: 200 }, (_, i) => `MP-${i.toString(36).toUpperCase().padStart(6, 'X')}`);
    const diff = codes.filter((c) => firstTeamFor(c, 'una') !== firstTeamFor(c, 'otra')).length;
    expect(diff).toBeGreaterThan(60);
    expect(diff).toBeLessThan(140);
  });

  it('una pareja queda repartida: un magenta y un azul, sea cual sea el ticket', () => {
    for (let i = 0; i < 300; i++) {
      const teams = teamsForTicket(`MP-DUO${i}`, 2, SECRET);
      expect(new Set(teams).size).toBe(2);
    }
  });

  it('un trío son dos de un color y uno del otro; uno solo, un color', () => {
    const trio = teamsForTicket('MP-TRIO1', 3, SECRET);
    expect(trio).toHaveLength(3);
    expect(trio[0]).toBe(trio[2]);
    expect(trio[1]).toBe(otherTeam(trio[0]));
    expect(teamsForTicket('MP-SOLO1', 1, SECRET)).toHaveLength(1);
  });

  it('el reparto de 800 personas sale parejo (dentro de ±6 %)', () => {
    let magenta = 0;
    let total = 0;
    // 150 tickets individuales + 250 Dúo (2 personas) + 50 tríos = 800 personas.
    const tickets: number[] = [...Array(150).fill(1), ...Array(250).fill(2), ...Array(50).fill(3)];
    tickets.forEach((people, i) => {
      for (const t of teamsForTicket(`MP-${i}-${(i * 7919).toString(36)}`, people, SECRET)) {
        total++;
        if (t === 'magenta') magenta++;
      }
    });
    expect(total).toBe(800);
    expect(Math.abs(magenta / total - 0.5)).toBeLessThan(0.06);
  });

  it('describe el color para el staff', () => {
    expect(describeTeams(['magenta'])).toBe('Magenta');
    expect(describeTeams(['azul', 'magenta'])).toBe('Magenta + Azul');
    expect(describeTeams(['azul', 'magenta', 'azul'])).toBe('Magenta + 2 Azul');
  });
});

describe('marcador', () => {
  it('quién va ganando y el % de la barra', () => {
    expect(leader({ magenta: 10, azul: 10 })).toBe('empate');
    expect(leader({ magenta: 30, azul: 10 })).toBe('magenta');
    expect(leader({ magenta: 5, azul: 25 })).toBe('azul');
    expect(scoreShare({ magenta: 0, azul: 0 })).toEqual({ magenta: 50, azul: 50 });
    expect(scoreShare({ magenta: 75, azul: 25 })).toEqual({ magenta: 75, azul: 25 });
    expect(scoreShare({ magenta: 1, azul: 2 })).toEqual({ magenta: 33, azul: 67 });
  });
});

describe('estaciones', () => {
  it('limpia el código y los puntos', () => {
    expect(cleanStationCode(' dados-1 ')).toBe('DADOS1');
    expect(cleanStationCode('ab')).toBe('');
    expect(cleanStationCode(null)).toBe('');
    expect(cleanPoints(5000)).toBe(100);
    expect(cleanPoints(0)).toBe(1);
    expect(cleanPoints('abc')).toBe(10);
    expect(cleanPoints(25)).toBe(25);
  });
});
