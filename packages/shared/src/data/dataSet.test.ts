import { describe, expect, it } from 'vitest';
import { parseDataSet, type DataResult } from './dataSet';
import { realRawData } from './testUtils';

/* eslint-disable @typescript-eslint/no-explicit-any -- las pruebas rompen los JSON a propósito */

function errorsOf(result: DataResult) {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

function expectError(result: DataResult, file: string, fragment: string | RegExp) {
  const errors = errorsOf(result);
  const match = errors.find(
    (e) =>
      e.file === file &&
      (typeof fragment === 'string'
        ? `${e.path} ${e.message}`.includes(fragment)
        : fragment.test(`${e.path} ${e.message}`)),
  );
  expect(
    match,
    `se esperaba un error en ${file} con "${String(fragment)}"; hubo:\n${JSON.stringify(errors, null, 2)}`,
  ).toBeDefined();
}

describe('datos reales de /data/mvp', () => {
  it('pasan la validación de esquemas y referencias cruzadas', () => {
    const result = parseDataSet(realRawData());
    if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
    expect(result.data.creatures.map((c) => c.id)).toEqual([
      'imp',
      'goblin',
      'troll',
      'warlock',
      'bileDemon',
      'executioner',
      'torturer',
    ]);
    expect(result.data.spells).toHaveLength(5);
    expect(result.data.traps.map((t) => t.id)).toEqual(['spikeTrap', 'blastTrap']);
  });

  it('contienen las cifras clave del plan (sección 6)', () => {
    const result = parseDataSet(realRawData());
    if (!result.ok) throw new Error('datos inválidos');
    const { global, creatures, rooms, mood, progression } = result.data;
    expect(global.tickRate).toBe(10);
    expect(global.startingGold).toBe(5000);
    expect(global.heart.hp).toBe(8000);
    expect(creatures.find((c) => c.id === 'bileDemon')?.base.lairTiles).toBe(2);
    expect(rooms.find((r) => r.id === 'treasury')?.goldCapacityPerTile).toBe(1000);
    expect(mood.needs.wage.weight + mood.needs.lair.weight + mood.needs.food.weight).toBe(50);
    expect(progression.xpToNextLevel).toEqual([100, 250, 450, 700]);
  });
});

describe('errores de esquema', () => {
  it('rechaza una vida negativa e indica archivo y ruta', () => {
    const raw = realRawData();
    (raw.creatures as any)[1].base.hp = -5;
    expectError(parseDataSet(raw), 'creatures.json', '[1].base.hp');
  });

  it('rechaza campos desconocidos (errores de tipeo)', () => {
    const raw = realRawData();
    (raw.global as any).startingGlod = 100;
    expectError(parseDataSet(raw), 'global.json', /startingGlod|Unrecognized/i);
  });

  it('rechaza un efecto de hechizo inexistente', () => {
    const raw = realRawData();
    (raw.spells as any)[0].effect = { type: 'meteor' };
    expectError(parseDataSet(raw), 'spells.json', '[0].effect');
  });

  it('rechaza un campo obligatorio ausente', () => {
    const raw = realRawData();
    delete (raw.economy as any).paydayIntervalSeconds;
    expectError(parseDataSet(raw), 'economy.json', 'paydayIntervalSeconds');
  });

  it('nombra el archivo del mapa cuando el mapa es inválido', () => {
    const raw = realRawData();
    (raw.map as any).width = 'grande';
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', 'width');
  });
});

describe('errores de referencias cruzadas', () => {
  it('detecta una criatura que pide una sala inexistente', () => {
    const raw = realRawData();
    (raw.creatures as any)[1].attraction.requires[0].room = 'casino';
    expectError(parseDataSet(raw), 'creatures.json', 'la sala "casino" no existe');
  });

  it('detecta un enemigo natural inexistente', () => {
    const raw = realRawData();
    (raw.creatures as any)[2].enemies = ['dragon'];
    expectError(parseDataSet(raw), 'creatures.json', 'la criatura "dragon" no existe');
  });

  it('detecta un hueco entre bandas de ánimo', () => {
    const raw = realRawData();
    (raw.mood as any).bands[1].min = 70; // "Contento" pasa a 70..89, queda hueco 65..69
    expectError(parseDataSet(raw), 'mood.json', 'hueco o solape');
  });

  it('detecta umbrales de XP que no crecen', () => {
    const raw = realRawData();
    (raw.progression as any).xpToNextLevel = [100, 90, 450, 700];
    expectError(parseDataSet(raw), 'progression.json', 'crecientes');
  });

  it('detecta umbrales de XP que no cuadran con el nivel máximo', () => {
    const raw = realRawData();
    (raw.progression as any).maxLevel = 6;
    expectError(parseDataSet(raw), 'progression.json', 'maxLevel − 1');
  });

  it('detecta una sala obligatoria ausente', () => {
    const raw = realRawData();
    raw.rooms = (raw.rooms as any[]).filter((r) => r.id !== 'hatchery');
    expectError(parseDataSet(raw), 'rooms.json', 'falta la sala obligatoria "hatchery"');
  });

  it('detecta un parámetro de sala ausente', () => {
    const raw = realRawData();
    const training = (raw.rooms as any[]).find((r) => r.id === 'trainingRoom');
    delete training.trainingMaxLevel;
    expectError(parseDataSet(raw), 'rooms.json', 'trainingMaxLevel');
  });

  it('detecta que el Imp no puede llegar por el Portal', () => {
    const raw = realRawData();
    (raw.creatures as any)[0].attraction = { requires: [{ room: 'lair' }], attractWeight: 1 };
    expectError(parseDataSet(raw), 'creatures.json', 'Imp');
  });

  it('detecta una fila del mapa con longitud incorrecta', () => {
    const raw = realRawData();
    (raw.map as any).rows[10] = '###';
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', 'rows[10]');
  });

  it('detecta un carácter de mapa sin terreno', () => {
    const raw = realRawData();
    const rows = (raw.map as any).rows as string[];
    rows[20] = `${rows[20]!.slice(0, 30)}X${rows[20]!.slice(31)}`;
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', '"X"');
  });

  it('detecta una Tesorería inicial demasiado pequeña para el oro inicial', () => {
    const raw = realRawData();
    (raw.global as any).startingGold = 50_000;
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', 'no alcanza para el oro inicial');
  });

  it('detecta un Imp inicial fuera de suelo transitable', () => {
    const raw = realRawData();
    (raw.map as any).bases[0].imps[0] = { x: 0, y: 0 };
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', 'no es transitable');
  });

  it('detecta salas iniciales solapadas', () => {
    const raw = realRawData();
    (raw.map as any).bases[0].rooms[0].rect = { x: 5, y: 5, w: 3, h: 3 };
    expectError(parseDataSet(raw), 'maps/map-4p-01.json', 'se solapan');
  });

  it('detecta esquinas de jugador inexistentes', () => {
    const raw = realRawData();
    (raw.global as any).players.cornersByPlayerCount['2'] = [0, 7];
    expectError(parseDataSet(raw), 'global.json', 'la esquina 7 no existe');
  });

  it('rechaza un radio de reclamo automático negativo o con decimales', () => {
    const raw = realRawData();
    (raw.global as any).work.autoClaimRadius = -3;
    expectError(parseDataSet(raw), 'global.json', 'work.autoClaimRadius');
    const raw2 = realRawData();
    (raw2.global as any).work.autoClaimRadius = 2.5;
    expectError(parseDataSet(raw2), 'global.json', 'work.autoClaimRadius');
  });

  it('detecta una esquina inexistente en el modo de un solo jugador', () => {
    const raw = realRawData();
    (raw.global as any).players.cornersByPlayerCount['1'] = [9];
    expectError(parseDataSet(raw), 'global.json', 'la esquina 9 no existe');
  });

  it('rechaza una pausa de paseo con mínimo mayor que máximo', () => {
    const raw = realRawData();
    (raw.economy as any).wanderPauseSeconds = { min: 6, max: 2 };
    expectError(parseDataSet(raw), 'economy.json', 'wanderPauseSeconds');
  });

  it('rechaza una pausa de paseo negativa', () => {
    const raw = realRawData();
    (raw.economy as any).wanderPauseSeconds = { min: -1, max: 2 };
    expectError(parseDataSet(raw), 'economy.json', 'wanderPauseSeconds.min');
  });

  it('exige blocksSight en cada terreno', () => {
    const raw = realRawData();
    delete (raw.terrain as any)[1].blocksSight;
    expectError(parseDataSet(raw), 'terrain.json', '[1].blocksSight');
  });

  it('rechaza una recuperación de vida que no supere la fracción de huida', () => {
    const raw = realRawData();
    (raw.global as any).combat.recoverHpFraction = 0.2;
    expectError(parseDataSet(raw), 'global.json', 'recoverHpFraction');
  });

  it('rechaza un alcance a estructuras que no sea positivo', () => {
    const raw = realRawData();
    (raw.global as any).combat.structureReach = 0;
    expectError(parseDataSet(raw), 'global.json', 'combat.structureReach');
  });

  it('detecta una trampa que exige una sala inexistente o no construible', () => {
    const raw = realRawData();
    (raw.traps as any)[0].requiresRoom = 'inventada';
    expectError(parseDataSet(raw), 'traps.json', '[0].requiresRoom');
    const raw2 = realRawData();
    (raw2.traps as any)[0].requiresRoom = 'heart';
    expectError(parseDataSet(raw2), 'traps.json', 'no se puede construir');
  });

  it('detecta ids de trampa repetidos, un radio de disparo diminuto y un daño no positivo', () => {
    const raw = realRawData();
    (raw.traps as any)[1].id = (raw.traps as any)[0].id;
    expectError(parseDataSet(raw), 'traps.json', 'id repetido');
    const raw2 = realRawData();
    (raw2.traps as any)[0].triggerRadius = 0.2;
    expectError(parseDataSet(raw2), 'traps.json', '[0].triggerRadius');
    const raw3 = realRawData();
    (raw3.traps as any)[0].effect.damage = 0;
    expectError(parseDataSet(raw3), 'traps.json', '[0].effect.damage');
  });

  it('exige la Cámara de tortura entre las salas obligatorias y que las criaturas que atrae existan', () => {
    const raw = realRawData();
    raw.rooms = (raw.rooms as any[]).filter((r) => r.id !== 'tortureChamber');
    expectError(parseDataSet(raw), 'rooms.json', 'falta la sala obligatoria "tortureChamber"');
  });
});
