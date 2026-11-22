import type { DataSet } from '../data';
import { passive } from './abilities';
import { createImpCost, getPlayer, impCount } from './economy';
import { inBounds, neighbors4, tileIndex } from './grid';
import { makeImp } from './createMatch';
import { stopCreature } from './behavior';
import { findAssaultTarget, isInCombat } from './combat';
import { dropImp, resetImp, wakeImp } from './imps';
import { checkBuildTrap, placeTrapNow, sellTrapNow, trapAt } from './traps';
import { isVisible } from './fog';
import { castEffect } from './spells';
import { eliminatePlayer } from './victory';
import { buildRoomNow, getRoom, missingRooms, roomBuildCost, sellRoomNow } from './rooms';
import { rulesOf, type Rules } from './rules';
import {
  canClaim,
  canDig,
  canReinforceShape,
  isOwnGround,
  reinforceRoomMet,
  removeTask,
  setTask,
} from './tasks';
import type {
  Command,
  CommandResult,
  Creature,
  ErrorCode,
  MatchState,
  PlayerId,
  PlayerState,
  SimEvent,
} from './types';

type Validation = { ok: true; tiles: number[]; cost?: number } | { ok: false; error: ErrorCode };

const fail = (error: ErrorCode): Validation => ({ ok: false, error });

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === 'object' &&
  p !== null &&
  isInt((p as { x?: unknown }).x) &&
  isInt((p as { y?: unknown }).y);

