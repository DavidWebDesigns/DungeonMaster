/**
 * Registro de avisos del consejero: guarda los últimos, deja ver unos pocos a la vez y evita repetir
 * el mismo aviso (por clave) en poco tiempo.
 */
export interface Notice {
  text: string;
  tick: number;
}

export interface NoticeLogOptions {
  /** Cuánto dura un aviso en pantalla, en ticks. */
  lifeTicks: number;
  /** Cuántos avisos se ven a la vez. */
  visible: number;
}

export class NoticeLog {
  private readonly items: Array<Notice & { key: string }> = [];
  private readonly lastByKey = new Map<string, number>();

  constructor(private readonly opts: NoticeLogOptions) {}

  /** Añade un aviso. Con `key` y `cooldownTicks`, ignora el mismo aviso si salió hace poco. Devuelve si se añadió. */
  add(text: string, tick: number, key = text, cooldownTicks = 0): boolean {
    const last = this.lastByKey.get(key);
    if (last !== undefined && tick - last < cooldownTicks) return false;
    this.lastByKey.set(key, tick);
    this.items.push({ text, tick, key });
    if (this.items.length > 50) this.items.shift();
    return true;
  }

  /** Avisos que siguen en pantalla en este tick, del más antiguo al más reciente. */
  active(tick: number): Notice[] {
    return this.items
      .filter((n) => tick - n.tick < this.opts.lifeTicks)
      .slice(-this.opts.visible)
      .map(({ text, tick: t }) => ({ text, tick: t }));
  }

  /** El aviso más reciente (aunque haya caducado). */
  latest(): Notice | null {
    const n = this.items[this.items.length - 1];
    return n ? { text: n.text, tick: n.tick } : null;
  }
}
