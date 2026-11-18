import type { DataSet } from '../data';
import { runQueuedCommands } from './applyCommand';
import { tickEconomy } from './economy';
import { assignTasks, updateImps } from './imps';
import { rulesOf } from './rules';
import type { MatchState, SimEvent } from './types';

/**
 * Avanza la partida un tick (100 ms). Orden fijo (sección 6.5), en lo que existe en la fase 1:
 * 1 comandos, 2 maná, 3 asignar tareas a los Imps, 6 rutas, movimiento y trabajo.
 * Los pasos 4, 5, 7 a 10 llegan con criaturas, combate y victoria (fases 3 y 4).
 * Devuelve los eventos del tick para el cliente; no forman parte del estado.
 */
export function step(state: MatchState, data: DataSet): SimEvent[] {
  const rules = rulesOf(data);
  const events: SimEvent[] = [];
  runQueuedCommands(state, rules, events);
  tickEconomy(state, rules);
  assignTasks(state, rules);
  updateImps(state, rules, events);
  state.tick++;
  return events;
}