/** Convierte la lista de puntos del comando en tiles únicos dentro del mapa, en orden de llegada. */
function parseTiles(state: MatchState, rules: Rules, raw: unknown): number[] | ErrorCode {
  if (!Array.isArray(raw) || !raw.every(isPoint)) return 'INVALID_COMMAND';
  if (raw.length === 0 || raw.length > rules.data.global.commands.maxTilesPerCommand)
    return 'INVALID_TARGET';
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of raw) {
    if (!inBounds(state, p.x, p.y)) continue;
    const i = tileIndex(state, p.x, p.y);
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

/** Tiles de `candidates` conectados (por vecinos ortogonales) a un punto de partida, pasando solo por la selección. */
function chained(
  state: MatchState,
  candidates: number[],
  isSeed: (tile: number) => boolean,
): number[] {
  const set = new Set(candidates);
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const t of candidates) {
    if (isSeed(t)) {
      visited.add(t);
      queue.push(t);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    for (const n of neighbors4(state, queue[h] as number)) {
      if (set.has(n) && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return candidates.filter((t) => visited.has(t));
}

function validate(state: MatchState, rules: Rules, player: PlayerState, cmd: Command): Validation {
  // Lo que llega por red puede ser cualquier cosa: sin forma de comando no se mira nada más.
  if (!cmd || typeof cmd !== 'object' || typeof (cmd as { type?: unknown }).type !== 'string')
    return fail('INVALID_COMMAND');
  const pid = player.id;
  switch (cmd.type) {
    case 'dig': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      // Se puede marcar un pasillo entero de una vez: cada tile debe tocar suelo caminable, otro tile
      // ya marcado para excavar, o enlazarse con ellos a través de la selección.
      const marked = new Set<number>();
      for (const k of state.tasks) if (k.owner === pid && k.kind === 'dig') marked.add(k.tile);
      const ok = chained(
        state,
        tiles.filter((t) => canDig(state, rules, t, pid)),
        (t) =>
          neighbors4(state, t).some(
            (n) => rules.walkable[state.terrain[n] as number] || marked.has(n),
          ),
      );
      if (ok.length > 0) return { ok: true, tiles: ok };
      const foreign = tiles.some((t) => {
        const def = rules.terrain[state.terrain[t] as number];
        return def?.diggable && state.owner[t] !== 0 && state.owner[t] !== pid;
      });
      return fail(foreign ? 'NOT_OWNER' : 'INVALID_TARGET');
    }
    case 'cancelDig': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      const ok = tiles.filter((t) =>
        state.tasks.some((k) => k.owner === pid && k.tile === t && k.kind === 'dig'),
      );
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('INVALID_TARGET');
    }
    case 'claim': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      const ok = chained(
        state,
        tiles.filter((t) => canClaim(state, rules, t, pid)),
        (t) => neighbors4(state, t).some((n) => isOwnGround(state, rules, n, pid)),
      );
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('INVALID_TARGET');
    }
    case 'reinforce': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      if (cmd.level !== undefined && (!Number.isInteger(cmd.level) || cmd.level < 1))
        return fail('INVALID_COMMAND');
      const level = cmd.level ?? 1;
      const shaped = tiles.filter((t) => canReinforceShape(state, rules, t, pid, level));
      if (shaped.length === 0) return fail('INVALID_TARGET');
      // Falta la sala que pide ese nivel (por ejemplo, un Taller de nivel 10).
      const ok = shaped.filter((t) => reinforceRoomMet(state, rules, t, pid));
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('REQUIRES_ROOM');
    }
    case 'buildRoom': {
      const r = cmd.rect;
      if (typeof cmd.room !== 'string' || typeof r !== 'object' || r === null)
        return fail('INVALID_COMMAND');
      if (![r.x, r.y, r.w, r.h].every(isInt)) return fail('INVALID_COMMAND');
      const def = rules.roomDefs[cmd.room];
      if (!def?.buildable) return fail('INVALID_TARGET');
      // Progresión: las salas superiores exigen tener antes otras.
      if (missingRooms(state, pid, def.requiresRooms).length > 0) return fail('REQUIRES_ROOM');
      if (r.w < def.minSize.w || r.h < def.minSize.h) return fail('INVALID_TARGET');
      if (!inBounds(state, r.x, r.y) || !inBounds(state, r.x + r.w - 1, r.y + r.h - 1))
        return fail('INVALID_TARGET');
      const tiles: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = tileIndex(state, x, y);
          const buildable = rules.terrain[state.terrain[i] as number]?.buildable === true;
          // Suelo propio libre: sin otra sala ni trampa encima.
          if (!buildable || state.owner[i] !== pid || state.roomAt[i] !== 0 || trapAt(state, i))
            return fail('INVALID_TARGET');
          tiles.push(i);
        }
      }
      const cost = roomBuildCost(state, rules, pid, cmd.room, r);
      if (player.gold < cost) return fail('NO_GOLD');
      return { ok: true, tiles, cost };
    }
    case 'sellRoom': {
      if (!isPoint(cmd.tile)) return fail('INVALID_COMMAND');
      if (!inBounds(state, cmd.tile.x, cmd.tile.y)) return fail('INVALID_TARGET');
      const i = tileIndex(state, cmd.tile.x, cmd.tile.y);
      const room = getRoom(state, state.roomAt[i] as number);
      if (!room) return fail('INVALID_TARGET');
      if (room.owner !== pid) return fail('NOT_OWNER');
      if (!rules.roomDefs[room.type]?.buildable) return fail('INVALID_TARGET');
      return { ok: true, tiles: [i] };
    }
    case 'castSpell': {
      if (typeof cmd.spell !== 'string') return fail('INVALID_COMMAND');
      const spell = rules.spells[cmd.spell];
      if (!spell) return fail('INVALID_COMMAND');
      if (state.tick < (player.cooldowns[spell.id] ?? 0)) return fail('COOLDOWN');
      let tile: number;
      if (spell.target === 'ownCreature') {
        if (!isInt(cmd.creature)) return fail('INVALID_COMMAND');
        const c = state.creatures.find((k) => k.id === cmd.creature);
        if (!c || c.held) return fail('INVALID_TARGET');
        if (c.owner !== pid) return fail('NOT_OWNER');
        tile = tileIndex(state, Math.floor(c.x), Math.floor(c.y));
      } else {
        if (!isPoint(cmd.target)) return fail('INVALID_COMMAND');
        if (!inBounds(state, cmd.target.x, cmd.target.y)) return fail('INVALID_TARGET');
        tile = tileIndex(state, cmd.target.x, cmd.target.y);
        if (spell.target === 'ownClaimedTile') {
          if (!isOwnGround(state, rules, tile, pid)) return fail('INVALID_TARGET');
        } else {
          // Solo sobre tiles que se ven ahora mismo; la Llamada a las armas además pide suelo caminable.
          if (!isVisible(state, rules, pid, tile)) return fail('INVALID_TARGET');
          if (spell.effect.type === 'rallyPoint' && !rules.walkable[state.terrain[tile] as number])
            return fail('INVALID_TARGET');
        }
      }
      let cost = spell.mana;
      if (spell.effect.type === 'spawnImp') {
        if (impCount(state, pid) >= rules.data.global.imps.max) return fail('LIMIT_REACHED');
        cost = createImpCost(state, rules, pid);
      }
      if (player.mana < cost) return fail('NO_MANA');
      return { ok: true, tiles: [tile], cost };
    }
    case 'pickUp': {
      if (!isInt(cmd.id)) return fail('INVALID_COMMAND');
      const unit =
        cmd.kind === 'imp'
          ? state.imps.find((k) => k.id === cmd.id)
          : state.creatures.find((k) => k.id === cmd.id);
      if (!unit || unit.held) return fail('INVALID_TARGET');
      if (unit.owner !== pid) return fail('NOT_OWNER');
      // Una criatura que está combatiendo no se puede retirar del mapa.
      if (cmd.kind !== 'imp' && isInCombat(state, rules, unit as Creature))
        return fail('IN_COMBAT');
      if (player.hand.length >= rules.data.global.hand.capacity) return fail('LIMIT_REACHED');
      return { ok: true, tiles: [] };
    }
    case 'buildTrap': {
      if (typeof cmd.trap !== 'string' || !isPoint(cmd.tile)) return fail('INVALID_COMMAND');
      if (!inBounds(state, cmd.tile.x, cmd.tile.y)) return fail('INVALID_TARGET');
      const tile = tileIndex(state, cmd.tile.x, cmd.tile.y);
      const res = checkBuildTrap(state, rules, player, cmd.trap, tile);
      return res.ok ? { ok: true, tiles: [tile], cost: res.cost } : fail(res.error);
    }
    case 'sellTrap': {
      if (!isPoint(cmd.tile)) return fail('INVALID_COMMAND');
      if (!inBounds(state, cmd.tile.x, cmd.tile.y)) return fail('INVALID_TARGET');
      const tile = tileIndex(state, cmd.tile.x, cmd.tile.y);
      const trap = trapAt(state, tile);
      // Ajena o inexistente da la misma respuesta: si no, se podrían sondear las trampas ocultas del rival.
      if (!trap || trap.owner !== pid) return fail('INVALID_TARGET');
      return { ok: true, tiles: [tile] };
    }
    case 'drop': {
      if (!isPoint(cmd.tile)) return fail('INVALID_COMMAND');
      if (player.hand.length === 0 || !inBounds(state, cmd.tile.x, cmd.tile.y))
        return fail('INVALID_TARGET');
      const i = tileIndex(state, cmd.tile.x, cmd.tile.y);
      // Solo en terreno ya conquistado y marcado como propio: desde ahí las criaturas salen a asaltar.
      if (!rules.walkable[state.terrain[i] as number]) return fail('INVALID_TARGET');
      if (state.owner[i] !== pid) return fail('NOT_OWNER');
      return { ok: true, tiles: [i] };
    }
    case 'surrender':
      return { ok: true, tiles: [] };
    case 'slap': {
      if (!isInt(cmd.id)) return fail('INVALID_COMMAND');
      // Criaturas e Imps se abofetean igual (los Imps no tienen ánimo, solo trabajan más rápido).
      const c =
        cmd.kind === 'imp'
          ? state.imps.find((k) => k.id === cmd.id)
          : state.creatures.find((k) => k.id === cmd.id);
      if (!c || c.held) return fail('INVALID_TARGET');
      if (c.owner !== pid) return fail('NOT_OWNER');
      if (state.tick < player.slapReadyTick) return fail('COOLDOWN');
      return { ok: true, tiles: [] };
    }
    default:
      return fail('INVALID_COMMAND');
  }
}

