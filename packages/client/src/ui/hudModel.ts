/**
 * Lo que muestra el HUD, calculado a partir del estado de la simulación. Función pura y probada;
 * los componentes solo lo pintan.
 */
import {
  createImpCost,
  creatureMaxHp,
  impCount,
  isInCombat,
  manaPulsePerSecond,
  pigletCap,
  pigletCount,
  manaRegenPerSecond,
  templeManaPerSecond,
  maxRoomLevel,
  missingRooms,
  populationOf,
  rulesOf,
  treasuryCapacity,
  type DataSet,
  type MatchState,
} from '@dm/shared';
import type { Tool } from '../input/inputModel';
import { doorHotkey, roomHotkey, trapHotkey } from '../input/keymap';
import { activityLabel, hpFraction, moodIconOf } from '../render/creatureStyle';
import type { Notice } from './notices';

export interface ToolButton {
  id: string;
  label: string;
  hotkey: string;
  tool: Tool;
  active: boolean;
  hint: string;
  /** Falta algo para usarla (por ejemplo, el Taller de nivel 10 del Reforzar II). */
  locked?: boolean;
}

/** "A", "A y B", "A, B y C". */
function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
}

export interface RoomButton {
  id: string;
  name: string;
  hotkey: string;
  costPerTile: number;
  /** Cuánto sube el precio cada tile extra de la misma sala (20 = +20 %). */
  growthPercent: number;
  /** Coste de la sala más pequeña posible. */
  minCost: number;
  minSize: string;
  /** Tiles máximos por sala (su nivel máximo). */
  maxTiles: number;
  affordable: boolean;
  /** Nombres de las salas que faltan por construir antes de poder construir esta (vacío si ninguna). */
  requires: string;
  /** Ya se cumplen sus requisitos de salas. */
  available: boolean;
  active: boolean;
}

export interface TrapButton {
  id: string;
  name: string;
  hotkey: string;
  cost: number;
  /** Nombre de la sala que hay que tener construida para colocarla. */
  requires: string;
  /** El jugador ya tiene esa sala. */
  available: boolean;
  affordable: boolean;
  active: boolean;
}

export interface SpellButton {
  id: string;
  name: string;
  hotkey: string;
  /** A qué se apunta: un tile o una criatura propia. */
  target: 'tile' | 'creature';
  hint: string;
  cost: number;
  affordable: boolean;
  /** Segundos que faltan para poder volver a lanzarlo (0 si está listo). */
  cooldownLeft: number;
  active: boolean;
}

export interface CreatureRow {
  id: number;
  name: string;
  level: number;
  band: string;
  bandName: string;
  glyph: string;
  mood: number;
  hp: number;
  hpFraction: number;
  activity: string;
  held: boolean;
  /** Está en combate: no se puede retirar del mapa. */
  inCombat: boolean;
  /** Derrotada y aturdida: segundos que le quedan antes de morir (`null` si no lo está). */
  downedSeconds: number | null;
}

export interface GameOverInfo {
  outcome: 'victory' | 'defeat' | 'draw';
  title: string;
  detail: string;
}

export interface HudModel {
  gold: number;
  goldCapacity: number;
  goldFull: boolean;
  mana: number;
  manaMax: number;
  manaRegen: number;
  /** De dónde sale el maná por segundo (tooltip de la barra). */
  manaHint: string;
  imps: number;
  impsMax: number;
  /** Imps propios que holgazanean ahora (sin hacer nada hasta que se les abofetee). */
  impsLoafing: number;
  /** Criaturas vivas y máximo actual (camas, Portal y tope global). */
  population: { count: number; max: number; full: boolean; hint: string };
  /** Cerditos de los Criaderos (`null` si no tienes Criadero). */
  piglets: { count: number; cap: number; hint: string } | null;
  clock: string;
  tools: ToolButton[];
  rooms: RoomButton[];
  traps: TrapButton[];
  /** Puertas (se construyen como trampas pero no se disparan). */
  doors: TrapButton[];
  spells: SpellButton[];
  creatures: CreatureRow[];
  /** Resultado de la partida si ya terminó, desde el punto de vista del jugador local. */
  gameOver: GameOverInfo | null;
  /** Se puede mostrar el botón de rendirse (hay rival y la partida sigue). */
  canSurrender: boolean;
  /** Criaturas en la mano y su capacidad. */
  hand: { count: number; capacity: number };
  /** Segundos que faltan para el próximo día de pago. */
  payday: number;
  /** Llamada a las armas en marcha: segundos que le quedan (`null` si no hay). */
  rally: { secondsLeft: number } | null;
  notices: string[];
}

