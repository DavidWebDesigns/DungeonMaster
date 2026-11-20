import { z } from 'zod';
import { Fraction, Id, NonNegativeInt, PositiveInt, PositiveNumber, Seconds } from './common';

/** Qué hace una trampa al dispararse. Se pueden añadir más tipos de efecto aquí. */
export const TrapEffect = z.discriminatedUnion('type', [
  /** Daño a los enemigos (criaturas e Imps) en un círculo alrededor de la trampa. */
  z.strictObject({ type: z.literal('areaDamage'), damage: PositiveInt, radius: PositiveNumber }),
  /** Daño y congelación (inmoviliza) a las criaturas enemigas del círculo. */
  z.strictObject({
    type: z.literal('freezeArea'),
    damage: PositiveInt,
    radius: PositiveNumber,
    freezeSeconds: PositiveNumber,
  }),
  /** Una roca rueda en línea recta hacia el enemigo que la dispara y daña a todos los que toca hasta chocar con un muro. */
  z.strictObject({ type: z.literal('rollingBoulder'), damage: PositiveInt }),
  /** Rayo que alcanza hasta `jumps` enemigos (el que la dispara y los más cercanos a cada salto); cada salto hace `falloff` menos. */
  z.strictObject({
    type: z.literal('chainLightning'),
    damage: PositiveInt,
    jumps: PositiveInt,
    falloff: Fraction,
    jumpRange: PositiveNumber,
  }),
  /** Dos muros con púas se cierran sobre el tile: solo se colocan en un pasillo de 1 tile. */
  z.strictObject({ type: z.literal('crushingWalls'), damage: PositiveInt, radius: PositiveNumber }),
]);
export type TrapEffect = z.infer<typeof TrapEffect>;

/**
 * Una trampa (traps.json, ASSETS.md §6). Se coloca en un tile de suelo propio, como una sala, y la construyen los Imps.
 * Hace falta tener construidas todas las salas de `requiresRooms`. Dos familias: las **físicas** tienen vida (`hp`) y se
 * desgastan con cada disparo; las **elementales** tienen `uses` usos y se consumen al gastarlos.
 */
export const TrapDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  goldCost: NonNegativeInt,
  /** Segundos de trabajo de un Imp para dejarla lista. */
  buildSeconds: PositiveNumber,
  requiresRooms: z.array(Id).min(1),
  family: z.enum(['physical', 'elemental']),
  /** Qué la dispara: un enemigo pisando el tile, uno a `triggerRadius` o menos, o uno en línea recta a esa distancia. */
  trigger: z.enum(['step', 'proximity', 'lineOfSight']),
  /** Distancia (en tiles) a la que un enemigo la dispara. */
  triggerRadius: PositiveNumber,
  /** Segundos hasta poder dispararse de nuevo. */
  cooldownSeconds: Seconds,
  /** Físicas: vida y desgaste por disparo. */
  hp: PositiveInt.optional(),
  wearPerTrigger: PositiveInt.optional(),
  /** Elementales: usos antes de consumirse. */
  uses: PositiveInt.optional(),
  /** Parte del coste que se devuelve al venderla. */
  sellRefund: Fraction,
  effect: TrapEffect,
});
export type TrapDef = z.infer<typeof TrapDef>;

export const TrapsFile = z.array(TrapDef).min(1);
export type TrapsFile = z.infer<typeof TrapsFile>;
