import { describe, expect, it } from 'vitest';
import { applyCommand, newCreature, rulesOf, step, tileIndex, type SimEvent } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { deriveEffects, takeSnapshot, type Effect } from './effects';
import { ParticleSim, PARTICLES } from './particleSim';
import { MIN_REPEAT_SECONDS, SOUND_RECIPES } from './sounds';

const data = loadGameData();

/** Juega `ticks` ticks y junta los efectos de cada uno, como hace el bucle del juego. */
function play(sb: Sandbox, ticks: number): Effect[] {
  const all: Effect[] = [];
  for (let i = 0; i < ticks; i++) {
    const snap = takeSnapshot(sb.state);
    const events: SimEvent[] = step(sb.state, data);
    all.push(...deriveEffects(snap, sb.state, data, events, LOCAL_PLAYER));
  }
  return all;
}

const sounds = (fx: Effect[]) =>
  fx.filter((e) => e.type === 'sound').map((e) => (e as { sound: string }).sound);
const bursts = (fx: Effect[]) => fx.filter((e) => e.type === 'burst');

describe('deriveEffects', () => {
  it('excavar un muro da una explosión de tierra y el sonido de excavar', () => {
    const sb = new Sandbox(data, 1);
    sb.send({ type: 'dig', tiles: [{ x: 11, y: 4 }] });
    const fx = play(sb, 250);
    expect(sounds(fx)).toContain('dig');
    const dirt = bursts(fx).find((b) => b.type === 'burst' && b.count === 14);
    expect(dirt).toBeDefined();
  });

  it('minar una veta suelta monedas y depositar da sonido de ingreso', () => {
    const sb = new Sandbox(data, 1);
    sb.send({
      type: 'dig',
      tiles: [
        { x: 11, y: 4 },
        { x: 12, y: 4 },
        { x: 13, y: 4 },
        { x: 14, y: 4 },
      ],
    });
    const fx = play(sb, 1200);
    expect(sounds(fx)).toContain('coin');
    expect(sounds(fx)).toContain('deposit');
    // El oro excavado sale dorado.
    expect(bursts(fx).some((b) => b.type === 'burst' && b.color[0] > 0.9 && b.color[2] < 0.3)).toBe(
      true,
    );
  });

  it('construir y vender suenan, y construir levanta polvo en cada tile', () => {
    const sb = new Sandbox(data, 1);
    applyCommand(sb.state, data, LOCAL_PLAYER, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 6, y: 2, w: 2, h: 2 },
    });
    const built = play(sb, 1);
    expect(sounds(built)).toContain('build');
    expect(bursts(built)).toHaveLength(4);
    applyCommand(sb.state, data, LOCAL_PLAYER, { type: 'sellRoom', tile: { x: 6, y: 2 } });
    expect(sounds(play(sb, 1))).toContain('sell');
  });

  it('Crear Imp da un estallido morado y sonido', () => {
    const sb = new Sandbox(data, 1);
    applyCommand(sb.state, data, LOCAL_PLAYER, {
      type: 'castSpell',
      spell: 'createImp',
      target: { x: 3, y: 8 },
    });
    const fx = play(sb, 1);
    expect(sounds(fx)).toContain('pop');
    expect(bursts(fx)).toHaveLength(1);
  });

  it('una orden rechazada al ejecutarse suena a error', () => {
    const sb = new Sandbox(data, 1);
    const cmd = { type: 'buildRoom', room: 'lair', rect: { x: 6, y: 2, w: 2, h: 2 } } as const;
    applyCommand(sb.state, data, LOCAL_PLAYER, cmd);
    applyCommand(sb.state, data, LOCAL_PLAYER, cmd);
    expect(sounds(play(sb, 1))).toContain('error');
  });

  it('reclamar suelo da un brillo del color del jugador', () => {
    const sb = new Sandbox(data, 1);
    const i = tileIndex(sb.state, 11, 6);
    sb.state.terrain[i] = data.terrain.findIndex((t) => t.id === 'neutralFloor');
    sb.send({ type: 'claim', tiles: [{ x: 11, y: 6 }] });
    expect(sounds(play(sb, 150))).toContain('claim');
  });

  it('sin cambios no hay efectos', () => {
    const sb = new Sandbox(data, 1);
    expect(play(sb, 5)).toEqual([]);
  });

  it('los eventos de otro jugador no suenan en tu pantalla', () => {
    const sb = new Sandbox(data, 1);
    const snap = takeSnapshot(sb.state);
    const fx = deriveEffects(
      snap,
      sb.state,
      data,
      [{ type: 'roomBuilt', playerId: 2, roomId: 1 }],
      LOCAL_PLAYER,
    );
    expect(fx).toEqual([]);
  });
});

