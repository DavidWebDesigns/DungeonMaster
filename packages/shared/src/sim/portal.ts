import { findBed, freeLairTiles } from './lairs';
import { creatureMaxHp } from './creatureStats';
import { maxRoomLevel } from './rooms';
import { nextFloat } from './rng';
import type { Rules } from './rules';
import type { CreatureDef } from '../schemas';
import type { Creature, MatchState, PlayerId, SimEvent } from './types';

export function creatureCount(state: MatchState, owner: PlayerId): number {
  let n = 0;
  for (const c of state.creatures) if (c.owner === owner) n++;
  return n;
}

export interface Population {
  /** Criaturas vivas del jugador. */
  count: number;
  /** Máximo actual: el menor de los topes que hoy frenan la llegada de criaturas. */
  max: number;
  /** Tiles de Guarida libres (camas). */
  freeBeds: number;
  /** Tope global por jugador. */
  globalCap: number;
  /** Tope de los Portales (`reservePerPortal` × Portales). */
  portalCap: number;
  /** Tope por camas (`count + camas libres`); `null` si hoy puede llegar alguna especie que no usa cama. */
  bedCap: number | null;
}

/**
 * Población actual y máximo actual de un jugador. El máximo es el menor entre el tope global, el de los Portales y las
 * camas (las camas solo cuentan si ninguna especie sin cama, como el Esqueleto, puede llegar ya: tiene sus salas).
 */
export function populationOf(state: MatchState, rules: Rules, owner: PlayerId): Population {
  const count = creatureCount(state, owner);
  const portals = state.rooms.filter((r) => r.owner === owner && r.type === 'portal').length;
  const g = rules.data.global;
  const globalCap = g.maxCreaturesPerPlayer;
  const portalCap = g.portal.reservePerPortal * portals;
  const freeBeds = freeLairTiles(state, rules, owner).length;
  const bedless = rules.data.creatures.some(
    (def) =>
      def.attraction &&
      def.base.lairTiles === 0 &&
      def.attraction.requires.every(
        (req) => roomTiles(state, owner, req.room) >= (req.minTiles ?? 1),
      ),
  );
  const bedCap = bedless ? null : count + freeBeds;
  return {
    count,
    max: Math.min(globalCap, portalCap, bedCap ?? Infinity),
    freeBeds,
    globalCap,
    portalCap,
    bedCap,
  };
}

/** Criaturas vivas de una especie que tiene el jugador. */
export function speciesCount(state: MatchState, owner: PlayerId, type: string): number {
  let n = 0;
  for (const c of state.creatures) if (c.owner === owner && c.type === type) n++;
  return n;
}

/**
 * Cuántas criaturas vivas de esta especie permite hoy la progresión de salas: 1 por cada `tilesPerSlot` tiles de salas
 * de ese tipo (`fromRoom`) o 1 por cada `unlockEvery` criaturas vivas de la especie base (`fromCreature`), con el tope `maxPerPlayer`.
 * `Infinity` si la especie no tiene cupos.
 */
export function slotCapacity(
  state: MatchState,
  owner: PlayerId,
  def: { id: string; attraction: CreatureDef['attraction'] },
): number {
  const a = def.attraction;
  if (!a) return 0;
  let cap = Infinity;
  if (a.slots) {
    cap =
      'fromRoom' in a.slots
        ? Math.floor(roomTiles(state, owner, a.slots.fromRoom) / a.slots.tilesPerSlot)
        : Math.floor(speciesCount(state, owner, a.slots.fromCreature) / a.slots.unlockEvery);
  }
  return a.maxPerPlayer !== undefined ? Math.min(cap, a.maxPerPlayer) : cap;
}

function roomTiles(state: MatchState, owner: PlayerId, type: string): number {
  let n = 0;
  for (const r of state.rooms) if (r.owner === owner && r.type === type) n += r.tiles.length;
  return n;
}

export function newCreature(
  state: MatchState,
  rules: Rules,
  owner: PlayerId,
  type: string,
  tile: number,
): Creature {
  const c: Creature = {
    id: state.nextCreatureId++,
    type,
    owner,
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    level: 1,
    xp: 0,
    hp: 0,
    mood: rules.data.mood.start,
    hunger: 0,
    sleep: 0,
    wageSat: 0,
    beds: [],
    payPending: false,
    goal: 'none',
    mode: 'idle',
    targetRoom: 0,
    wanderTile: -1,
    path: [],
    pathVersion: 0,
    actTimer: 0,
    pauseTicks: 0,
    furiousSeconds: 0,
    band: '',
    held: false,
    slapUntil: 0,
    ignoring: false,
    blocked: {},
    doorTarget: -1,
    targetKind: 'none',
    targetId: 0,
    attackReadyTick: 0,
    assaultKind: 'none',
    assaultId: 0,
    hasteUntil: 0,
    healTicksLeft: 0,
    healPerTick: 0,
    attackedByKind: 'none',
    attackedBy: 0,
    attackedTick: -1000000,
    statuses: [],
    abilityReady: {},
    stillTicks: 0,
    reassembled: false,
  };
  c.hp = creatureMaxHp(rules, c);
  c.band = rules.bands.find((b) => c.mood >= b.min)?.id ?? '';
  return c;
}

/**
 * Qué criaturas podrían llegar ahora por el Portal de este jugador: las que cumplen los requisitos de
 * salas y tienen cama libre. Si ninguna, `why` dice qué falta (para el aviso al jugador).
 */
