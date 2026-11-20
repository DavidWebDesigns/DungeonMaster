import { describe, expect, it } from 'vitest';
import {
  AnimBoard,
  ANIM_SECONDS,
  crackStage,
  DEATH_SECONDS,
  deathPose,
  FloaterList,
  floaterPose,
  NEUTRAL_ANIM,
  sampleAnim,
  type CreatureAnimKind,
} from './anim';

describe('animaciones de criaturas', () => {
  it('la bofetada se aplasta primero (más ancho y bajo) y luego se estira', () => {
    const squash = sampleAnim('slap', 0.08);
    const stretch = sampleAnim('slap', 0.22);
    expect(squash.sy).toBeLessThan(1);
    expect(squash.sx).toBeGreaterThan(1);
    expect(stretch.sy).toBeGreaterThan(1);
    expect(stretch.sx).toBeLessThan(1);
  });

  it('todas empiezan y acaban de forma continua y vuelven a la forma normal', () => {
    for (const k of Object.keys(ANIM_SECONDS) as CreatureAnimKind[]) {
      expect(sampleAnim(k, ANIM_SECONDS[k])).toEqual(NEUTRAL_ANIM);
      expect(sampleAnim(k, ANIM_SECONDS[k] + 5)).toEqual(NEUTRAL_ANIM);
      const near = sampleAnim(k, ANIM_SECONDS[k] - 0.001);
      expect(Math.abs(near.sx - 1)).toBeLessThan(0.05);
      expect(Math.abs(near.sy - 1)).toBeLessThan(0.05);
    }
  });

  it('subir de nivel destella y el brillo se apaga', () => {
    expect(sampleAnim('levelUp', 0.1).glow).toBe(1);
    expect(sampleAnim('levelUp', 0.5).glow).toBeLessThan(0.3);
  });

  it('el tablero anima solo a la criatura afectada y se limpia al terminar', () => {
    const b = new AnimBoard();
    b.trigger(7, 'slap', 10);
    expect(b.sample(7, 10.08).sy).toBeLessThan(1);
    expect(b.sample(8, 10.08)).toEqual(NEUTRAL_ANIM);
    expect(b.sample(7, 11)).toEqual(NEUTRAL_ANIM);
    b.trigger(7, 'drop', 20);
    b.forget(7);
    expect(b.sample(7, 20.05)).toEqual(NEUTRAL_ANIM);
  });
});

describe('muerte, flotantes y grietas', () => {
  it('la criatura muerta se aplasta y se desvanece hasta desaparecer', () => {
    expect(deathPose(0)).toMatchObject({ sy: 1, alpha: 1, done: false });
    const mid = deathPose(DEATH_SECONDS / 2);
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(mid.sy).toBeLessThan(1);
    expect(deathPose(DEATH_SECONDS)).toMatchObject({ alpha: 0, done: true });
  });

  it('los números flotantes suben, se desvanecen al final y la lista tiene tope', () => {
    expect(floaterPose(0)).toEqual({ rise: 0, opacity: 1 });
    expect(floaterPose(0.5).rise).toBeGreaterThan(floaterPose(0.1).rise);
    expect(floaterPose(1.09).opacity).toBeLessThan(0.1);
    const l = new FloaterList(3);
    for (let i = 0; i < 5; i++) l.add({ text: String(i), x: 0, y: 0, color: '#fff', born: i });
    expect(l.items.map((f) => f.text)).toEqual(['2', '3', '4']);
    l.prune(4.5);
    expect(l.items.map((f) => f.text)).toEqual(['4']);
  });

  it('el muro se agrieta en dos etapas según el trabajo hecho', () => {
    expect([0, 0.2, 0.34, 0.5, 0.67, 0.99].map((f) => crackStage(f * 4, 4))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(crackStage(1, 0)).toBe(0);
  });
});