/** Aplica un comando ya validado (paso 1 del tick). */
function execute(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  cmd: Command,
  v: Extract<Validation, { ok: true }>,
  events: SimEvent[],
): void {
  switch (cmd.type) {
    case 'dig':
      for (const t of v.tiles) setTask(state, player.id, 'dig', t);
      break;
    case 'claim':
      for (const t of v.tiles) setTask(state, player.id, 'claim', t);
      break;
    case 'reinforce':
      for (const t of v.tiles) setTask(state, player.id, 'reinforce', t);
      break;
    case 'cancelDig':
      for (const t of v.tiles) {
        for (const k of state.tasks.filter(
          (k) => k.owner === player.id && k.tile === t && k.kind === 'dig',
        )) {
          removeTask(state, k.id);
        }
      }
      break;
    case 'buildRoom':
      buildRoomNow(state, rules, player, cmd.room, cmd.rect, events);
      break;
    case 'sellRoom': {
      const room = getRoom(state, state.roomAt[v.tiles[0] as number] as number);
      if (room) sellRoomNow(state, rules, player, room, events);
      break;
    }
    case 'pickUp': {
      if (cmd.kind === 'imp') {
        const imp = state.imps.find((k) => k.id === cmd.id);
        if (!imp) break;
        resetImp(state, imp);
        imp.held = true;
        player.hand.push({ kind: 'imp', id: imp.id });
        break;
      }
      const c = state.creatures.find((k) => k.id === cmd.id);
      if (!c) break;
      stopCreature(c);
      c.assaultKind = 'none';
      c.held = true;
      player.hand.push({ kind: 'creature', id: c.id });
      break;
    }
    case 'drop': {
      const item = player.hand.pop();
      const tile = v.tiles[0] as number;
      if (!item) break;
      if (item.kind === 'imp') {
        const imp = state.imps.find((k) => k.id === item.id);
        if (imp) dropImp(state, rules, imp, tile);
        break;
      }
      const c = state.creatures.find((k) => k.id === item.id);
      if (!c) break;
      c.held = false;
      c.x = (tile % state.width) + 0.5;
      c.y = Math.floor(tile / state.width) + 0.5;
      stopCreature(c);
      c.blocked = {};
      // Suelta = asalto: va al enemigo visible más cercano al punto donde cayó (si lo hay).
      const target = findAssaultTarget(state, rules, player.id, tile);
      c.assaultKind = target ? target.kind : 'none';
      c.assaultId = target ? target.id : 0;
      break;
    }
    case 'buildTrap':
      placeTrapNow(state, rules, player, cmd.trap, v.tiles[0] as number, events);
      break;
    case 'sellTrap': {
      const trap = trapAt(state, v.tiles[0] as number);
      if (trap) sellTrapNow(state, rules, player, trap, events);
      break;
    }
    case 'slap': {
      const g = rules.data.global;
      if (cmd.kind === 'imp') {
        const imp = state.imps.find((k) => k.id === cmd.id);
        if (!imp) break;
        imp.slapUntil = state.tick + Math.round(g.slap.durationSeconds * g.tickRate);
        // Lo despierta si holgazaneaba y, si está libre, lo manda a la tarea pendiente más cercana.
        wakeImp(state, rules, imp);
        player.slapReadyTick = state.tick + Math.round(g.slap.cooldownSeconds * g.tickRate);
        events.push({ type: 'impSlapped', playerId: player.id, impId: imp.id });
        break;
      }
      const c = state.creatures.find((k) => k.id === cmd.id);
      if (!c) break;
      // Disfruta el dolor: la bofetada le sube el ánimo en vez de bajárselo.
      const likes = passive(rules, c, 'moodOnSlap');
      c.mood = likes
        ? Math.min(rules.data.mood.max, c.mood + likes.effect.delta)
        : Math.max(rules.data.mood.min, c.mood - rules.data.mood.slapMoodPenalty);
      c.slapUntil = state.tick + Math.round(g.slap.durationSeconds * g.tickRate);
      player.slapReadyTick = state.tick + Math.round(g.slap.cooldownSeconds * g.tickRate);
      events.push({ type: 'slapped', playerId: player.id, creatureId: c.id });
      break;
    }
    case 'surrender':
      eliminatePlayer(state, rules, player, events);
      break;
    case 'castSpell': {
      const spell = rules.spells[cmd.spell];
      if (!spell) break;
      player.mana -= v.cost ?? 0;
      player.cooldowns[spell.id] =
        state.tick + Math.ceil(spell.cooldownSeconds * rules.data.global.tickRate);
      if (spell.effect.type === 'spawnImp') {
        const target = cmd.target as { x: number; y: number };
        const imp = makeImp(state.nextImpId++, player.id, target.x, target.y, rules.imp.base.hp);
        state.imps.push(imp);
        events.push({ type: 'impSpawned', playerId: player.id, impId: imp.id });
      } else {
        castEffect(state, rules, player, spell.id, v.tiles[0] as number, cmd.creature, events);
      }
      break;
    }
  }
}