/** Cuánto dura un aviso en pantalla, en segundos de juego, y cuántos se ven a la vez. */
export const NOTICE_SECONDS = 5;
export const NOTICES_VISIBLE = 3;

const sameTool = (a: Tool, b: Tool) => JSON.stringify(a) === JSON.stringify(b);

/** Texto de fin de partida para el jugador local. */
export function gameOverInfo(
  state: MatchState,
  playerId: number,
  tickRate: number,
): GameOverInfo | null {
  const r = state.result;
  if (!r) return null;
  const minutes = formatClock(r.tick, tickRate);
  if (r.winners.length > 1) {
    return {
      outcome: 'draw',
      title: 'Empate',
      detail: `La partida terminó en empate a los ${minutes}.`,
    };
  }
  if (r.winners[0] === playerId) {
    const how =
      r.reason === 'timeout'
        ? 'Ganaste por desempate al agotarse el tiempo.'
        : 'Eres el último Corazón en pie.';
    return { outcome: 'victory', title: '¡Victoria!', detail: `${how} Duración: ${minutes}.` };
  }
  return {
    outcome: 'defeat',
    title: 'Derrota',
    detail: `Tu Corazón ha caído. Duración: ${minutes}.`,
  };
}

export function formatClock(tick: number, tickRate: number): string {
  const total = Math.floor(tick / tickRate);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "Base 12,1 + Templo 30 + Bibliotecas 5 por segundo". */
function manaHint(state: MatchState, rules: ReturnType<typeof rulesOf>, playerId: number): string {
  const temple = templeManaPerSecond(state, rules, playerId);
  const pulses = manaPulsePerSecond(state, rules, playerId);
  const base = manaRegenPerSecond(state, rules, playerId) - temple;
  const parts = [`Territorio ${base.toFixed(1)}`];
  if (temple > 0) parts.push(`Templo ${temple.toFixed(0)}`);
  if (pulses > 0) parts.push(`Bibliotecas de nivel alto ${pulses.toFixed(1)}`);
  return `Maná por segundo: ${parts.join(' + ')}`;
}

/** Cerditos para el HUD: cuántos hay, el tope y qué hacen. */
function pigletsModel(
  state: MatchState,
  rules: ReturnType<typeof rulesOf>,
  playerId: number,
): HudModel['piglets'] {
  const def = rules.roomDefs['hatchery'];
  if (
    !def?.pigletIntervalSeconds ||
    !state.rooms.some((r) => r.owner === playerId && r.type === 'hatchery')
  )
    return null;
  const heal = Math.round((def.pigletHealFraction ?? 0) * 100);
  const below = Math.round((def.pigletEatBelowHpFraction ?? 0) * 100);
  return {
    count: pigletCount(state, playerId),
    cap: pigletCap(state, rules, playerId),
    hint: `Cerditos: cada tile de Criadero cría uno cada ${def.pigletIntervalSeconds} s (hasta ${def.pigletCapPerMaxCreature} por criatura de la población máxima). Una criatura con menos del ${below} % de vida se come uno y recupera el ${heal} % de su vida máxima.`,
  };
}

/** Población para el HUD: "6/9" y de dónde sale el máximo. */
export function populationModel(
  state: MatchState,
  rules: ReturnType<typeof rulesOf>,
  playerId: number,
): HudModel['population'] {
  const p = populationOf(state, rules, playerId);
  const parts = [`camas libres ${p.freeBeds}`, `tope ${p.globalCap}`, `Portal ${p.portalCap}`];
  const limit =
    p.max === p.portalCap && p.portalCap <= p.globalCap
      ? 'Limita el Portal.'
      : p.bedCap !== null && p.max === p.bedCap
        ? 'Limitan las camas: construye más Guarida.'
        : 'Limita el tope global.';
  return {
    count: p.count,
    max: p.max,
    full: p.count >= p.max,
    hint: `Criaturas ${p.count} de ${p.max} (${parts.join(' · ')}). ${limit}`,
  };
}

export function buildHudModel(
  state: MatchState,
  data: DataSet,
  playerId: number,
  tool: Tool,
  notices: readonly Notice[],
): HudModel {
  const rules = rulesOf(data);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`No existe el jugador ${playerId}`);
  const capacity = treasuryCapacity(state, rules, playerId);

  // Datos de los muros reforzados (tiempos y requisito), para no escribir números en los textos.
  const wall1 = data.terrain.find((t) => t.wallLevel === 1) ?? { digSeconds: 0 };
  const wall2 = data.terrain.find((t) => t.wallLevel === 2);
  const wall2Need = data.terrain.find((t) => t.becomesOnReinforce === wall2?.id)?.reinforceRequires;
  const wall2Name = data.rooms.find((r) => r.id === wall2Need?.room)?.name ?? '';
  const wall2Locked =
    wall2Need !== undefined && maxRoomLevel(state, playerId, wall2Need.room) < wall2Need.minLevel;
  const wall2Req = wall2Need ? `${wall2Name} de nivel ${wall2Need.minLevel}` : '';
  const toolDefs: Array<{
    id: string;
    label: string;
    hotkey: string;
    tool: Tool;
    hint: string;
    locked?: boolean;
  }> = [
    {
      id: 'dig',
      label: 'Excavar',
      hotkey: 'Clic',
      tool: { kind: 'dig' },
      hint: 'Arrastra sobre la tierra o las vetas de oro',
    },
    {
      id: 'claim',
      label: 'Reclamar',
      hotkey: 'C',
      tool: { kind: 'claim' },
      hint: 'Convierte el suelo en tuyo',
    },
    {
      id: 'reinforce',
      label: 'Reforzar',
      hotkey: 'F',
      tool: { kind: 'reinforce' },
      hint: `Muro reforzado I: un rival tarda ${wall1.digSeconds ?? 0} s por Imp en derribarlo`,
    },
    {
      id: 'reinforce2',
      label: 'Reforzar II',
      hotkey: 'V',
      tool: { kind: 'reinforce', level: 2 },
      hint: wall2Locked
        ? `Mejora un muro reforzado a nivel 2 (${wall2?.digSeconds ?? 0} s por Imp para derribarlo). Pide ${wall2Req}.`
        : `Mejora un muro reforzado a nivel 2: un rival tarda ${wall2?.digSeconds ?? 0} s por Imp en derribarlo`,
      locked: wall2Locked,
    },
    {
      id: 'cancelDig',
      label: 'Quitar marca',
      hotkey: 'U',
      tool: { kind: 'cancelDig' },
      hint: 'Cancela las excavaciones marcadas',
    },
    {
      id: 'sell',
      label: 'Vender',
      hotkey: 'Supr',
      tool: { kind: 'sell' },
      hint: 'Devuelve el 50 % del coste',
    },
  ];

  const buildable = data.rooms.filter((r) => r.buildable);
  const rooms: RoomButton[] = buildable.map((r, i) => {
    const minTiles = r.minSize.w * r.minSize.h;
    const missing = missingRooms(state, playerId, r.requiresRooms);
    return {
      id: r.id,
      name: r.name,
      hotkey: roomHotkey(i),
      costPerTile: r.goldPerTile,
      growthPercent: Math.round((data.economy.roomCostGrowthPerTile - 1) * 100),
      minCost: r.goldPerTile * minTiles,
      minSize: `${r.minSize.w}×${r.minSize.h}`,
      maxTiles: r.maxTiles ?? 0,
      affordable: player.gold >= r.goldPerTile * minTiles,
      requires: joinNames(missing.map((id) => data.rooms.find((x) => x.id === id)?.name ?? id)),
      available: missing.length === 0,
      active: tool.kind === 'build' && tool.room === r.id,
    };
  });

  const trapButton = (t: DataSet['traps'][number], hotkey: string): TrapButton => ({
    id: t.id,
    name: t.name,
    hotkey,
    cost: t.goldCost,
    requires: joinNames(
      missingRooms(state, playerId, t.requiresRooms).map(
        (id) => data.rooms.find((r) => r.id === id)?.name ?? id,
      ),
    ),
    available: missingRooms(state, playerId, t.requiresRooms).length === 0,
    affordable: player.gold >= t.goldCost,
    active: tool.kind === 'trap' && tool.trap === t.id,
  });
  const armed = data.traps.filter((t) => t.family !== 'door');
  const doorDefs = data.traps.filter((t) => t.family === 'door');
  const traps: TrapButton[] = armed.map((t, i) => trapButton(t, trapHotkey(i)));
  const doors: TrapButton[] = doorDefs.map((t, i) => trapButton(t, doorHotkey(i)));

  const SPELL_KEYS = ['Q', 'W', 'E', 'R', 'T'];
  const SPELL_HINTS: Record<string, string> = {
    createImp: 'Crea un Imp en suelo propio. Cada Imp extra cuesta 50 más.',
    callToArms:
      'Todas tus criaturas disponibles acuden al punto marcado durante 20 s. Se puede cancelar (Y) para que sigan con lo suyo.',
    haste: 'Una criatura propia se mueve y ataca un 50 % más rápido durante 20 s.',
    heal: 'Cura el 40 % de la vida máxima de una criatura propia en 3 s.',
    lightning: 'Daña con 600 a los enemigos en 1,5 tiles. No toca salas ni el Corazón.',
  };
  const spells: SpellButton[] = data.spells.map((sp, i) => {
    const cost = sp.effect.type === 'spawnImp' ? createImpCost(state, rules, playerId) : sp.mana;
    const readyAt = player.cooldowns[sp.id] ?? 0;
    return {
      id: sp.id,
      name: sp.name,
      hotkey: SPELL_KEYS[i] ?? '',
      target: sp.target === 'ownCreature' ? 'creature' : 'tile',
      hint: SPELL_HINTS[sp.id] ?? sp.name,
      cost,
      affordable: player.mana >= cost,
      cooldownLeft: Math.max(0, (readyAt - state.tick) / data.global.tickRate),
      active: tool.kind === 'spell' && tool.spell === sp.id,
    };
  });

  const rows: CreatureRow[] = state.creatures
    .filter((c) => c.owner === playerId)
    .map((c) => {
      const band = rules.bands.find((b) => b.id === c.band);
      return {
        id: c.id,
        name: rules.creatureDefs[c.type]?.name ?? c.type,
        level: c.level,
        band: c.band,
        bandName: band?.name ?? '',
        glyph: moodIconOf(c.band).glyph,
        mood: Math.round(c.mood),
        hp: Math.round(c.hp),
        hpFraction: hpFraction(c, creatureMaxHp(rules, c)),
        activity: activityLabel(c),
        held: c.held,
        inCombat: isInCombat(state, rules, c),
        downedSeconds:
          c.downedUntil > 0
            ? Math.max(0, (c.downedUntil - state.tick) / data.global.tickRate)
            : null,
      };
    });

  return {
    gold: Math.floor(player.gold),
    goldCapacity: capacity,
    goldFull: capacity > 0 && player.gold >= capacity - 0.5,
    mana: Math.floor(player.mana),
    manaMax: data.global.mana.max,
    // Lo continuo más el promedio de los pulsos de las Bibliotecas de nivel alto.
    manaRegen:
      manaRegenPerSecond(state, rules, playerId) + manaPulsePerSecond(state, rules, playerId),
    manaHint: manaHint(state, rules, playerId),
    imps: impCount(state, playerId),
    impsMax: data.global.imps.max,
    impsLoafing: state.imps.filter((i) => i.owner === playerId && i.loafUntil > state.tick).length,
    population: populationModel(state, rules, playerId),
    piglets: pigletsModel(state, rules, playerId),
    clock: formatClock(state.tick, data.global.tickRate),
    tools: toolDefs.map((t) => ({ ...t, active: sameTool(t.tool, tool) })),
    rooms,
    traps,
    doors,
    spells,
    creatures: rows,
    gameOver: gameOverInfo(state, playerId, data.global.tickRate),
    canSurrender: state.players.length > 1 && state.status === 'playing' && !player.eliminated,
    hand: { count: player.hand.length, capacity: data.global.hand.capacity },
    payday: Math.max(0, (state.nextPayTick - state.tick) / data.global.tickRate),
    rally:
      player.rallyTile >= 0 && state.tick < player.rallyUntil
        ? { secondsLeft: (player.rallyUntil - state.tick) / data.global.tickRate }
        : null,
    notices: notices.map((n) => n.text),
  };
}
