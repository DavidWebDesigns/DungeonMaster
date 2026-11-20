import type { DataSet } from '../data';
import { tickAbilityState } from './abilities';
import { runQueuedCommands } from './applyCommand';
import { updateCreatures } from './behavior';
import { tickPayday, tickHatcheries } from './creatureEconomy';
import { tickEconomy } from './economy';
import { tickNeeds } from './needs';
import { updateCombat, processDeaths } from './combat';
import { updateSeen } from './fog';
import { tickPortals } from './portal';
import { tickSpells } from './spells';
import { updateTraps } from './traps';
import { tickVictory } from './victory';
import { assignTasks, updateImps } from './imps';
import { rulesOf } from './rules';
import type { MatchState, SimEvent } from './types';

/**
 * Avanza la partida un tick (100 ms). Orden fijo (sección 6.5), en lo que existe en la fase 1:
 * 1 comandos, 2 maná, pagos, pollos y Portal, 3 asignar tareas a los Imps, 4 necesidades y ánimo,
 * 5 y 6 decisiones, rutas, movimiento y trabajo de Imps y criaturas.
 * 7 combate, 8 hechizos y temporizadores, 9 muertes, 10 victoria y 11 visibilidad.
 * Cuando la partida termina, `step` ya no avanza.
 * Devuelve los eventos del tick para el cliente; no forman parte del estado.
 */
export function step(state: MatchState, data: DataSet): SimEvent[] {
  if (state.status === 'ended') return [];
  const rules = rulesOf(data);
  const events: SimEvent[] = [];
  runQueuedCommands(state, rules, events);
  tickEconomy(state, rules);
  tickPayday(state, rules, events);
  tickHatcheries(state, rules);
  tickPortals(state, rules, events);
  assignTasks(state, rules);
  tickNeeds(state, rules, events);
  tickAbilityState(state);
  // Los cálculos de ruta por tick y jugador se reparten entre Imps y criaturas (los Imps primero).
  const budgets = new Map<number, number>();
  for (const p of state.players)
    budgets.set(p.id, rules.data.global.pathfinding.maxPerTickPerPlayer);
  updateImps(state, rules, events, budgets);
  updateCreatures(state, rules, events, budgets);
  updateCombat(state, rules, events);
  updateTraps(state, rules, events);
  tickSpells(state, rules);
  processDeaths(state, rules, events);
  tickVictory(state, rules, events);
  updateSeen(state, rules);
  state.tick++;
  return events;
}
