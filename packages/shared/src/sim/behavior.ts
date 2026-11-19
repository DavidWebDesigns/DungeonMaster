/**
 * Comportamiento de las criaturas (sección 6.10), por prioridad de arriba abajo:
 * 1 en la mano (no actúa), 2 huir si está herida, 3 combatir, 4 acudir a la Llamada a las armas,
 * 5 comer, 6 dormir, 7 cobrar, 8 entrenar, 9 vagar. Además, una criatura que está en territorio enemigo
 * sin enemigos a la vista golpea la sala o el Corazón que tenga cerca (asedio).
 */
import {
  assaultValid,
  attackReach,
  chooseTarget,
  findUnit,
  hasLineOfSight,
  inAttackRange,
  isRanged,
  moveSpeed,
  nearestStructure,
  attackableTile,
  distToTileBox,
  type UnitKind,
} from './combat';
import {
  creatureMaxHp,
  creatureWage,
  moodBandOf,
  workSpeedFactor,
  xpFactor,
} from './creatureStats';
import { tileIndex, tileOfPosition } from './grid';
import { moveAlongPath } from './movement';
import { findPath } from './pathfinding';
import { nextFloat, nextInt } from './rng';
import type { Rules } from './rules';
import type { Creature, CreatureGoal, MatchState, PlayerId, Room, SimEvent } from './types';
import { levelUpIfReady } from './xp';

type Budgets = Map<PlayerId, number>;

interface Desire {
  goal: CreatureGoal;
  room: number;
  targetKind?: Creature['targetKind'];
  targetId?: number;
}

const EPS = 1e-9;

const roomsOf = (state: MatchState, owner: PlayerId, type: string): Room[] =>
  state.rooms.filter((r) => r.owner === owner && r.type === type);

function trainingSlots(rules: Rules, room: Room): number {
  const per = rules.roomDefs['trainingRoom']?.tilesPerTrainee ?? 1;
  return Math.floor(room.tiles.length / per);
}

/** Sala de entrenamiento con hueco: la que ya tenía si sigue libre, o la de menor id con hueco. */
function pickTrainingRoom(state: MatchState, rules: Rules, c: Creature): Room | undefined {
  const rooms = roomsOf(state, c.owner, 'trainingRoom');
  const occupancy = (room: Room) =>
    state.creatures.filter(
      (o) => o.id !== c.id && o.goal === 'training' && o.targetRoom === room.id,
    ).length;
  const current = rooms.find((r) => r.id === c.targetRoom);
  if (c.goal === 'training' && current && occupancy(current) < trainingSlots(rules, current))
    return current;
  return rooms.find((r) => occupancy(r) < trainingSlots(rules, r));
}

/** ¿Está la criatura sobre suelo de otro jugador? (Es lo que la convierte en invasora.) */
function inEnemyTerritory(state: MatchState, c: Creature): boolean {
  const owner = state.owner[tileOfPosition(state, c.x, c.y)] as number;
  return owner !== 0 && owner !== c.owner;
}

/** ¿Está la criatura ya dentro del alcance de su objetivo actual? */
function targetInReach(state: MatchState, rules: Rules, c: Creature): boolean {
  if (c.targetKind === 'structure') {
    return (
      distToTileBox(state, c.x, c.y, c.targetId) <= rules.data.global.combat.structureReach + EPS
    );
  }
  if (c.targetKind === 'none') return false;
  const t = findUnit(state, c.targetKind as UnitKind, c.targetId);
  return t ? inAttackRange(state, rules, c, t.x, t.y) : false;
}

function targetPoint(state: MatchState, c: Creature): { x: number; y: number } | null {
  if (c.targetKind === 'structure')
    return { x: (c.targetId % state.width) + 0.5, y: Math.floor(c.targetId / state.width) + 0.5 };
  if (c.targetKind === 'none') return null;
  const t = findUnit(state, c.targetKind as UnitKind, c.targetId);
  return t ? { x: t.x, y: t.y } : null;
}

