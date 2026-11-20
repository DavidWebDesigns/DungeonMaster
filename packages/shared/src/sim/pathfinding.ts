import { DIRS8 } from './grid';

export interface PathQuery {
  width: number;
  height: number;
  walkable: (tile: number) => boolean;
  start: number;
  /** Se acepta cualquier tile que cumpla esto (permite varios destinos). */
  isGoal: (tile: number) => boolean;
  /** Estimación admisible del coste restante; devuelve 0 si no hay una buena. */
  heuristic: (tile: number) => number;
  straightCost: number;
  diagonalCost: number;
}

/** Cola de prioridad binaria; a igual prioridad gana el tile de índice menor (determinista). */
class MinHeap {
  private f: number[] = [];
  private n: number[] = [];

  get size(): number {
    return this.n.length;
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a] as number;
    const fb = this.f[b] as number;
    return fa < fb || (fa === fb && (this.n[a] as number) < (this.n[b] as number));
  }

  private swap(a: number, b: number): void {
    const f = this.f[a] as number;
    const n = this.n[a] as number;
    this.f[a] = this.f[b] as number;
    this.n[a] = this.n[b] as number;
    this.f[b] = f;
    this.n[b] = n;
  }

  push(node: number, priority: number): void {
    this.f.push(priority);
    this.n.push(node);
    let i = this.n.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.n[0] as number;
    const lastF = this.f.pop() as number;
    const lastN = this.n.pop() as number;
    if (this.n.length > 0) {
      this.f[0] = lastF;
      this.n[0] = lastN;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.n.length && this.less(l, m)) m = l;
        if (r < this.n.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* en cuadrícula de 8 direcciones sin cortar esquinas (sección 6.13).
 * Devuelve los tiles a recorrer (sin el de salida, con el de llegada), `[]` si ya se está en
 * un destino, o `null` si no hay ruta.
 */
export function findPath(q: PathQuery): number[] | null {
  const { width, height, walkable, start, isGoal, heuristic, straightCost, diagonalCost } = q;
  const total = width * height;
  const g = new Float64Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, heuristic(start));

  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (isGoal(cur)) {
      const path: number[] = [];
      for (let t = cur; t !== start; t = parent[t] as number) path.push(t);
      return path.reverse();
    }
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const gc = g[cur] as number;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (closed[ni] || !walkable(ni)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!walkable(cy * width + nx) || !walkable(ny * width + cx))) continue;
      const ng = gc + (diagonal ? diagonalCost : straightCost);
      if (ng < (g[ni] as number)) {
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + heuristic(ni));
      }
    }
  }
  return null;
}

/**
 * Distancia de camino desde `start` a todos los tiles, con las mismas reglas de movimiento que `findPath`
 * (8 direcciones sin cortar esquinas, costes recto y diagonal). `Infinity` donde no se puede llegar.
 * Sirve para decidir "el más cercano" por lo que realmente hay que andar, no por la línea recta.
 */
export function distanceField(
  q: Pick<PathQuery, 'width' | 'height' | 'walkable' | 'start' | 'straightCost' | 'diagonalCost'>,
): Float64Array {
  const { width, height, walkable, start, straightCost, diagonalCost } = q;
  const g = new Float64Array(width * height).fill(Infinity);
  const closed = new Uint8Array(width * height);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, 0);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const gc = g[cur] as number;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (closed[ni] || !walkable(ni)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!walkable(cy * width + nx) || !walkable(ny * width + cx))) continue;
      const ng = gc + (diagonal ? diagonalCost : straightCost);
      if (ng < (g[ni] as number)) {
        g[ni] = ng;
        heap.push(ni, ng);
      }
    }
  }
  return g;
}
