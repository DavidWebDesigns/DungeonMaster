/**
 * Sonidos del juego, generados con WebAudio (sin archivos de audio todavía). Cada sonido es una receta
 * de capas; `AudioEngine` solo las reproduce. Todo se silencia si el navegador no tiene audio.
 */
import type { SoundName } from './effects';

export interface Layer {
  kind: 'tone' | 'noise';
  /** Frecuencia inicial y final en Hz (solo para tonos). */
  freq?: [number, number];
  wave?: OscillatorType;
  /** Duración en segundos. */
  dur: number;
  gain: number;
  /** Retraso respecto al inicio del sonido. */
  delay?: number;
  /** Para ruido: frecuencia del filtro paso bajo. */
  lowpass?: number;
}

export const SOUND_RECIPES: Readonly<Record<SoundName, readonly Layer[]>> = {
  click: [{ kind: 'tone', freq: [900, 600], wave: 'square', dur: 0.04, gain: 0.08 }],
  dig: [
    { kind: 'noise', dur: 0.16, gain: 0.22, lowpass: 900 },
    { kind: 'tone', freq: [140, 60], wave: 'triangle', dur: 0.14, gain: 0.2 },
  ],
  coin: [{ kind: 'tone', freq: [1500, 1900], wave: 'sine', dur: 0.08, gain: 0.1 }],
  deposit: [
    { kind: 'tone', freq: [1200, 1200], wave: 'sine', dur: 0.1, gain: 0.14 },
    { kind: 'tone', freq: [1800, 1800], wave: 'sine', dur: 0.18, gain: 0.12, delay: 0.07 },
  ],
  claim: [{ kind: 'tone', freq: [500, 750], wave: 'sine', dur: 0.08, gain: 0.07 }],
  build: [
    { kind: 'tone', freq: [110, 55], wave: 'sawtooth', dur: 0.25, gain: 0.25 },
    { kind: 'noise', dur: 0.2, gain: 0.18, lowpass: 600 },
  ],
  sell: [
    { kind: 'tone', freq: [900, 500], wave: 'triangle', dur: 0.12, gain: 0.14 },
    { kind: 'tone', freq: [700, 400], wave: 'triangle', dur: 0.12, gain: 0.12, delay: 0.1 },
  ],
  pop: [{ kind: 'tone', freq: [300, 900], wave: 'sine', dur: 0.16, gain: 0.18 }],
  error: [{ kind: 'tone', freq: [180, 140], wave: 'sawtooth', dur: 0.18, gain: 0.14 }],
  slap: [
    { kind: 'noise', dur: 0.08, gain: 0.3, lowpass: 2500 },
    { kind: 'tone', freq: [400, 120], wave: 'square', dur: 0.08, gain: 0.12 },
  ],
  levelup: [
    { kind: 'tone', freq: [660, 660], wave: 'triangle', dur: 0.1, gain: 0.14 },
    { kind: 'tone', freq: [880, 880], wave: 'triangle', dur: 0.1, gain: 0.14, delay: 0.09 },
    { kind: 'tone', freq: [1320, 1320], wave: 'triangle', dur: 0.2, gain: 0.14, delay: 0.18 },
  ],
  payday: [
    { kind: 'tone', freq: [1568, 1568], wave: 'sine', dur: 0.25, gain: 0.12 },
    { kind: 'tone', freq: [2093, 2093], wave: 'sine', dur: 0.35, gain: 0.1, delay: 0.12 },
  ],
  pickup: [{ kind: 'tone', freq: [500, 800], wave: 'sine', dur: 0.07, gain: 0.1 }],
};

/** Evita que el mismo sonido suene muchas veces seguidas (por ejemplo 10 excavaciones en un tick). */
export const MIN_REPEAT_SECONDS = 0.05;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  muted = false;

  /** Debe llamarse desde un gesto del usuario (clic o tecla): los navegadores no dejan sonar antes. */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext();
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Ruido blanco determinista (el sonido es solo decoración; no usa el generador de la partida).
    let s = 1;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      data[i] = (s / 2147483648) * 0.9;
    }
    this.noise = buf;
  }

  play(sound: SoundName, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(sound) ?? -1;
    if (now - last < MIN_REPEAT_SECONDS) return;
    this.lastPlayed.set(sound, now);

    for (const layer of SOUND_RECIPES[sound]) {
      const start = now + (layer.delay ?? 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(layer.gain * volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + layer.dur);
      gain.connect(ctx.destination);
      if (layer.kind === 'tone' && layer.freq) {
        const osc = ctx.createOscillator();
        osc.type = layer.wave ?? 'sine';
        osc.frequency.setValueAtTime(layer.freq[0], start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.freq[1]), start + layer.dur);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + layer.dur + 0.02);
      } else if (layer.kind === 'noise' && this.noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = layer.lowpass ?? 1200;
        src.connect(filter);
        filter.connect(gain);
        src.start(start);
        src.stop(start + layer.dur + 0.02);
      }
    }
  }
}
