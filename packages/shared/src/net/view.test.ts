import { describe, expect, it } from 'vitest';
import { applyStatus, tickAbilityState } from '../sim/abilities';
import { applyCommand } from '../sim/applyCommand';
import { playBotMatch } from '../bot/match';
import { createMatch } from '../sim/createMatch';
import { visibleMask } from '../sim/fog';
import { rulesOf } from '../sim/rules';
import { step } from '../sim/step';
import { buildRooms, duel, loadData, run, spawn } from '../sim/testUtils';
import type { MatchState } from '../sim/types';
import { Mirror } from './mirror';
import { ClientKnowledge, computeDelta, eventsFor } from './view';

const data = loadData();
const rules = rulesOf(data);

/** Sigue a un jugador: calcula su delta en cada llamada y se lo aplica a su espejo. */
class Follower {
  readonly known: ClientKnowledge;
  readonly mirror: Mirror;
  bytes = 0;
  /** Último terreno visto de cada tile (la verdad en el momento en que se vio por última vez). */
  readonly lastSeen = new Map<number, [number, number]>();
  constructor(
    readonly pid: number,
    state: MatchState,
  ) {
    this.known = new ClientKnowledge(state.width * state.height);
    this.mirror = new Mirror(data, pid);
  }
  update(state: MatchState): number {
    const delta = computeDelta(state, data, this.pid, this.known);
    const size = JSON.stringify(delta).length;
    this.bytes += size;
    this.mirror.apply(JSON.parse(JSON.stringify(delta)));
    const vis = visibleMask(state, rules, this.pid);
    for (let i = 0; i < vis.length; i++)
      if (vis[i] === 1)
        this.lastSeen.set(i, [state.terrain[i] as number, state.owner[i] as number]);
    return size;
  }
}

