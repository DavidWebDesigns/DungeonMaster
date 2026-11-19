import { describe, expect, it } from 'vitest';
import type { Command, CommandResult } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { InputModel } from './inputModel';
import { keyAction } from './keymap';
import { newCreature, rulesOf } from '@dm/shared';
import { errorMessage } from './messages';

const data = loadGameData();
const pt = (x: number, y: number) => ({ x, y });

function setup() {
  const sandbox = new Sandbox(data, 1);
  const sent: Array<{ cmd: Command; res: CommandResult }> = [];
  const host = {
    state: sandbox.state,
    data,
    player: LOCAL_PLAYER,
    send: (cmd: Command) => sandbox.send(cmd),
  };
  const input = new InputModel(host, (cmd, res) => sent.push({ cmd, res }));
  return { sandbox, input, sent };
}

describe('excavar arrastrando', () => {
  it('arrastrar un rectángulo envía un dig con todos sus tiles', () => {
    const { input, sent } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerMove(pt(13, 4));
    input.pointerUp(pt(13, 4));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.cmd).toEqual({ type: 'dig', tiles: [pt(11, 4), pt(12, 4), pt(13, 4)] });
    expect(sent[0]!.res).toEqual({ ok: true, accepted: 3 });
  });

  it('un clic simple marca un solo tile', () => {
    const { input, sent } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerUp(pt(11, 4));
    expect(sent[0]!.cmd).toEqual({ type: 'dig', tiles: [pt(11, 4)] });
  });

  it('Mayús+arrastrar deshace las marcas', () => {
    const { input, sent, sandbox } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerUp(pt(12, 4));
    sandbox.advance(100);
    input.pointerDown(pt(11, 4), 0, true);
    input.pointerUp(pt(12, 4));
    expect(sent[1]!.cmd.type).toBe('cancelDig');
    expect(sent[1]!.res.ok).toBe(true);
  });

  it('sin tocar la simulación mientras se arrastra: solo se envía al soltar', () => {
    const { input, sent } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerMove(pt(15, 6));
    expect(sent).toHaveLength(0);
    expect(input.dragging).toBe(true);
  });

  it('soltar fuera del mapa usa la última posición conocida; sin ninguna, no hace nada', () => {
    const { input, sent } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerMove(pt(12, 4));
    input.pointerUp(null);
    expect(sent[0]!.cmd).toEqual({ type: 'dig', tiles: [pt(11, 4), pt(12, 4)] });
  });

  it('una selección de más de 64 tiles se manda en trozos, uno por tick', () => {
    const { input, sent, sandbox } = setup();
    // 12 x 9 = 108 tiles de tierra pegados a la base.
    input.pointerDown(pt(11, 2), 0);
    input.pointerUp(pt(22, 10));
    expect(sent).toHaveLength(1);
    expect(input.pending).toBe(1);
    input.pump(); // todavía en el mismo tick: no se envía
    expect(input.pending).toBe(1);
    sandbox.advance(100);
    input.pump();
    expect(input.pending).toBe(0);
    expect(sent).toHaveLength(2);
    const sizes = sent.map((s) => (s.cmd as { tiles: unknown[] }).tiles.length);
    expect(sizes).toEqual([64, 44]);
  });

  it('los trozos siguientes fallidos no molestan con avisos de error', () => {
    const { input, sent, sandbox } = setup();
    input.pointerDown(pt(20, 40), 0); // tierra lejos de todo suelo: nada es alcanzable
    input.pointerUp(pt(32, 48));
    expect(sent[0]!.res.ok).toBe(false);
    sandbox.advance(100);
    input.pump();
    expect(sent).toHaveLength(1);
  });
});

describe('herramientas', () => {
  it('reclamar y reforzar usan su propio comando', () => {
    const { input, sent } = setup();
    input.setTool({ kind: 'reinforce' });
    input.pointerDown(pt(11, 4), 0);
    input.pointerUp(pt(11, 5));
    expect(sent[0]!.cmd.type).toBe('reinforce');
    input.setTool({ kind: 'claim' });
    input.pointerDown(pt(11, 4), 0);
    input.pointerUp(pt(11, 4));
    expect(sent[1]!.cmd.type).toBe('claim');
  });

  it('el clic derecho cancela un arrastre y, si no hay, vuelve a excavar', () => {
    const { input, sent } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.pointerDown(null, 2);
    expect(input.dragging).toBe(false);
    input.pointerUp(pt(12, 4));
    expect(sent).toHaveLength(0);
    input.setTool({ kind: 'claim' });
    input.pointerDown(null, 2);
    expect(input.tool).toEqual({ kind: 'dig' });
  });

  it('cambiar de herramienta suelta lo que se arrastraba', () => {
    const { input } = setup();
    input.pointerDown(pt(11, 4), 0);
    input.setTool({ kind: 'claim' });
    expect(input.dragging).toBe(false);
  });
});

