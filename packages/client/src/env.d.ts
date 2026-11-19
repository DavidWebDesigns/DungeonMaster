/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección WebSocket del servidor de partidas (ej. wss://servidor.ejemplo.com). Si falta, el mismo equipo en el puerto 2567. */
  readonly VITE_SERVER_URL?: string;
}
