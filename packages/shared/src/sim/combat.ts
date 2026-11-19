/**
 * Combate (sección 6.11): daño, alcance, línea de visión, elección de objetivo, ataques a salas y al Corazón,
 * y muertes. Todo el azar sale del generador de la partida.
 */
import { creatureMaxHp, moodBandOf, scaledStat } from './creatureStats';
import { computeVisible } from './fog';
import { resetImp } from './imps';
import { tileIndex } from './grid';
import { removeCreature } from './needs';
import { removeRoomTile } from './rooms';
import { nextFloat } from './rng';
import type { Rules } from './rules';
import { removeTask } from './tasks';
import type { Creature, Imp, MatchState, PlayerId, SimEvent } from './types';
import { gainXp } from './xp';

export type UnitKind = 'creature' | 'imp';

export interface Enemy {
  kind: UnitKind;
  id: number;
  owner: PlayerId;
  x: number;
  y: number;
  dist: number;
}

/** ¿Hay línea recta sin muros entre dos puntos (en tiles)? Los tiles de los extremos no cuentan. */
export function hasLineOfSight(
  state: MatchState,
  rules: Rules,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  let x0 = Math.floor(ax);
  let y0 = Math.floor(ay);
  const x1 = Math.floor(bx);
  const y1 = Math.floor(by);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (!(x0 === Math.floor(ax) && y0 === Math.floor(ay)) && !(x0 === x1 && y0 === y1)) {
      if (rules.terrain[state.terrain[tileIndex(state, x0, y0)] as number]?.blocksSight)
        return false;
    }
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Distancia (en tiles) del punto (x, y) a la caja del tile: 0 si está dentro. */
export function distToTileBox(state: MatchState, x: number, y: number, tile: number): number {
  const tx = tile % state.width;
  const ty = Math.floor(tile / state.width);
  const dx = Math.max(tx - x, 0, x - (tx + 1));
  const dy = Math.max(ty - y, 0, y - (ty + 1));
  return Math.sqrt(dx * dx + dy * dy);
}

const bonusOf = (rules: Rules, key: 'attackSpeedBonus' | 'moveSpeedBonus'): number => {
  const e = rules.spells['haste']?.effect;
  return e && e.type === 'haste' ? e[key] : 0;
};

export function isHasted(state: MatchState, c: Creature): boolean {
  return state.tick < c.hasteUntil;
}

/** Ticks entre dos golpes: el intervalo de la criatura, dividido por (1 + bonus) si está acelerada. */
export function attackIntervalTicks(state: MatchState, rules: Rules, c: Creature): number {
  const def = rules.creatureDefs[c.type];
  if (!def) return 10;
  const speed = 1 + (isHasted(state, c) ? bonusOf(rules, 'attackSpeedBonus') : 0);
  return Math.max(1, Math.round((def.base.attackInterval * rules.data.global.tickRate) / speed));
}

/** Velocidad de movimiento en tiles por segundo (con el bonus de Acelerar). */
export function moveSpeed(state: MatchState, rules: Rules, c: Creature): number {
  const def = rules.creatureDefs[c.type];
  return (def?.base.speed ?? 0) * (1 + (isHasted(state, c) ? bonusOf(rules, 'moveSpeedBonus') : 0));
}

/** daño = dañoBase × mult(nivel) × modAnimo × aleatorio(0,9 a 1,1). */
export function rollDamage(state: MatchState, rules: Rules, c: Creature): number {
  const def = rules.creatureDefs[c.type];
  if (!def) return 0;
  const { combat } = rules.data.global;
  const base = scaledStat(rules, 'damage', def.base.damage, c.level);
  const mood = 1 + moodBandOf(rules, c.mood).damageMod;
  const random =
    combat.damageRandomMin + nextFloat(state) * (combat.damageRandomMax - combat.damageRandomMin);
  return base * mood * random;
}

/** Alcance de ataque de una criatura en tiles. */
export function attackReach(rules: Rules, c: Creature): number {
  const def = rules.creatureDefs[c.type];
  if (!def) return 0;
  return def.base.range <= 1 ? rules.data.global.combat.meleeReach : def.base.range;
}

export function isRanged(rules: Rules, c: Creature): boolean {
  return (rules.creatureDefs[c.type]?.base.range ?? 1) > 1;
}

/** ¿Está el enemigo al alcance de un golpe ahora mismo (distancia y, si es a distancia, línea de visión)? */
export function inAttackRange(
  state: MatchState,
  rules: Rules,
  c: Creature,
  ex: number,
  ey: number,
): boolean {
  const d = Math.hypot(ex - c.x, ey - c.y);
  if (d > attackReach(rules, c) + 1e-9) return false;
  return !isRanged(rules, c) || hasLineOfSight(state, rules, c.x, c.y, ex, ey);
}

const ownerAlive = (state: MatchState, owner: PlayerId) =>
  state.players.some((p) => p.id === owner && !p.eliminated);

/** Enemigos (criaturas e Imps de otros jugadores en juego) a menos de `radius` tiles. */
export function enemiesNear(state: MatchState, c: Creature, radius: number): Enemy[] {
  const out: Enemy[] = [];
  for (const o of state.creatures) {
    if (o.owner === c.owner || o.held || o.hp <= 0 || !ownerAlive(state, o.owner)) continue;
    const dist = Math.hypot(o.x - c.x, o.y - c.y);
    if (dist <= radius)
      out.push({ kind: 'creature', id: o.id, owner: o.owner, x: o.x, y: o.y, dist });
  }
  for (const i of state.imps) {
    if (i.owner === c.owner || i.held || i.hp <= 0 || !ownerAlive(state, i.owner)) continue;
    const dist = Math.hypot(i.x - c.x, i.y - c.y);
    if (dist <= radius) out.push({ kind: 'imp', id: i.id, owner: i.owner, x: i.x, y: i.y, dist });
  }
  return out;
}

export function findUnit(
  state: MatchState,
  kind: UnitKind,
  id: number,
): Creature | Imp | undefined {
  return kind === 'creature'
    ? state.creatures.find((k) => k.id === id)
    : state.imps.find((k) => k.id === id);
}

/**
 * Elige a quién atacar: primero a quien la ataca (si está a la vista), y si no, según su estilo de pelea:
 * el Goblin (flanker) prefiere Imps y lanzadores; el resto, al más cercano. [PROPUESTO]
 */
export function chooseTarget(state: MatchState, rules: Rules, c: Creature): Enemy | null {
  const radius = rules.data.global.combat.aggroRadius;
  const enemies = enemiesNear(state, c, radius);
  if (enemies.length === 0) return null;
  const byDist = (a: Enemy, b: Enemy) =>
    a.dist - b.dist || (a.kind === b.kind ? a.id - b.id : a.kind === 'creature' ? -1 : 1);
  if (c.attackedByKind !== 'none' && state.tick - c.attackedTick < 50) {
    const attacker = enemies.find((e) => e.kind === c.attackedByKind && e.id === c.attackedBy);
    if (attacker) return attacker;
  }
  if (rules.creatureDefs[c.type]?.fightStyle === 'flanker') {
    const soft = enemies.filter((e) => {
      if (e.kind === 'imp') return true;
      const u = findUnit(state, 'creature', e.id) as Creature | undefined;
      return u ? isRanged(rules, u) : false;
    });
    if (soft.length > 0) return soft.sort(byDist)[0] as Enemy;
  }
  return enemies.sort(byDist)[0] as Enemy;
}

/** Sala o Corazón enemigo que se puede golpear (el Portal está protegido). */
export function attackableTile(
  state: MatchState,
  rules: Rules,
  owner: PlayerId,
  tile: number,
): boolean {
  const roomId = state.roomAt[tile] as number;
  if (!roomId) return false;
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || room.owner === owner || room.type === 'portal') return false;
  return ownerAlive(state, room.owner);
}

