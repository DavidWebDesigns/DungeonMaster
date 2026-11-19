# Dungeon Master: reglas del proyecto

Juego de gestión de mazmorras multijugador para navegador. Lee docs/PLAN.md antes de cada fase.

## Estado actual

- Fase 0 (cimientos): terminada. Puerta 0 cumplida.
- Fase 1 (núcleo de la simulación): terminada. Puerta 1 cumplida (`packages/shared/src/sim/gate1.test.ts`).
- Fase 2 (cliente gris jugable en local): implementada y probada (`pnpm dev`, `pnpm e2e`). Falta el playtest humano de sensaciones para cumplir la Puerta 2.
- Fase 3 (criaturas vivas): implementada y probada. Puerta 3 cubierta por pruebas (`sim/creatures.test.ts` y `sim/gate3.test.ts`). Falta el playtest humano de las fases 2 y 3.
- Fase 4 (combate, victoria, niebla, bots): implementada y probada. Puerta 4 pendiente solo en el reparto por esquina (docs/DUDAS.md #46 y #61), a propósito hasta tener la plantilla final de criaturas.
- Fase 5 (multijugador): implementada y probada con dos navegadores reales (lobby, partida, reconexión). Falta el Playtest #1 en red con 3 o 4 personas.
- Modo PvE (fase 6, en curso): `pnpm dev` abre por defecto tu mazmorra contra 3 bots en dificultad normal (`data/mvp/pve.json`). `?rivals=0..3`, `?difficulty=easy|normal|hard`, `?mode=solo|online`. P pausa y `[` `]` cambian la velocidad. El tutorial queda para después del MVP.
- Siguiente: playtest de las fases 2 a 5 y fase 6 (pulido). Propón archivos y pruebas antes de escribir código.

## Reglas de arquitectura

- Toda la lógica de juego vive en packages/shared. Es TypeScript puro: sin DOM, sin Babylon, sin Colyseus, sin Date.now(), sin Math.random(). ESLint lo hace cumplir.
- Única excepción: packages/shared/src/node/ (utilidades de Node como leer /data del disco). El navegador nunca la importa.
- El servidor es autoritativo. El cliente solo envía comandos y dibuja deltas. El cliente nunca cambia estado de juego por su cuenta.
- Ningún número de juego va en el código. Todo sale de /data/mvp/\*.json y se valida con zod al cargar (packages/shared/src/schemas + data/validateDataSet.ts).
- Si agregas un número nuevo al juego: añádelo al JSON, al esquema zod y, si referencia otros datos, a validateDataSet.ts, con una prueba que rompa ese dato.
- Toda aleatoriedad pasa por el generador con semilla de la partida (mulberry32).
- Simulación a 10 ticks por segundo. Las entidades se recorren siempre en orden ascendente de id.
- Misma semilla + mismo registro de comandos = mismo resultado final. Hay un test que lo comprueba (desde la fase 1).

## Reglas de trabajo

- Trabaja por fases (docs/PLAN.md sección 8). No empieces una fase sin cumplir la puerta de la anterior.
- Antes de escribir código en una fase nueva, propón la lista de archivos y de pruebas y espera confirmación.
- Cada sistema nuevo lleva pruebas en Vitest. Una tarea no está terminada si `pnpm check` falla.
- Tareas pequeñas y verificables. Un commit por tarea completada, con mensaje en español.
- Si la especificación es ambigua, no inventes: anota la duda en docs/DUDAS.md, elige la opción más simple, márcala como [PROPUESTO] y sigue.

## Reglas de contenido

- Para añadir criaturas, salas, trampas o hechizos sigue `docs/CONTENIDO.md`: casi todo es datos y la prueba `content.test.ts` avisa de lo que falte.

- No uses nombres, textos ni assets de juegos comerciales existentes. El juego se llama Dungeon Master (nombre de trabajo).
- Los modelos 3D se referencian por modelId en assets/assetManifest.json. Si falta un modelo, usa un placeholder por rol.
- El mapa se edita en tools/gen-map/generate.ts y se regenera con `pnpm gen-map`; no edites el JSON del mapa a mano.

## Comandos

```text
pnpm check          typecheck + lint + formato + validate-data + test (antes de cada commit)
pnpm test           todas las pruebas
pnpm typecheck      tipos
pnpm lint           ESLint
pnpm format         Prettier
pnpm validate-data  valida /data contra los esquemas
pnpm gen-map        regenera data/mvp/maps/map-4p-01.json
pnpm dev            cliente en local con el sandbox (fase 2); el servidor llega en la fase 5
pnpm e2e            pruebas de navegador con Playwright (arrancan solas el cliente y el servidor)
pnpm server         servidor de partidas en red (ws://localhost:2567); cliente en red: ?mode=online
pnpm perf           pruebas de rendimiento (tiempo real, fuera de pnpm check)
pnpm sim            partidas headless de bots: --games N --players P --jobs K --out f.json
pnpm balance        informe de balance (tablas de criaturas; --games N añade partidas)
```
