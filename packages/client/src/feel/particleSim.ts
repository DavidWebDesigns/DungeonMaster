/**
 * Simulación de partículas (chispas, polvo, monedas). Solo efecto visual: nunca influye en el juego,
 * así que tiene su propio generador y no toca el de la partida.
 */
import { nextFloat } from '@dm/shared';
import type { RGB } from '../render/palette';

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: RGB;
}

export interface BurstSpec {
  x: number;
  y: number;
  z: number;
  color: RGB;
  count: number;
  /** Velocidad horizontal máxima, en tiles por segundo. */
  speed: number;
  /** Velocidad vertical inicial máxima. */
  up: number;
  size: number;
}

export const PARTICLES = {
  gravity: 9,
  life: 0.7,
  /** Tope de partículas vivas: si se llena, las nuevas se descartan. */
  max: 600,
} as const;

export class ParticleSim {
  readonly particles: Particle[] = [];
  private readonly rng: { rng: number };

  constructor(seed = 12345) {
    this.rng = { rng: seed | 0 };
  }

  burst(s: BurstSpec): void {
    for (let i = 0; i < s.count && this.particles.length < PARTICLES.max; i++) {
      const a = nextFloat(this.rng) * Math.PI * 2;
      const r = nextFloat(this.rng) * s.speed;
      const life = PARTICLES.life * (0.6 + 0.8 * nextFloat(this.rng));
      this.particles.push({
        x: s.x,
        y: s.y,
        z: s.z,
        vx: Math.cos(a) * r,
        vy: s.up * (0.5 + 0.5 * nextFloat(this.rng)),
        vz: Math.sin(a) * r,
        life,
        maxLife: life,
        size: s.size * (0.7 + 0.6 * nextFloat(this.rng)),
        color: s.color,
      });
    }
  }

  /** Avanza `dt` segundos: gravedad, rebote en el suelo y desaparición al acabar su vida. */
  step(dt: number): void {
    let w = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= PARTICLES.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy = Math.abs(p.vy) * 0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.particles[w++] = p;
    }
    this.particles.length = w;
  }
}