/** Qué quiere hacer la criatura ahora, por orden de prioridad. */
function decide(state: MatchState, rules: Rules, c: Creature): Desire {
  const def = rules.creatureDefs[c.type];
  const { economy } = rules.data;
  const { combat } = rules.data.global;
  const blocked = (g: CreatureGoal) => c.blocked[g] === state.mapVersion;
  const portal = roomsOf(state, c.owner, 'portal').length > 0 && !blocked('portal');
  const none: Desire = { goal: 'none', room: 0 };
  if (!def) return none;
  const maxHp = creatureMaxHp(rules, c);
  const hpFrac = maxHp > 0 ? c.hp / maxHp : 1;
  const player = state.players.find((p) => p.id === c.owner);

  // 2. Huir: con poca vida y cama accesible. Una vez a salvo descansa hasta recuperarse.
  if (def.needs.sleeps && c.beds.length > 0 && !blocked('flee')) {
    if (
      hpFrac < combat.fleeHpFraction ||
      (c.goal === 'flee' && hpFrac < combat.recoverHpFraction)
    ) {
      return { goal: 'flee', room: 0 };
    }
  }

  // Asalto ordenado con la mano: va a por el objetivo marcado aunque esté lejos del radio de combate.
  if (c.assaultKind !== 'none') {
    const goal: CreatureGoal = c.assaultKind === 'structure' ? 'siege' : 'combat';
    if (assaultValid(state, rules, c) && !blocked(goal)) {
      return { goal, room: 0, targetKind: c.assaultKind, targetId: c.assaultId };
    }
    c.assaultKind = 'none';
    c.assaultId = 0;
  }

  // 3. Combatir: enemigo a la vista (o que la ataca).
  if (def.base.damage > 0 && !blocked('combat')) {
    const keep =
      c.goal === 'combat' && c.targetKind !== 'none' && c.targetKind !== 'structure'
        ? findUnit(state, c.targetKind as UnitKind, c.targetId)
        : undefined;
    if (keep && keep.hp > 0 && Math.hypot(keep.x - c.x, keep.y - c.y) <= combat.aggroRadius) {
      return { goal: 'combat', room: 0, targetKind: c.targetKind, targetId: c.targetId };
    }
    const enemy = chooseTarget(state, rules, c);
    if (enemy) return { goal: 'combat', room: 0, targetKind: enemy.kind, targetId: enemy.id };
  }

  // Asedio: en territorio enemigo, sin enemigos que combatir, golpea la sala o el Corazón más cercano.
  if (def.base.damage > 0 && inEnemyTerritory(state, c) && !blocked('siege')) {
    const keep =
      c.goal === 'siege' &&
      c.targetKind === 'structure' &&
      attackableTile(state, rules, c.owner, c.targetId)
        ? c.targetId
        : -1;
    const tile = keep >= 0 ? keep : nearestStructure(state, rules, c, combat.aggroRadius);
    if (tile >= 0) return { goal: 'siege', room: 0, targetKind: 'structure', targetId: tile };
  }

  // 4. Llamada a las armas.
  if (player && player.rallyTile >= 0 && state.tick < player.rallyUntil && !blocked('rally')) {
    return { goal: 'rally', room: 0 };
  }

  // Enfadada: este segundo ignora lo demás y va hacia el Portal.
  if (c.ignoring && portal) return { goal: 'portal', room: 0 };

  if (
    def.needs.eats &&
    c.hunger >= economy.hunger.eatThreshold &&
    !blocked('hatchery') &&
    roomsOf(state, c.owner, 'hatchery').some((r) => r.stock > 0)
  )
    return { goal: 'hatchery', room: 0 };

  if (
    def.needs.sleeps &&
    c.sleep >= economy.sleep.sleepThreshold &&
    c.beds.length > 0 &&
    !blocked('bed')
  )
    return { goal: 'bed', room: 0 };

  if (c.payPending && !blocked('treasury') && roomsOf(state, c.owner, 'treasury').length > 0)
    return { goal: 'treasury', room: 0 };

  const training = rules.roomDefs['trainingRoom'];
  if (
    training?.trainingMaxLevel !== undefined &&
    c.level < training.trainingMaxLevel &&
    !blocked('training') &&
    player &&
    player.gold >= (training.trainingGoldPerSecond ?? 0)
  ) {
    const room = pickTrainingRoom(state, rules, c);
    if (room) return { goal: 'training', room: room.id };
  }

  // Enfadada pero sin ganas de ignorar nada: se queda cerca del Portal en vez de pasear.
  if (moodBandOf(rules, c.mood).behavior === 'headsToPortal' && portal)
    return { goal: 'portal', room: 0 };
  return { goal: 'wander', room: 0 };
}