describe('vistas por jugador: lo que se ve', () => {
  it('el primer delta es una instantánea: ves tu base y todo lo demás es desconocido', () => {
    const state = createMatch({ playerCount: 2 }, data, 5);
    const f = new Follower(1, state);
    f.update(state);
    const m = f.mirror.state;
    const mine = state.players[0]!;
    const base = data.map.bases.find((b) => b.slot === mine.slot)!;
    // Un tile de tu base: terreno y dueño verdaderos.
    const i = (base.claimed.y + 4) * 64 + base.claimed.x + 4;
    expect(m.terrain[i]).toBe(state.terrain[i]);
    expect(m.owner[i]).toBe(1);
    expect(m.players[0]!.seen[i]).toBe(1);
    // El centro del mapa nunca se ha visto: terreno desconocido (roca) y sin marcar como visto.
    const c = 32 * 64 + 32;
    expect(m.terrain[c]).toBe(rules.terrainIndex['solidRock']);
    expect(m.players[0]!.seen[c]).toBe(0);
    expect(m.imps.filter((k) => k.owner === 1)).toHaveLength(4);
    expect(m.imps.filter((k) => k.owner === 2)).toHaveLength(0);
    expect(m.players.map((p) => p.id)).toEqual([1, 2]);
  });

  it('del rival solo llega lo que cae dentro de la visión', () => {
    const { state, data: d } = duel();
    const f = new Follower(1, state);
    const far = spawn(state, d, 2, 'troll', 40.5, 40.5);
    const near = spawn(state, d, 2, 'goblin', 8.5, 4.5);
    f.update(state);
    const ids = f.mirror.state.creatures.filter((c) => c.owner === 2).map((c) => c.id);
    expect(ids).toContain(near.id);
    expect(ids).not.toContain(far.id);
    // Al alejarse sale de la vista y desaparece del espejo.
    near.x = 30.5;
    near.y = 30.5;
    run(state, d, 1);
    f.update(state);
    expect(f.mirror.state.creatures.filter((c) => c.owner === 2)).toHaveLength(0);
  });

  it('de las criaturas rivales no se envían sus necesidades ni su ánimo, y de las tuyas sí', () => {
    const { state, data: d } = duel();
    const f = new Follower(1, state);
    const enemy = spawn(state, d, 2, 'goblin', 8.5, 4.5, { mood: 11, hunger: 42 });
    const mine = spawn(state, d, 1, 'goblin', 3.5, 8.5, { mood: 77, hunger: 33 });
    const delta = computeDelta(state, d, 1, new ClientKnowledge(64 * 64));
    const rec = (id: number) => delta.set![`c:${id}`]!;
    expect(rec(mine.id)).toMatchObject({ m: 77, hu: 33 });
    expect(Object.keys(rec(enemy.id)).sort()).toEqual(['h', 'l', 'o', 't', 'x', 'y']);
    void f;
  });

  it('que un Imp holgazanea solo lo sabe su dueño', () => {
    const { state, data: d } = duel();
    const mine = state.imps.find((i) => i.owner === 1)!;
    const enemy = state.imps.find((i) => i.owner === 2)!;
    mine.loafUntil = 123;
    enemy.loafUntil = 456;
    enemy.x = mine.x + 1; // a la vista de los dos
    enemy.y = mine.y;
    const delta = computeDelta(state, d, 1, new ClientKnowledge(64 * 64));
    expect(delta.set![`i:${mine.id}`]).toMatchObject({ lu: 123 });
    expect('lu' in delta.set![`i:${enemy.id}`]!).toBe(false);
    // Y el espejo del cliente lo recibe.
    const f = new Follower(1, state);
    f.update(state);
    expect(f.mirror.state.imps.find((i) => i.id === mine.id)?.loafUntil).toBe(123);
  });

  it('una puerta construida del rival llega en cuanto se ve el tile (nace revelada) y desaparece al perderla de vista', () => {
    const { state, data: d } = duel();
    state.imps = [];
    const door = 12 * 64 + 9;
    state.traps.push({
      id: state.nextTrapId++,
      type: 'basicDoor',
      owner: 1,
      tile: door,
      built: true,
      readyAt: 0,
      hp: 1500,
      usesLeft: 0,
      revealed: true,
    });
    const watcher = spawn(state, d, 2, 'goblin', 9.5, 13.5);
    const p2 = new Follower(2, state);
    p2.update(state);
    expect(p2.mirror.state.traps[0]).toMatchObject({ type: 'basicDoor', owner: 1, built: true });
    // El espejo sabe que ahí hay una puerta ajena (lo usa para las vistas previas).
    expect(p2.mirror.state.doorAt[door]).toBe(1);
    watcher.x = 50.5;
    watcher.y = 50.5;
    step(state, d);
    p2.update(state);
    expect(p2.mirror.state.traps).toHaveLength(0);
    expect(p2.mirror.state.doorAt[door]).toBe(0);
  });

  describe('trampas reveladas', () => {
    /** Jugador 1 con una trampa armada en (9,12) y el rival con una criatura al lado (la ve). */
    function trapWorld() {
      const { state, data: d } = duel();
      state.imps = [];
      buildRooms(state, d, ['trainingRoom', 'workshop']);
      state.players[0]!.gold = 9000;
      applyCommand(state, d, 1, { type: 'buildTrap', trap: 'spikeTrap', tile: { x: 9, y: 12 } });
      step(state, d);
      state.traps[0]!.built = true;
      state.tasks = [];
      const watcher = spawn(state, d, 2, 'goblin', 9.5, 13.5);
      return { state, d, watcher };
    }

    it('una trampa sin revelar nunca llega al rival, aunque la vea', () => {
      const { state } = trapWorld();
      const p2 = new Follower(2, state);
      p2.update(state);
      expect(p2.mirror.state.traps).toHaveLength(0);
      expect(JSON.stringify(p2.mirror.state)).not.toContain('spikeTrap');
      const delta = computeDelta(state, data, 2, new ClientKnowledge(64 * 64));
      expect(Object.keys(delta.set ?? {}).some((k) => k.startsWith('t:'))).toBe(false);
    });

    it('revelada y a la vista, el rival la recibe con dueño, vida y marca de revelada', () => {
      const { state } = trapWorld();
      state.traps[0]!.revealed = true;
      state.traps[0]!.hp = 700;
      const p2 = new Follower(2, state);
      p2.update(state);
      expect(p2.mirror.state.traps).toHaveLength(1);
      expect(p2.mirror.state.traps[0]).toMatchObject({
        owner: 1,
        hp: 700,
        revealed: true,
        built: true,
      });
      // Los campos secretos (usos, recarga) no viajan.
      const delta = computeDelta(state, data, 2, new ClientKnowledge(64 * 64));
      expect(Object.keys(delta.set!['t:' + state.traps[0]!.id]!).sort()).toEqual([
        'b',
        'h',
        'i',
        'o',
        'rv',
        'y',
      ]);
    });

    it('al salir de su vista el rival deja de tenerla; sin construir tampoco se envía', () => {
      const { state, d, watcher } = trapWorld();
      state.traps[0]!.revealed = true;
      const p2 = new Follower(2, state);
      p2.update(state);
      expect(p2.mirror.state.traps).toHaveLength(1);
      // La visión se calcula una vez por tick: se avanza uno tras mover a la criatura.
      watcher.x = 50.5;
      watcher.y = 50.5;
      run(state, d, 1);
      p2.update(state);
      expect(p2.mirror.state.traps).toHaveLength(0);
      watcher.x = 9.5;
      watcher.y = 13.5;
      state.traps[0]!.built = false;
      run(state, d, 1);
      p2.update(state);
      expect(p2.mirror.state.traps).toHaveLength(0);
    });

    it('el dueño siempre recibe sus trampas con su vida', () => {
      const { state } = trapWorld();
      state.traps[0]!.hp = 321;
      const p1 = new Follower(1, state);
      p1.update(state);
      expect(p1.mirror.state.traps[0]).toMatchObject({ owner: 1, hp: 321, revealed: false });
    });

    it('el muro derribado solo se cuenta a su dueño, nunca a quien lo derribó', () => {
      const { state } = trapWorld();
      const ev = { type: 'wallBreached', playerId: 1, tile: 5 * 64 + 5 } as const;
      expect(eventsFor([ev], state, 1, visibleMask(state, rules, 1))).toEqual([ev]);
      expect(eventsFor([ev], state, 2, visibleMask(state, rules, 2))).toEqual([]);
    });

    it('el evento de trampa destruida llega al dueño siempre y al rival solo si ve el tile', () => {
      const { state } = trapWorld();
      const ev = {
        type: 'trapDestroyed',
        playerId: 1,
        trap: 'spikeTrap',
        tile: 12 * 64 + 9,
        x: 9.5,
        y: 12.5,
      } as const;
      const v1 = visibleMask(state, rules, 1);
      const v2 = visibleMask(state, rules, 2);
      expect(eventsFor([ev], state, 1, v1)).toEqual([ev]);
      expect(eventsFor([ev], state, 2, v2)).toEqual([ev]);
      const far = { ...ev, x: 40.5, y: 40.5 };
      expect(eventsFor([far], state, 2, v2)).toEqual([]);
      expect(eventsFor([far], state, 1, v1)).toEqual([far]);
    });
  });

  it('los estados (atada, ralentizada...) solo los ve su dueño y se borran al caducar', () => {
    const { state, data: d } = duel();
    state.imps = [];
    const f = new Follower(1, state);
    const enemy = spawn(state, d, 2, 'goblin', 5.5, 5.5);
    const mine = spawn(state, d, 1, 'goblin', 3.5, 8.5);
    applyStatus(state, rulesOf(d), mine, 'slow', -0.4, 5);
    applyStatus(state, rulesOf(d), enemy, 'root', 0, 5);
    f.update(state);
    const mirrored = f.mirror.state.creatures.find((c) => c.id === mine.id)!;
    expect(mirrored.statuses).toEqual([
      { kind: 'slow', until: mine.statuses[0]!.until, value: -0.4 },
    ]);
    // El del rival no llega al cliente (solo las claves públicas) ni en el mismo mensaje.
    const delta = computeDelta(state, d, 1, new ClientKnowledge(64 * 64));
    expect(Object.keys(delta.set![`c:${enemy.id}`]!)).not.toContain('st');
    // Al caducar, el espejo se queda sin estados.
    state.tick += 100;
    tickAbilityState(state);
    f.update(state);
    expect(f.mirror.state.creatures.find((c) => c.id === mine.id)!.statuses).toEqual([]);
  });

  it('el evento de habilidad solo llega si ocurre a la vista del jugador', () => {
    const { state } = duel();
    const vis = visibleMask(state, rules, 1);
    const near = {
      type: 'abilityUsed',
      playerId: 2,
      creatureId: 9,
      ability: 'witchCurse',
      x: 3.5,
      y: 3.5,
    } as const;
    const far = { ...near, x: 40.5, y: 40.5 };
    const out = eventsFor([near, far], state, 1, vis);
    expect(out).toEqual([near]);
  });

  it('el Corazón enemigo solo muestra su vida si se ve', () => {
    const { state, data: d } = duel();
    state.players[1]!.heartHp = 1234;
    const f = new Follower(1, state);
    f.update(state);
    expect(f.mirror.state.players.find((p) => p.id === 2)!.heartHp).toBe(0);
    expect(f.mirror.state.players.find((p) => p.id === 1)!.heartHp).toBe(8000);
    // Una criatura propia junto a su Corazón lo deja ver.
    const h = d.map.bases.find((b) => b.slot === state.players[1]!.slot)!.heart;
    spawn(state, d, 1, 'goblin', h.x - 1.5, h.y + 1.5);
    f.update(state);
    expect(f.mirror.state.players.find((p) => p.id === 2)!.heartHp).toBe(1234);
  });

  it('las trampas y las tareas son siempre propias: el rival nunca las recibe', () => {
    const { state, data: d } = duel();
    buildRooms(state, d, ['trainingRoom', 'workshop']);
    state.players[0]!.gold = 9000;
    applyCommand(state, d, 1, { type: 'buildTrap', trap: 'spikeTrap', tile: { x: 9, y: 12 } });
    applyCommand(state, d, 1, { type: 'dig', tiles: [{ x: 11, y: 4 }] });
    step(state, d);
    const p1 = new Follower(1, state);
    const p2 = new Follower(2, state);
    // Aunque el jugador 2 viera ese tile, no recibe trampas ajenas.
    spawn(state, d, 2, 'troll', 9.5, 12.5);
    p1.update(state);
    p2.update(state);
    expect(p1.mirror.state.traps).toHaveLength(1);
    expect(p1.mirror.state.tasks.length).toBeGreaterThan(0);
    expect(p2.mirror.state.traps).toHaveLength(0);
    expect(p2.mirror.state.tasks).toHaveLength(0);
    // El jugador 2 sí ve el terreno y la sala si los tiene a la vista (no hay trampa en lo que recibe).
    expect(JSON.stringify(p2.mirror.state)).not.toContain('spikeTrap');
  });

  it('el terreno visto se recuerda tal como estaba, aunque cambie fuera de la vista', () => {
    const { state, data: d } = duel();
    const f = new Follower(1, state);
    const c = spawn(state, d, 1, 'goblin', 30.5, 30.5);
    f.update(state);
    const tile = 30 * 64 + 33;
    const before = f.mirror.state.terrain[tile];
    expect(f.mirror.state.players[0]!.seen[tile]).toBe(1);
    // La criatura se va y el tile cambia (alguien lo excava) sin que se vea.
    c.x = 5.5;
    c.y = 8.5;
    run(state, d, 1);
    state.terrain[tile] = d.terrain.findIndex((t) => t.id === 'neutralFloor');
    f.update(state);
    expect(f.mirror.state.terrain[tile]).toBe(before);
    expect(f.mirror.state.players[0]!.seen[tile]).toBe(1);
  });

  it('cuando una sala enemiga se destruye fuera de la vista, el cliente no se entera (no se envía el borrado)', () => {
    const { state, data: d } = duel();
    const f = new Follower(1, state);
    const h = d.map.bases.find((b) => b.slot === state.players[1]!.slot)!;
    const spy = spawn(state, d, 1, 'goblin', h.heart.x - 1.5, h.heart.y + 1.5);
    f.update(state);
    const treasury = h.rooms.find((r) => r.type === 'treasury')!.rect;
    const known = f.mirror.state.rooms.filter((r) => r.owner === 2).length;
    expect(known).toBeGreaterThan(0);
    spy.x = 30.5;
    spy.y = 30.5;
    run(state, d, 1);
    state.rooms = state.rooms.filter((r) => !(r.owner === 2 && r.type === 'treasury'));
    for (let y = treasury.y; y < treasury.y + treasury.h; y++)
      for (let x = treasury.x; x < treasury.x + treasury.w; x++) state.roomAt[y * 64 + x] = 0;
    const delta = computeDelta(state, d, 1, f.known);
    expect(delta.del ?? []).not.toContain(expect.stringMatching(/^r:/));
    expect(Object.keys(delta.set ?? {}).filter((k) => k.startsWith('r:'))).toEqual([]);
  });
});