export function attractionCandidates(
  state: MatchState,
  rules: Rules,
  owner: PlayerId,
  portalTile: number,
): {
  candidates: Array<{ type: string; weight: number }>;
  why: 'noLair' | 'noRoom' | 'noSlots' | 'noLevel' | null;
} {
  const candidates: Array<{ type: string; weight: number }> = [];
  let missingLair = false;
  let missingRoom = false;
  let slotsFull = false;
  let lowLevel = false;
  for (const def of rules.data.creatures) {
    if (!def.attraction) continue;
    const hasRooms = def.attraction.requires.every(
      (req) => roomTiles(state, owner, req.room) >= (req.minTiles ?? 1),
    );
    if (!hasRooms) {
      if (def.attraction.requires.some((r) => r.room === 'lair')) missingLair = true;
      else missingRoom = true;
      continue;
    }
    // Nivel: hace falta una sala de ese tipo con suficientes tiles conectados (por ejemplo, nivel 10).
    if (
      def.attraction.requires.some(
        (req) => maxRoomLevel(state, owner, req.room) < (req.minLevel ?? 1),
      )
    ) {
      lowLevel = true;
      continue;
    }
    // Cupos: ya tiene todas las que permite la progresión de salas.
    if (speciesCount(state, owner, def.id) >= slotCapacity(state, owner, def)) {
      slotsFull = true;
      continue;
    }
    if (def.base.lairTiles > 0 && !findBed(state, rules, owner, def.base.lairTiles, portalTile)) {
      missingLair = true;
      continue;
    }
    // La probabilidad sigue a las salas: cuantos más tiles tenga la sala que atrae a la especie (la más pequeña de las que
    // pide, si son varias), más veces sale. `attractWeight` es lo común o rara que es esa especie.
    const tiles = Math.min(
      ...def.attraction.requires.map((req) => roomTiles(state, owner, req.room)),
    );
    candidates.push({ type: def.id, weight: def.attraction.attractWeight * Math.max(1, tiles) });
  }
  return {
    candidates,
    why:
      candidates.length > 0
        ? null
        : missingLair
          ? 'noLair'
          : slotsFull
            ? 'noSlots'
            : lowLevel
              ? 'noLevel'
              : missingRoom
                ? 'noRoom'
                : null,
  };
}

/** Paso 2: cada Portal intenta atraer a una criatura cada 30 s. */
export function tickPortals(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const interval = Math.round(
    rules.data.global.portal.attractIntervalSeconds * rules.data.global.tickRate,
  );
  for (const room of state.rooms) {
    if (room.type !== 'portal') continue;
    room.timer++;
    if (room.timer < interval) continue;
    room.timer = 0;
    const owner = room.owner;
    const player = state.players.find((p) => p.id === owner);
    if (!player || player.eliminated) continue;

    const portals = state.rooms.filter((r) => r.owner === owner && r.type === 'portal').length;
    const count = creatureCount(state, owner);
    if (
      count >= rules.data.global.maxCreaturesPerPlayer ||
      count >= rules.data.global.portal.reservePerPortal * portals
    ) {
      events.push({ type: 'portalIdle', playerId: owner, reason: 'full' });
      continue;
    }
    const portalTile = room.tiles[Math.floor(room.tiles.length / 2)] as number;
    const { candidates, why } = attractionCandidates(state, rules, owner, portalTile);
    if (candidates.length === 0) {
      events.push({ type: 'portalIdle', playerId: owner, reason: why ?? 'noRoom' });
      continue;
    }
    // Sorteo ponderado con el generador de la partida.
    const total = candidates.reduce((n, c) => n + c.weight, 0);
    let roll = nextFloat(state) * total;
    let pick = candidates[candidates.length - 1] as { type: string; weight: number };
    for (const c of candidates) {
      if (roll < c.weight) {
        pick = c;
        break;
      }
      roll -= c.weight;
    }
    const creature = newCreature(state, rules, owner, pick.type, portalTile);
    // Cama: la más cercana al Portal.
    const def = rules.creatureDefs[pick.type];
    if (def && def.base.lairTiles > 0)
      creature.beds = findBed(state, rules, owner, def.base.lairTiles, portalTile) ?? [];
    state.creatures.push(creature);
    events.push({
      type: 'creatureArrived',
      playerId: owner,
      creatureId: creature.id,
      creature: pick.type,
    });
  }
}

/**
 * Criaturas muertas que vuelven a la vida (Inmortal): cuando llega su hora reaparecen en el Cementerio con su nivel
 * reducido. Si ya no hay Cementerio o el jugador está eliminado, se pierden; si la mazmorra está llena, esperan.
 */
export function tickRevives(state: MatchState, rules: Rules, events: SimEvent[]): void {
  if (state.revives.length === 0) return;
  const keep: MatchState['revives'] = [];
  for (const r of state.revives) {
    if (state.tick < r.at) {
      keep.push(r);
      continue;
    }
    const player = state.players.find((p) => p.id === r.owner);
    if (!player || player.eliminated) continue;
    const effect = rules.abilitiesOf[r.type]?.find((a) => a.effect.type === 'undying')?.effect;
    if (!effect || effect.type !== 'undying') continue;
    const room = state.rooms.find((x) => x.owner === r.owner && x.type === effect.requiresRoom);
    if (!room) continue;
    if (creatureCount(state, r.owner) >= rules.data.global.maxCreaturesPerPlayer) {
      keep.push(r);
      continue;
    }
    const tile = room.tiles[Math.floor(room.tiles.length / 2)] as number;
    const c = newCreature(state, rules, r.owner, r.type, tile);
    c.level = r.level;
    c.hp = creatureMaxHp(rules, c);
    const def = rules.creatureDefs[r.type];
    if (def && def.base.lairTiles > 0)
      c.beds = findBed(state, rules, r.owner, def.base.lairTiles, tile) ?? [];
    state.creatures.push(c);
    events.push({ type: 'creatureArrived', playerId: r.owner, creatureId: c.id, creature: r.type });
  }
  state.revives = keep;
}