export function stopCreature(c: Creature): void {
  c.goal = 'none';
  c.mode = 'idle';
  c.path = [];
  c.actTimer = 0;
  c.targetKind = 'none';
  c.targetId = 0;
}

/** Tile propio al azar a menos de `wanderRadius` de la criatura, o -1 si no hay. */
function pickWanderTile(state: MatchState, rules: Rules, c: Creature): number {
  const r = Math.floor(rules.data.economy.wanderRadius);
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  const options: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(state.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.width - 1, cx + r); x++) {
      const i = tileIndex(state, x, y);
      if (
        state.owner[i] === c.owner &&
        rules.walkable[state.terrain[i] as number] &&
        (x !== cx || y !== cy)
      )
        options.push(i);
    }
  }
  return options.length === 0 ? -1 : (options[nextInt(state, options.length)] as number);
}

/** Tiles caminables desde los que se puede golpear un punto (a distancia, con línea de visión). */
function attackPositions(
  state: MatchState,
  rules: Rules,
  c: Creature,
  px: number,
  py: number,
): Set<number> {
  const reach = attackReach(rules, c) * 0.95;
  const out = new Set<number>();
  const r = Math.ceil(reach);
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  for (let y = Math.max(0, cy - r); y <= Math.min(state.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.width - 1, cx + r); x++) {
      const i = tileIndex(state, x, y);
      if (!rules.walkable[state.terrain[i] as number]) continue;
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > reach) continue;
      if (isRanged(rules, c) && !hasLineOfSight(state, rules, x + 0.5, y + 0.5, px, py)) continue;
      out.add(i);
    }
  }
  return out;
}

/** Tiles caminables junto a una sala o al Corazón desde los que se puede golpear su tile. */
function structurePositions(state: MatchState, rules: Rules, tile: number): Set<number> {
  const reach = rules.data.global.combat.structureReach;
  const out = new Set<number>();
  const tx = tile % state.width;
  const ty = Math.floor(tile / state.width);
  for (let y = Math.max(0, ty - 1); y <= Math.min(state.height - 1, ty + 1); y++) {
    for (let x = Math.max(0, tx - 1); x <= Math.min(state.width - 1, tx + 1); x++) {
      const i = tileIndex(state, x, y);
      if (!rules.walkable[state.terrain[i] as number]) continue;
      if (distToTileBox(state, x + 0.5, y + 0.5, tile) <= reach + EPS) out.add(i);
    }
  }
  return out;
}

function goalTiles(state: MatchState, rules: Rules, c: Creature): Set<number> {
  const tiles = new Set<number>();
  const add = (rooms: Room[]) => rooms.forEach((r) => r.tiles.forEach((t) => tiles.add(t)));
  switch (c.goal) {
    case 'portal':
      add(roomsOf(state, c.owner, 'portal'));
      break;
    case 'hatchery':
      add(roomsOf(state, c.owner, 'hatchery').filter((r) => r.stock > 0));
      break;
    case 'treasury':
      add(roomsOf(state, c.owner, 'treasury'));
      break;
    case 'training':
      add(state.rooms.filter((r) => r.id === c.targetRoom));
      break;
    case 'bed':
    case 'flee':
      if (c.beds[0] !== undefined) tiles.add(c.beds[0]);
      break;
    case 'wander':
      if (c.wanderTile >= 0) tiles.add(c.wanderTile);
      break;
    case 'rally': {
      const p = state.players.find((k) => k.id === c.owner);
      if (p && p.rallyTile >= 0) tiles.add(p.rallyTile);
      break;
    }
    case 'combat': {
      const t = targetPoint(state, c);
      if (t) attackPositions(state, rules, c, t.x, t.y).forEach((i) => tiles.add(i));
      break;
    }
    case 'siege':
      if (c.targetKind === 'structure')
        structurePositions(state, rules, c.targetId).forEach((i) => tiles.add(i));
      break;
    default:
      break;
  }
  return tiles;
}

