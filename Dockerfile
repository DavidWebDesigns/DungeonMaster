# Servidor de partidas (Colyseus). NO PROBADO: en el equipo de desarrollo no hay Docker (docs/DESPLIEGUE.md).
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @dm/server...
ENV PORT=2567
EXPOSE 2567
CMD ["pnpm", "--filter", "@dm/server", "start"]