describe('ParticleSim', () => {
  const spec = {
    x: 5,
    y: 1,
    z: 5,
    color: [1, 1, 1] as const,
    count: 10,
    speed: 2,
    up: 3,
    size: 0.2,
  };

  it('un estallido crea tantas partículas como se pidió', () => {
    const sim = new ParticleSim();
    sim.burst(spec);
    expect(sim.particles).toHaveLength(10);
  });

  it('caen por la gravedad, rebotan en el suelo y nunca lo atraviesan', () => {
    const sim = new ParticleSim();
    sim.burst(spec);
    for (let i = 0; i < 30; i++) {
      sim.step(0.016);
      for (const p of sim.particles) expect(p.y).toBeGreaterThanOrEqual(0.05);
    }
    expect(sim.particles.some((p) => p.y < 1)).toBe(true);
  });

  it('desaparecen al acabar su vida', () => {
    const sim = new ParticleSim();
    sim.burst(spec);
    for (let i = 0; i < 100; i++) sim.step(0.05);
    expect(sim.particles).toHaveLength(0);
  });

  it('respeta el tope de partículas', () => {
    const sim = new ParticleSim();
    for (let i = 0; i < 100; i++) sim.burst({ ...spec, count: 50 });
    expect(sim.particles.length).toBeLessThanOrEqual(PARTICLES.max);
  });

  it('es determinista con la misma semilla y distinta con otra', () => {
    const a = new ParticleSim(7);
    const b = new ParticleSim(7);
    const c = new ParticleSim(8);
    for (const s of [a, b, c]) s.burst(spec);
    expect(a.particles).toEqual(b.particles);
    expect(a.particles).not.toEqual(c.particles);
  });
});

describe('recetas de sonido', () => {
  it('hay receta para cada sonido que usan los efectos y todas son válidas', () => {
    for (const name of [
      'click',
      'dig',
      'coin',
      'deposit',
      'claim',
      'build',
      'sell',
      'pop',
      'error',
    ] as const) {
      const layers = SOUND_RECIPES[name];
      expect(layers.length, name).toBeGreaterThan(0);
      for (const l of layers) {
        expect(l.dur).toBeGreaterThan(0);
        expect(l.gain).toBeGreaterThan(0);
        expect(l.gain).toBeLessThanOrEqual(0.3);
        if (l.kind === 'tone') expect(l.freq).toBeDefined();
      }
    }
  });

  it('los sonidos repetidos se limitan en el tiempo', () => {
    expect(MIN_REPEAT_SECONDS).toBeGreaterThan(0);
  });
});

