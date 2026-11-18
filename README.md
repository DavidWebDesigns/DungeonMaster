# Dungeon Master

Gestor de mazmorras multijugador, gratuito y para navegador (nombre de trabajo).
Cada jugador es un Guardián que excava, mina oro, construye salas, atrae criaturas y destruye el Corazón de sus rivales.

- Plan completo: [docs/PLAN.md](docs/PLAN.md)
- Reglas para Claude Code: [CLAUDE.md](CLAUDE.md)
- Decisiones tomadas: [docs/DUDAS.md](docs/DUDAS.md)

## Requisitos

- Node.js 22.12 o superior
- pnpm 10 (`corepack enable` lo activa con la versión del proyecto)

## Primeros pasos

```bash
corepack enable
pnpm install
pnpm check
```

`pnpm check` corre tipos, lint, validación de datos y pruebas. Si sale en verde, todo está bien.

## Estructura

```text
data/mvp/          todas las cifras del juego (JSON validados con zod)
packages/shared/   simulación pura: esquemas, datos y, desde la fase 1, el juego
packages/server/   servidor Colyseus (fase 5)
packages/client/   cliente Vite + Babylon.js (fase 2)
tools/             validate-data, gen-map y, más adelante, sim y balance-report
assets/            modelos .glb y assetManifest.json
docs/              plan, dudas y decisiones
```

## Estado

| Fase | Contenido                     | Estado    |
| ---- | ----------------------------- | --------- |
| 0    | Cimientos, datos y validación | Terminada |
| 1    | Núcleo de la simulación       | Siguiente |
| 2    | Cliente gris jugable en local |           |
| 3    | Criaturas vivas               |           |
| 4    | Combate, victoria y bots      |           |
| 5    | Multijugador                  |           |
| 6    | Pulido y lanzamiento del MVP  |           |
