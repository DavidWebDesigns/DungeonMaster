/**
 * Trampas: se colocan en un tile de suelo propio (como una sala) cuando se tiene la sala que exige cada una
 * (la Cámara de tortura). Las construyen los Imps; una vez armadas, se disparan solas contra los enemigos que
 * pasan cerca. Son invisibles para el rival.
 */
import { applyStatus } from './abilities';
import { areaDamage, hasLineOfSight } from './combat';
import { clampGold, missingRooms } from './rooms';
import type { Rules } from './rules';
import { removeTask, setTask } from './tasks';
import { isDoorDef, type ArmedTrapDef } from '../schemas';
import { syncDoors } from './doors';
import type { Creature, ErrorCode, Imp, MatchState, PlayerState, SimEvent, Trap } from './types';

export type TrapCheck = { ok: true; cost: number } | { ok: false; error: ErrorCode };

export function trapAt(state: MatchState, tile: number): Trap | undefined {
  return state.traps.find((t) => t.tile === tile);
}

/** ¿Tiene el tile muro (no caminable) a dos lados opuestos? Es un pasillo de 1 tile. */
export function isCorridor(state: MatchState, rules: Rules, tile: number): boolean {
  const blocked = (dx: number, dy: number) => {
    const x = (tile % state.width) + dx;
    const y = Math.floor(tile / state.width) + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return true;
    return !rules.walkable[state.terrain[y * state.width + x] as number];
  };
  return (blocked(-1, 0) && blocked(1, 0)) || (blocked(0, -1) && blocked(0, 1));
}

/** Comprueba si el jugador puede colocar la trampa en ese tile (sin gastar nada). */
export function checkBuildTrap(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trapId: string,
  tile: number,
): TrapCheck {
  const def = rules.data.traps.find((t) => t.id === trapId);
  if (!def) return { ok: false, error: 'INVALID_COMMAND' };
  if (missingRooms(state, player.id, def.requiresRooms).length > 0)
    return { ok: false, error: 'REQUIRES_ROOM' };
  const terrain = rules.terrain[state.terrain[tile] as number];
  // Suelo propio libre: construible, sin sala y sin otra trampa.
  if (
    !terrain?.buildable ||
    state.owner[tile] !== player.id ||
    state.roomAt[tile] !== 0 ||
    trapAt(state, tile)
  ) {
    return { ok: false, error: 'INVALID_TARGET' };
  }
  // Paredes aplastantes: solo en un pasillo de 1 tile (muro a dos lados opuestos).
  if (!isDoorDef(def) && def.effect.type === 'crushingWalls' && !isCorridor(state, rules, tile))
    return { ok: false, error: 'INVALID_TARGET' };
  if (player.gold < def.goldCost) return { ok: false, error: 'NO_GOLD' };
  return { ok: true, cost: def.goldCost };
}

/** Coloca la trampa (ya validada), cobra su coste y manda a los Imps a construirla. */
export function placeTrapNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trapId: string,
  tile: number,
  events: SimEvent[],
): void {
  const def = rules.data.traps.find((t) => t.id === trapId);
  if (!def) return;
  player.gold -= def.goldCost;
  const trap: Trap = {
    id: state.nextTrapId++,
    type: trapId,
    owner: player.id,
    tile,
    built: false,
    readyAt: 0,
    hp: def.hp,
    usesLeft: isDoorDef(def) ? 0 : (def.uses ?? 0),
    // Una puerta se ve siempre; una trampa, solo tras su primer disparo.
    revealed: isDoorDef(def),
  };
  state.traps.push(trap);
  setTask(state, player.id, 'buildTrap', tile);
  events.push({ type: 'trapPlaced', playerId: player.id, trapId: trap.id, trap: trapId, tile });
}

/** Vende o desmonta una trampa: devuelve su parte del coste (todo si aún no está construida). */
export function sellTrapNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trap: Trap,
  events: SimEvent[],
): void {
  const def = rules.data.traps.find((t) => t.id === trap.type);
  if (def) player.gold += Math.floor(def.goldCost * (trap.built ? def.sellRefund : 1));
  clampGold(state, rules, player);
  state.traps = state.traps.filter((t) => t.id !== trap.id);
  syncDoors(state, rules);
  for (const k of state.tasks.filter((k) => k.tile === trap.tile && k.owner === trap.owner)) {
    removeTask(state, k.id);
  }
  events.push({ type: 'trapSold', playerId: player.id, trap: trap.type, tile: trap.tile });
}

/** La trampa se destruye (daño, desgaste o último uso): desaparece con sus tareas y avisa. */
export function destroyTrap(state: MatchState, rules: Rules, trap: Trap, events: SimEvent[]): void {
  state.traps = state.traps.filter((t) => t.id !== trap.id);
  syncDoors(state, rules);
  for (const k of state.tasks.filter((k) => k.tile === trap.tile && k.owner === trap.owner))
    removeTask(state, k.id);
  events.push({
    type: 'trapDestroyed',
    playerId: trap.owner,
    trap: trap.type,
    tile: trap.tile,
    x: (trap.tile % state.width) + 0.5,
    y: Math.floor(trap.tile / state.width) + 0.5,
  });
}

/** Daño directo de una trampa a una unidad (sin atacante: no da experiencia). */
function hurt(
  state: MatchState,
  trapOwner: number,
  u: Creature | Imp,
  damage: number,
  events: SimEvent[],
): void {
  u.hp -= damage;
  u.attackedBy = 0;
  u.attackedTick = state.tick;
  if ('attackedByKind' in u) u.attackedByKind = 'none';
  events.push({
    type: 'hit',
    attackerOwner: trapOwner,
    targetOwner: u.owner,
    targetKind: 'level' in u ? 'creature' : 'imp',
    damage,
    x: u.x,
    y: u.y,
  });
}

