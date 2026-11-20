import { describe, expect, it } from 'vitest';
import type { Command } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { Sandbox } from '../sandbox/sandbox';
import { attractingRooms } from '../ui/advisor';
import { errorMessage } from './messages';

const data = structuredClone(loadGameData());
data.rooms.find((r) => r.id === 'trainingRoom')!.requiresRooms = ['library', 'hatchery'];

describe('errorMessage con contexto', () => {
  const sb = new Sandbox(data, 1);
  const ctx = (cmd: Command) => ({ cmd, data, state: sb.state, player: 1 });

  it('REQUIRES_ROOM de una sala nombra las salas que faltan', () => {
    const m = errorMessage(
      'REQUIRES_ROOM',
      ctx({ type: 'buildRoom', room: 'trainingRoom', rect: { x: 2, y: 14, w: 3, h: 3 } }),
    );
    expect(m).toBe('Te falta construir: Biblioteca y Criadero.');
  });

  it('REQUIRES_ROOM de una trampa nombra la sala que pide', () => {
    const m = errorMessage(
      'REQUIRES_ROOM',
      ctx({ type: 'buildTrap', trap: 'spikeTrap', tile: { x: 3, y: 3 } }),
    );
    expect(m).toBe('Te falta construir: Taller.');
  });

  it('sin contexto, o con otro código, da el texto genérico', () => {
    expect(errorMessage('REQUIRES_ROOM')).toContain('Te falta construir una sala');
    expect(errorMessage('NO_GOLD')).toBe('No tienes oro suficiente.');
  });
});

describe('attractingRooms', () => {
  it('lista, desde los datos, las salas (menos la Guarida) que hacen llegar criaturas', () => {
    const names = attractingRooms(loadGameData());
    expect(names).toContain('Sala de entrenamiento');
    expect(names).toContain('Biblioteca');
    expect(names).not.toContain('Guarida');
  });
});
