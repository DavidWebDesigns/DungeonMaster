import { describe, expect, it } from 'vitest';
import { ghostPreview } from './ghosts';

describe('ghostPreview', () => {
  it('sin órdenes pendientes no hay nada que dibujar', () => {
    expect(ghostPreview([])).toEqual({ kind: 'none' });
    expect(ghostPreview([{ type: 'surrender' }, { type: 'slap', id: 3 }])).toEqual({
      kind: 'none',
    });
  });

  it('las excavaciones, trampas y salas pendientes se dibujan en sus tiles', () => {
    const p = ghostPreview([
      {
        type: 'dig',
        tiles: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      },
      { type: 'buildTrap', trap: 'spikeTrap', tile: { x: 5, y: 5 } },
      { type: 'buildRoom', room: 'lair', rect: { x: 7, y: 7, w: 2, h: 2 } },
    ]);
    expect(p.kind).toBe('tiles');
    if (p.kind === 'tiles') expect(p.valid).toHaveLength(2 + 1 + 4);
  });
});
