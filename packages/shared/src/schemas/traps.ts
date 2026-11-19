import { z } from 'zod';
import { Fraction, Id, NonNegativeInt, PositiveInt, PositiveNumber, Seconds } from './common';

/** Qué hace una trampa al dispararse. Se pueden añadir más tipos de efecto aquí. */
export const TrapEffect = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('areaDamage'),
    damage: PositiveInt,
    /** Radio (en tiles) del daño a criaturas e Imps enemigos. */
    radius: PositiveNumber,
  }),
]);
export type TrapEffect = z.infer<typeof TrapEffect>;

/**
 * Una trampa (traps.json). Se coloca en un tile de suelo propio, como una sala, y la construyen los Imps.
 * Solo se puede colocar si el jugador tiene construida la sala `requiresRoom`.
 */
export const TrapDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  goldCost: NonNegativeInt,
  /** Segundos de trabajo de un Imp para dejarla lista. */
  buildSeconds: PositiveNumber,
  requiresRoom: Id,
  /** Distancia (en tiles) a la que un enemigo la dispara. */
  triggerRadius: PositiveNumber,
  /** Segundos hasta poder dispararse de nuevo (si no es de un solo uso). */
  cooldownSeconds: Seconds,
  /** Se gasta al dispararse. */
  consumable: z.boolean(),
  /** Parte del coste que se devuelve al venderla. */
  sellRefund: Fraction,
  effect: TrapEffect,
});
export type TrapDef = z.infer<typeof TrapDef>;

export const TrapsFile = z.array(TrapDef).min(1);
export type TrapsFile = z.infer<typeof TrapsFile>;