/** Tile de sala o Corazón enemigo más cercano a menos de `radius` tiles (distancia a su caja), o -1. */
export function nearestStructure(
  state: MatchState,
  rules: Rules,
  c: Creature,
  radius: number,
): number {
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  const r = Math.ceil(radius);
  let best = -1;
  let bestD = Infinity;
  for (let y = Math.max(0, cy - r); y <= Math.min(state.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.width - 1, cx + r); x++) {
      const t = tileIndex(state, x, y);
      if (!attackableTile(state, rules, c.owner, t)) continue;
      const d = distToTileBox(state, c.x, c.y, t);
      if (d <= radius && (d < bestD || (d === bestD && t < best))) {
        bestD = d;
        best = t;
      }
    }
  }
  return best;
}

/** ¿Sigue siendo válido un objetivo de asalto (existe, es enemigo y su dueño sigue en juego)? */
export function assaultValid(state: MatchState, rules: Rules, c: Creature): boolean {
  if (c.assaultKind === 'none') return false;
  if (c.assaultKind === 'structure') return attackableTile(state, rules, c.owner, c.assaultId);
  const u = findUnit(state, c.assaultKind, c.assaultId);
  return (
    !!u && !('held' in u && u.held) && u.hp > 0 && u.owner !== c.owner && ownerAlive(state, u.owner)
  );
}

