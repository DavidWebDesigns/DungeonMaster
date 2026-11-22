import { describe, expect, it } from 'vitest';
import { parseDataSet, type DataSet } from '@dm/shared';
import { realRawData } from '../../packages/shared/src/data/testUtils';
import { creatureRows, powerFlags, renderReport, timeToKill, type CreatureRow } from './report';

function data(): DataSet {
  const r = parseDataSet(realRawData());
  if (!r.ok) throw new Error('datos inválidos');
  return r.data;
}

const row = (over: Partial<CreatureRow>): CreatureRow => ({
  id: 'x',
  name: 'X',
  tier: 'common',
  hp: 1000,
  damage: 100,
  interval: 1,
  range: 1,
  speed: 2,
  wage: 100,
  dps: 100,
  power: 100000,
  wagePerMinute: 50,
  ...over,
});

describe('informe de balance', () => {
  const rows = creatureRows(data());
  const by = (id: string) => rows.find((r) => r.id === id)!;

  it('el DPS es daño / intervalo y el poder es vida × DPS', () => {
    expect(by('goblin').dps).toBe(60);
    expect(by('troll').dps).toBeCloseTo(75);
    expect(by('warlock').dps).toBeCloseTo(80 / 1.5);
    expect(by('bileDemon').dps).toBeCloseTo(80);
    expect(by('goblin').power).toBe(1500 * 60);
    expect(by('bileDemon').power).toBeCloseTo(4000 * 80);
  });

  it('el sueldo por minuto sale del día de pago (cada 180 s)', () => {
    expect(by('goblin').wagePerMinute).toBeCloseTo(100 / 3);
    expect(by('bileDemon').wagePerMinute).toBeCloseTo(100);
    expect(by('imp').wagePerMinute).toBe(0);
  });

  it('el tiempo para matar cuenta los golpes necesarios (el primero es inmediato)', () => {
    // Goblin (60 de daño, 1 s) contra Troll (2.500 de vida): 42 golpes → 41 s.
    expect(timeToKill(by('goblin'), by('troll'))).toBe(41);
    // Demonio (120, 1,5 s) contra Goblin (1.500): 13 golpes → 18 s.
    expect(timeToKill(by('bileDemon'), by('goblin'))).toBe(18);
    expect(timeToKill(row({ damage: 0 }), row({}))).toBe(Infinity);
  });

  it('marca a una criatura que supera a otra en más del 15 % de poder sin cobrar proporcionalmente más', () => {
    const cheapStrong = row({ id: 'a', power: 200000, wagePerMinute: 60 });
    const weak = row({ id: 'b', power: 100000, wagePerMinute: 50 });
    const flags = powerFlags([cheapStrong, weak]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ stronger: 'a', weaker: 'b' });
  });

  it('no marca si cobra proporcionalmente más, si la diferencia es menor al 15 % ni si son de rango distinto', () => {
    expect(
      powerFlags([
        row({ id: 'a', power: 200000, wagePerMinute: 100 }),
        row({ id: 'b', power: 100000, wagePerMinute: 50 }),
      ]),
    ).toEqual([]);
    expect(
      powerFlags([
        row({ id: 'a', power: 110000, wagePerMinute: 50 }),
        row({ id: 'b', power: 100000, wagePerMinute: 50 }),
      ]),
    ).toEqual([]);
    expect(
      powerFlags([
        row({ id: 'a', tier: 'elite', power: 900000, wagePerMinute: 10 }),
        row({ id: 'b', power: 100000, wagePerMinute: 50 }),
      ]),
    ).toEqual([]);
  });

  it('el informe en Markdown lista cada criatura y la matriz de tiempos', () => {
    const md = renderReport(rows);
    for (const name of ['Goblin', 'Troll', 'Warlock', 'Demonio de bilis', 'Imp'])
      expect(md).toContain(name);
    expect(md).toContain('Segundos para que la fila mate a la columna');
    expect(md).toContain('Regla de poder');
  });
});
