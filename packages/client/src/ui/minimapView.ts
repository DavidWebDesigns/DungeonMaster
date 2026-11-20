/**
 * Dibujo del minimapa en el DOM: un lienzo con la imagen de `minimapPixels`, el recuadro de lo que se ve en
 * pantalla y clic o arrastre para mover la cámara. Sin lógica de juego.
 */
import { minimapTileAt } from './minimap';

/** Lado del minimapa en píxeles de pantalla. */
const SIZE = 176;

export class MinimapView {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly small: HTMLCanvasElement;
  private readonly smallCtx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private dragging = false;

  constructor(
    host: HTMLElement,
    private readonly map: { width: number; height: number },
    /** Se llama con el tile del minimapa al que apunta el jugador (clic o arrastre). */
    private readonly onTile: (tile: { x: number; y: number }) => void,
  ) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.el.width = SIZE;
    this.el.height = SIZE;
    host.appendChild(this.el);
    const ctx = this.el.getContext('2d');
    this.small = document.createElement('canvas');
    this.small.width = map.width;
    this.small.height = map.height;
    const sctx = this.small.getContext('2d');
    if (!ctx || !sctx) throw new Error('El navegador no ofrece canvas 2D para el minimapa.');
    this.ctx = ctx;
    this.smallCtx = sctx;
    const point = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      const t = minimapTileAt(
        ((e.clientX - r.left) / r.width) * SIZE,
        ((e.clientY - r.top) / r.height) * SIZE,
        { w: SIZE, h: SIZE },
        this.map,
      );
      if (t) this.onTile(t);
    };
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dragging = true;
      this.el.setPointerCapture(e.pointerId);
      point(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) point(e);
    });
    const stop = () => (this.dragging = false);
    this.el.addEventListener('pointerup', stop);
    this.el.addEventListener('pointercancel', stop);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Nueva imagen del mapa (un píxel por tile). */
  setPixels(px: Uint8ClampedArray): void {
    this.image = new ImageData(new Uint8ClampedArray(px), this.map.width, this.map.height);
    this.smallCtx.putImageData(this.image, 0, 0);
  }

  /** Repinta: el mapa y encima el área visible (puntos del suelo en tiles). */
  draw(view: ReadonlyArray<{ x: number; z: number }>): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.small, 0, 0, SIZE, SIZE);
    if (view.length < 3) return;
    const sx = SIZE / this.map.width;
    const sy = SIZE / this.map.height;
    ctx.beginPath();
    view.forEach((p, i) => {
      const x = Math.max(0, Math.min(SIZE, p.x * sx));
      const y = Math.max(0, Math.min(SIZE, p.z * sy));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 240, 160, 0.95)';
    ctx.stroke();
  }
}