function computePath(state: MatchState, rules: Rules, c: Creature): boolean {
  const goals = goalTiles(state, rules, c);
  if (goals.size === 0) return false;
  const start = tileOfPosition(state, c.x, c.y);
  const walkable = (i: number) => rules.walkable[state.terrain[i] as number] === true;
  if (!walkable(start)) return false;
  const { straightCost, diagonalCost } = rules.data.global.pathfinding;
  const path = findPath({
    width: state.width,
    height: state.height,
    walkable,
    start,
    isGoal: (i) => goals.has(i),
    heuristic: () => 0,
    straightCost,
    diagonalCost,
  });
  if (!path) return false;
  c.path = path;
  c.pathVersion = state.mapVersion;
  c.mode = 'moving';
  return true;
}

function arrive(state: MatchState, rules: Rules, c: Creature, events: SimEvent[]): void {
  const here = tileOfPosition(state, c.x, c.y);
  switch (c.goal) {
    case 'portal':
    case 'rally':
      c.mode = 'acting'; // espera donde le dijeron
      return;
    case 'combat':
    case 'siege':
      c.mode = 'acting'; // ya está a tiro: golpea en el paso de combate
      c.path = [];
      return;
    case 'hatchery': {
      const room = state.rooms.find((r) => r.id === state.roomAt[here] && r.type === 'hatchery');
      if (room && room.stock > 0) {
        room.stock--;
        c.hunger = 0;
        events.push({ type: 'ate', playerId: c.owner, creatureId: c.id });
      }
      stopCreature(c);
      return;
    }
    case 'bed':
    case 'flee':
      c.mode = 'acting';
      c.actTimer = 0;
      return;
    case 'treasury': {
      const player = state.players.find((p) => p.id === c.owner);
      const wage = creatureWage(rules, c);
      if (player && player.gold >= wage) {
        player.gold -= wage;
        c.wageSat = 1;
        events.push({ type: 'paid', playerId: c.owner, creatureId: c.id, amount: wage, ok: true });
      } else {
        c.wageSat = -1;
        events.push({ type: 'paid', playerId: c.owner, creatureId: c.id, amount: 0, ok: false });
      }
      c.payPending = false;
      stopCreature(c);
      return;
    }
    case 'training':
      c.mode = 'acting';
      return;
    case 'wander': {
      const { min, max } = rules.data.economy.wanderPauseSeconds;
      c.pauseTicks = Math.round(
        (min + nextFloat(state) * (max - min)) * rules.data.global.tickRate,
      );
      stopCreature(c);
      return;
    }
    default:
      stopCreature(c);
  }
}

/** Entrenando: gana experiencia y gasta oro cada tick; sube de nivel hasta el máximo de la sala. */
function train(state: MatchState, rules: Rules, c: Creature, events: SimEvent[]): void {
  const def = rules.roomDefs['trainingRoom'];
  const player = state.players.find((p) => p.id === c.owner);
  const room = state.rooms.find((r) => r.id === c.targetRoom);
  if (!def || !player || !room || !def.trainingXpPerSecond || def.trainingMaxLevel === undefined) {
    stopCreature(c);
    return;
  }
  const cost = (def.trainingGoldPerSecond ?? 0) * rules.dt;
  if (player.gold < cost) {
    stopCreature(c);
    return;
  }
  player.gold -= cost;
  c.xp +=
    def.trainingXpPerSecond * rules.dt * workSpeedFactor(state, rules, c) * xpFactor(rules, c);
  levelUpIfReady(rules, c, events);
  if (c.level >= def.trainingMaxLevel) stopCreature(c);
}

