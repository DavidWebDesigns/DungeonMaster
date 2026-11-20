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
      'salamander',
      'skeleton',
      'witch',
      'vampire',
      'darkKnight',
      'fallenAngel',
    ]);
    expect(result.data.spells).toHaveLength(5);
    expect(result.data.traps.map((t) => t.id)).toEqual([
      'spikeTrap',
      'boulderTrap',
      'crushingWalls',
      'frostTrap',
      'fireTrap',
      'lightningTrap',
    ]);
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

  it('rechaza una veta infinita que también lleve oro finito o que no se pueda excavar', () => {
    const raw = realRawData();
    const t = (raw.terrain as any).find((x: any) => x.id === 'diamondVein');
    t.goldPerTile = 600;
    expectError(parseDataSet(raw), 'terrain.json', 'es infinita');
    const raw2 = realRawData();
    const t2 = (raw2.terrain as any).find((x: any) => x.id === 'diamondVein');
    t2.diggable = false;
    delete t2.digSeconds;
    delete t2.becomesOnDig;
    expectError(parseDataSet(raw2), 'terrain.json', 'tiene que ser excavable');
  });

  it('rechaza requisitos entre salas inexistentes, no construibles, a sí mismas o en ciclo', () => {
    const rooms = (raw: ReturnType<typeof realRawData>) => raw.rooms as any[];
    const raw = realRawData();
    rooms(raw).find((r) => r.id === 'library').requiresRooms = ['inventada'];
    expectError(parseDataSet(raw), 'rooms.json', 'la sala "inventada" no existe');
    const raw2 = realRawData();
    rooms(raw2).find((r) => r.id === 'library').requiresRooms = ['heart'];
    expectError(parseDataSet(raw2), 'rooms.json', 'no se puede construir');
    const raw3 = realRawData();
    rooms(raw3).find((r) => r.id === 'library').requiresRooms = ['library'];
    expectError(parseDataSet(raw3), 'rooms.json', 'no puede pedirse a sí misma');
    const raw4 = realRawData();
    rooms(raw4).find((r) => r.id === 'library').requiresRooms = ['trainingRoom'];
    rooms(raw4).find((r) => r.id === 'trainingRoom').requiresRooms = ['library'];
    expectError(parseDataSet(raw4), 'rooms.json', 'forman un ciclo');
    // Una cadena sin ciclo es válida.
    const ok = realRawData();
    rooms(ok).find((r) => r.id === 'library').requiresRooms = ['trainingRoom'];
    expect(parseDataSet(ok).ok).toBe(true);
  });

  it('rechaza cupos que apuntan a salas o criaturas inexistentes, a sí mismas o en ciclo', () => {
    const creature = (raw: ReturnType<typeof realRawData>, id: string) =>
      (raw.creatures as any[]).find((c) => c.id === id);
    const raw = realRawData();
    creature(raw, 'goblin').attraction.slots = { fromRoom: 'inventada' };
    expectError(parseDataSet(raw), 'creatures.json', 'la sala "inventada" no existe');
    const raw2 = realRawData();
    creature(raw2, 'goblin').attraction.slots = { fromRoom: 'library' };
    expectError(
      parseDataSet(raw2),
      'creatures.json',
      'tiene que estar también en attraction.requires',
    );
    const raw3 = realRawData();
    creature(raw3, 'troll').attraction.slots = { fromCreature: 'inventada', unlockEvery: 3 };
    expectError(parseDataSet(raw3), 'creatures.json', 'la criatura "inventada" no existe');
    const raw4 = realRawData();
    creature(raw4, 'troll').attraction.slots = { fromCreature: 'troll', unlockEvery: 3 };
    expectError(parseDataSet(raw4), 'creatures.json', 'de sí misma');
    const raw5 = realRawData();
    creature(raw5, 'troll').attraction.slots = { fromCreature: 'goblin', unlockEvery: 3 };
    creature(raw5, 'goblin').attraction.slots = { fromCreature: 'troll', unlockEvery: 3 };
    expectError(parseDataSet(raw5), 'creatures.json', 'forman un ciclo');
    const raw6 = realRawData();
    creature(raw6, 'troll').attraction.slots = { fromCreature: 'goblin', unlockEvery: 0 };
    expectError(parseDataSet(raw6), 'creatures.json', 'unlockEvery');
    const raw7 = realRawData();
    creature(raw7, 'goblin').attraction.maxPerPlayer = 0;
    expectError(parseDataSet(raw7), 'creatures.json', 'maxPerPlayer');
    // Cupos bien formados son válidos.
    const ok = realRawData();
    creature(ok, 'goblin').attraction.slots = { fromRoom: 'lair' };
    creature(ok, 'troll').attraction.slots = { fromCreature: 'goblin', unlockEvery: 3 };
    creature(ok, 'goblin').attraction.maxPerPlayer = 5;
    expect(parseDataSet(ok).ok).toBe(true);
  });

  it('una criatura sin cama debe no dormir y pedir una sala que no exista al empezar', () => {
    const goblin = (raw: ReturnType<typeof realRawData>) =>
      (raw.creatures as any[]).find((c) => c.id === 'goblin');
    const raw = realRawData();
    goblin(raw).base.lairTiles = 0;
    expectError(parseDataSet(raw), 'creatures.json', 'duerme: necesita cama');
    // Sin dormir, pero pidiendo solo la Tesorería (ya está en el mapa): llegaría en el minuto 0.
    const raw2 = realRawData();
    goblin(raw2).base.lairTiles = 0;
    goblin(raw2).needs.sleeps = false;
    goblin(raw2).attraction.requires = [{ room: 'treasury' }];
    expectError(parseDataSet(raw2), 'creatures.json', 'llegaría en el minuto 0');
    // Sin dormir y pidiendo una sala que hay que construir: válido.
    const ok = realRawData();
    goblin(ok).base.lairTiles = 0;
    goblin(ok).needs.sleeps = false;
    expect(parseDataSet(ok).ok).toBe(true);
  });

  it('rechaza habilidades mal definidas o que no cuadran con su criatura', () => {
    const ab = (raw: ReturnType<typeof realRawData>, id: string) =>
      (raw.abilities as any[]).find((a) => a.id === id);
    const cr = (raw: ReturnType<typeof realRawData>, id: string) =>
      (raw.creatures as any[]).find((c) => c.id === id);
    const raw = realRawData();
    ab(raw, 'torturerBind').creature = 'inventada';
    expectError(parseDataSet(raw), 'abilities.json', 'la criatura "inventada" no existe');
    const raw2 = realRawData();
    cr(raw2, 'torturer').abilities = ['torturerEnjoysPain'];
    expectError(parseDataSet(raw2), 'abilities.json', 'no lista la habilidad "torturerBind"');
    const raw3 = realRawData();
    cr(raw3, 'torturer').abilities.push('inventada');
    expectError(parseDataSet(raw3), 'creatures.json', 'la habilidad "inventada" no existe');
    const raw4 = realRawData();
    cr(raw4, 'goblin').abilities = ['torturerBind'];
    expectError(parseDataSet(raw4), 'creatures.json', 'pertenece a "torturer"');
    const raw5 = realRawData();
    ab(raw5, 'torturerBind').unlockLevel = 9;
    expectError(parseDataSet(raw5), 'abilities.json', 'por encima del tope de nivel');
    const raw6 = realRawData();
    delete ab(raw6, 'torturerBind').cooldownSeconds;
    expectError(parseDataSet(raw6), 'abilities.json', 'necesita cooldownSeconds');
    const raw7 = realRawData();
    ab(raw7, 'torturerBind').kind = 'passive';
    expectError(parseDataSet(raw7), 'abilities.json', 'no corresponde a una habilidad pasiva');
    const raw8 = realRawData();
    delete ab(raw8, 'fallenAngelDive').radiusTiles;
    expectError(parseDataSet(raw8), 'abilities.json', 'necesita radiusTiles');
    const raw9 = realRawData();
    ab(raw9, 'fallenAngelFlight').effect.terrains = ['nada'];
    expectError(parseDataSet(raw9), 'abilities.json', 'el terreno "nada" no existe');
    const raw10 = realRawData();
    ab(raw10, 'vampireUndying').effect.requiresRoom = 'nada';
    expectError(parseDataSet(raw10), 'abilities.json', 'la sala "nada" no existe');
    const raw11 = realRawData();
    ab(raw11, 'torturerBind').effect.status = 'volar';
    expectError(parseDataSet(raw11), 'abilities.json', 'effect.status');
    const raw12 = realRawData();
    (raw12.abilities as any[]).push(structuredClone(ab(raw12, 'torturerBind')));
    expectError(parseDataSet(raw12), 'abilities.json', 'id repetido');
  });

  it('rechaza ajustes de combate que no tengan sentido', () => {
    const raw = realRawData();
    (raw.global as any).combat.retaliationSeconds = 0;
    expectError(parseDataSet(raw), 'global.json', 'combat.retaliationSeconds');
    const raw2 = realRawData();
    (raw2.global as any).combat.standoffFactor = 1.5;
    expectError(parseDataSet(raw2), 'global.json', 'combat.standoffFactor');
    const raw3 = realRawData();
    delete (raw3.global as any).combat.wakeOnAttackSeconds;
    expectError(parseDataSet(raw3), 'global.json', 'combat.wakeOnAttackSeconds');
  });

  it('rechaza límites de red que no sean positivos', () => {
    const raw = realRawData();
    (raw.global as any).connection.maxMessagesPerSecond = 0;
    expectError(parseDataSet(raw), 'global.json', 'connection.maxMessagesPerSecond');
    const raw2 = realRawData();
    delete (raw2.global as any).connection.maxPayloadBytes;
    expectError(parseDataSet(raw2), 'global.json', 'connection.maxPayloadBytes');
    const raw3 = realRawData();
    (raw3.global as any).connection.maxRooms = -1;
    expectError(parseDataSet(raw3), 'global.json', 'connection.maxRooms');
  });

  it('rechaza un pve.json con dificultad por defecto inexistente, repetida o demasiados rivales', () => {
    const raw = realRawData();
    (raw.pve as any).defaultDifficulty = 'imposible';
    expectError(parseDataSet(raw), 'pve.json', 'defaultDifficulty');
    const raw2 = realRawData();
    (raw2.pve as any).difficulties[1].id = (raw2.pve as any).difficulties[0].id;
    expectError(parseDataSet(raw2), 'pve.json', 'dificultad repetida');
    const raw3 = realRawData();
    (raw3.pve as any).defaultRivals = 4;
    expectError(parseDataSet(raw3), 'pve.json', 'defaultRivals');
    const raw4 = realRawData();
    (raw4.pve as any).speeds = [2, 4];
    expectError(parseDataSet(raw4), 'pve.json', 'speeds');
    const raw5 = realRawData();
    (raw5.pve as any).difficulties[0].bot.targetImps = 0;
    expectError(parseDataSet(raw5), 'pve.json', 'difficulties[0].bot.targetImps');
  });

  it('detecta una trampa que exige una sala inexistente o no construible', () => {
    const raw = realRawData();
    (raw.traps as any)[0].requiresRooms = ['inventada'];
    expectError(parseDataSet(raw), 'traps.json', '[0].requiresRooms[0]');
    const raw2 = realRawData();
    (raw2.traps as any)[0].requiresRooms = ['heart'];
    expectError(parseDataSet(raw2), 'traps.json', 'no se puede construir');
  });

  it('exige vida y desgaste a las físicas y usos a las elementales, sin mezclar', () => {
    const trap = (raw: ReturnType<typeof realRawData>, id: string) =>
      (raw.traps as any[]).find((t) => t.id === id);
    const raw = realRawData();
    delete trap(raw, 'spikeTrap').hp;
    expectError(parseDataSet(raw), 'traps.json', 'es física: necesita hp y wearPerTrigger');
    const raw2 = realRawData();
    delete trap(raw2, 'frostTrap').uses;
    expectError(parseDataSet(raw2), 'traps.json', 'es elemental: necesita uses');
    const raw3 = realRawData();
    trap(raw3, 'spikeTrap').uses = 5;
    expectError(parseDataSet(raw3), 'traps.json', 'es física: no lleva uses');
    const raw4 = realRawData();
    trap(raw4, 'fireTrap').hp = 500;
    expectError(parseDataSet(raw4), 'traps.json', 'no se puede atacar');
    const raw5 = realRawData();
    trap(raw5, 'lightningTrap').effect.falloff = 2;
    expectError(parseDataSet(raw5), 'traps.json', 'falloff');
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
