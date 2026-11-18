# Dungeon Master: reglas del proyecto

Juego de gestión de mazmorras multijugador para navegador. Lee docs/PLAN.md antes de cada fase.

## Estado actual

- Fase 0 (cimientos): terminada. Puerta 0 cumplida.
- Fase 1 (núcleo de la simulación): terminada. Puerta 1 cumplida (`packages/shared/src/sim/gate1.test.ts`).
- Fase 2 (cliente gris jugable en local): implementada y probada (`pnpm dev`, `pnpm e2e`). Falta el playtest humano de sensaciones para cumplir la Puerta 2.
- Siguiente: playtest de la fase 2 y, después, fase 3 (criaturas vivas). Propón archivos y pruebas antes de escribir código.

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
pnpm e2e            pruebas de navegador con Playwright (cliente en pnpm dev)
pnpm sim            partida headless de bots (fase 4)
pnpm balance        informe de balance (fase 4)
```
