/**
 * Lo que muestra el HUD, calculado a partir del estado de la simulación. Función pura y probada;
 * los componentes solo lo pintan.
 */
import {
  createImpCost,
  creatureMaxHp,
  impCount,
  manaRegenPerSecond,
  rulesOf,
  treasuryCapacity,
  type DataSet,
  type MatchState,
} from '@dm/shared';
import type { Tool } from '../input/inputModel';
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
  active: boolean;
}

export interface SpellButton {
  id: string;
  name: string;
  hotkey: string;
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
  spell: SpellButton;
  creatures: CreatureRow[];
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
    return {
      id: r.id,
      name: r.name,
      hotkey: String(i + 1),
      costPerTile: r.goldPerTile,
      minCost: r.goldPerTile * minTiles,
      minSize: `${r.minSize.w}×${r.minSize.h}`,
      affordable: player.gold >= r.goldPerTile * minTiles,
      active: tool.kind === 'build' && tool.room === r.id,
    };
  });

  const spellDef = rules.spells['createImp'];
  const cost = createImpCost(state, rules, playerId);
  const readyAt = player.cooldowns['createImp'] ?? 0;
  const spell: SpellButton = {
    id: 'createImp',
    name: spellDef?.name ?? 'Crear Imp',
    hotkey: 'Q',
    cost,
    affordable: player.mana >= cost,
    cooldownLeft: Math.max(0, (readyAt - state.tick) / data.global.tickRate),
    active: tool.kind === 'spell' && tool.spell === 'createImp',
  };

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
    spell,
    creatures: rows,
    hand: { count: player.hand.length, capacity: data.global.hand.capacity },
    payday: Math.max(0, (state.nextPayTick - state.tick) / data.global.tickRate),
    notices: notices.map((n) => n.text),
  };
}
