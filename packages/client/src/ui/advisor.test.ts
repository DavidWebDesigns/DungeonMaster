import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loadGameData';
import { Sandbox } from '../sandbox/sandbox';
import { adviceFor } from './advisor';

const data = loadGameData();
const sb = new Sandbox(data, 1);
const typeOf = (id: number) => (id === 1 ? 'goblin' : id === 2 ? 'troll' : undefined);
const advise = (events: Parameters<typeof adviceFor>[0]) =>
  adviceFor(events, sb.state, data, 1, typeOf);

describe('el consejero', () => {
  it('da la bienvenida a una criatura nueva con su nombre', () => {
    const [a] = advise([
      { type: 'creatureArrived', playerId: 1, creatureId: 1, creature: 'goblin' },
    ]);
    expect(a!.text).toBe('Ha llegado un Goblin a tu mazmorra.');
  });

  it('explica qué falta cuando el Portal no atrae a nadie', () => {
    const lair = advise([{ type: 'portalIdle', playerId: 1, reason: 'noLair' }])[0]!;
    expect(lair.text).toBe('Construye una Guarida para atraer criaturas.');
    expect(lair.cooldownTicks).toBeGreaterThan(0);
    expect(advise([{ type: 'portalIdle', playerId: 1, reason: 'noRoom' }])[0]!.text).toContain(
      'Sala de entrenamiento',
    );
    expect(advise([{ type: 'portalIdle', playerId: 1, reason: 'full' }])[0]!.text).toContain(
      'no admite más',
    );
    expect(advise([{ type: 'portalIdle', playerId: 1, reason: 'noSlots' }])[0]!.text).toContain(
      'cada sala nueva da un cupo',
    );
  });

  it('avisa del día de pago y del impago con el nombre de la criatura', () => {
    expect(advise([{ type: 'payday', tick: 1200 }])[0]!.text).toContain('Día de pago');
    expect(
      advise([{ type: 'paid', playerId: 1, creatureId: 2, amount: 0, ok: false }])[0]!.text,
    ).toBe('Sin oro para pagar a un Troll: se enfadará.');
    expect(advise([{ type: 'paid', playerId: 1, creatureId: 2, amount: 150, ok: true }])).toEqual(
      [],
    );
  });

  it('avisa de que una criatura se pone descontenta, enfadada o furiosa', () => {
    const band = (b: string) => advise([{ type: 'moodBand', playerId: 1, creatureId: 1, band: b }]);
    expect(band('unhappy')[0]!.text).toBe('Un Goblin está descontento.');
    expect(band('angry')[0]!.text).toContain('enfadado');
    expect(band('furious')[0]!.text).toContain('furioso');
    expect(band('happy')).toEqual([]);
  });

  it('avisa de subidas de nivel, abandonos y muertes', () => {
    expect(advise([{ type: 'levelUp', playerId: 1, creatureId: 1, level: 3 }])[0]!.text).toBe(
      'Tu Goblin ha subido al nivel 3.',
    );
    expect(advise([{ type: 'creatureLeft', playerId: 1, creatureId: 2 }])[0]!.text).toBe(
      'Un Troll ha abandonado tu mazmorra.',
    );
    expect(
      advise([{ type: 'creatureDied', playerId: 1, creatureId: 2, cause: 'starvation' }])[0]!.text,
    ).toContain('muerto de hambre');
  });

  it('ignora lo que le pasa a otro jugador y los eventos sin interés', () => {
    expect(advise([{ type: 'levelUp', playerId: 2, creatureId: 1, level: 3 }])).toEqual([]);
    expect(
      advise([
        { type: 'tileChanged', tile: 5 },
        { type: 'ate', playerId: 1, creatureId: 1 },
      ]),
    ).toEqual([]);
  });

  it('una criatura que ya no existe se llama "criatura"', () => {
    expect(advise([{ type: 'creatureLeft', playerId: 1, creatureId: 99 }])[0]!.text).toBe(
      'Una criatura ha abandonado tu mazmorra.',
    );
  });

  it('avisa de que una trampa propia quedó lista y de que atrapó a alguien, con su nombre', () => {
    const ready = advise([
      { type: 'trapBuilt', playerId: 1, trapId: 3, trap: 'spikeTrap', tile: 5 },
    ]);
    expect(ready[0]!.text).toBe('Trampa de pinchos lista y armada.');
    const hit = advise([{ type: 'trapTriggered', playerId: 1, trap: 'fireTrap', x: 1, y: 1 }]);
    expect(hit[0]!.text).toBe('¡Tu trampa de fuego ha atrapado a un intruso!');
    expect(advise([{ type: 'trapTriggered', playerId: 2, trap: 'fireTrap', x: 1, y: 1 }])).toEqual(
      [],
    );
  });

  it('da la bienvenida al Verdugo y a la Torturadora con su nombre', () => {
    expect(
      advise([{ type: 'creatureArrived', playerId: 1, creatureId: 9, creature: 'executioner' }])[0]!
        .text,
    ).toBe('Ha llegado un Verdugo a tu mazmorra.');
    expect(
      advise([{ type: 'creatureArrived', playerId: 1, creatureId: 9, creature: 'torturer' }])[0]!
        .text,
    ).toBe('Ha llegado una Torturadora a tu mazmorra.');
  });

  it('concuerda el género en los avisos de ánimo y de pago (Torturadora = femenino)', () => {
    const tor = (id: number) => (id === 7 ? 'torturer' : id === 1 ? 'goblin' : undefined);
    const f = (events: Parameters<typeof adviceFor>[0]) =>
      adviceFor(events, sb.state, data, 1, tor);
    expect(f([{ type: 'moodBand', playerId: 1, creatureId: 7, band: 'unhappy' }])[0]!.text).toBe(
      'Una Torturadora está descontenta.',
    );
    expect(f([{ type: 'moodBand', playerId: 1, creatureId: 7, band: 'furious' }])[0]!.text).toBe(
      '¡Una Torturadora está furiosa! Se marchará si no la calmas.',
    );
    expect(f([{ type: 'moodBand', playerId: 1, creatureId: 1, band: 'angry' }])[0]!.text).toBe(
      '¡Un Goblin está enfadado! Se acerca al Portal.',
    );
    expect(f([{ type: 'paid', playerId: 1, creatureId: 7, amount: 0, ok: false }])[0]!.text).toBe(
      'Sin oro para pagar a una Torturadora: se enfadará.',
    );
    expect(f([{ type: 'creatureLeft', playerId: 1, creatureId: 7 }])[0]!.text).toBe(
      'Una Torturadora ha abandonado tu mazmorra.',
    );
  });
});
