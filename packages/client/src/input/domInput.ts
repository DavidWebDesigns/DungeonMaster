/**
 * Enlaza el DOM (ratón, teclado, rueda) con el modelo de entrada y la cámara.
 * Lo único que hace es traducir eventos del navegador; la lógica está en InputModel, keymap y cameraController.
 */
import type { CameraInput } from '../render/cameraController';

/** Posición del puntero en la pantalla normalizada a [-1, 1] con y hacia arriba. */
export function toNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { nx: number; ny: number } {
  return {
    nx: ((clientX - rect.left) / rect.width) * 2 - 1,
    ny: 1 - ((clientY - rect.top) / rect.height) * 2,
  };
}

const KEY_GROUPS = {
  up: ['w', 'ArrowUp'],
  down: ['s', 'ArrowDown'],
  left: ['a', 'ArrowLeft'],
  right: ['d', 'ArrowRight'],
} as const;

export interface DomHandlers {
  /** Qué tile hay bajo la posición normalizada (o null si ninguno). */
  pick(nx: number, ny: number): { x: number; y: number } | null;
  move(tile: { x: number; y: number } | null): void;
  down(tile: { x: number; y: number } | null, button: 0 | 2, shift: boolean): void;
  up(tile: { x: number; y: number } | null): void;
  key(key: string): void;
  wheel(deltaY: number): void;
}

export class DomInput {
  private readonly held = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly h: DomHandlers,
  ) {
    const opts = { signal: this.abort.signal };
    const tileAt = (e: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const { nx, ny } = toNdc(e.clientX, e.clientY, r);
      return h.pick(nx, ny);
    };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    canvas.addEventListener(
      'pointermove',
      (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        h.move(tileAt(e));
      },
      opts,
    );
    canvas.addEventListener(
      'pointerleave',
      () => {
        this.mouse = null;
        h.move(null);
      },
      opts,
    );
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        canvas.setPointerCapture(e.pointerId);
        h.down(tileAt(e), e.button, e.shiftKey);
      },
      opts,
    );
    canvas.addEventListener('pointerup', (e) => h.up(tileAt(e)), opts);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        h.wheel(e.deltaY);
      },
      { ...opts, passive: false },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.held.add(k);
        if (k === ' ' || k.startsWith('Arrow')) e.preventDefault();
        h.key(e.key);
      },
      opts,
    );
    window.addEventListener(
      'keyup',
      (e) => this.held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key),
      opts,
    );
    window.addEventListener('blur', () => this.held.clear(), opts);
  }

  /** Resumen de teclas y ratón para la cámara. */
  cameraInput(): CameraInput {
    const any = (keys: readonly string[]) => keys.some((k) => this.held.has(k));
    return {
      up: any(KEY_GROUPS.up),
      down: any(KEY_GROUPS.down),
      left: any(KEY_GROUPS.left),
      right: any(KEY_GROUPS.right),
      mouse: this.mouse,
    };
  }

  dispose(): void {
    this.abort.abort();
  }
}
