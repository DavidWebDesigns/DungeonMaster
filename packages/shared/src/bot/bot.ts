/**
 * Bot de prueba (docs/PLAN.md 9.2): estrategia simple y reproducible que usa exactamente el mismo protocolo
 * de comandos que un jugador. No mira nada que su jugador no vea: solo el plano inicial del mapa (público),
 * el terreno que ya vio y las entidades dentro de su niebla de guerra.
 *
 *  1. Excavar hacia las vetas cercanas y minar.
 *  2. Tesorería extra si se llena; luego Guarida, Criadero, Sala de entrenamiento y Biblioteca (3×3).
 *  3. Mantener 6 a 8 Imps.
 *  4. Excavar hacia la mina central y hacia el enemigo.
 *  5. Con 8 o más criaturas de nivel 3 o más: Llamada a las armas sobre lo más débil que se vea y soltar
 *     criaturas cerca del Corazón enemigo.
 *  6. Curar criaturas por debajo del 40 % de vida si hay maná.
 */
import type { DataSet } from '../data';
import { previewCommand } from '../sim/applyCommand';
import { creatureMaxHp } from '../sim/creatureStats';
import { treasuryCapacity, createImpCost, impCount } from '../sim/economy';
import { freeLairTiles } from '../sim/lairs';
import { visibleMask } from '../sim/fog';
import { tileIndex, tileX, tileY } from '../sim/grid';
import { nextFloat } from '../sim/rng';
import { rulesOf } from '../sim/rules';
import type { Command, MatchState, PlayerId, PlayerState } from '../sim/types';
import { planDig } from './knowledge';

export interface Bot {
  readonly playerId: PlayerId;
  /** Comandos que el bot manda en este tick (casi siempre ninguno: decide una vez por segundo). */
  act(state: MatchState, data: DataSet): Command[];
}

export interface BotOptions {
  /** Cuántos Imps intenta mantener. */
  targetImps?: number;
  /** Criaturas de nivel 3 o más que juntan antes de atacar. */
  attackArmy?: number;
  /** Si pasa este tiempo (en ticks) con al menos 4 criaturas, ataca aunque no sean tantas. */
  attackAfterTicks?: number;
  /** Cada cuántos ticks decide (por defecto, una vez por segundo). Más alto = bot más lento. */
  thinkEveryTicks?: number;
  /** Fracción de decisiones que se salta (por defecto 0,05). Más alta = bot más torpe. */
  mistakeChance?: number;
}

const ROOM_ORDER = ['lair', 'hatchery', 'trainingRoom', 'library'] as const;
/** Se construye siempre al menos de 3×3 (la Guarida mínima es 2×2, pero 3×3 da 9 camas). */
const ROOM_SIZE = 3;
const RESERVE_GOLD = 300;

