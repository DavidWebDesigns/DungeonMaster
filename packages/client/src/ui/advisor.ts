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

/** Nombres de las salas (salvo la Guarida) que hacen llegar criaturas por el Portal, sacados de los datos. */
export function attractingRooms(data: DataSet): string {
  const ids = new Set<string>();
  for (const c of data.creatures)
    for (const req of c.attraction?.requires ?? []) if (req.room !== 'lair') ids.add(req.room);
  const names = data.rooms.filter((r) => ids.has(r.id)).map((r) => r.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} o ${names.at(-1)}`
    : (names[0] ?? 'otra sala');
}

export function adviceFor(
  events: readonly SimEvent[],
  state: MatchState,
  data: DataSet,
  localPlayer: number,
  /** Tipo de cada criatura por id (algunas ya no existen en el estado cuando llega el evento). */
  typeOf: (creatureId: number) => string | undefined,
): Advice[] {
  const rate = data.global.tickRate;
  const defOf = (type: string | undefined) => data.creatures.find((c) => c.id === type);
  const nameOfType = (type: string | undefined) => defOf(type)?.name ?? 'criatura';
  const nameOf = (id: number) => nameOfType(typeOf(id));
  // Género gramatical: un tipo desconocido es "una criatura"; el resto, el que digan los datos (masculino por defecto).
  const femOfType = (type: string | undefined) =>
    defOf(type) ? defOf(type)?.gender === 'f' : true;
  const femOf = (id: number) => femOfType(typeOf(id));
  const un = (type: string | undefined) => `${femOfType(type) ? 'una' : 'un'} ${nameOfType(type)}`;
  const unOf = (id: number) => un(typeOf(id));
  /** Adjetivo con la terminación del género: "descontent" + o/a. */
  const adj = (id: number, stem: string) => `${stem}${femOf(id) ? 'a' : 'o'}`;
  const out: Advice[] = [];

  for (const e of events) {
    if ('playerId' in e && e.playerId !== localPlayer) continue;
    switch (e.type) {
      case 'creatureArrived':
        out.push({
          text: `Ha llegado ${un(e.creature)} a tu mazmorra.`,
          key: `arrived${e.creatureId}`,
          cooldownTicks: 0,
        });
        break;
      case 'portalIdle': {
        const text =
          e.reason === 'noLair'
            ? 'Construye una Guarida para atraer criaturas.'
            : e.reason === 'noLevel'
              ? 'Para atraer a las criaturas superiores necesitas una sala de nivel 10: 10 tiles conectados del mismo tipo.'
              : e.reason === 'noSlots'
                ? 'Ya tienes todas las criaturas que permiten tus salas: más tiles de sala dan más cupos.'
                : e.reason === 'noRoom'
                  ? `Tus criaturas piden otras salas: ${attractingRooms(data)}.`
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
            text: `Sin oro para pagar a ${unOf(e.creatureId)}: se enfadará.`,
            key: `unpaid${e.creatureId}`,
            cooldownTicks: 600,
          });
        break;
      case 'moodBand':
        if (e.band === 'unhappy')
          out.push({
            text: `${cap(unOf(e.creatureId))} está ${adj(e.creatureId, 'descontent')}.`,
            key: `unhappy${e.creatureId}`,
            cooldownTicks: 900,
          });
        else if (e.band === 'angry')
          out.push({
            text: `¡${cap(unOf(e.creatureId))} está ${adj(e.creatureId, 'enfadad')}! Se acerca al Portal.`,
            key: `angry${e.creatureId}`,
            cooldownTicks: 900,
          });
        else if (e.band === 'furious')
          out.push({
            text: `¡${cap(unOf(e.creatureId))} está ${adj(e.creatureId, 'furios')}! Se marchará si no ${femOf(e.creatureId) ? 'la' : 'lo'} calmas.`,
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
      case 'trapBuilt':
        out.push({
          text: `${data.traps.find((t) => t.id === e.trap)?.name ?? 'Trampa'} lista y armada.`,
          key: `trapbuilt${e.trapId}`,
          cooldownTicks: 0,
        });
        break;
      case 'trapTriggered':
        out.push({
          text: `¡Tu ${data.traps.find((t) => t.id === e.trap)?.name?.toLowerCase() ?? 'trampa'} ha atrapado a un intruso!`,
          key: `traptrig${e.trap}`,
          cooldownTicks: 100,
        });
        break;
      case 'trapDestroyed':
        out.push({
          text: `Han destruido tu ${data.traps.find((t) => t.id === e.trap)?.name?.toLowerCase() ?? 'trampa'}.`,
          key: `trapdead${e.tile}`,
          cooldownTicks: 100,
        });
        break;
      case 'creatureLeft':
        out.push({
          text: `${cap(unOf(e.creatureId))} ha abandonado tu mazmorra.`,
          key: `left${e.creatureId}`,
          cooldownTicks: 0,
        });
        break;
      case 'creatureDied':
        out.push({
          text: `${cap(unOf(e.creatureId))} ha ${femOf(e.creatureId) ? 'muerto' : 'muerto'} de hambre.`,
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

/** Criaturas que el consejero no puede nombrar (siempre vacío si los datos están completos). */
export function advisorKnowsCreatures(data: DataSet): string[] {
  return data.creatures.filter((c) => c.name.trim() === '').map((c) => c.id);
}
