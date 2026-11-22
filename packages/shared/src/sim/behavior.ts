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
import { goldRoom } from './economy';
import { tileIndex, tileOfPosition } from './grid';
import { moveAlongPath } from './movement';
import { isStunned, walkableFor } from './abilities';
import { doorBlocks } from './doors';
import { findPath } from './pathfinding';
import { nextFloat, nextInt } from './rng';
import { secondsToTicks, type Rules } from './rules';
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

function casinoSeats(rules: Rules, room: Room): number {
  const per = rules.roomDefs['casino']?.casinoTilesPerSeat ?? 1;
  return Math.floor(room.tiles.length / per);
}

/** Casino con asiento libre: el que ya tenía si sigue libre, o el de menor id con hueco. */
function pickCasinoRoom(state: MatchState, rules: Rules, c: Creature): Room | undefined {
  const rooms = roomsOf(state, c.owner, 'casino');
  const occupancy = (room: Room) =>
    state.creatures.filter((o) => o.id !== c.id && o.goal === 'casino' && o.targetRoom === room.id)
      .length;
  const current = rooms.find((r) => r.id === c.targetRoom);
  if (c.goal === 'casino' && current && occupancy(current) < casinoSeats(rules, current))
    return current;
  return rooms.find((r) => occupancy(r) < casinoSeats(rules, r));
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

  // La puerta que le cortaba el paso ya no está (rota o vendida): vuelve a su camino.
  if (c.doorTarget >= 0 && !attackableTile(state, rules, c.owner, c.doorTarget)) c.doorTarget = -1;

  // Asalto ordenado con la mano: va a por el objetivo marcado aunque esté lejos del radio de combate. Si una puerta
  // enemiga le corta el paso (`doorTarget`), el asalto sigue en pie pero primero rompe la puerta (más abajo).
  if (c.assaultKind !== 'none') {
    const goal: CreatureGoal = c.assaultKind === 'structure' ? 'siege' : 'combat';
    if (c.doorTarget < 0 && assaultValid(state, rules, c) && !blocked(goal)) {
      return { goal, room: 0, targetKind: c.assaultKind, targetId: c.assaultId };
    }
    if (c.doorTarget < 0 || !assaultValid(state, rules, c)) {
      c.assaultKind = 'none';
      c.assaultId = 0;
    }
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

  // Una puerta enemiga le corta el paso: la ataca hasta romperla (al caer, la ruta se rehace sola).
  if (def.base.damage > 0 && c.doorTarget >= 0 && !blocked('siege'))
    return { goal: 'siege', room: 0, targetKind: 'structure', targetId: c.doorTarget };

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

  // Con el sueldo en el bolsillo, va a gastarlo al Casino (si lo hay y tiene asiento) antes de entrenar.
  if (c.purse > 0 && !blocked('casino')) {
    const casino = pickCasinoRoom(state, rules, c);
    if (casino) return { goal: 'casino', room: casino.id };
  }

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
  const reach = attackReach(rules, c) * rules.data.global.combat.standoffFactor;
  const out = new Set<number>();
  const r = Math.ceil(reach);
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  for (let y = Math.max(0, cy - r); y <= Math.min(state.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.width - 1, cx + r); x++) {
      const i = tileIndex(state, x, y);
      if (!rules.walkable[state.terrain[i] as number] || doorBlocks(state, i, c.owner)) continue;
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > reach) continue;
      if (isRanged(rules, c) && !hasLineOfSight(state, rules, x + 0.5, y + 0.5, px, py)) continue;
      out.add(i);
    }
  }
  return out;
}