export function createBot(playerId: PlayerId, seed: number, options: BotOptions = {}): Bot {
  const opts = {
    targetImps: 7,
    attackArmy: 8,
    attackAfterTicks: 15000,
    thinkEveryTicks: 0,
    mistakeChance: 0.05,
    ...options,
  };
  const mem = { rng: seed | 0, lastRoomTry: -1000, enemy: 0 };

  function ownPlayer(state: MatchState): PlayerState | undefined {
    return state.players.find((p) => p.id === playerId);
  }

  function heartCenter(state: MatchState, owner: PlayerId): { x: number; y: number } | null {
    const room = state.rooms.find((r) => r.owner === owner && r.type === 'heart');
    if (!room) return null;
    let sx = 0;
    let sy = 0;
    for (const t of room.tiles) {
      sx += tileX(state, t);
      sy += tileY(state, t);
    }
    return { x: Math.round(sx / room.tiles.length), y: Math.round(sy / room.tiles.length) };
  }

  /** Primer sitio libre de w×h en suelo propio, empezando por el más cercano al Corazón. */
  function findRoomSpot(
    state: MatchState,
    data: DataSet,
    room: string,
  ): { x: number; y: number; w: number; h: number } | null {
    const rules = rulesOf(data);
    const def = rules.roomDefs[room];
    if (!def) return null;
    const w = Math.max(def.minSize.w, ROOM_SIZE);
    const h = Math.max(def.minSize.h, ROOM_SIZE);
    const heart = heartCenter(state, playerId);
    const candidates: Array<{ x: number; y: number; d: number }> = [];
    for (let y = 0; y + h <= state.height; y++) {
      for (let x = 0; x + w <= state.width; x++) {
        if (state.owner[tileIndex(state, x, y)] !== playerId) continue;
        const d = heart ? Math.abs(x + w / 2 - heart.x) + Math.abs(y + h / 2 - heart.y) : 0;
        candidates.push({ x, y, d });
      }
    }
    // A igual distancia al Corazón se elige al azar (con la semilla del bot): por orden de tile favorecería una orientación.
    const keyed = candidates.map((c) => ({ c, k: nextFloat(mem) }));
    keyed.sort((a, b) => a.c.d - b.c.d || a.k - b.k);
    candidates.splice(0, candidates.length, ...keyed.map((x) => x.c));
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w, h };
      // NO_GOLD cuenta como sitio válido: lo que se busca aquí es hueco, no dinero.
      const res = previewCommand(state, data, playerId, { type: 'buildRoom', room, rect });
      if (res.ok || res.error === 'NO_GOLD') return rect;
    }
    return null;
  }

  function roomCount(state: MatchState, type: string): number {
    return state.rooms.filter((r) => r.owner === playerId && r.type === type).length;
  }

  /** Semilla (distinta de 0) para desempatar rutas de excavación. */
  function tieSeed(): number {
    return (Math.floor(nextFloat(mem) * 0x7fffffff) | 1) >>> 0;
  }

  function freeBeds(state: MatchState, data: DataSet): number {
    return freeLairTiles(state, rulesOf(data), playerId).length;
  }

  function planRooms(state: MatchState, data: DataSet, p: PlayerState, out: Command[]): void {
    const rules = rulesOf(data);
    const cap = treasuryCapacity(state, rules, playerId);
    // Tesorería extra si se llena.
    const wantTreasury = cap > 0 && p.gold >= cap * 0.9 && state.tick - mem.lastRoomTry > 100;
    let next: string | undefined = wantTreasury
      ? 'treasury'
      : ROOM_ORDER.find((r) => roomCount(state, r) === 0);
    // Con la base montada y las camas llenas, otra Guarida para que quepan más criaturas (hasta 3).
    if (
      !next &&
      roomCount(state, 'lair') < 3 &&
      freeBeds(state, data) === 0 &&
      state.creatures.filter((c) => c.owner === playerId).length < 14
    ) {
      next = 'lair';
    }
    if (!next) return;
    const def = rules.roomDefs[next];
    if (!def) return;
    const w = Math.max(def.minSize.w, ROOM_SIZE);
    const h = Math.max(def.minSize.h, ROOM_SIZE);
    if (p.gold < def.goldPerTile * w * h + RESERVE_GOLD) return;
    const spot = findRoomSpot(state, data, next);
    mem.lastRoomTry = state.tick;
    if (spot) out.push({ type: 'buildRoom', room: next, rect: spot });
  }

  function planImps(state: MatchState, data: DataSet, p: PlayerState, out: Command[]): void {
    const rules = rulesOf(data);
    if (impCount(state, playerId) >= opts.targetImps) return;
    if (state.tick < (p.cooldowns['createImp'] ?? 0)) return;
    if (p.mana < createImpCost(state, rules, playerId) + 100) return;
    // Un tile propio de la base cerca del Corazón.
    const heart = heartCenter(state, playerId);
    if (!heart) return;
    for (let r = 2; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = heart.x + dx;
          const y = heart.y + dy;
          if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
          const res = previewCommand(state, data, playerId, {
            type: 'castSpell',
            spell: 'createImp',
            target: { x, y },
          });
          if (res.ok) {
            out.push({ type: 'castSpell', spell: 'createImp', target: { x, y } });
            return;
          }
        }
      }
    }
  }

  function planDigging(state: MatchState, data: DataSet, p: PlayerState, out: Command[]): void {
    const rules = rulesOf(data);
    const pending = state.tasks.filter((t) => t.owner === playerId && t.kind === 'dig').length;
    if (pending >= 3) return;
    const cap = treasuryCapacity(state, rules, playerId);
    const vein = (tile: number) =>
      rules.terrain[state.terrain[tile] as number]?.goldPerTile !== undefined;
    let path = null;
    // 1. Oro mientras haya sitio en la Tesorería.
    if (cap > 0 && p.gold < cap * 0.85) path = planDig(state, data, playerId, vein, tieSeed());
    // 2. Mina central, y 3. el enemigo, cuando la base está montada.
    const baseDone = ROOM_ORDER.every((r) => roomCount(state, r) > 0);
    if (!path && (baseDone || state.tick > 6000)) {
      const cx = Math.floor(state.width / 2);
      const cy = Math.floor(state.height / 2);
      path = planDig(
        state,
        data,
        playerId,
        (t) => Math.abs(tileX(state, t) - cx) <= 2 && Math.abs(tileY(state, t) - cy) <= 2,
      );
    }
    if (!path || path.tiles.length === 0) {
      const enemy = nearestEnemyBase(state, data);
      if (enemy) {
        const r = enemy;
        path = planDig(
          state,
          data,
          playerId,
          (t) => {
            const x = tileX(state, t);
            const y = tileY(state, t);
            return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
          },
          tieSeed(),
        );
      }
    }
    if (path && path.tiles.length > 0) {
      const tiles = path.tiles
        .slice(0, 24)
        .map((t) => ({ x: tileX(state, t), y: tileY(state, t) }));
      out.push({ type: 'dig', tiles });
    }
  }

  /**
   * Zona inicial del enemigo al que ataca. Elige el más cercano a la base propia (el plano del mapa es público);
   * si hay varios a igual distancia, al azar con la semilla del bot y se queda con esa elección mientras siga vivo.
   * (Elegir siempre por id haría que el jugador 1 recibiera más ataques que los demás.)
   */
  function nearestEnemyBase(
    state: MatchState,
    data: DataSet,
  ): { x: number; y: number; w: number; h: number } | null {
    const me = ownPlayer(state);
    const mine = data.map.bases.find((b) => b.slot === me?.slot);
    if (!mine) return null;
    const kept = state.players.find((q) => q.id === mem.enemy && !q.eliminated);
    if (kept) return data.map.bases.find((k) => k.slot === kept.slot)?.claimed ?? null;
    let bestD = Infinity;
    let tied: PlayerState[] = [];
    for (const q of state.players) {
      if (q.id === playerId || q.eliminated) continue;
      const b = data.map.bases.find((k) => k.slot === q.slot);
      if (!b) continue;
      const d = Math.abs(b.heart.x - mine.heart.x) + Math.abs(b.heart.y - mine.heart.y);
      if (d < bestD) {
        bestD = d;
        tied = [q];
      } else if (d === bestD) tied.push(q);
    }
    if (tied.length === 0) return null;
    const pick = tied[Math.floor(nextFloat(mem) * tied.length)] as PlayerState;
    mem.enemy = pick.id;
    return data.map.bases.find((k) => k.slot === pick.slot)?.claimed ?? null;
  }

  function planHeal(state: MatchState, data: DataSet, p: PlayerState, out: Command[]): void {
    const rules = rulesOf(data);
    if (state.tick < (p.cooldowns['heal'] ?? 0) || p.mana < (rules.spells['heal']?.mana ?? 0) + 200)
      return;
    const hurt = state.creatures
      .filter(
        (c) =>
          c.owner === playerId &&
          !c.held &&
          c.hp < creatureMaxHp(rules, c) * 0.4 &&
          c.healTicksLeft === 0,
      )
      .sort(
        (a, b) => a.hp / creatureMaxHp(rules, a) - b.hp / creatureMaxHp(rules, b) || a.id - b.id,
      );
    if (hurt[0]) out.push({ type: 'castSpell', spell: 'heal', creature: hurt[0].id });
  }

  /** Lo más débil que el jugador ve del enemigo: criaturas heridas primero, luego el Corazón, luego salas. */
  function weakestVisibleEnemy(
    state: MatchState,
    data: DataSet,
  ): { x: number; y: number; heart: boolean } | null {
    const rules = rulesOf(data);
    const vis = visibleMask(state, rules, playerId);
    const seenCreatures = state.creatures
      .filter(
        (c) =>
          c.owner !== playerId &&
          !c.held &&
          vis[tileIndex(state, Math.floor(c.x), Math.floor(c.y))] === 1,
      )
      .sort((a, b) => a.hp - b.hp || a.id - b.id);
    for (const room of state.rooms) {
      if (room.owner === playerId || room.type !== 'heart') continue;
      const t = room.tiles[Math.floor(room.tiles.length / 2)] as number;
      if (vis[t] === 1) return { x: tileX(state, t), y: tileY(state, t), heart: true };
    }
    if (seenCreatures[0])
      return { x: Math.floor(seenCreatures[0].x), y: Math.floor(seenCreatures[0].y), heart: false };
    for (const room of state.rooms) {
      if (room.owner === playerId || room.type === 'portal') continue;
      const t = room.tiles.find((k) => vis[k] === 1);
      if (t !== undefined) return { x: tileX(state, t), y: tileY(state, t), heart: false };
    }
    return null;
  }

  /** Tile visible y caminable más cercano al Corazón del enemigo más próximo (su posición inicial es pública). */
  function advanceTarget(
    state: MatchState,
    data: DataSet,
    vis: Uint8Array,
  ): { x: number; y: number; heart: boolean } | null {
    const base = nearestEnemyBase(state, data);
    if (!base) return null;
    const rules = rulesOf(data);
    const gx = base.x + base.w / 2;
    const gy = base.y + base.h / 2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < vis.length; i++) {
      if (vis[i] !== 1 || !rules.walkable[state.terrain[i] as number]) continue;
      const d = Math.abs(tileX(state, i) - gx) + Math.abs(tileY(state, i) - gy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? null : { x: tileX(state, best), y: tileY(state, best), heart: false };
  }

  function planAttack(state: MatchState, data: DataSet, p: PlayerState, out: Command[]): void {
    const rules = rulesOf(data);
    const army = state.creatures.filter((c) => c.owner === playerId);
    const strong = army.filter((c) => c.level >= 3).length;
    const ready =
      strong >= opts.attackArmy || (state.tick >= opts.attackAfterTicks && army.length >= 4);
    if (!ready) return;
    const vis = visibleMask(state, rules, playerId);
    // Sin enemigos a la vista, avanza: marca el tile visible más cercano a la base enemiga, y al llegar
    // las criaturas ven más lejos y encuentran por dónde seguir.
    const target = weakestVisibleEnemy(state, data) ?? advanceTarget(state, data, vis);
    if (!target) return;

    // Las criaturas que lleva en la mano se sueltan en el tile visible y caminable más cercano al objetivo.
    if (p.hand.length > 0) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < vis.length; i++) {
        if (vis[i] !== 1 || !rules.walkable[state.terrain[i] as number]) continue;
        const d = Math.abs(tileX(state, i) - target.x) + Math.abs(tileY(state, i) - target.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0)
        for (let k = 0; k < p.hand.length; k++)
          out.push({ type: 'drop', tile: { x: tileX(state, best), y: tileY(state, best) } });
      return;
    }
    // Llamada a las armas sobre el objetivo.
    const call = rules.spells['callToArms'];
    if (
      call &&
      p.rallyTile < 0 &&
      state.tick >= (p.cooldowns['callToArms'] ?? 0) &&
      p.mana >= call.mana
    ) {
      const res = previewCommand(state, data, playerId, {
        type: 'castSpell',
        spell: 'callToArms',
        target: { x: target.x, y: target.y },
      });
      if (res.ok) {
        out.push({ type: 'castSpell', spell: 'callToArms', target: { x: target.x, y: target.y } });
        return;
      }
    }
    // Y a mano: recoge a las criaturas más fuertes que no estén peleando y las lleva a la zona visible del enemigo.
    const free = army
      .filter(
        (c) =>
          !c.held &&
          c.goal !== 'combat' &&
          c.goal !== 'siege' &&
          c.goal !== 'flee' &&
          c.hp > creatureMaxHp(rules, c) * 0.6,
      )
      .sort((a, b) => b.level - a.level || a.id - b.id)
      .slice(0, rules.data.global.hand.capacity);
    for (const c of free) out.push({ type: 'pickUp', id: c.id });
  }

  return {
    playerId,
    act(state, data) {
      const p = ownPlayer(state);
      if (!p || p.eliminated || state.status === 'ended') return [];
      // Una decisión por segundo, repartida entre bots para no hacerlo todos en el mismo tick.
      const every = opts.thinkEveryTicks > 0 ? opts.thinkEveryTicks : data.global.tickRate;
      if ((state.tick + playerId * 3) % every !== 0) return [];
      // Un poco de aleatoriedad (con la semilla del bot) para que las partidas no sean idénticas.
      if (nextFloat(mem) < opts.mistakeChance) return [];
      const out: Command[] = [];
      planHeal(state, data, p, out);
      planAttack(state, data, p, out);
      planImps(state, data, p, out);
      planRooms(state, data, p, out);
      planDigging(state, data, p, out);
      return out.slice(0, 12);
    },
  };
}
