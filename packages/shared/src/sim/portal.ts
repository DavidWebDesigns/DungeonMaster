import { findBed } from './lairs';
import { creatureMaxHp } from './creatureStats';
import { nextFloat } from './rng';
import type { Rules } from './rules';
import type { Creature, MatchState, PlayerId, SimEvent } from './types';

export function creatureCount(state: MatchState, owner: PlayerId): number {
  let n = 0;
  for (const c of state.creatures) if (c.owner === owner) n++;
  return n;
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
    targetKind: 'none',
    targetId: 0,
    attackReadyTick: 0,
    hasteUntil: 0,
    healTicksLeft: 0,
    healPerTick: 0,
    attackedByKind: 'none',
    attackedBy: 0,
    attackedTick: -1000000,
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
): { candidates: Array<{ type: string; weight: number }>; why: 'noLair' | 'noRoom' | null } {
  const candidates: Array<{ type: string; weight: number }> = [];
  let missingLair = false;
  let missingRoom = false;
  for (const def of rules.data.creatures) {
    if (!def.attraction) continue;
    const meets = def.attraction.requires.every(
      (req) => roomTiles(state, owner, req.room) >= (req.minTiles ?? 1),
    );
    if (!meets) {
      if (def.attraction.requires.some((r) => r.room === 'lair')) missingLair = true;
      else missingRoom = true;
      continue;
    }
    if (def.base.lairTiles > 0 && !findBed(state, rules, owner, def.base.lairTiles, portalTile)) {
      missingLair = true;
      continue;
    }
    candidates.push({ type: def.id, weight: def.attraction.attractWeight });
  }
  return {
    candidates,
    why: candidates.length > 0 ? null : missingLair ? 'noLair' : missingRoom ? 'noRoom' : null,
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