/**
 * Objetivo enemigo que el jugador VE más cercano a un tile (criaturas, Imps, salas y Corazón, en ese orden de
 * desempate). Se usa al soltar criaturas con la mano: se lanzan a por él, esté o no dentro del radio normal de combate.
 * Mira solo lo visible, así que no revela nada que el jugador no sepa.
 */
export function findAssaultTarget(
  state: MatchState,
  rules: Rules,
  owner: PlayerId,
  tile: number,
): { kind: 'creature' | 'imp' | 'structure'; id: number } | null {
  const vis = computeVisible(state, rules, owner);
  const px = (tile % state.width) + 0.5;
  const py = Math.floor(tile / state.width) + 0.5;
  const seen = (x: number, y: number) => vis[Math.floor(y) * state.width + Math.floor(x)] === 1;
  let best: { kind: 'creature' | 'imp' | 'structure'; id: number } | null = null;
  let bestD = Infinity;
  const rank = { creature: 0, imp: 1, structure: 2 } as const;
  const consider = (kind: 'creature' | 'imp' | 'structure', id: number, x: number, y: number) => {
    const d = Math.hypot(x - px, y - py);
    if (
      d < bestD - 1e-9 ||
      (Math.abs(d - bestD) <= 1e-9 &&
        best &&
        (rank[kind] < rank[best.kind] || (kind === best.kind && id < best.id)))
    ) {
      bestD = d;
      best = { kind, id };
    }
  };
  for (const o of state.creatures) {
    if (o.owner === owner || o.held || o.hp <= 0 || !ownerAlive(state, o.owner) || !seen(o.x, o.y))
      continue;
    consider('creature', o.id, o.x, o.y);
  }
  for (const i of state.imps) {
    if (i.owner === owner || i.held || i.hp <= 0 || !ownerAlive(state, i.owner) || !seen(i.x, i.y))
      continue;
    consider('imp', i.id, i.x, i.y);
  }
  for (let t = 0; t < state.owner.length; t++) {
    if (vis[t] !== 1 || !attackableTile(state, rules, owner, t)) continue;
    consider('structure', t, (t % state.width) + 0.5, Math.floor(t / state.width) + 0.5);
  }
  return best;
}

/** Quita un tile de sala destruido: pasa a suelo neutral sin dueño. */
function destroyTile(state: MatchState, rules: Rules, tile: number, events: SimEvent[]): void {
  const owner = state.owner[tile] as number;
  removeRoomTile(state, rules, tile);
  const neutral = rules.neutralTerrain;
  if (neutral !== undefined) state.terrain[tile] = neutral;
  state.owner[tile] = 0;
  state.tileDamage[tile] = 0;
  state.mapVersion++;
  events.push({ type: 'tileDestroyed', tile, owner });
  events.push({ type: 'tileChanged', tile });
}

function recordAttacker(victim: Creature | Imp, attacker: Creature, tick: number): void {
  if ('attackedByKind' in victim) victim.attackedByKind = 'creature';
  victim.attackedBy = attacker.id;
  victim.attackedTick = tick;
}

/** Golpe de una criatura a otra criatura o a un Imp. */
function hitUnit(
  state: MatchState,
  rules: Rules,
  attacker: Creature,
  kind: UnitKind,
  victim: Creature | Imp,
  events: SimEvent[],
): void {
  const dmg = rollDamage(state, rules, attacker);
  victim.hp -= dmg;
  recordAttacker(victim, attacker, state.tick);
  events.push({
    type: 'hit',
    attackerOwner: attacker.owner,
    targetOwner: victim.owner,
    targetKind: kind,
    damage: dmg,
    x: victim.x,
    y: victim.y,
  });
  gainXp(state, rules, attacker, rules.data.progression.xpPerHit, events);
}

/** Golpe a una sala (1.000 de vida por tile) o al Corazón (solo criaturas adyacentes lo dañan). */
function hitStructure(
  state: MatchState,
  rules: Rules,
  attacker: Creature,
  tile: number,
  events: SimEvent[],
): void {
  const dmg = rollDamage(state, rules, attacker);
  const room = state.rooms.find((r) => r.id === state.roomAt[tile]);
  if (!room) return;
  const cx = (tile % state.width) + 0.5;
  const cy = Math.floor(tile / state.width) + 0.5;
  if (room.type === 'heart') {
    const owner = state.players.find((p) => p.id === room.owner);
    if (owner) owner.heartHp -= dmg;
    events.push({
      type: 'hit',
      attackerOwner: attacker.owner,
      targetOwner: room.owner,
      targetKind: 'heart',
      damage: dmg,
      x: cx,
      y: cy,
    });
  } else {
    state.tileDamage[tile] = (state.tileDamage[tile] as number) + dmg;
    events.push({
      type: 'hit',
      attackerOwner: attacker.owner,
      targetOwner: room.owner,
      targetKind: 'room',
      damage: dmg,
      x: cx,
      y: cy,
    });
    if ((state.tileDamage[tile] as number) >= rules.data.global.roomTileHp)
      destroyTile(state, rules, tile, events);
  }
  gainXp(state, rules, attacker, rules.data.progression.xpPerHit, events);
}

