/**
 * Convierte lo que pasó en la simulación (eventos y cambios de estado) en efectos de "game feel":
 * partículas y sonidos. Pura: no dibuja ni suena nada, solo decide qué debe pasar.
 */
import type { DataSet, MatchState, SimEvent } from '@dm/shared';
import type { RGB } from '../render/palette';
import { playerColor } from '../render/palette';

export type SoundName =
  | 'click'
  | 'dig'
  | 'coin'
  | 'deposit'
  | 'claim'
  | 'build'
  | 'sell'
  | 'pop'
  | 'error'
  | 'slap'
  | 'levelup'
  | 'payday'
  | 'pickup'
  | 'hit'
  | 'death'
  | 'zap'
  | 'horn'
  | 'gameover'
  | 'trap';

export type Effect =
  | {
      type: 'burst';
      x: number;
      y: number;
      z: number;
      color: RGB;
      count: number;
      speed: number;
      up: number;
      size: number;
    }
  | { type: 'sound'; sound: SoundName; volume: number };

/** Lo que hay que recordar de un tick al siguiente para detectar cambios. */
export interface FeelSnapshot {
  terrain: number[];
  owner: number[];
  carry: Map<number, number>;
}

export function takeSnapshot(state: MatchState): FeelSnapshot {
  return {
    terrain: state.terrain.slice(),
    owner: state.owner.slice(),
    carry: new Map(state.imps.map((i) => [i.id, i.carry])),
  };
}

const DIRT: RGB = [0.45, 0.3, 0.18];
const GOLD: RGB = [0.98, 0.82, 0.2];
const STEEL: RGB = [0.5, 0.52, 0.62];
const DUST: RGB = [0.6, 0.55, 0.5];
const PURPLE: RGB = [0.7, 0.4, 1];

/** Cada cuántos ticks suelta una moneda un Imp que está minando (para no llenar la pantalla). */
const COIN_EVERY_TICKS = 3;

