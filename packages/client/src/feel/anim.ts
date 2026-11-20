/**
 * Animaciones de "game feel" de las criaturas, en funciones puras de tiempo: aplastar y estirar, destello al subir de
 * nivel, caída al morir, números flotantes y etapas de grieta al excavar. El dibujo las aplica; no cambian la partida.
 */
export type CreatureAnimKind = 'slap' | 'drop' | 'levelUp';

export interface AnimSample {
  /** Multiplicadores de escala. Al aplastarse se ensancha (x, z) y baja (y), y al estirarse al revés. */
  sx: number;
  sy: number;
  /** 0 a 1: brillo extra (destello). */
  glow: number;
}

export const NEUTRAL_ANIM: AnimSample = { sx: 1, sy: 1, glow: 0 };

/** Fotogramas clave [segundos, sx, sy, glow]; entre ellos se interpola y al acabar vuelve a la forma normal. */
const KEYFRAMES: Readonly<
  Record<CreatureAnimKind, ReadonlyArray<readonly [number, number, number, number]>>
> = {
  // Bofetada: se aplasta de golpe y rebota estirándose.
  slap: [
    [0, 1, 1, 0],
    [0.08, 1.35, 0.6, 0],
    [0.22, 0.85, 1.25, 0],
    [0.38, 1, 1, 0],
  ],
  // Soltar: un impacto corto al caer.
  drop: [
    [0, 1.3, 0.7, 0],
    [0.18, 1, 1, 0],
  ],
  // Subir de nivel: crece un poco y destella.
  levelUp: [
    [0, 1, 1, 1],
    [0.15, 1.2, 1.2, 1],
    [0.6, 1, 1, 0],
  ],
};

export const ANIM_SECONDS: Readonly<Record<CreatureAnimKind, number>> = {
  slap: 0.38,
  drop: 0.18,
  levelUp: 0.6,
};

/** Valores de una animación `age` segundos después de empezar. Pasado su final, la forma normal. */
export function sampleAnim(kind: CreatureAnimKind, age: number): AnimSample {
  const frames = KEYFRAMES[kind];
  const last = frames[frames.length - 1]!;
  if (age < 0 || age >= last[0]) return NEUTRAL_ANIM;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    if (age <= b[0]) {
      const t = (age - a[0]) / (b[0] - a[0]);
      return {
        sx: a[1] + (b[1] - a[1]) * t,
        sy: a[2] + (b[2] - a[2]) * t,
        glow: a[3] + (b[3] - a[3]) * t,
      };
    }
  }
  return NEUTRAL_ANIM;
}

/** Animaciones en curso de cada criatura. Si llega otra mientras hay una, la sustituye. */
export class AnimBoard {
  private readonly active = new Map<number, { kind: CreatureAnimKind; start: number }>();

  trigger(id: number, kind: CreatureAnimKind, nowSeconds: number): void {
    this.active.set(id, { kind, start: nowSeconds });
  }

  sample(id: number, nowSeconds: number): AnimSample {
    const a = this.active.get(id);
    if (!a) return NEUTRAL_ANIM;
    if (nowSeconds - a.start >= ANIM_SECONDS[a.kind]) {
      this.active.delete(id);
      return NEUTRAL_ANIM;
    }
    return sampleAnim(a.kind, nowSeconds - a.start);
  }

  forget(id: number): void {
    this.active.delete(id);
  }

  private readonly killed = new Set<number>();

  /** Anota que la criatura murió: cuando su modelo desaparezca, cae y se desvanece (si solo salió de la vista, no). */
  markKilled(id: number): void {
    this.killed.add(id);
  }

  /** ¿Murió? Se consulta una sola vez, al quitar su modelo. */
  takeKilled(id: number): boolean {
    return this.killed.delete(id);
  }
}

/** Segundos que tarda una criatura muerta en caer y desvanecerse. */
export const DEATH_SECONDS = 0.7;

export interface DeathPose {
  /** Escala vertical (se aplasta contra el suelo) y ensanchamiento. */
  sy: number;
  sx: number;
  /** Opacidad de 1 a 0. */
  alpha: number;
  /** Ya terminó: hay que quitar el modelo. */
  done: boolean;
}

export function deathPose(age: number): DeathPose {
  const t = Math.max(0, Math.min(1, age / DEATH_SECONDS));
  return { sy: 1 - 0.85 * t, sx: 1 + 0.25 * t, alpha: 1 - t, done: age >= DEATH_SECONDS };
}

export interface Floater {
  text: string;
  /** Posición en el mundo (tiles). */
  x: number;
  y: number;
  color: string;
  born: number;
}

export const FLOATER_SECONDS = 1.1;
/** Cuánto sube un número flotante en toda su vida, en píxeles. */
export const FLOATER_RISE_PX = 38;

/** Texto que sube y se desvanece (por ejemplo, "+velocidad" al abofetear). Máximo `limit` a la vez. */
export class FloaterList {
  items: Floater[] = [];
  constructor(private readonly limit = 24) {}

  add(f: Floater): void {
    this.items.push(f);
    if (this.items.length > this.limit) this.items.shift();
  }

  /** Quita los que ya terminaron. */
  prune(nowSeconds: number): void {
    this.items = this.items.filter((f) => nowSeconds - f.born < FLOATER_SECONDS);
  }
}

/** Subida en píxeles y opacidad de un flotante a su edad: sube rápido al principio y se desvanece al final. */
export function floaterPose(age: number): { rise: number; opacity: number } {
  const t = Math.max(0, Math.min(1, age / FLOATER_SECONDS));
  return {
    rise: FLOATER_RISE_PX * (1 - (1 - t) * (1 - t)),
    opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
  };
}

/**
 * Etapa de la grieta de un muro que se excava: 0 entero, 1 primera grieta, 2 muy agrietado.
 * `work` y `total` son los segundos trabajados y los necesarios.
 */
export function crackStage(work: number, total: number): 0 | 1 | 2 {
  if (!(total > 0)) return 0;
  const f = work / total;
  return f >= 2 / 3 ? 2 : f >= 1 / 3 ? 1 : 0;
}
