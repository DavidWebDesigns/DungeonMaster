# Despliegue

Hay dos piezas, como indica docs/PLAN.md sección 12. **Nada de esto está desplegado todavía**: son instrucciones y
archivos preparados. Revisa los planes gratuitos de cada servicio al desplegar, porque cambian.

## Cliente (sitio estático)

```text
pnpm --filter @dm/client build      # genera packages/client/dist
```

Sube `packages/client/dist` a Cloudflare Pages, Vercel o similar (comando de compilación `pnpm --filter @dm/client build`,
carpeta de salida `packages/client/dist`). Antes de compilar define la dirección del servidor:

```text
VITE_SERVER_URL=wss://tu-servidor.ejemplo.com
```

Si no se define, el cliente usa el mismo equipo en el puerto 2567 (sirve para jugar en red local). En producción hace
falta `wss://` (HTTPS), o el navegador bloqueará la conexión.

Sin servidor el cliente sigue funcionando: la partida por defecto es PvE local y no necesita red.

## Servidor (proceso Node con WebSockets)

```text
pnpm --filter @dm/server start      # escucha en PORT (por defecto 2567)
```

- Una sola instancia basta para el MVP: las salas viven en la memoria del proceso (no hay base de datos).
- Variables: `PORT` (puerto). Los registros de partidas terminadas se guardan en `match-logs/` (reinicia = se pierden las salas en curso).
- Colyseus responde 404 en `/`: para las comprobaciones de salud usa una conexión TCP al puerto, no una petición HTTP.
- Se incluye un `Dockerfile` (Fly.io, Railway, VPS). **No se ha construido ni probado** porque no hay Docker en el equipo de desarrollo.
- Detrás de un proxy hay que permitir WebSockets y mantener las conexiones abiertas (el servidor manda latidos cada 1,5 s).

## Antes de publicar

- Elegir nombre y dominio definitivos y comprobar que no chocan con marcas existentes (el nombre actual es de trabajo).
- Playtest #1 en red con 3 o 4 personas (pendiente).
- No hay límite de salas ni protección contra abusos más allá de los 30 comandos por segundo por jugador.