describe('construir salas', () => {
  it('un clic construye una Guarida del tamaño mínimo y se cobra tras el tick', () => {
    const { input, sent, sandbox } = setup();
    input.setTool({ kind: 'build', room: 'lair' });
    input.pointerDown(pt(6, 2), 0);
    input.pointerUp(pt(6, 2));
    expect(sent[0]!.cmd).toEqual({
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 6, y: 2, w: 2, h: 2 },
    });
    expect(sent[0]!.res.ok).toBe(true);
    sandbox.advance(100);
    expect(sandbox.state.rooms.some((r) => r.type === 'lair')).toBe(true);
  });

  it('se mantiene en modo construir para poner más salas', () => {
    const { input } = setup();
    input.setTool({ kind: 'build', room: 'lair' });
    input.pointerDown(pt(6, 2), 0);
    input.pointerUp(pt(6, 2));
    expect(input.tool).toEqual({ kind: 'build', room: 'lair' });
  });

  it('el fantasma sigue al ratón y marca válida o inválida', () => {
    const { input } = setup();
    input.setTool({ kind: 'build', room: 'lair' });
    expect(input.preview()).toEqual({ kind: 'none' });
    input.pointerMove(pt(6, 2));
    const ok = input.preview();
    expect(ok).toMatchObject({ kind: 'room', room: { valid: true, cost: 1200 } });
    input.pointerMove(pt(5, 5));
    expect(input.preview()).toMatchObject({
      kind: 'room',
      room: { valid: false, error: 'INVALID_TARGET' },
    });
  });

  it('sin oro el fantasma avisa NO_GOLD y la orden se rechaza con ese código', () => {
    const { input, sent, sandbox } = setup();
    sandbox.state.players[0]!.gold = 0;
    input.setTool({ kind: 'build', room: 'lair' });
    input.pointerMove(pt(6, 2));
    expect(input.preview()).toMatchObject({ room: { valid: false, error: 'NO_GOLD' } });
    input.pointerDown(pt(6, 2), 0);
    input.pointerUp(pt(6, 2));
    expect(sent[0]!.res).toEqual({ ok: false, error: 'NO_GOLD' });
  });
});

describe('vender y hechizos', () => {
  it('vender con un clic sobre una sala propia', () => {
    const { input, sent, sandbox } = setup();
    input.setTool({ kind: 'build', room: 'lair' });
    input.pointerDown(pt(6, 2), 0);
    input.pointerUp(pt(6, 2));
    sandbox.advance(100);
    input.setTool({ kind: 'sell' });
    input.pointerMove(pt(6, 2));
    expect(input.preview()).toEqual({ kind: 'target', tile: pt(6, 2), ok: true });
    input.pointerDown(pt(6, 2), 0);
    expect(sent.at(-1)!.cmd).toEqual({ type: 'sellRoom', tile: pt(6, 2) });
    expect(sent.at(-1)!.res.ok).toBe(true);
  });

  it('no se puede vender el Corazón: el cursor lo marca inválido', () => {
    const { input } = setup();
    input.setTool({ kind: 'sell' });
    input.pointerMove(pt(6, 6));
    expect(input.preview()).toMatchObject({ kind: 'target', ok: false });
  });

  it('Crear Imp con un clic en suelo propio', () => {
    const { input, sent, sandbox } = setup();
    input.setTool({ kind: 'spell', spell: 'createImp' });
    input.pointerDown(pt(3, 8), 0);
    expect(sent[0]!.res.ok).toBe(true);
    sandbox.advance(100);
    expect(sandbox.state.imps).toHaveLength(5);
  });

  it('Crear Imp fuera de tu territorio da INVALID_TARGET', () => {
    const { input, sent } = setup();
    input.setTool({ kind: 'spell', spell: 'createImp' });
    input.pointerDown(pt(30, 30), 0);
    expect(sent[0]!.res).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });
});

