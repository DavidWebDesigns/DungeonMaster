/**
 * Eliminación, victoria, empate y desempate por tiempo (sección 6.3).
 */
import { syncDoors } from './doors';
import { creatureMaxHp } from './creatureStats';
import { removeCreature } from './needs';
import type { Rules } from './rules';
import type { MatchResult, MatchState, PlayerId, PlayerState, SimEvent } from './types';

/**
 * Saca a un jugador de la partida: sus criaturas e Imps mueren, sus salas y su suelo pasan a ser neutrales
 * y su oro desaparece.
 */
export function eliminatePlayer(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  events: SimEvent[],
): void {
  if (player.eliminated) return;
  player.eliminated = true;
  player.heartHp = Math.min(player.heartHp, 0);
  player.gold = 0;
  player.hand = [];
  player.rallyTile = -1;
  for (const c of state.creatures.filter((k) => k.owner === player.id)) {
    removeCreature(state, c.id);
    events.push({
      type: 'creatureDied',
      playerId: player.id,
      creatureId: c.id,
      cause: 'eliminated',
    });
  }
  for (const imp of state.imps.filter((i) => i.owner === player.id)) {
    events.push({ type: 'impDied', playerId: player.id, impId: imp.id });
  }
  state.imps = state.imps.filter((i) => i.owner !== player.id);
  state.tasks = state.tasks.filter((t) => t.owner !== player.id);
  state.rooms = state.rooms.filter((r) => r.owner !== player.id);
  state.traps = state.traps.filter((t) => t.owner !== player.id);
  syncDoors(state, rules);
  const neutral = rules.neutralTerrain;
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] !== player.id) continue;
    state.owner[i] = 0;
    state.roomAt[i] = 0;
    state.tileDamage[i] = 0;
    if (neutral !== undefined && rules.walkable[state.terrain[i] as number])
      state.terrain[i] = neutral;
    events.push({ type: 'tileChanged', tile: i });
  }
  state.mapVersion++;
  events.push({ type: 'eliminated', playerId: player.id });
}

/** Valores de desempate de un jugador: fracción de vida del Corazón, poder de criaturas y oro. */
export function tiebreakValues(
  state: MatchState,
  rules: Rules,
  p: PlayerState,
): Record<string, number> {
  const power = state.creatures
    .filter((c) => c.owner === p.id)
    .reduce((n, c) => n + creatureMaxHp(rules, c), 0);
  return {
    heartHpFraction: Math.max(0, p.heartHp) / rules.data.global.heart.hp,
    creaturePower: power,
    gold: p.gold,
  };
}

/** Entre los jugadores que quedan, quién gana por desempate (varios si empatan en todo). */
export function tiebreakWinners(
  state: MatchState,
  rules: Rules,
  players: PlayerState[],
): PlayerId[] {
  let left = players;
  for (const key of rules.data.global.tiebreak) {
    const values = left.map((p) => tiebreakValues(state, rules, p)[key] as number);
    const best = Math.max(...values);
    left = left.filter((_, i) => Math.abs((values[i] as number) - best) < 1e-9);
    if (left.length === 1) break;
  }
  return left.map((p) => p.id);
}

function finish(state: MatchState, result: MatchResult, events: SimEvent[]): void {
  state.status = 'ended';
  state.result = result;
  events.push({ type: 'gameOver', result });
}

/** Paso 10 del tick: elimina a quien no tiene Corazón y comprueba victoria, empate o fin de tiempo. */
export function tickVictory(state: MatchState, rules: Rules, events: SimEvent[]): void {
  if (state.status === 'ended') return;
  const justEliminated: PlayerId[] = [];
  for (const p of state.players) {
    if (!p.eliminated && p.heartHp <= 0) {
      eliminatePlayer(state, rules, p, events);
      justEliminated.push(p.id);
    }
  }
  // Una partida de un solo jugador (sandbox) no termina nunca por victoria.
  if (state.players.length < 2) return;
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length === 1) {
    finish(state, { winners: [alive[0]!.id], reason: 'lastStanding', tick: state.tick }, events);
  } else if (alive.length === 0) {
    // Los últimos Corazones cayeron en el mismo tick: empate entre ellos.
    finish(state, { winners: justEliminated, reason: 'draw', tick: state.tick }, events);
  } else if (
    state.tick >= Math.round(rules.data.global.match.maxMinutes * 60 * rules.data.global.tickRate)
  ) {
    const winners = tiebreakWinners(state, rules, alive);
    finish(
      state,
      { winners, reason: winners.length > 1 ? 'draw' : 'timeout', tick: state.tick },
      events,
    );
  }
}