describe('efectos de las criaturas', () => {
  const withCreature = () => {
    const sb = new Sandbox(data, 1);
    const c = newCreature(sb.state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
    sb.state.creatures.push(c);
    return { sb, c };
  };
  const fxFor = (sb: Sandbox, events: SimEvent[]) =>
    deriveEffects(takeSnapshot(sb.state), sb.state, data, events, LOCAL_PLAYER);

  it('una criatura nueva llega con un estallido morado y sonido', () => {
    const { sb, c } = withCreature();
    const fx = fxFor(sb, [
      { type: 'creatureArrived', playerId: 1, creatureId: c.id, creature: 'goblin' },
    ]);
    expect(sounds(fx)).toContain('pop');
    expect(bursts(fx)).toHaveLength(1);
  });

  it('subir de nivel da destello dorado y fanfarria', () => {
    const { sb, c } = withCreature();
    const fx = fxFor(sb, [{ type: 'levelUp', playerId: 1, creatureId: c.id, level: 2 }]);
    expect(sounds(fx)).toContain('levelup');
    expect(bursts(fx)[0]).toMatchObject({ color: [0.98, 0.82, 0.2] });
  });

  it('la bofetada suena y levanta chispas blancas', () => {
    const { sb, c } = withCreature();
    const fx = fxFor(sb, [{ type: 'slapped', playerId: 1, creatureId: c.id }]);
    expect(sounds(fx)).toContain('slap');
    expect(bursts(fx)[0]).toMatchObject({ color: [1, 1, 1] });
  });

  it('el día de pago suena una campanilla y que se vaya una criatura da un sonido de aviso', () => {
    const { sb } = withCreature();
    expect(sounds(fxFor(sb, [{ type: 'payday', tick: 1200 }]))).toContain('payday');
    expect(sounds(fxFor(sb, [{ type: 'creatureLeft', playerId: 1, creatureId: 1 }]))).toContain(
      'error',
    );
  });

  it('lo que le pasa a otro jugador no suena', () => {
    const { sb, c } = withCreature();
    expect(fxFor(sb, [{ type: 'slapped', playerId: 2, creatureId: c.id }])).toEqual([]);
  });
});

describe('efectos de combate', () => {
  const sb = new Sandbox(data, 1);
  const fx = (events: SimEvent[], visible?: (x: number, y: number) => boolean) =>
    deriveEffects(takeSnapshot(sb.state), sb.state, data, events, LOCAL_PLAYER, visible);
  const hit: SimEvent = {
    type: 'hit',
    attackerOwner: 2,
    targetOwner: 1,
    targetKind: 'creature',
    damage: 60,
    x: 5.5,
    y: 5.5,
  };

  it('un golpe levanta chispas rojas y suena', () => {
    const out = fx([hit]);
    expect(sounds(out)).toEqual(['hit']);
    expect(bursts(out)[0]).toMatchObject({ color: [0.95, 0.25, 0.2] });
  });

  it('un golpe al Corazón es más grande y un golpe a una sala levanta polvo', () => {
    const heart = bursts(fx([{ ...hit, targetKind: 'heart' }]))[0] as { count: number };
    const creature = bursts(fx([hit]))[0] as { count: number };
    expect(heart.count).toBeGreaterThan(creature.count);
    expect(bursts(fx([{ ...hit, targetKind: 'room' }]))[0]).toMatchObject({
      color: [0.6, 0.55, 0.5],
    });
  });

  it('lo que pasa fuera de la vista no se dibuja ni suena', () => {
    expect(fx([hit], () => false)).toEqual([]);
    expect(
      fx([{ type: 'spellCast', playerId: 2, spell: 'lightning', x: 30, y: 30 }], () => false),
    ).toEqual([]);
  });

  it('una sala destruida, un Rayo y una Llamada a las armas tienen su efecto y su sonido', () => {
    expect(sounds(fx([{ type: 'tileDestroyed', tile: 100, owner: 2 }]))).toEqual(['death']);
    const zap = fx([{ type: 'spellCast', playerId: 1, spell: 'lightning', x: 5, y: 5 }]);
    expect(sounds(zap)).toEqual(['zap']);
    expect(bursts(zap)[0]).toMatchObject({ color: [1, 0.95, 0.4] });
    expect(
      sounds(fx([{ type: 'spellCast', playerId: 1, spell: 'callToArms', x: 5, y: 5 }])),
    ).toEqual(['horn']);
  });

  it('una criatura que muere en combate suena, pero la eliminación del jugador no', () => {
    expect(
      sounds(fx([{ type: 'creatureDied', playerId: 2, creatureId: 1, cause: 'combat' }])),
    ).toEqual(['death']);
    expect(fx([{ type: 'creatureDied', playerId: 2, creatureId: 1, cause: 'eliminated' }])).toEqual(
      [],
    );
  });

  it('el fin de partida suena', () => {
    expect(
      sounds(
        fx([{ type: 'gameOver', result: { winners: [1], reason: 'lastStanding', tick: 10 } }]),
      ),
    ).toEqual(['gameover']);
  });
});