/** Tiles caminables junto a una sala o al Corazón desde los que se puede golpear su tile. */
function structurePositions(
  state: MatchState,
  rules: Rules,
  tile: number,
  /** Quien se va a colocar: una puerta ajena no es un sitio donde pararse. */
  owner: number,
): Set<number> {
  const reach = rules.data.global.combat.structureReach;
  const out = new Set<number>();
  const tx = tile % state.width;
  const ty = Math.floor(tile / state.width);
  for (let y = Math.max(0, ty - 1); y <= Math.min(state.height - 1, ty + 1); y++) {
    for (let x = Math.max(0, tx - 1); x <= Math.min(state.width - 1, tx + 1); x++) {
      const i = tileIndex(state, x, y);
      if (!rules.walkable[state.terrain[i] as number] || doorBlocks(state, i, owner)) continue;
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
    case 'casino':
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
        structurePositions(state, rules, c.targetId, c.owner).forEach((i) => tiles.add(i));
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
  // Quien cruza agua o lava (Vuelo, Hija de la lava) las incluye en su ruta.
  const walkable = walkableFor(state, rules, c);
  // El tile de salida se acepta aunque tenga una puerta ajena encima (si se la construyen, que pueda salir).
  if (!walkable(start) && !doorBlocks(state, start, c.owner)) return false;
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

/**
 * Si no hay ruta a su destino, ¿es por una puerta enemiga? Se vuelve a buscar la ruta sin contar las puertas ajenas; si
 * existe, la primera puerta enemiga del camino es lo que hay que romper. Devuelve su tile o -1. Solo trabaja si hay
 * puertas enemigas, así que no cuesta nada en una partida sin ellas.
 */
function findBlockingDoor(state: MatchState, rules: Rules, c: Creature): number {
  if (!state.doorAt.some((d) => d !== 0 && d !== c.owner)) return -1;
  const goals = goalTiles(state, rules, c);
  if (goals.size === 0) return -1;
  const start = tileOfPosition(state, c.x, c.y);
  const own = walkableFor(state, rules, c);
  // Igual que la ruta normal, pero las puertas ajenas cuentan como suelo.
  const ignoringDoors = (tile: number) => own(tile) || doorBlocks(state, tile, c.owner);
  const { straightCost, diagonalCost } = rules.data.global.pathfinding;
  const path = findPath({
    width: state.width,
    height: state.height,
    walkable: ignoringDoors,
    start,
    isGoal: (i) => goals.has(i),
    heuristic: () => 0,
    straightCost,
    diagonalCost,
  });
  if (!path) return -1;
  return path.find((tile) => doorBlocks(state, tile, c.owner)) ?? -1;
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
        c.purse = wage; // el sueldo cobrado: lo que podrá gastar en el Casino
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
    case 'casino':
      c.mode = 'acting';
      c.actTimer = 0;
      c.gambled = 0;
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

/**
 * En el Casino: gasta poco a poco parte de su sueldo (`casinoSpendFraction`) durante `casinoStaySeconds`; la casa, o sea la
 * Tesorería del jugador, se queda `casinoHouseShare` de lo gastado (hasta donde quepa). Al salir queda divertida: entrena
 * con más experiencia durante `casinoBonusSeconds`.
 */
function gamble(state: MatchState, rules: Rules, c: Creature, events: SimEvent[]): void {
  const def = rules.roomDefs['casino'];
  const player = state.players.find((p) => p.id === c.owner);
  const room = state.rooms.find((r) => r.id === c.targetRoom);
  if (
    !def ||
    !player ||
    !room ||
    !def.casinoStaySeconds ||
    def.casinoSpendFraction === undefined ||
    def.casinoHouseShare === undefined
  ) {
    stopCreature(c);
    return;
  }
  const budget = creatureWage(rules, c) * def.casinoSpendFraction;
  const spend = Math.min(c.purse, (budget / def.casinoStaySeconds) * rules.dt);
  c.purse -= spend;
  c.gambled += spend;
  // Solo entra lo que cabe en la Tesorería (contando el oro que llevan los Imps).
  player.gold += Math.min(spend * def.casinoHouseShare, goldRoom(state, rules, player));
  c.actTimer += rules.dt;
  if (c.actTimer < def.casinoStaySeconds - EPS) return;
  // Se va: gastó lo que quiso (lo que sobra del sueldo se lo queda) y sale con ganas de entrenar.
  c.funUntil = state.tick + secondsToTicks(rules, def.casinoBonusSeconds ?? 0);
  events.push({
    type: 'gambled',
    playerId: c.owner,
    creatureId: c.id,
    amount: Math.round(c.gambled),
  });
  c.purse = 0;
  c.gambled = 0;
  stopCreature(c);
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
  // Si salió del Casino hace poco, entrena con más experiencia.
  const fun =
    state.tick < c.funUntil ? 1 + (rules.roomDefs['casino']?.casinoTrainingBonus ?? 0) : 1;
  c.xp +=
    def.trainingXpPerSecond *
    rules.dt *
    workSpeedFactor(state, rules, c) *
    xpFactor(rules, c) *
    fun;
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

    // Aturdida: no hace nada hasta que pase el aturdimiento.
    if (isStunned(state, c)) continue;
    // Furioso: detenida (el abandono lo decide el paso de necesidades).
    if (workSpeedFactor(state, rules, c) === 0) {
      stopCreature(c);
      continue;
    }
    // Durmiendo: no se la interrumpe hasta que termina de descansar (salvo que la ataquen).
    if (c.goal === 'bed' && c.mode === 'acting') {
      const attacked =
        state.tick - c.attackedTick <
        secondsToTicks(rules, rules.data.global.combat.wakeOnAttackSeconds);
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
        // ¿Lo tapa una puerta enemiga? Entonces la rompe en vez de rendirse.
        const door = findBlockingDoor(state, rules, c);
        const hittingTheDoor =
          c.goal === 'siege' && c.targetKind === 'structure' && c.targetId === door;
        // Si es la puerta lo que lo bloquea, no se da el destino por perdido: primero se rompe la puerta. Si ni a la
        // propia puerta se llega, entonces sí.
        if (door >= 0 && !hittingTheDoor) c.doorTarget = door;
        else c.blocked[c.goal] = state.mapVersion;
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
    if (c.mode === 'acting' && c.goal === 'casino') gamble(state, rules, c, events);
    // Descansando tras huir: vuelve a la acción al recuperar parte de la vida.
    if (c.mode === 'acting' && c.goal === 'flee') {
      if (c.hp >= creatureMaxHp(rules, c) * rules.data.global.combat.recoverHpFraction)
        stopCreature(c);
    }
  }
}
