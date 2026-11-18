/**
 * Marcador para scripts que llegan en fases posteriores (pnpm dev, sim, balance).
 * Uso: tsx tools/lib/not-yet.ts <comando> <fase>
 */
const [command = '?', phase = '?'] = process.argv.slice(2);
console.log(
  `"pnpm ${command}" todavía no existe: se construye en la fase ${phase} (ver docs/PLAN.md, sección 8).`,
);
