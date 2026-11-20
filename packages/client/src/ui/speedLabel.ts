/** Texto del indicador de tiempo de las partidas locales: "⏸ Pausa", "×2"... y nada a velocidad normal. */
export function speedLabel(paused: boolean, speed: number | undefined): string {
  if (paused) return '⏸ Pausa';
  return speed !== undefined && speed !== 1 ? `×${speed}` : '';
}