/** Pasos 5 y 6 del tick para las criaturas: decidir, calcular ruta, moverse y actuar. */
export function updateCreatures(
  state: MatchState,
  rules: Rules,
  events: SimEvent[],
  budgets: Budgets,
): void {
  const dt = rules.dt;
  for (const c of state.creatures) {
    if (c.held || c.hp <= 0) continue;
    const def = rules.creatureDefs[c.type];
    if (!def) continue;

    // Furioso: detenida (el abandono lo decide el paso de necesidades).
    if (workSpeedFactor(state, rules, c) === 0) {
      stopCreature(c);
      continue;
    }
    // Durmiendo: no se la interrumpe hasta que termina de descansar (salvo que la ataquen).
    if (c.goal === 'bed' && c.mode === 'acting') {
      const attacked = state.tick - c.attackedTick < 3;
      if (!attacked) {
        c.actTimer += dt;
        if (c.actTimer >= rules.data.economy.sleep.restSeconds - EPS) {
          c.sleep = 0;
          stopCreature(c);
        }
        continue;
      }
      stopCreature(c);
    }

    const want = decide(state, rules, c);
    if (want.goal === 'wander') {
      if (c.goal !== 'wander') {
        stopCreature(c);
        if (c.pauseTicks > 0) {
          c.pauseTicks--;
          continue;
        }
        const tile = pickWanderTile(state, rules, c);
        if (tile < 0) {
          c.pauseTicks = Math.round(
            rules.data.economy.wanderPauseSeconds.min * rules.data.global.tickRate,
          );
          continue;
        }
        c.goal = 'wander';
        c.wanderTile = tile;
        c.mode = 'needPath';
      }
    } else if (want.goal === 'combat' || want.goal === 'siege') {
      const changed =
        c.goal !== want.goal || c.targetKind !== want.targetKind || c.targetId !== want.targetId;
      if (changed) {
        stopCreature(c);
        c.goal = want.goal;
        c.targetKind = want.targetKind ?? 'none';
        c.targetId = want.targetId ?? 0;
        c.mode = 'needPath';
      }
      if (targetInReach(state, rules, c)) {
        // Ya a tiro: se planta y golpea en el paso de combate.
        c.path = [];
        c.mode = 'acting';
      } else if (c.mode === 'acting') {
        c.mode = 'needPath';
      } else if (c.mode === 'moving') {
        // El enemigo se movió: se vuelve a trazar la ruta.
        const p = targetPoint(state, c);
        if (p && tileIndex(state, Math.floor(p.x), Math.floor(p.y)) !== c.wanderTile)
          c.mode = 'needPath';
      }
    } else if (want.goal !== c.goal || (want.goal === 'training' && want.room !== c.targetRoom)) {
      stopCreature(c);
      c.goal = want.goal;
      c.targetRoom = want.room;
      c.mode = 'needPath';
    }

    if (c.mode === 'moving' && c.pathVersion !== state.mapVersion) c.mode = 'needPath';
    if (c.mode === 'needPath') {
      const budget = budgets.get(c.owner) ?? 0;
      if (budget <= 0) continue;
      budgets.set(c.owner, budget - 1);
      const p = c.goal === 'combat' || c.goal === 'siege' ? targetPoint(state, c) : null;
      if (!computePath(state, rules, c)) {
        c.blocked[c.goal] = state.mapVersion;
        stopCreature(c);
        continue;
      }
      if (p) c.wanderTile = tileIndex(state, Math.floor(p.x), Math.floor(p.y));
    }
    if (c.mode === 'moving') {
      moveAlongPath(state, c, moveSpeed(state, rules, c) * dt);
      if (c.path.length === 0) arrive(state, rules, c, events);
    }
    if (c.mode === 'acting' && c.goal === 'training') train(state, rules, c, events);
    // Descansando tras huir: vuelve a la acción al recuperar parte de la vida.
    if (c.mode === 'acting' && c.goal === 'flee') {
      if (c.hp >= creatureMaxHp(rules, c) * rules.data.global.combat.recoverHpFraction)
        stopCreature(c);
    }
  }
}
