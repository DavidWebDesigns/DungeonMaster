/**
 * pnpm gen-map
 * Regenera data/mvp/maps/map-4p-01.json a partir de tools/gen-map/generate.ts.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DATA_DIR } from '@dm/shared/node';
import { generateMap } from './generate';

const map = generateMap();
const out = join(DEFAULT_DATA_DIR, 'maps', `${map.id}.json`);
writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

console.log(`Mapa "${map.name}" (${map.width}×${map.height}) escrito en ${out}`);
console.log(map.rows.join('\n'));
