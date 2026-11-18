/**
 * pnpm validate-data
 * Valida todos los JSON de /data/mvp contra sus esquemas y sus referencias cruzadas.
 * Sale con código 1 si algo falla (la CI lo usa).
 */
import { formatDataErrors } from '@dm/shared';
import { DEFAULT_DATA_DIR, loadDataFromDisk } from '@dm/shared/node';

const dir = process.argv[2] ?? DEFAULT_DATA_DIR;
const result = loadDataFromDisk(dir);

if (!result.ok) {
  console.error(`✗ Los datos de ${dir} tienen ${result.errors.length} error(es):\n`);
  console.error(formatDataErrors(result.errors));
  process.exit(1);
}

const d = result.data;
console.log(`✓ Datos válidos en ${dir}`);
console.log(
  `  ${d.terrain.length} terrenos · ${d.rooms.length} salas · ${d.creatures.length} criaturas · ` +
    `${d.spells.length} hechizos · ${d.mood.bands.length} bandas de ánimo · mapa ${d.map.id} ` +
    `(${d.map.width}×${d.map.height}, ${d.map.bases.length} bases)`,
);