const alive = (state: MatchState, owner: number) =>
  state.players.some((p) => p.id === owner && !p.eliminated);

/** Unidades enemigas de la trampa (criaturas primero), por distancia y luego por id. */
function enemiesOf(
  state: MatchState,
  trap: Trap,
  x: number,
  y: number,
): Array<{ u: Creature | Imp; d: number }> {
  const out: Array<{ u: Creature | Imp; d: number }> = [];
  for (const c of state.creatures)
    if (c.owner !== trap.owner && !c.held && c.hp > 0 && alive(state, c.owner))
      out.push({ u: c, d: Math.hypot(c.x - x, c.y - y) });
  for (const i of state.imps)
    if (i.owner !== trap.owner && !i.held && i.hp > 0 && alive(state, i.owner))
      out.push({ u: i, d: Math.hypot(i.x - x, i.y - y) });
  return out.sort((a, b) => a.d - b.d);
}

/** Quien dispara la trampa ahora mismo (el más cercano que cumple su disparador), si hay alguien. */
function triggerer(
  state: MatchState,
  rules: Rules,
  trap: Trap,
  def: ArmedTrapDef,
  x: number,
  y: number,
) {
  for (const e of enemiesOf(state, trap, x, y)) {
    if (e.d > def.triggerRadius) break;
    if (def.trigger === 'lineOfSight') {
      const aligned = Math.abs(e.u.x - x) < 0.6 || Math.abs(e.u.y - y) < 0.6;
      if (!aligned || !hasLineOfSight(state, rules, x, y, e.u.x, e.u.y)) continue;
    }
    return e.u;
  }
  return undefined;
}

function fire(
  state: MatchState,
  rules: Rules,
  trap: Trap,
  def: ArmedTrapDef,
  x: number,
  y: number,
  who: Creature | Imp,
  events: SimEvent[],
): void {
  const fx = def.effect;
  switch (fx.type) {
    case 'areaDamage':
    case 'crushingWalls':
      areaDamage(state, rules, trap.owner, x, y, fx.radius, fx.damage, events);
      break;
    case 'freezeArea': {
      areaDamage(state, rules, trap.owner, x, y, fx.radius, fx.damage, events);
      for (const e of enemiesOf(state, trap, x, y))
        if (e.d <= fx.radius && 'level' in e.u && e.u.hp > 0)
          applyStatus(state, rules, e.u, 'root', 0, fx.freezeSeconds);
      break;
    }
    case 'rollingBoulder': {
      // Rueda en línea recta hacia quien la disparó, hasta chocar con un muro.
      const horizontal = Math.abs(who.x - x) >= Math.abs(who.y - y);
      const dir = horizontal ? Math.sign(who.x - x) || 1 : Math.sign(who.y - y) || 1;
      let reach = 0;
      for (let k = 1; k <= 20; k++) {
        const tx = Math.floor(horizontal ? x + dir * k : x);
        const ty = Math.floor(horizontal ? y : y + dir * k);
        if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) break;
        if (!rules.walkable[state.terrain[ty * state.width + tx] as number]) break;
        reach = k;
      }
      for (const e of enemiesOf(state, trap, x, y)) {
        const along = horizontal ? (e.u.x - x) * dir : (e.u.y - y) * dir;
        const across = horizontal ? Math.abs(e.u.y - y) : Math.abs(e.u.x - x);
        if (across < 0.6 && along >= 0 && along <= reach + 1)
          hurt(state, trap.owner, e.u, fx.damage, events);
      }
      break;
    }
    case 'chainLightning': {
      const hit = new Set<Creature | Imp>([who]);
      let last: Creature | Imp = who;
      let dmg: number = fx.damage;
      hurt(state, trap.owner, who, dmg, events);
      for (let j = 1; j < fx.jumps; j++) {
        const next = enemiesOf(state, trap, last.x, last.y).find(
          (e) => !hit.has(e.u) && e.d <= fx.jumpRange,
        );
        if (!next) break;
        dmg *= 1 - fx.falloff;
        hurt(state, trap.owner, next.u, dmg, events);
        hit.add(next.u);
        last = next.u;
      }
      break;
    }
  }
}

/**
 * Paso 7: las trampas armadas se disparan contra el enemigo más cercano que cumpla su disparador. Las elementales gastan
 * un uso (se consumen al último); las físicas se desgastan y se rompen al quedarse sin vida. Entre disparos esperan su
 * enfriamiento.
 */
export function updateTraps(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const rate = rules.data.global.tickRate;
  for (const trap of state.traps.slice()) {
    if (!trap.built || state.tick < trap.readyAt) continue;
    const def = rules.data.traps.find((t) => t.id === trap.type);
    if (!def || isDoorDef(def)) continue;
    const owner = state.players.find((p) => p.id === trap.owner);
    if (!owner || owner.eliminated) continue;
    const x = (trap.tile % state.width) + 0.5;
    const y = Math.floor(trap.tile / state.width) + 0.5;
    const who = triggerer(state, rules, trap, def, x, y);
    if (!who) continue;
    fire(state, rules, trap, def, x, y, who, events);
    trap.revealed = true;
    events.push({ type: 'trapTriggered', playerId: trap.owner, trap: trap.type, x, y });
    if (def.family === 'elemental') trap.usesLeft--;
    else trap.hp -= def.wearPerTrigger ?? 0;
    const gone = def.family === 'elemental' ? trap.usesLeft <= 0 : trap.hp <= 0;
    if (gone) destroyTrap(state, rules, trap, events);
    else trap.readyAt = state.tick + Math.round(def.cooldownSeconds * rate);
  }
}