/** Paso 7 del tick: las criaturas en combate o asediando golpean cuando les toca. */
export function updateCombat(state: MatchState, rules: Rules, events: SimEvent[]): void {
  for (const c of state.creatures) {
    if (c.held || c.hp <= 0) continue;
    if (c.goal !== 'combat' && c.goal !== 'siege') continue;
    if (state.tick < c.attackReadyTick) continue;

    if (c.goal === 'combat' && c.targetKind !== 'structure' && c.targetKind !== 'none') {
      const kind = c.targetKind as UnitKind;
      const target = findUnit(state, kind, c.targetId);
      if (!target || target.hp <= 0) continue;
      if (!inAttackRange(state, rules, c, target.x, target.y)) continue;
      hitUnit(state, rules, c, kind, target, events);
      c.attackReadyTick = state.tick + attackIntervalTicks(state, rules, c);
    } else if (c.goal === 'siege' && c.targetKind === 'structure') {
      if (!attackableTile(state, rules, c.owner, c.targetId)) continue;
      if (
        distToTileBox(state, c.x, c.y, c.targetId) >
        rules.data.global.combat.structureReach + 1e-9
      )
        continue;
      hitStructure(state, rules, c, c.targetId, events);
      c.attackReadyTick = state.tick + attackIntervalTicks(state, rules, c);
    }
  }
}

/** Daño de un hechizo de área a las criaturas e Imps enemigos (no toca salas ni el Corazón). */
export function areaDamage(
  state: MatchState,
  rules: Rules,
  caster: PlayerId,
  x: number,
  y: number,
  radius: number,
  damage: number,
  events: SimEvent[],
): void {
  for (const o of state.creatures) {
    if (o.owner === caster || o.held || !ownerAlive(state, o.owner)) continue;
    if (Math.hypot(o.x - x, o.y - y) > radius) continue;
    o.hp -= damage;
    o.attackedByKind = 'none';
    o.attackedTick = state.tick;
    events.push({
      type: 'hit',
      attackerOwner: caster,
      targetOwner: o.owner,
      targetKind: 'creature',
      damage,
      x: o.x,
      y: o.y,
    });
  }
  for (const i of state.imps) {
    if (i.owner === caster || i.held || !ownerAlive(state, i.owner)) continue;
    if (Math.hypot(i.x - x, i.y - y) > radius) continue;
    i.hp -= damage;
    i.attackedBy = 0;
    i.attackedTick = state.tick;
    events.push({
      type: 'hit',
      attackerOwner: caster,
      targetOwner: i.owner,
      targetKind: 'imp',
      damage,
      x: i.x,
      y: i.y,
    });
  }
}

/**
 * Paso 9 del tick: retira a los muertos. El asesino gana 20 × nivel de la víctima en experiencia
 * (un Imp muerto no da XP). El oro que llevaba un Imp se pierde. [PROPUESTO]
 */
export function processDeaths(state: MatchState, rules: Rules, events: SimEvent[]): void {
  for (const victim of state.creatures.filter((c) => c.hp <= 0)) {
    if (victim.attackedByKind === 'creature') {
      const killer = state.creatures.find((k) => k.id === victim.attackedBy && k.hp > 0);
      if (killer)
        gainXp(
          state,
          rules,
          killer,
          rules.data.progression.xpPerKillPerEnemyLevel * victim.level,
          events,
        );
    }
    events.push({
      type: 'creatureDied',
      playerId: victim.owner,
      creatureId: victim.id,
      cause: victim.attackedByKind === 'none' ? 'spell' : 'combat',
    });
    removeCreature(state, victim.id);
  }
  for (const imp of state.imps.filter((i) => i.hp <= 0)) {
    resetImp(state, imp);
    for (const t of state.tasks.filter((k) => k.reservedBy === imp.id)) removeTask(state, t.id);
    state.imps = state.imps.filter((i) => i.id !== imp.id);
    events.push({ type: 'impDied', playerId: imp.owner, impId: imp.id });
  }
  void creatureMaxHp;
}