export function deriveEffects(
  prev: FeelSnapshot,
  state: MatchState,
  data: DataSet,
  events: readonly SimEvent[],
  localPlayer: number,
  /** Si se indica, los golpes y hechizos que pasan fuera de la vista del jugador no se dibujan ni suenan. */
  visibleAt?: (x: number, y: number) => boolean,
): Effect[] {
  const out: Effect[] = [];
  const burst = (
    x: number,
    y: number,
    z: number,
    color: RGB,
    count: number,
    speed: number,
    up: number,
    size: number,
  ) => out.push({ type: 'burst', x, y, z, color, count, speed, up, size });
  const impById = new Map(state.imps.map((i) => [i.id, i]));

  // Tiles que cambiaron: muro que se abre, suelo que se reclama.
  const seen = new Set<number>();
  for (const e of events) {
    if (e.type !== 'tileChanged' || seen.has(e.tile)) continue;
    seen.add(e.tile);
    const x = (e.tile % state.width) + 0.5;
    const z = Math.floor(e.tile / state.width) + 0.5;
    const before = data.terrain[prev.terrain[e.tile] as number];
    const after = data.terrain[state.terrain[e.tile] as number];
    if (before && after && !before.walkable && after.walkable) {
      const color = before.goldPerTile !== undefined ? GOLD : DIRT;
      burst(x, 0.5, z, color, 14, 2.2, 2.5, 0.16);
      out.push({ type: 'sound', sound: 'dig', volume: 1 });
    } else if (before && after && !before.walkable && !after.walkable) {
      // Refuerzo: chispas de acero.
      burst(x, 0.9, z, STEEL, 8, 1.6, 1.5, 0.12);
    } else if (
      (prev.owner[e.tile] as number) !== (state.owner[e.tile] as number) &&
      state.owner[e.tile] !== 0
    ) {
      burst(x, 0.2, z, playerColor(state.owner[e.tile] as number), 4, 0.8, 1.2, 0.1);
      out.push({ type: 'sound', sound: 'claim', volume: 0.5 });
    }
  }

  const seesAt = (x: number, y: number) => visibleAt === undefined || visibleAt(x, y);
  for (const e of events) {
    // Combate y hechizos: se ven los de cualquiera, pero solo si ocurren dentro de la vista.
    if (e.type === 'hit') {
      if (!seesAt(e.x, e.y)) continue;
      const heart = e.targetKind === 'heart';
      burst(
        e.x,
        0.6,
        e.y,
        heart ? [1, 0.2, 0.2] : e.targetKind === 'room' ? DUST : [0.95, 0.25, 0.2],
        heart ? 10 : 5,
        1.4,
        2,
        heart ? 0.16 : 0.1,
      );
      out.push({ type: 'sound', sound: 'hit', volume: 0.6 });
      continue;
    }
    if (e.type === 'tileDestroyed') {
      const x = (e.tile % state.width) + 0.5;
      const z = Math.floor(e.tile / state.width) + 0.5;
      if (!seesAt(x, z)) continue;
      burst(x, 0.3, z, DUST, 14, 1.8, 2.4, 0.18);
      out.push({ type: 'sound', sound: 'death', volume: 0.8 });
      continue;
    }
    if (e.type === 'spellCast') {
      if (!seesAt(e.x, e.y)) continue;
      if (e.spell === 'lightning') {
        burst(e.x, 1.2, e.y, [1, 0.95, 0.4], 24, 2.2, 4, 0.14);
        out.push({ type: 'sound', sound: 'zap', volume: 1 });
      } else if (e.spell === 'callToArms') {
        burst(e.x, 0.8, e.y, [0.5, 0.7, 1], 16, 1.8, 3, 0.14);
        out.push({ type: 'sound', sound: 'horn', volume: 1 });
      } else if (e.spell === 'haste') {
        burst(e.x, 0.8, e.y, [0.5, 0.8, 1], 10, 1.2, 2, 0.1);
      } else if (e.spell === 'heal') {
        burst(e.x, 0.8, e.y, [0.4, 1, 0.5], 10, 1.2, 2.6, 0.1);
      }
      continue;
    }
    if (e.type === 'creatureDied' && e.cause !== 'starvation') {
      if (e.cause === 'eliminated') continue;
      out.push({ type: 'sound', sound: 'death', volume: 0.7 });
      continue;
    }
    if (e.type === 'trapTriggered') {
      if (!seesAt(e.x, e.y)) continue;
      const blast = e.trap === 'blastTrap';
      burst(
        e.x,
        0.5,
        e.y,
        blast ? [1, 0.55, 0.2] : [0.85, 0.85, 0.9],
        blast ? 26 : 12,
        blast ? 2.6 : 1.8,
        3.2,
        blast ? 0.18 : 0.12,
      );
      out.push({ type: 'sound', sound: 'trap', volume: 1 });
      continue;
    }
    if (e.type === 'trapBuilt') {
      if (e.playerId !== localPlayer) continue;
      const x = (e.tile % state.width) + 0.5;
      const z = Math.floor(e.tile / state.width) + 0.5;
      burst(x, 0.3, z, DUST, 6, 1.2, 1.5, 0.12);
      out.push({ type: 'sound', sound: 'build', volume: 0.6 });
      continue;
    }
    if (e.type === 'gameOver') {
      out.push({ type: 'sound', sound: 'gameover', volume: 1 });
      continue;
    }
    if ('playerId' in e && e.playerId !== localPlayer) continue;
    switch (e.type) {
      case 'goldDeposited': {
        const imp = impById.get(e.impId);
        if (imp)
          burst(
            imp.x,
            0.8,
            imp.y,
            GOLD,
            Math.min(14, 4 + Math.floor(e.amount / 40)),
            1.8,
            3.2,
            0.13,
          );
        out.push({ type: 'sound', sound: 'deposit', volume: 1 });
        break;
      }
      case 'roomBuilt': {
        const room = state.rooms.find((r) => r.id === e.roomId);
        if (room) {
          for (const t of room.tiles)
            burst(
              (t % state.width) + 0.5,
              0.2,
              Math.floor(t / state.width) + 0.5,
              DUST,
              2,
              1.2,
              1.5,
              0.14,
            );
        }
        out.push({ type: 'sound', sound: 'build', volume: 1 });
        break;
      }
      case 'roomSold':
        out.push({ type: 'sound', sound: 'sell', volume: 1 });
        break;
      case 'impSpawned': {
        const imp = impById.get(e.impId);
        if (imp) burst(imp.x, 0.5, imp.y, PURPLE, 12, 1.6, 2.4, 0.13);
        out.push({ type: 'sound', sound: 'pop', volume: 1 });
        break;
      }
      case 'creatureArrived': {
        // Llega por el Portal: estallido morado donde aparece.
        const c = state.creatures.find((k) => k.id === e.creatureId);
        if (c) burst(c.x, 0.6, c.y, PURPLE, 14, 1.8, 2.8, 0.14);
        out.push({ type: 'sound', sound: 'pop', volume: 1 });
        break;
      }
      case 'slapped': {
        const c = state.creatures.find((k) => k.id === e.creatureId);
        if (c) burst(c.x, 0.8, c.y, [1, 1, 1], 8, 1.6, 2, 0.1);
        out.push({ type: 'sound', sound: 'slap', volume: 1 });
        break;
      }
      case 'levelUp': {
        const c = state.creatures.find((k) => k.id === e.creatureId);
        if (c) burst(c.x, 0.9, c.y, GOLD, 16, 1.4, 3.4, 0.12);
        out.push({ type: 'sound', sound: 'levelup', volume: 1 });
        break;
      }
      case 'creatureLeft':
        out.push({ type: 'sound', sound: 'error', volume: 0.8 });
        break;
      case 'commandRejected':
        out.push({ type: 'sound', sound: 'error', volume: 0.8 });
        break;
      default:
        break;
    }
  }

  // Día de pago: campanilla (no tiene jugador, es de toda la partida).
  if (events.some((e) => e.type === 'payday'))
    out.push({ type: 'sound', sound: 'payday', volume: 0.9 });

  // Monedas que saltan mientras un Imp mina (su carga sube).
  if (state.tick % COIN_EVERY_TICKS === 0) {
    for (const imp of state.imps) {
      if (imp.owner !== localPlayer) continue;
      const before = prev.carry.get(imp.id) ?? 0;
      if (imp.mode === 'working' && imp.carry > before) {
        burst(imp.x, 0.9, imp.y, GOLD, 2, 1.2, 2.6, 0.1);
        out.push({ type: 'sound', sound: 'coin', volume: 0.35 });
      }
    }
  }
  return out;
}