describe('vistas por jugador: coherencia', () => {
  it('el espejo coincide con la verdad en todo lo que se ve, tick a tick, durante una partida de bots', () => {
    const f: Follower[] = [];
    let checked = 0;
    playBotMatch(data, {
      players: 2,
      seed: 9,
      maxTicks: 2500,
      onEvents: (_e, state) => {
        if (f.length === 0) for (const p of state.players) f.push(new Follower(p.id, state));
        for (const fl of f) {
          fl.update(state);
          if (state.tick % 250 !== 0) continue;
          checked++;
          const m = fl.mirror.state;
          const vis = visibleMask(state, rules, fl.pid);
          // Tiles visibles: iguales a la verdad. No visibles: iguales a lo último que se vio (o desconocidos).
          for (let i = 0; i < vis.length; i++) {
            if (vis[i] === 1) {
              expect(m.terrain[i]).toBe(state.terrain[i]);
              expect(m.owner[i]).toBe(state.owner[i]);
              expect(m.roomAt[i]).toBe(state.roomAt[i]);
            } else {
              const last = fl.lastSeen.get(i);
              if (last) expect([m.terrain[i], m.owner[i]]).toEqual(last);
              else expect(m.terrain[i]).toBe(rules.terrainIndex['solidRock']);
            }
          }
          // Cosas propias: iguales; del rival: solo las visibles y existentes.
          for (const c of state.creatures) {
            const mine = c.owner === fl.pid;
            const seen = vis[Math.floor(c.y) * 64 + Math.floor(c.x)] === 1;
            const got = m.creatures.find((k) => k.id === c.id);
            if (mine || (seen && !c.held)) {
              expect(got, `criatura ${c.id}`).toBeDefined();
              expect(got!.hp).toBe(Math.round(c.hp));
              expect(Math.abs(got!.x - c.x)).toBeLessThan(0.006);
            } else expect(got).toBeUndefined();
          }
          expect(m.creatures.every((k) => state.creatures.some((c) => c.id === k.id))).toBe(true);
          for (const i of state.imps) {
            const mine = i.owner === fl.pid;
            const seen = vis[Math.floor(i.y) * 64 + Math.floor(i.x)] === 1;
            expect(!!m.imps.find((k) => k.id === i.id)).toBe(mine || seen);
          }
          expect(m.players.find((p) => p.id === fl.pid)!.gold).toBe(
            Math.round(state.players.find((p) => p.id === fl.pid)!.gold),
          );
          expect(m.tick).toBe(state.tick);
        }
      },
    });
    expect(checked).toBeGreaterThanOrEqual(18);
  }, 300_000);

  it('reconectar (conocimiento vacío) devuelve lo que se ve ahora, igual que seguir al día', () => {
    const { state, data: d } = duel();
    const live = new Follower(1, state);
    spawn(state, d, 2, 'goblin', 8.5, 4.5);
    spawn(state, d, 1, 'troll', 3.5, 8.5);
    for (let n = 0; n < 40; n++) {
      step(state, d);
      live.update(state);
    }
    const fresh = new Follower(1, state);
    fresh.update(state);
    const key = (m: MatchState) =>
      JSON.stringify([
        m.creatures.map((c) => [c.id, c.owner, c.x, c.y, c.hp]),
        m.imps.map((i) => [i.id, i.x, i.y]),
      ]);
    expect(key(fresh.mirror.state)).toBe(key(live.mirror.state));
    const vis = visibleMask(state, rules, 1);
    for (let i = 0; i < vis.length; i++)
      if (vis[i] === 1) expect(fresh.mirror.state.terrain[i]).toBe(live.mirror.state.terrain[i]);
  });

  it('computeDelta no modifica el estado de la partida', () => {
    const { state, data: d } = duel();
    run(state, d, 30);
    const before = JSON.stringify(state);
    computeDelta(state, d, 1, new ClientKnowledge(64 * 64));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('un tick sin cambios cuesta muy poco (el tick y poco más)', () => {
    const { state, data: d } = duel();
    const f = new Follower(1, state);
    f.update(state);
    run(state, d, 20);
    f.update(state);
    const size = f.update(state);
    expect(size).toBeLessThan(1500);
  });
});

describe('ancho de banda', () => {
  it('con 4 jugadores, cada cliente recibe menos de 20 KB/s de media y en su peor segundo', () => {
    const f: Follower[] = [];
    const perSecond = new Map<number, number[]>();
    let secondBytes = new Map<number, number>();
    const r = playBotMatch(data, {
      players: 4,
      seed: 3,
      maxTicks: 4000,
      onEvents: (_e, state) => {
        if (f.length === 0) for (const p of state.players) f.push(new Follower(p.id, state));
        for (const fl of f)
          secondBytes.set(fl.pid, (secondBytes.get(fl.pid) ?? 0) + fl.update(state));
        if (state.tick % 10 === 0) {
          for (const [pid, b] of secondBytes)
            perSecond.set(pid, [...(perSecond.get(pid) ?? []), b]);
          secondBytes = new Map();
        }
      },
    });
    expect(r.ticks).toBe(4000);
    for (const [pid, list] of perSecond) {
      // El primer segundo incluye la instantánea completa; se mide aparte.
      const steady = list.slice(2);
      const avg = steady.reduce((a, b) => a + b, 0) / steady.length;
      const worst = Math.max(...steady);
      console.log(
        `jugador ${pid}: media ${(avg / 1024).toFixed(1)} KB/s, peor segundo ${(worst / 1024).toFixed(1)} KB/s, instantánea ${(list[0]! / 1024).toFixed(1)} KB`,
      );
      expect(avg, `media del jugador ${pid}`).toBeLessThan(20 * 1024);
      expect(worst, `peor segundo del jugador ${pid}`).toBeLessThan(20 * 1024);
    }
  }, 300_000);
});

describe('eventos por jugador', () => {
  it('cada jugador recibe sus eventos y lo público, y de lo ajeno solo lo que ocurre a la vista', () => {
    const { state, data: d } = duel();
    const vis = visibleMask(state, rules, 1);
    const near = {
      type: 'hit',
      attackerOwner: 2,
      targetOwner: 1,
      targetKind: 'creature',
      damage: 5,
      x: 6.5,
      y: 6.5,
    } as const;
    const far = { ...near, x: 40.5, y: 40.5 };
    const events = [
      { type: 'levelUp', playerId: 1, creatureId: 3, level: 2 },
      { type: 'levelUp', playerId: 2, creatureId: 4, level: 2 },
      { type: 'payday', tick: 1200 },
      { type: 'tileChanged', tile: 5 },
      near,
      far,
      { type: 'trapTriggered', playerId: 2, trap: 'spikeTrap', x: 40.5, y: 40.5 },
      { type: 'tileDestroyed', tile: 40 * 64 + 40, owner: 2 },
    ] as const;
    const got = eventsFor(events, state, 1, vis).map(
      (e) => e.type + (('playerId' in e && e.playerId) || ''),
    );
    expect(got).toEqual(['levelUp1', 'payday', 'hit']);
    void d;
  });

  it('el delta incluye los eventos filtrados y no incluye cambios de terreno', () => {
    const { state, data: d } = duel();
    const k = new ClientKnowledge(64 * 64);
    const delta = computeDelta(state, d, 1, k, [
      { type: 'tileChanged', tile: 1 },
      { type: 'payday', tick: 5 },
    ]);
    expect(delta.ev).toEqual([{ type: 'payday', tick: 5 }]);
  });
});
