import { describe, expect, it } from 'vitest';
import { NoticeLog } from './notices';

const log = () => new NoticeLog({ lifeTicks: 40, visible: 3 });

describe('NoticeLog', () => {
  it('muestra los avisos mientras no caducan', () => {
    const l = log();
    l.add('a', 0);
    expect(l.active(39).map((n) => n.text)).toEqual(['a']);
    expect(l.active(40)).toEqual([]);
  });

  it('solo se ven los 3 más recientes', () => {
    const l = log();
    for (const t of ['a', 'b', 'c', 'd']) l.add(t, 0);
    expect(l.active(1).map((n) => n.text)).toEqual(['b', 'c', 'd']);
  });

  it('no repite un aviso con la misma clave dentro de su enfriamiento', () => {
    const l = log();
    expect(l.add('Construye una Guarida', 0, 'guarida', 600)).toBe(true);
    expect(l.add('Construye una Guarida', 300, 'guarida', 600)).toBe(false);
    expect(l.add('Construye una Guarida', 600, 'guarida', 600)).toBe(true);
    expect(l.add('otro', 300, 'otra-clave', 600)).toBe(true);
  });

  it('recuerda el último aviso aunque haya caducado', () => {
    const l = log();
    expect(l.latest()).toBeNull();
    l.add('hola', 5);
    expect(l.latest()).toEqual({ text: 'hola', tick: 5 });
  });
});