describe('vista previa de tiles', () => {
  it('pinta en verde la tierra y en rojo lo que no se puede excavar', () => {
    const { input } = setup();
    input.pointerDown(pt(10, 4), 0);
    input.pointerMove(pt(12, 4));
    const p = input.preview();
    expect(p.kind).toBe('tiles');
    if (p.kind === 'tiles') {
      expect(p.valid).toEqual([pt(11, 4), pt(12, 4)]);
      expect(p.invalid).toEqual([pt(10, 4)]);
    }
  });

  it('sin arrastrar, resalta solo el tile bajo el ratón', () => {
    const { input } = setup();
    input.pointerMove(pt(11, 4));
    expect(input.preview()).toMatchObject({ kind: 'tiles', valid: [pt(11, 4)], invalid: [] });
    input.pointerMove(null);
    expect(input.preview()).toEqual({ kind: 'none' });
  });
});

describe('hechizos con el ratón', () => {
  it('Acelerar y Curar se lanzan sobre la criatura propia bajo el cursor', () => {
    const { input, sent, sandbox } = setup();
    sandbox.state.players[0]!.mana = 5000;
    const c = newCreature(sandbox.state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
    sandbox.state.creatures.push(c);
    input.setTool({ kind: 'spell', spell: 'haste' });
    input.pointerMove(pt(9, 9), c.id);
    input.pointerDown(pt(9, 9), 0, false, c.id);
    expect(sent[0]!.cmd).toEqual({ type: 'castSpell', spell: 'haste', creature: c.id });
    expect(sent[0]!.res.ok).toBe(true);
    // Sin criatura debajo, el hechizo se rechaza con INVALID_TARGET.
    input.setTool({ kind: 'spell', spell: 'heal' });
    input.pointerDown(pt(3, 8), 0);
    expect(sent[1]!.res).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });

  it('Rayo y Llamada a las armas se lanzan sobre un tile', () => {
    const { input, sent, sandbox } = setup();
    sandbox.state.players[0]!.mana = 5000;
    input.setTool({ kind: 'spell', spell: 'lightning' });
    input.pointerDown(pt(5, 8), 0);
    expect(sent[0]!.cmd).toEqual({ type: 'castSpell', spell: 'lightning', target: pt(5, 8) });
    expect(sent[0]!.res.ok).toBe(true);
    input.setTool({ kind: 'spell', spell: 'callToArms' });
    input.pointerDown(pt(8, 4), 0);
    expect(sent[1]!.cmd).toEqual({ type: 'castSpell', spell: 'callToArms', target: pt(8, 4) });
    expect(sent[1]!.res.ok).toBe(true);
  });

  it('el cursor marca en rojo un Rayo fuera de la vista y en verde uno dentro', () => {
    const { input, sandbox } = setup();
    sandbox.state.players[0]!.mana = 5000;
    input.setTool({ kind: 'spell', spell: 'lightning' });
    input.pointerMove(pt(5, 8));
    expect(input.preview()).toMatchObject({ kind: 'target', ok: true });
    input.pointerMove(pt(40, 40));
    expect(input.preview()).toMatchObject({ kind: 'target', ok: false });
  });
});

describe('atajos de teclado', () => {
  it('1 a 5 eligen las 5 salas construibles en el orden del plan', () => {
    const rooms = ['lair', 'hatchery', 'treasury', 'trainingRoom', 'library'];
    rooms.forEach((room, i) => {
      expect(keyAction(String(i + 1), data)).toEqual({
        type: 'tool',
        tool: { kind: 'build', room },
      });
    });
    expect(keyAction('6', data)).toBeNull();
  });

  it('el resto de atajos', () => {
    expect(keyAction('q', data)).toEqual({
      type: 'tool',
      tool: { kind: 'spell', spell: 'createImp' },
    });
    expect(keyAction('F', data)).toEqual({ type: 'tool', tool: { kind: 'reinforce' } });
    expect(keyAction('c', data)).toEqual({ type: 'tool', tool: { kind: 'claim' } });
    expect(keyAction('u', data)).toEqual({ type: 'tool', tool: { kind: 'cancelDig' } });
    expect(keyAction('Delete', data)).toEqual({ type: 'tool', tool: { kind: 'sell' } });
    expect(keyAction('Escape', data)).toEqual({ type: 'cancel' });
    expect(keyAction(' ', data)).toEqual({ type: 'center' });
    expect(keyAction('z', data)).toEqual({ type: 'rotate', step: -1 });
    expect(keyAction('x', data)).toEqual({ type: 'rotate', step: 1 });
    expect(keyAction('p', data)).toBeNull();
  });
});

describe('mensajes', () => {
  it('todos los códigos de error tienen texto en español', () => {
    for (const code of [
      'NO_GOLD',
      'NO_MANA',
      'INVALID_TARGET',
      'OUT_OF_RANGE',
      'COOLDOWN',
      'NOT_OWNER',
      'RATE_LIMIT',
      'LIMIT_REACHED',
      'INVALID_COMMAND',
    ] as const) {
      expect(errorMessage(code).length).toBeGreaterThan(5);
    }
  });
});

describe('la mano', () => {
  function withCreature() {
    const ctx = setup();
    const c = newCreature(ctx.sandbox.state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
    ctx.sandbox.state.creatures.push(c);
    return { ...ctx, c };
  }

  it('un clic sobre una criatura propia con la herramienta de excavar la recoge', () => {
    const { input, sent, sandbox, c } = withCreature();
    input.pointerDown(pt(9, 9), 0, false, c.id);
    expect(sent[0]!.cmd).toEqual({ type: 'pickUp', id: c.id });
    expect(sent[0]!.res.ok).toBe(true);
    sandbox.advance(100);
    expect(c.held).toBe(true);
    expect(input.handSize).toBe(1);
  });

  it('con la herramienta de construir, un clic sobre una criatura no la recoge', () => {
    const { input, sent, c } = withCreature();
    input.setTool({ kind: 'build', room: 'lair' });
    input.pointerDown(pt(6, 2), 0, false, c.id);
    input.pointerUp(pt(6, 2));
    expect(sent.every((s) => s.cmd.type !== 'pickUp')).toBe(true);
  });

  it('el clic derecho con criaturas en la mano las suelta donde está el cursor', () => {
    const { input, sent, sandbox, c } = withCreature();
    input.pointerDown(pt(9, 9), 0, false, c.id);
    sandbox.advance(100);
    input.pointerDown(pt(3, 8), 2);
    expect(sent.at(-1)!.cmd).toEqual({ type: 'drop', tile: pt(3, 8) });
    expect(sent.at(-1)!.res.ok).toBe(true);
    sandbox.advance(100);
    expect(c.held).toBe(false);
    expect([Math.floor(c.x), Math.floor(c.y)]).toEqual([3, 8]);
    // Con la mano vacía, el clic derecho vuelve a excavar.
    input.setTool({ kind: 'claim' });
    input.pointerDown(pt(3, 8), 2);
    expect(input.tool).toEqual({ kind: 'dig' });
  });

  it('con la mano llena el cursor muestra si se puede soltar ahí', () => {
    const { input, sandbox, c } = withCreature();
    input.pointerDown(pt(9, 9), 0, false, c.id);
    sandbox.advance(100);
    input.pointerMove(pt(3, 8));
    expect(input.preview()).toEqual({ kind: 'target', tile: pt(3, 8), ok: true });
    input.pointerMove(pt(11, 4));
    expect(input.preview()).toEqual({ kind: 'target', tile: pt(11, 4), ok: false });
  });

  it('B abofetea a la criatura bajo el cursor y respeta el enfriamiento', () => {
    const { input, sent, sandbox, c } = withCreature();
    input.slapHovered(); // sin criatura bajo el cursor: no hace nada
    expect(sent).toHaveLength(0);
    input.pointerMove(pt(9, 9), c.id);
    input.slapHovered();
    expect(sent[0]!.cmd).toEqual({ type: 'slap', id: c.id });
    sandbox.advance(100);
    expect(c.mood).toBe(57);
    input.slapHovered();
    expect(sent[1]!.res).toEqual({ ok: false, error: 'COOLDOWN' });
  });

  it('el atajo B es la bofetada', () => {
    expect(keyAction('b', data)).toEqual({ type: 'slap' });
  });
});
