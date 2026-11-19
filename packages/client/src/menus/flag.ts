/**
 * Las pantallas de menús (inicio, ajustes PvE, resultados) son una MAQUETA: existen y se prueban, pero el juego
 * no las usa todavía. Mientras tanto la partida arranca directamente en PvE (docs/DUDAS.md #80).
 *
 * Para verlas sin activarlas: `?menus=preview` (muestra la maqueta con datos de ejemplo y botones que no hacen nada).
 * Activarlas de verdad (cambiar `MENUS_ENABLED` a true y conectar los botones) es trabajo pendiente.
 */
export const MENUS_ENABLED = false;

export function menusPreviewRequested(params: URLSearchParams): boolean {
  return params.get('menus') === 'preview';
}
