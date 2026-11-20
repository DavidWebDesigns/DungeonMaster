/**
 * Lo que muestra el HUD, calculado a partir del estado de la simulación. Función pura y probada;
 * los componentes solo lo pintan.
 */
import {
  createImpCost,
  creatureMaxHp,
  impCount,
  manaRegenPerSecond,
  missingRooms,
  rulesOf,
  treasuryCapacity,
  type DataSet,
  type MatchState,
} from '@dm/shared';
import type { Tool } from '../input/inputModel';
import { roomHotkey, trapHotkey } from '../input/keymap';
import { activityLabel, hpFraction, moodIconOf } from '../render/creatureStyle';
import type { Notice } from './notices';

export interface ToolButton {
  id: string;
  label: string;
  hotkey: string;
  tool: Tool;
  active: boolean;
  hint: string;
}

export interface RoomButton {
  id: string;
  name: string;
  hotkey: string;
  costPerTile: number;
  /** Coste de la sala más pequeña posible. */
  minCost: number;
  minSize: string;
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
  imps: number;
  impsMax: number;
  clock: string;
  tools: ToolButton[];
  rooms: RoomButton[];
  traps: TrapButton[];
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

  const toolDefs: Array<{ id: string; label: string; hotkey: string; tool: Tool; hint: string }> = [
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
      hint: 'Solo tú podrás excavar ese muro',
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
      minCost: r.goldPerTile * minTiles,
      minSize: `${r.minSize.w}×${r.minSize.h}`,
      affordable: player.gold >= r.goldPerTile * minTiles,
      requires: missing.map((id) => data.rooms.find((x) => x.id === id)?.name ?? id).join(' y '),
      available: missing.length === 0,
      active: tool.kind === 'build' && tool.room === r.id,
    };
  });

  const traps: TrapButton[] = data.traps.map((t, i) => ({
    id: t.id,
    name: t.name,
    hotkey: trapHotkey(i),
    cost: t.goldCost,
    requires: data.rooms.find((r) => r.id === t.requiresRoom)?.name ?? t.requiresRoom,
    available: state.rooms.some((r) => r.owner === playerId && r.type === t.requiresRoom),
    affordable: player.gold >= t.goldCost,
    active: tool.kind === 'trap' && tool.trap === t.id,
  }));

  const SPELL_KEYS = ['Q', 'W', 'E', 'R', 'T'];
  const SPELL_HINTS: Record<string, string> = {
    createImp: 'Crea un Imp en suelo propio. Cada Imp extra cuesta 50 más.',
    callToArms: 'Todas tus criaturas disponibles acuden al punto marcado durante 20 s.',
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
      };
    });

  return {
    gold: Math.floor(player.gold),
    goldCapacity: capacity,
    goldFull: capacity > 0 && player.gold >= capacity - 0.5,
    mana: Math.floor(player.mana),
    manaMax: data.global.mana.max,
    manaRegen: manaRegenPerSecond(state, rules, playerId),
    imps: impCount(state, playerId),
    impsMax: data.global.imps.max,
    clock: formatClock(state.tick, data.global.tickRate),
    tools: toolDefs.map((t) => ({ ...t, active: sameTool(t.tool, tool) })),
    rooms,
    traps,
    spells,
    creatures: rows,
    gameOver: gameOverInfo(state, playerId, data.global.tickRate),
    canSurrender: state.players.length > 1 && state.status === 'playing' && !player.eliminated,
    hand: { count: player.hand.length, capacity: data.global.hand.capacity },
    payday: Math.max(0, (state.nextPayTick - state.tick) / data.global.tickRate),
    notices: notices.map((n) => n.text),
  };
}
