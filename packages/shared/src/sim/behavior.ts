/**
 * Comportamiento de las criaturas (sección 6.10). En la fase 3 existen las prioridades que no necesitan
 * combate: abandono por ira, comer, dormir, cobrar, entrenar y vagar. Combate, huida y Llamada a las armas
 * llegan en la fase 4.
 */
import {
  creatureWage,
  workSpeedFactor,
  xpFactor,
  creatureMaxHp,
  moodBandOf,
} from './creatureStats';
import { tileIndex, tileOfPosition } from './grid';
import { moveAlongPath } from './movement';
import { findPath } from './pathfinding';
import { nextFloat, nextInt } from './rng';
import type { Rules } from './rules';
import type { Creature, CreatureGoal, MatchState, PlayerId, Room, SimEvent } from './types';

type Budgets = Map<PlayerId, number>;

interface Desire {
  goal: CreatureGoal;
  room: number;
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

/** Qué quiere hacer la criatura ahora, por orden de prioridad. */
function decide(state: MatchState, rules: Rules, c: Creature): Desire {
  const def = rules.creatureDefs[c.type];
  const { economy } = rules.data;
  const blocked = (g: CreatureGoal) => c.blocked[g] === state.mapVersion;
  const portal = roomsOf(state, c.owner, 'portal').length > 0 && !blocked('portal');
  const none = { goal: 'none' as CreatureGoal, room: 0 };
  if (!def) return none;

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
  const player = state.players.find((p) => p.id === c.owner);
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

function goalTiles(state: MatchState, c: Creature): Set<number> {
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
      if (c.beds[0] !== undefined) tiles.add(c.beds[0]);
      break;
    case 'wander':
      if (c.wanderTile >= 0) tiles.add(c.wanderTile);
      break;
    default:
      break;
  }
  return tiles;
}

function computePath(state: MatchState, rules: Rules, c: Creature): boolean {
  const goals = goalTiles(state, c);
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
      c.mode = 'acting'; // se queda esperando junto al Portal
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
  const { xpToNextLevel, maxLevel } = rules.data.progression;
  for (;;) {
    const need = xpToNextLevel[c.level - 1];
    if (need === undefined || c.level >= maxLevel || c.xp + EPS < need) break;
    const before = creatureMaxHp(rules, c);
    c.xp -= need;
    c.level++;
    c.hp += creatureMaxHp(rules, c) - before;
    events.push({ type: 'levelUp', playerId: c.owner, creatureId: c.id, level: c.level });
  }
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
    if (c.held) continue;
    const def = rules.creatureDefs[c.type];
    if (!def) continue;

    // Furioso: detenida (el abandono lo decide el paso de necesidades).
    if (workSpeedFactor(state, rules, c) === 0) {
      stopCreature(c);
      continue;
    }
    // Durmiendo: no se la interrumpe hasta que termina de descansar.
    if (c.goal === 'bed' && c.mode === 'acting') {
      c.actTimer += dt;
      if (c.actTimer >= rules.data.economy.sleep.restSeconds - EPS) {
        c.sleep = 0;
        stopCreature(c);
      }
      continue;
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
      if (!computePath(state, rules, c)) {
        c.blocked[c.goal] = state.mapVersion;
        stopCreature(c);
        continue;
      }
    }
    if (c.mode === 'moving') {
      moveAlongPath(state, c, def.base.speed * dt);
      if (c.path.length === 0) arrive(state, rules, c, events);
    }
    if (c.mode === 'acting' && c.goal === 'training') train(state, rules, c, events);
  }
}
