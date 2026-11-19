/** Utilidades de prueba del servidor: carga los datos reales y reexporta lo que usan las pruebas. */
import { parseDataSet, type DataSet } from '@dm/shared';
import { realRawData } from '../../shared/src/data/testUtils';

export function loadGameDataForTests(): DataSet {
  const r = parseDataSet(realRawData());
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

export * from '@dm/shared';
