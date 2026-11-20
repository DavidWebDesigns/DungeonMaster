import { describe, expect, it } from 'vitest';
import {
  adjustDamage,
  applyStatus,
  isImmune,
  statusOf,
  statusSpeedFactor,
  tickAbilityState,
  unlockedAbilities,
} from './abilities';
import { applyCommand } from './applyCommand';
import { moveSpeed } from './combat';
import { rulesOf } from './rules';
import { duel, run, spawn } from './testUtils';

const setup = () => {
  const { state, data } = duel();
  state.imps = [];
  return { state, data, rules: rulesOf(data) };
};

describe('desbloqueo por nivel', () => {
  it('cada habilidad se tiene desde su nivel y no antes', () => {
    const { state, data, rules } = setup();
    const t1 = spawn(state, data, 1, 'torturer', 5.5, 5.5);
    expect(unlockedAbilities(rules, t1).map((a) => a.id)).toEqual(['torturerEnjoysPain']);
    t1.level = 3;
    expect(unlockedAbilities(rules, t1).map((a) => a.id)).toEqual([
      'torturerEnjoysPain',
      'torturerBind',
    ]);
    const ex = spawn(state, data, 1, 'executioner', 6.5, 5.5);
    expect(unlockedAbilities(rules, ex).map((a) => a.id)).toEqual(['executionerFinisher']);
    ex.level = 4;
    expect(unlockedAbilities(rules, ex).map((a) => a.id)).toEqual([
      'executionerFinisher',
      'executionerIntimidate',
    ]);
    // Las criaturas sin habilidades no tienen ninguna.
    expect(unlockedAbilities(rules, spawn(state, data, 1, 'goblin', 7.5, 5.5))).toEqual([]);
  });
});

describe('daño: Ejecución, Intimidar, Guardia y Debilitar', () => {
  it('Ejecución: +50 % contra objetivos con menos del 30 % de vida, y no por encima', () => {
    const { state, data, rules } = setup();
    const ex = spawn(state, data, 1, 'executioner', 5.5, 5.5);
    const victim = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    victim.hp = 1500 * 0.29;
    expect(adjustDamage(state, rules, ex, victim, 100)).toBeCloseTo(150);
    victim.hp = 1500 * 0.31;
    expect(adjustDamage(state, rules, ex, victim, 100)).toBeCloseTo(100);
    // Quien no la tiene no se beneficia.
    const gob = spawn(state, data, 1, 'goblin', 5.5, 6.5);
    victim.hp = 100;
    expect(adjustDamage(state, rules, gob, victim, 100)).toBeCloseTo(100);
  });

  it('Guardia: −25 % de daño recibido tras 2 s sin moverse', () => {
    const { state, data, rules } = setup();
    const knight = spawn(state, data, 1, 'darkKnight', 5.5, 5.5);
    const attacker = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    knight.stillTicks = 0;
    expect(adjustDamage(state, rules, attacker, knight, 100)).toBeCloseTo(100);
    knight.stillTicks = 19;
    expect(adjustDamage(state, rules, attacker, knight, 100)).toBeCloseTo(100);
    knight.stillTicks = 20;
    expect(adjustDamage(state, rules, attacker, knight, 100)).toBeCloseTo(75);
  });

  it('Intimidar: −15 % al daño de enemigos de nivel 3 o menos a 2 tiles; no de nivel 4, ni lejos, ni propios', () => {
    const { state, data, rules } = setup();
    const ex = spawn(state, data, 1, 'executioner', 5.5, 5.5);
    ex.level = 4;
    const enemy = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    const victim = spawn(state, data, 1, 'troll', 5.5, 6.5);
    enemy.level = 3;
    expect(adjustDamage(state, rules, enemy, victim, 100)).toBeCloseTo(85);
    enemy.level = 4;
    expect(adjustDamage(state, rules, enemy, victim, 100)).toBeCloseTo(100);
    enemy.level = 3;
    enemy.x = 9.5;
    expect(adjustDamage(state, rules, enemy, victim, 100)).toBeCloseTo(100);
    enemy.x = 6.5;
    // Aún sin nivel 4, el Verdugo no intimida.
    ex.level = 3;
    expect(adjustDamage(state, rules, enemy, victim, 100)).toBeCloseTo(100);
    // Un aliado del Verdugo no se ve recortado.
    ex.level = 4;
    const ally = spawn(state, data, 1, 'goblin', 6.5, 6.5);
    expect(
      adjustDamage(state, rules, ally, spawn(state, data, 2, 'troll', 7.5, 6.5), 100),
    ).toBeCloseTo(100);
  });

  it('Debilitar (maldición): −20 % al daño del afectado, y los modificadores se multiplican', () => {
    const { state, data, rules } = setup();
    const attacker = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    const knight = spawn(state, data, 1, 'darkKnight', 5.5, 5.5);
    applyStatus(state, rules, attacker, 'weaken', -0.2, 8);
    expect(adjustDamage(state, rules, attacker, knight, 100)).toBeCloseTo(80);
    knight.stillTicks = 50;
    expect(adjustDamage(state, rules, attacker, knight, 100)).toBeCloseTo(80 * 0.75);
  });
});

