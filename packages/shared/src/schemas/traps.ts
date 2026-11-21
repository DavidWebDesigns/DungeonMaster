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

/** Campos que comparten trampas y puertas. */
const StructureFields = {
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  goldCost: NonNegativeInt,
  /** Segundos de trabajo de un Imp para dejarla lista. */
  buildSeconds: PositiveNumber,
  /** Salas que hay que tener construidas (una puerta básica no pide ninguna). */
  requiresRooms: z.array(Id),
  /** Vida: los enemigos pueden atacarla una vez revelada y los Imps la reparan. */
  hp: PositiveInt,
  /** Parte del coste que se devuelve al venderla. */
  sellRefund: Fraction,
};

/**
 * Una trampa (traps.json, ASSETS.md §6). Se coloca en un tile de suelo propio, como una sala, y la construyen los Imps.
 * Hace falta tener construidas todas las salas de `requiresRooms`. Todas tienen vida (`hp`): tras su primer disparo quedan
 * reveladas y los enemigos pueden atacarlas; los Imps las reparan. Dos familias: las **físicas** se desgastan con cada
 * disparo (`wearPerTrigger`); las **elementales** tienen `uses` usos y se consumen al gastarlos.
 */
export const ArmedTrapDef = z.strictObject({
  ...StructureFields,
  requiresRooms: z.array(Id).min(1),
  family: z.enum(['physical', 'elemental']),
  /** Qué la dispara: un enemigo pisando el tile, uno a `triggerRadius` o menos, o uno en línea recta a esa distancia. */
  trigger: z.enum(['step', 'proximity', 'lineOfSight']),
  /** Distancia (en tiles) a la que un enemigo la dispara. */
  triggerRadius: PositiveNumber,
  /** Segundos hasta poder dispararse de nuevo. */
  cooldownSeconds: Seconds,
  /** Físicas: vida que pierde en cada disparo. */
  wearPerTrigger: PositiveInt.optional(),
  /** Elementales: usos antes de consumirse. */
  uses: PositiveInt.optional(),
  effect: TrapEffect,
});
export type ArmedTrapDef = z.infer<typeof ArmedTrapDef>;

/**
 * Una puerta: se construye como una trampa (suelo propio, Imps, venta, reparación) pero no se dispara. Su dueño y los
 * suyos la cruzan; los enemigos no pueden y la atacan hasta romperla. Nace revelada (se ve siempre que se vea su tile).
 */
export const DoorDef = z.strictObject({
  ...StructureFields,
  family: z.literal('door'),
});
export type DoorDef = z.infer<typeof DoorDef>;

export const TrapDef = z.discriminatedUnion('family', [ArmedTrapDef, DoorDef]);
export type TrapDef = z.infer<typeof TrapDef>;

/** ¿Es una puerta? (estrecha el tipo para acceder a los datos de disparo en las demás). */
export const isDoorDef = (def: TrapDef | undefined): def is DoorDef => def?.family === 'door';

export const TrapsFile = z.array(TrapDef).min(1);
export type TrapsFile = z.infer<typeof TrapsFile>;
