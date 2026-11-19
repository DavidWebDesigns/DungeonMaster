import { describe, expect, it } from 'vitest';
import { generateCode, normalizeCode } from './code';

describe('códigos de sala', () => {
  it('son de 6 letras mayúsculas sin I ni O', () => {
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 200; i++) expect(generateCode(rnd)).toMatch(/^[A-HJ-NP-Z]{6}$/);
  });

  it('se normalizan: mayúsculas, solo letras y 6 como máximo', () => {
    expect(normalizeCode(' abc-123 def ghi ')).toBe('ABCDEF');
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode('ab')).toBe('AB');
  });
});