describe('estados', () => {
  it('se quedan los que duran más, sin acumular intensidad, ordenados por tipo, y caducan', () => {
    const { state, data, rules } = setup();
    const c = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    applyStatus(state, rules, c, 'slow', -0.4, 5);
    applyStatus(state, rules, c, 'root', 0, 2);
    expect(c.statuses.map((s) => s.kind)).toEqual(['root', 'slow']);
    // Otro "slow" más corto no sustituye al largo; uno más largo sí.
    applyStatus(state, rules, c, 'slow', -0.1, 1);
    expect(c.statuses.find((s) => s.kind === 'slow')!.value).toBe(-0.4);
    applyStatus(state, rules, c, 'slow', -0.1, 9);
    expect(c.statuses.find((s) => s.kind === 'slow')!.value).toBe(-0.1);
    state.tick += 21;
    tickAbilityState(state);
    expect(c.statuses.map((s) => s.kind)).toEqual(['slow']);
    state.tick += 100;
    tickAbilityState(state);
    expect(c.statuses).toEqual([]);
    expect(statusOf(state, c, 'slow')).toBeUndefined();
  });

  it('ralentizar reduce la velocidad; atar y aturdir la dejan en 0', () => {
    const { state, data, rules } = setup();
    const c = spawn(state, data, 2, 'goblin', 6.5, 5.5);
    expect(moveSpeed(state, rules, c)).toBeCloseTo(2.0);
    applyStatus(state, rules, c, 'slow', -0.4, 5);
    expect(statusSpeedFactor(state, c)).toBeCloseTo(0.6);
    expect(moveSpeed(state, rules, c)).toBeCloseTo(1.2);
    applyStatus(state, rules, c, 'root', 0, 2);
    expect(moveSpeed(state, rules, c)).toBe(0);
    c.statuses = [];
    applyStatus(state, rules, c, 'stun', 0, 1);
    expect(moveSpeed(state, rules, c)).toBe(0);
  });

  it('una criatura aturdida no ataca hasta que pasa el aturdimiento; atada sí', () => {
    const { state, data, rules } = setup();
    const a = spawn(state, data, 1, 'goblin', 6.5, 6.5);
    const b = spawn(state, data, 2, 'troll', 7.5, 6.5);
    applyStatus(state, rules, a, 'stun', 0, 3);
    const hpB = b.hp;
    run(state, data, 25);
    expect(b.hp).toBe(hpB);
    run(state, data, 40);
    expect(b.hp).toBeLessThan(hpB);
    // Atada (root) sí puede golpear al que tiene al lado.
    const { state: s2, data: d2, rules: r2 } = setup();
    const c = spawn(s2, d2, 1, 'goblin', 6.5, 6.5);
    const e = spawn(s2, d2, 2, 'troll', 7.5, 6.5);
    applyStatus(s2, r2, c, 'root', 0, 20);
    run(s2, d2, 30);
    expect(e.hp).toBeLessThan(2500);
  });

  it('los ticks sin moverse suben y se reinician al moverse', () => {
    const { state, data } = setup();
    const c = spawn(state, data, 1, 'darkKnight', 6.5, 6.5);
    c.mode = 'idle';
    for (let i = 0; i < 5; i++) tickAbilityState(state);
    expect(c.stillTicks).toBe(5);
    c.mode = 'moving';
    tickAbilityState(state);
    expect(c.stillTicks).toBe(0);
  });
});

describe('Drenar, Disfruta el dolor e inmunidades', () => {
  it('Drenar: el Vampiro se cura la mitad del daño que hace', () => {
    const { state, data, rules } = setup();
    const v = spawn(state, data, 1, 'vampire', 6.5, 6.5);
    const enemy = spawn(state, data, 2, 'troll', 7.5, 6.5);
    // El enemigo está aturdido: solo golpea el Vampiro y la cura se ve limpia.
    applyStatus(state, rules, enemy, 'stun', 0, 100);
    v.hp = 1000;
    let healed = false;
    for (let i = 0; i < 60 && !healed; i++) {
      const before = v.hp;
      const events = run(state, data, 1);
      const dealt = events
        .filter((e) => e.type === 'hit')
        .reduce((n, e) => n + (e as { damage: number }).damage, 0);
      if (dealt > 0) {
        expect(v.hp - before).toBeCloseTo(dealt * 0.5, 5);
        healed = true;
      }
    }
    expect(healed).toBe(true);
    expect(enemy.hp).toBeLessThan(2500);
  });

  it('Disfruta el dolor: la Torturadora sube de ánimo con la bofetada; las demás bajan', () => {
    const { state, data } = setup();
    const t = spawn(state, data, 1, 'torturer', 5.5, 5.5);
    const g = spawn(state, data, 1, 'goblin', 6.5, 5.5);
    t.mood = 50;
    g.mood = 50;
    applyCommand(state, data, 1, { type: 'slap', id: t.id });
    run(state, data, 1);
    expect(t.mood).toBe(53);
    run(state, data, 15);
    applyCommand(state, data, 1, { type: 'slap', id: g.id });
    run(state, data, 1);
    expect(g.mood).toBeLessThan(50);
  });

  it('inmunidades: el Esqueleto al miedo y al veneno, la Salamandra al fuego', () => {
    const { state, data, rules } = setup();
    const sk = spawn(state, data, 1, 'skeleton', 5.5, 5.5);
    const sa = spawn(state, data, 1, 'salamander', 6.5, 5.5);
    const gb = spawn(state, data, 1, 'goblin', 7.5, 5.5);
    expect([
      isImmune(rules, sk, 'fear'),
      isImmune(rules, sk, 'poison'),
      isImmune(rules, sk, 'fire'),
    ]).toEqual([true, true, false]);
    expect([isImmune(rules, sa, 'fire'), isImmune(rules, sa, 'fear')]).toEqual([true, false]);
    expect(isImmune(rules, gb, 'fire')).toBe(false);
  });
});
