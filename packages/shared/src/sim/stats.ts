/**
 * Estadísticas de una partida para la pantalla de resultados. Solo cuentan eventos que ya emite la simulación:
 * no cambian nada del juego. Las usan el servidor (partidas en red) y el sandbox (PvE local).
 */
import type { PlayerId, SimEvent } from './types';

export interface PlayerStats {
  /** Oro que sus Imps han llevado a la Tesorería. */
  goldMined: number;
  /** Criaturas que ha perdido (muertas, hambre o huidas), sin contar las de un jugador eliminado. */
  creaturesLost: number;
  /** Criaturas que han llegado a su mazmorra por el Portal. */
  creaturesAttracted: number;
  /** Daño que ha hecho a Corazones enemigos. */
  heartDamage: number;
}

export type MatchStats = Map<PlayerId, PlayerStats>;

export const emptyPlayerStats = (): PlayerStats => ({
  goldMined: 0,
  creaturesLost: 0,
  creaturesAttracted: 0,
  heartDamage: 0,
});

export function newMatchStats(playerIds: readonly PlayerId[]): MatchStats {
  return new Map(playerIds.map((id) => [id, emptyPlayerStats()]));
}

/** Suma lo que ocurrió en un tick. Los jugadores que no estén en el mapa se ignoran. */
export function countStats(stats: MatchStats, events: readonly SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'goldDeposited': {
        const s = stats.get(e.playerId);
        if (s) s.goldMined += e.amount;
        break;
      }
      case 'creatureDied':
      case 'creatureLeft': {
        if (e.type === 'creatureDied' && e.cause === 'eliminated') break;
        const s = stats.get(e.playerId);
        if (s) s.creaturesLost++;
        break;
      }
      case 'creatureArrived': {
        const s = stats.get(e.playerId);
        if (s) s.creaturesAttracted++;
        break;
      }
      case 'hit': {
        if (e.targetKind !== 'heart' || e.targetOwner === e.attackerOwner) break;
        const s = stats.get(e.attackerOwner);
        if (s) s.heartDamage += e.damage;
        break;
      }
      default:
        break;
    }
  }
}