/**
 * Comprueba un comando sin encolarlo, sin registrarlo y sin gastar el límite de ritmo.
 * Es lo que usa el cliente para dibujar fantasmas (por ejemplo una sala en rojo) con las mismas
 * reglas exactas que la simulación. `tiles` son los tiles aceptados; `cost` el coste en oro o maná.
 */
export function previewCommand(
  state: MatchState,
  data: DataSet,
  playerId: PlayerId,
  cmd: Command,
): { ok: true; tiles: number[]; cost?: number } | { ok: false; error: ErrorCode } {
  const player = getPlayer(state, playerId);
  if (!player || player.eliminated) return { ok: false, error: 'NOT_OWNER' };
  return validate(state, rulesOf(data), player, cmd);
}

/**
 * Valida un comando del jugador y lo encola para el próximo tick. Devuelve `ok` o un código de error.
 * Todo comando que pasa el límite de ritmo se guarda en `state.log` (acertado o no), para poder reproducir la partida.
 */
export function applyCommand(
  state: MatchState,
  data: DataSet,
  playerId: PlayerId,
  cmd: Command,
): CommandResult {
  const rules = rulesOf(data);
  const player = getPlayer(state, playerId);
  if (!player || player.eliminated) return { ok: false, error: 'NOT_OWNER' };
  if (state.status === 'ended') return { ok: false, error: 'INVALID_COMMAND' };

  const second = Math.floor(state.tick / rules.data.global.tickRate);
  if (player.rateSecond !== second) {
    player.rateSecond = second;
    player.rateCount = 0;
  }
  if (player.rateCount >= rules.data.global.commands.maxPerSecond)
    return { ok: false, error: 'RATE_LIMIT' };
  player.rateCount++;

  const copy = structuredClone(cmd);
  state.log.push({ tick: state.tick, playerId, cmd: copy });

  const v = validate(state, rules, player, copy);
  if (!v.ok) return v;
  state.queue.push({ playerId, cmd: copy });
  return { ok: true, accepted: v.tiles.length };
}

/** Paso 1 del tick: ejecuta los comandos en cola, en orden de llegada y luego por id de jugador. */
export function runQueuedCommands(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const queue = state.queue;
  state.queue = [];
  queue.sort((a, b) => a.playerId - b.playerId);
  for (const q of queue) {
    const player = getPlayer(state, q.playerId);
    if (!player || player.eliminated) continue;
    // El estado pudo cambiar desde que se encoló (otro comando gastó el oro, etc.): se valida otra vez.
    const v = validate(state, rules, player, q.cmd);
    if (!v.ok) events.push({ type: 'commandRejected', playerId: q.playerId, error: v.error });
    else execute(state, rules, player, q.cmd, v, events);
  }
}
