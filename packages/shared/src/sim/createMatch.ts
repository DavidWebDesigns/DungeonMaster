import type { DataSet } from '../data';
import { rulesOf } from './rules';
import { seedToState, shuffled } from './rng';
import { tileIndex } from './grid';
import type { Imp, MatchState, PlayerState, Room } from './types';

export interface MatchConfig {
  /** Número de jugadores; debe tener esquinas definidas en global.players.cornersByPlayerCount. */
  playerCount: number;
}

export function makeImp(id: number, owner: number, tileX: number, tileY: number, hp: number): Imp {
  return {
    id,
    owner,
    x: tileX + 0.5,
    y: tileY + 0.5,
    carry: 0,
    mode: 'idle',
    goal: 'none',
    taskId: 0,
    path: [],
    pathVersion: 0,
    work: 0,
    haulBlockedVersion: -1,
    autoBlockedVersion: -1,
    hp,
    held: false,
    slapUntil: 0,
    loafUntil: 0,
    loafTile: -1,
    restUntil: 0,
    attackedBy: 0,
    attackedTick: -1000000,
  };
}

/**
 * Crea el estado inicial a partir del mapa y los datos.
 * La semilla decide qué jugador ocupa cada esquina. Las esquinas sin jugador se llenan de roca.
 */
export function createMatch(config: MatchConfig, data: DataSet, seed: number): MatchState {
  const rules = rulesOf(data);
  const { global, map } = data;
  const corners = global.players.cornersByPlayerCount[String(config.playerCount)];
  if (!corners) throw new Error(`No hay esquinas definidas para ${config.playerCount} jugadores`);

  const state: MatchState = {
    tick: 0,
    seed,
    rng: seedToState(seed),
    mapVersion: 1,
    width: map.width,
    height: map.height,
    terrain: [],
    owner: new Array<number>(map.width * map.height).fill(0),
    goldLeft: new Array<number>(map.width * map.height).fill(0),
    roomAt: new Array<number>(map.width * map.height).fill(0),
    doorAt: new Array<number>(map.width * map.height).fill(0),
    players: [],
    imps: [],
    creatures: [],
    tasks: [],
    rooms: [],
    traps: [],
    nextTrapId: 1,
    nextImpId: 1,
    nextCreatureId: 1,
    nextPayTick: Math.round(data.economy.paydayIntervalSeconds * data.global.tickRate),
    nextTaskId: 1,
    nextRoomId: 1,
    revives: [],
    tileDamage: new Array<number>(map.width * map.height).fill(0),
    status: 'playing',
    result: null,
    queue: [],
    log: [],
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const ch = map.rows[y]?.[x];
      const t = data.terrain.findIndex((d) => d.char === ch);
      if (t < 0) throw new Error(`Carácter de mapa desconocido en (${x},${y}): ${String(ch)}`);
      const i = tileIndex(state, x, y);
      state.terrain.push(t);
      state.goldLeft[i] = data.terrain[t]?.goldPerTile ?? 0;
    }
  }

  const slots = shuffled(state, corners);
  const rock = rules.terrainIndex['solidRock'] as number;

  // Esquinas sin jugador: roca sólida.
  for (const base of map.bases) {
    if (slots.includes(base.slot)) continue;
    const r = base.claimed;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) state.terrain[tileIndex(state, x, y)] = rock;
  }

  const addRoom = (
    type: string,
    owner: number,
    rect: { x: number; y: number; w: number; h: number },
  ) => {
    const room: Room = { id: state.nextRoomId++, type, owner, tiles: [], timer: 0, stock: 0 };
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = tileIndex(state, x, y);
        room.tiles.push(i);
        state.roomAt[i] = room.id;
      }
    }
    state.rooms.push(room);
  };

  slots.forEach((slot, n) => {
    const base = map.bases.find((b) => b.slot === slot);
    if (!base) throw new Error(`El mapa no tiene la esquina ${slot}`);
    const id = n + 1;
    const player: PlayerState = {
      id,
      slot,
      gold: global.startingGold,
      mana: global.mana.start,
      heartHp: global.heart.hp,
      eliminated: false,
      cooldowns: {},
      rateSecond: -1,
      rateCount: 0,
      hand: [],
      slapReadyTick: 0,
      rallyTile: -1,
      rallyUntil: 0,
      seen: new Array<number>(map.width * map.height).fill(0),
    };
    state.players.push(player);
    const c = base.claimed;
    for (let y = c.y; y < c.y + c.h; y++)
      for (let x = c.x; x < c.x + c.w; x++) state.owner[tileIndex(state, x, y)] = id;
    addRoom('heart', id, base.heart);
    for (const r of base.rooms) addRoom(r.type, id, r.rect);
    for (const p of base.imps.slice(0, global.imps.start)) {
      state.imps.push(makeImp(state.nextImpId++, id, p.x, p.y, rules.imp.base.hp));
    }
  });

  return state;
}
