/**
 * El consejero: convierte los eventos de la simulación en frases para el jugador.
 * Textos propios (no copiados de ningún juego). Puro y probado.
 */
import type { DataSet, MatchState, SimEvent } from '@dm/shared';

export interface Advice {
  text: string;
  /** Clave para no repetir el mismo aviso. */
  key: string;
  /** Ticks que hay que esperar antes de repetirlo. */
  cooldownTicks: number;
}

/** Artículo según el nombre: la reserva "criatura" es femenina; los tipos del juego son masculinos. */
const article = (name: string) => (name === 'criatura' ? `una ${name}` : `un ${name}`);

export function adviceFor(
  events: readonly SimEvent[],
  state: MatchState,
  data: DataSet,
  localPlayer: number,
  /** Tipo de cada criatura por id (algunas ya no existen en el estado cuando llega el evento). */
  typeOf: (creatureId: number) => string | undefined,
): Advice[] {
  const rate = data.global.tickRate;
  const nameOfType = (type: string | undefined) =>
    data.creatures.find((c) => c.id === type)?.name ?? 'criatura';
  const nameOf = (id: number) => nameOfType(typeOf(id));
  const out: Advice[] = [];

  for (const e of events) {
    if ('playerId' in e && e.playerId !== localPlayer) continue;
    switch (e.type) {
      case 'creatureArrived':
        out.push({
          text: `Ha llegado ${article(nameOfType(e.creature))} a tu mazmorra.`,
          key: `arrived${e.creatureId}`,
          cooldownTicks: 0,
        });
        break;
      case 'portalIdle': {
        const text =
          e.reason === 'noLair'
            ? 'Construye una Guarida para atraer criaturas.'
            : e.reason === 'noRoom'
              ? 'Tus criaturas piden otras salas: Sala de entrenamiento, Biblioteca o Criadero.'
              : 'Tu mazmorra no admite más criaturas por ahora.';
        out.push({ text, key: `portal-${e.reason}`, cooldownTicks: (600 * rate) / 10 });
        break;
      }
      case 'payday':
        out.push({
          text: '¡Día de pago! Tus criaturas van a cobrar a la Tesorería.',
          key: 'payday',
          cooldownTicks: 0,
        });
        break;
      case 'paid':
        if (!e.ok)
          out.push({
            text: `Sin oro para pagar a ${article(nameOf(e.creatureId))}: se enfadará.`,
            key: `unpaid${e.creatureId}`,
            cooldownTicks: 600,
          });
        break;
      case 'moodBand':
        if (e.band === 'unhappy')
          out.push({
            text: `${cap(article(nameOf(e.creatureId)))} está descontento.`,
            key: `unhappy${e.creatureId}`,
            cooldownTicks: 900,
          });
        else if (e.band === 'angry')
          out.push({
            text: `¡${cap(article(nameOf(e.creatureId)))} está enfadado! Se acerca al Portal.`,
            key: `angry${e.creatureId}`,
            cooldownTicks: 900,
          });
        else if (e.band === 'furious')
          out.push({
            text: `¡${cap(article(nameOf(e.creatureId)))} está furioso! Se marchará si no lo calmas.`,
            key: `furious${e.creatureId}`,
            cooldownTicks: 900,
          });
        break;
      case 'levelUp':
        out.push({
          text: `Tu ${nameOf(e.creatureId)} ha subido al nivel ${e.level}.`,
          key: `level${e.creatureId}-${e.level}`,
          cooldownTicks: 0,
        });
        break;
      case 'creatureLeft':
        out.push({
          text: `${cap(article(nameOf(e.creatureId)))} ha abandonado tu mazmorra.`,
          key: `left${e.creatureId}`,
          cooldownTicks: 0,
        });
        break;
      case 'creatureDied':
        out.push({
          text: `${cap(article(nameOf(e.creatureId)))} ha muerto de hambre.`,
          key: `died${e.creatureId}`,
          cooldownTicks: 0,
        });
        break;
      default:
        break;
    }
  }
  void state;
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
