/**
 * Convierte lo que pasó en la simulación (eventos y cambios de estado) en efectos de "game feel":
 * partículas y sonidos. Pura: no dibuja ni suena nada, solo decide qué debe pasar.
 */
import { isVeinTerrain, type DataSet, type MatchState, type SimEvent } from '@dm/shared';
import type { RGB } from '../render/palette';
import { playerColor } from '../render/palette';
import type { CreatureAnimKind } from './anim';

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
  | 'trap'
  | 'alarm';

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
  | { type: 'sound'; sound: SoundName; volume: number }
  /** Atacan el Corazón del jugador local: temblor, pulso rojo y alarma. `strength` de 0 a 1. */
  | { type: 'heartAlert'; strength: number }
  /** Aplastar, soltar o destellar a una criatura. */
  | { type: 'creatureAnim'; creatureId: number; anim: CreatureAnimKind }
  /** La criatura murió (para que su modelo caiga y se desvanezca en vez de desaparecer). */
  | { type: 'creatureKilled'; creatureId: number }
  /** Texto que sube sobre un punto del mapa (en tiles). */
  | { type: 'floater'; x: number; y: number; text: string; color: string };

/** Lo que hay que recordar de un tick al siguiente para detectar cambios. */
export interface FeelSnapshot {
  terrain: number[];
  owner: number[];
  carry: Map<number, number>;
  /** Criaturas que estaban en la mano: al dejar de estarlo, se han soltado. */
  held: Set<number>;
}

export function takeSnapshot(state: MatchState): FeelSnapshot {
  return {
    terrain: state.terrain.slice(),
    owner: state.owner.slice(),
    carry: new Map(state.imps.map((i) => [i.id, i.carry])),
    held: new Set(state.creatures.filter((c) => c.held).map((c) => c.id)),
  };
}

const DIRT: RGB = [0.45, 0.3, 0.18];
const GOLD: RGB = [0.98, 0.82, 0.2];
const DIAMOND: RGB = [0.55, 0.95, 1];
const STEEL: RGB = [0.5, 0.52, 0.62];
const DUST: RGB = [0.6, 0.55, 0.5];
const PURPLE: RGB = [0.7, 0.4, 1];

/** Cada cuántos ticks suelta una moneda un Imp que está minando (para no llenar la pantalla). */
const COIN_EVERY_TICKS = 3;

/** Daño de un golpe al Corazón que hace temblar la pantalla al máximo (decoración, no cambia la partida). */
const HEART_SHAKE_DAMAGE = 400;

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
      const color = isVeinTerrain(before) ? (before.infinite ? DIAMOND : GOLD) : DIRT;
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
      if (heart && e.targetOwner === localPlayer) {
        out.push({
          type: 'heartAlert',
          strength: Math.min(1, 0.15 + e.damage / HEART_SHAKE_DAMAGE),
        });
        out.push({ type: 'sound', sound: 'alarm', volume: 0.7 });
      }
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
      out.push({ type: 'creatureKilled', creatureId: e.creatureId });
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
        if (c) {
          burst(c.x, 0.8, c.y, [1, 1, 1], 8, 1.6, 2, 0.1);
          out.push({ type: 'creatureAnim', creatureId: c.id, anim: 'slap' });
          out.push({
            type: 'floater',
            x: c.x,
            y: c.y,
            text: `+${Math.round(data.global.slap.workSpeedBonus * 100)}% velocidad`,
            color: '#ffe27a',
          });
        }
        out.push({ type: 'sound', sound: 'slap', volume: 1 });
        break;
      }
      case 'impSlapped': {
        const imp = impById.get(e.impId);
        if (imp) {
          burst(imp.x, 0.5, imp.y, [1, 1, 1], 8, 1.6, 2, 0.1);
          out.push({
            type: 'floater',
            x: imp.x,
            y: imp.y,
            text: `+${Math.round(data.global.slap.workSpeedBonus * 100)}% velocidad`,
            color: '#ffe27a',
          });
        }
        out.push({ type: 'sound', sound: 'slap', volume: 1 });
        break;
      }
      case 'levelUp': {
        const c = state.creatures.find((k) => k.id === e.creatureId);
        if (c) {
          burst(c.x, 0.9, c.y, GOLD, 16, 1.4, 3.4, 0.12);
          out.push({ type: 'creatureAnim', creatureId: c.id, anim: 'levelUp' });
          out.push({
            type: 'floater',
            x: c.x,
            y: c.y,
            text: `¡Nivel ${e.level}!`,
            color: '#ffd23a',
          });
        }
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

  // Criatura que estaba en la mano y ya no: cae con un pequeño impacto y polvo.
  for (const c of state.creatures) {
    if (c.held || !prev.held.has(c.id)) continue;
    burst(c.x, 0.15, c.y, DUST, 8, 1.3, 1.2, 0.12);
    out.push({ type: 'creatureAnim', creatureId: c.id, anim: 'drop' });
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
