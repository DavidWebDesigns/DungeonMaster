import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { applyCommand, newCreature, rulesOf, step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { Hud } from './Hud';
import { buildHudModel, formatClock } from './hudModel';

const data = loadGameData();
const imp = (m: ReturnType<typeof buildHudModel>) => m.spells.find((x) => x.id === 'createImp')!;
const fresh = () => new Sandbox(data, 1);
const dig = { kind: 'dig' } as const;

describe('buildHudModel', () => {
  it('muestra el oro, la capacidad, el maná y los Imps del inicio', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, LOCAL_PLAYER, dig, []);
    expect(m.gold).toBe(5000);
    expect(m.goldCapacity).toBe(9000);
    expect(m.goldFull).toBe(false);
    expect(m.mana).toBe(2000);
    expect(m.manaMax).toBe(5000);
    expect(m.manaRegen).toBeCloseTo(12.1);
    expect(m.imps).toBe(4);
    expect(m.impsMax).toBe(12);
    expect(m.clock).toBe('00:00');
  });

  it('la población muestra criaturas actuales sobre el máximo y se marca llena', () => {
    const sb = fresh();
    const empty = buildHudModel(sb.state, data, 1, dig, []).population;
    // Sin Guarida ni salas de criaturas no cabe nadie: 0/0 y llena.
    expect(empty.count).toBe(0);
    expect(empty.max).toBe(0);
    expect(empty.full).toBe(true);
    expect(empty.hint).toContain('camas libres 0');
    expect(empty.hint).toContain('Limitan las camas');
  });

  it('Reforzar II sale bloqueado hasta tener un Taller de nivel 10 y dice qué pide y cuánto tarda', () => {
    const sb = fresh();
    const find = () =>
      buildHudModel(sb.state, data, 1, dig, []).tools.find((t) => t.id === 'reinforce2')!;
    expect(find()).toMatchObject({
      hotkey: 'V',
      locked: true,
      tool: { kind: 'reinforce', level: 2 },
    });
    expect(find().hint).toContain('Taller de nivel 10');
    sb.state.rooms.push({
      id: 999,
      type: 'workshop',
      owner: 1,
      tiles: Array.from({ length: 10 }, (_, k) => 20 * 64 + k),
      timer: 0,
      stock: 0,
      piglets: 0,
      pigletTimer: 0,
    });
    expect(find().locked).toBe(false);
    expect(find().hint).toContain('30 s');
  });

  it('cuenta los Imps propios que holgazanean', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, []).impsLoafing).toBe(0);
    const mine = sb.state.imps.filter((i) => i.owner === 1);
    mine[0]!.loafUntil = sb.state.tick + 50;
    mine[1]!.loafUntil = sb.state.tick + 50;
    mine[2]!.loafUntil = sb.state.tick - 1; // ya se le pasó
    expect(buildHudModel(sb.state, data, 1, dig, []).impsLoafing).toBe(2);
  });

  it('la lista de criaturas permite recogerlas (clic) y centrarlas (mira); la que va en la mano sale desactivada', () => {
    const sb = fresh();
    const rules = rulesOf(data);
    const a = newCreature(sb.state, rules, 1, 'troll', 9 * 64 + 9);
    const b = newCreature(sb.state, rules, 1, 'goblin', 9 * 64 + 9);
    b.held = true;
    sb.state.creatures.push(a, b);
    const out = render(<Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />);
    expect(out).toContain('recogerla');
    expect(out).toContain('Ver en el mapa');
    expect(out).toContain('Ya la llevas en la mano');
    expect(out.match(/class="locate"/g)).toHaveLength(2);
    expect(out).toMatch(/creature [a-z]+ held" disabled/);
  });

  it('una criatura en combate sale en la lista sin poder recogerse', () => {
    const sb = fresh();
    const rules = rulesOf(data);
    const fighting = newCreature(sb.state, rules, 1, 'troll', 9 * 64 + 9);
    fighting.goal = 'combat';
    const calm = newCreature(sb.state, rules, 1, 'goblin', 9 * 64 + 9);
    sb.state.creatures.push(fighting, calm);
    const model = buildHudModel(sb.state, data, 1, dig, []);
    expect(model.creatures.map((c) => [c.name, c.inCombat])).toEqual([
      ['Troll', true],
      ['Goblin', false],
    ]);
    const out = render(<Hud model={model} onTool={() => {}} />);
    expect(out).toContain('Está en combate: no se puede retirar del mapa');
    expect(out).toContain('recogerla'); // la tranquila sí se puede
  });

  it('el chip de cerditos solo sale con un Criadero y dice la cuenta y el tope', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, []).piglets).toBeNull();
    sb.state.rooms.push({
      id: 90,
      type: 'hatchery',
      owner: 1,
      tiles: [3 * 64 + 3, 3 * 64 + 4],
      timer: 0,
      stock: 0,
      piglets: 5,
      pigletTimer: 0,
    });
    const piglets = buildHudModel(sb.state, data, 1, dig, []).piglets!;
    expect(piglets.count).toBe(5);
    expect(piglets.cap).toBe(0); // sin Guarida no hay población máxima: no se crían más
    expect(piglets.hint).toContain('30 %');
    expect(piglets.hint).toContain('70 %');
    const out = render(<Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />);
    expect(out).toContain('Cerditos 5/0');
  });

  it('el botón de la sala que se coloca enseña el coste en vivo en vez del precio base', () => {
    const sb = fresh();
    const model = buildHudModel(sb.state, data, 1, { kind: 'build', room: 'library' }, []);
    const plain = render(<Hud model={model} onTool={() => {}} />);
    expect(plain).not.toContain('▸');
    const live = render(
      <Hud model={model} onTool={() => {}} liveCost={{ room: 'library', cost: 896, tone: 'ok' }} />,
    );
    expect(live).toContain('cost live ok');
    expect(live).toContain('▸ 896');
    // Solo cambia el botón de esa sala.
    expect(live.match(/▸/g)).toHaveLength(1);
    const poor = render(
      <Hud
        model={model}
        onTool={() => {}}
        liveCost={{ room: 'library', cost: 9999, tone: 'poor' }}
      />,
    );
    expect(poor).toContain('cost live poor');
  });

  it('avisa de Tesorería llena', () => {
    const sb = fresh();
    sb.state.players[0]!.gold = 9000;
    expect(buildHudModel(sb.state, data, 1, dig, []).goldFull).toBe(true);
  });

  it('lista las 10 salas con tecla, coste mínimo y si alcanza el oro', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.rooms.map((r) => [r.hotkey, r.id, r.minCost])).toEqual([
      ['1', 'lair', 300],
      ['2', 'hatchery', 150],
      ['3', 'treasury', 100],
      ['4', 'trainingRoom', 300],
      ['5', 'library', 250],
      ['6', 'tortureChamber', 400],
      ['7', 'workshop', 200],
      ['8', 'graveyard', 350],
      ['9', 'temple', 600],
      ['0', 'casino', 350],
    ]);
    // El coste mínimo es el de 1 tile: con 5.000 de oro alcanza todo.
    expect(m.rooms.every((r) => r.affordable)).toBe(true);
    sb.state.players[0]!.gold = 250;
    const poor = buildHudModel(sb.state, data, 1, dig, []).rooms;
    expect(poor.filter((r) => r.affordable).map((r) => r.id)).toEqual([
      'hatchery',
      'treasury',
      'library',
      'workshop',
    ]);
  });

  it('las salas con requisitos salen bloqueadas y nombran lo que falta', () => {
    const sb = fresh();
    const rooms = buildHudModel(sb.state, data, 1, dig, []).rooms;
    const by = (id: string) => rooms.find((r) => r.id === id)!;
    expect(rooms.filter((r) => !r.available).map((r) => r.id)).toEqual([
      'workshop',
      'graveyard',
      'temple',
      'casino',
    ]);
    expect(by('workshop').requires).toBe('Sala de entrenamiento');
    expect(by('casino').requires).toBe('Sala de entrenamiento');
    expect(by('graveyard').requires).toBe('Biblioteca');
    expect(by('temple').requires).toBe('Cámara de tortura y Cementerio');
    expect(by('lair').requires).toBe('');
    // Al construir el requisito, la sala se desbloquea.
    sb.state.rooms.push({
      id: 90,
      type: 'trainingRoom',
      owner: 1,
      tiles: [],
      timer: 0,
      stock: 0,
      piglets: 0,
      pigletTimer: 0,
    });
    const after = buildHudModel(sb.state, data, 1, dig, []).rooms;
    expect(after.find((r) => r.id === 'workshop')!.available).toBe(true);
    expect(after.find((r) => r.id === 'graveyard')!.available).toBe(false);
  });

  it('marca la herramienta activa', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, { kind: 'build', room: 'lair' }, []);
    expect(m.rooms.find((r) => r.id === 'lair')!.active).toBe(true);
    expect(m.tools.some((t) => t.active)).toBe(false);
    expect(
      buildHudModel(sb.state, data, 1, { kind: 'claim' }, []).tools.find((t) => t.id === 'claim')!
        .active,
    ).toBe(true);
  });

  it('el hechizo Crear Imp muestra su coste, que sube con cada Imp extra, y su enfriamiento', () => {
    const sb = fresh();
    expect(imp(buildHudModel(sb.state, data, 1, dig, []))).toMatchObject({
      cost: 300,
      cooldownLeft: 0,
      affordable: true,
    });
    applyCommand(sb.state, data, 1, {
      type: 'castSpell',
      spell: 'createImp',
      target: { x: 3, y: 8 },
    });
    step(sb.state, data);
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(imp(m).cost).toBe(350);
    expect(imp(m).cooldownLeft).toBeGreaterThan(1.5);
    sb.state.players[0]!.mana = 10;
    expect(imp(buildHudModel(sb.state, data, 1, dig, [])).affordable).toBe(false);
  });

  it('los avisos activos pasan al HUD en el mismo orden', () => {
    const sb = fresh();
    const notices = [
      { text: 'Primero', tick: 0 },
      { text: 'Segundo', tick: 3 },
    ];
    expect(buildHudModel(sb.state, data, 1, dig, notices).notices).toEqual(['Primero', 'Segundo']);
  });

  it('lista las criaturas propias con nivel, ánimo, vida y lo que hacen', () => {
    const sb = fresh();
    const goblin = newCreature(sb.state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
    goblin.hp = 750;
    goblin.goal = 'training';
    goblin.mode = 'acting';
    sb.state.creatures.push(goblin);
    const other = newCreature(sb.state, rulesOf(data), 2, 'troll', 9 * 64 + 9);
    sb.state.creatures.push(other);
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.creatures).toHaveLength(1);
    expect(m.creatures[0]).toMatchObject({
      name: 'Goblin',
      level: 1,
      band: 'neutral',
      bandName: 'Neutral',
      activity: 'Entrenando',
      hpFraction: 0.5,
      held: false,
    });
  });

  it('cuenta la mano y los segundos que faltan para el día de pago', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, []).payday).toBe(180);
    sb.state.tick = 300;
    expect(buildHudModel(sb.state, data, 1, dig, []).payday).toBe(150);
    sb.state.players[0]!.hand = [
      { kind: 'creature', id: 1 },
      { kind: 'imp', id: 1 },
    ];
    expect(buildHudModel(sb.state, data, 1, dig, []).hand).toEqual({ count: 2, capacity: 10 });
  });

  it('el reloj da minutos y segundos de juego', () => {
    expect(formatClock(0, 10)).toBe('00:00');
    expect(formatClock(605, 10)).toBe('01:00');
    expect(formatClock(36_000, 10)).toBe('60:00');
  });

  it('un jugador que no existe es un error claro', () => {
    expect(() => buildHudModel(fresh().state, data, 9, dig, [])).toThrow(/jugador 9/);
  });
});

describe('Hud', () => {
  const html = (over: (m: ReturnType<typeof buildHudModel>) => void = () => {}) => {
    const sb = fresh();
    const model = buildHudModel(sb.state, data, 1, dig, []);
    over(model);
    return render(<Hud model={model} onTool={() => {}} />);
  };

  it('pinta oro, maná, Imps y las 5 salas con sus atajos', () => {
    const out = html();
    expect(out).toContain('Oro 5000 / 9000');
    expect(out).toContain('Maná 2000');
    expect(out).toContain('Imps 4/12');
    for (const name of ['Guarida', 'Criadero', 'Tesorería', 'Sala de entrenamiento', 'Biblioteca'])
      expect(out).toContain(name);
    expect(out).toContain('Crear Imp');
  });

  it('muestra el aviso cuando lo hay y no cuando no', () => {
    expect(html()).not.toContain('class="notice"');
    expect(html((m) => (m.notices = ['La Tesorería está llena.']))).toContain(
      'La Tesorería está llena.',
    );
  });

  it('marca la Tesorería llena y las salas que no se pueden pagar', () => {
    expect(html((m) => (m.goldFull = true))).toContain('LLENA');
    const poor = html((m) => m.rooms.forEach((r) => (r.affordable = false)));
    expect(poor.match(/btn poor/g)?.length).toBe(6);
  });

  it('pinta la lista de criaturas con su actividad y el contador de pago y de la mano', () => {
    const sb = fresh();
    const c = newCreature(sb.state, rulesOf(data), 1, 'troll', 9 * 64 + 9);
    sb.state.creatures.push(c);
    sb.state.players[0]!.hand = [{ kind: 'creature', id: c.id }];
    const out = render(<Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />);
    expect(out).toContain('Criaturas (1)');
    expect(out).toContain('Troll');
    expect(out).toContain('Descansando');
    expect(out).toContain('Pago 180 s');
    expect(out).toContain('Mano 1/10');
  });

  it('sin criaturas no hay panel de criaturas ni contador de mano', () => {
    const out = html();
    expect(out).not.toContain('Criaturas (');
    expect(out).not.toContain('Mano ');
  });
});

describe('hechizos y fin de partida en el HUD', () => {
  it('lista los cinco hechizos con su tecla Q W E R T, su coste y a qué se apunta', () => {
    const m = buildHudModel(fresh().state, data, 1, dig, []);
    expect(m.spells.map((x) => [x.hotkey, x.id, x.cost, x.target])).toEqual([
      ['Q', 'createImp', 300, 'tile'],
      ['W', 'callToArms', 600, 'tile'],
      ['E', 'haste', 300, 'creature'],
      ['R', 'heal', 400, 'creature'],
      ['T', 'lightning', 500, 'tile'],
    ]);
    expect(m.spells.every((x) => x.affordable && x.cooldownLeft === 0)).toBe(true);
  });

  it('marca el hechizo activo y los que no se pueden pagar', () => {
    const sb = fresh();
    sb.state.players[0]!.mana = 350;
    const m = buildHudModel(sb.state, data, 1, { kind: 'spell', spell: 'heal' }, []);
    expect(m.spells.find((x) => x.id === 'heal')!.active).toBe(true);
    expect(m.spells.filter((x) => !x.affordable).map((x) => x.id)).toEqual([
      'callToArms',
      'heal',
      'lightning',
    ]);
  });

  it('con un solo jugador no hay botón de rendirse ni pantalla final', () => {
    const m = buildHudModel(fresh().state, data, 1, dig, []);
    expect(m.canSurrender).toBe(false);
    expect(m.gameOver).toBeNull();
  });

  it('con rival se puede rendir; y el resultado se cuenta desde el punto de vista del jugador', () => {
    const sb = new Sandbox(data, 1, { opponent: true });
    expect(buildHudModel(sb.state, data, 1, dig, []).canSurrender).toBe(true);
    sb.state.status = 'ended';
    sb.state.result = { winners: [1], reason: 'lastStanding', tick: 6000 };
    const win = buildHudModel(sb.state, data, 1, dig, []);
    expect(win.gameOver).toMatchObject({ outcome: 'victory', title: '¡Victoria!' });
    expect(win.gameOver!.detail).toContain('10:00');
    expect(win.canSurrender).toBe(false);
    expect(buildHudModel(sb.state, data, 2, dig, []).gameOver).toMatchObject({
      outcome: 'defeat',
      title: 'Derrota',
    });
    sb.state.result = { winners: [1, 2], reason: 'draw', tick: 100 };
    expect(buildHudModel(sb.state, data, 1, dig, []).gameOver!.outcome).toBe('draw');
    sb.state.result = { winners: [1], reason: 'timeout', tick: 27000 };
    expect(buildHudModel(sb.state, data, 1, dig, []).gameOver!.detail).toContain('desempate');
  });

  it('el HUD pinta los cinco hechizos, el botón de rendirse con su confirmación y la pantalla final', () => {
    const sb = new Sandbox(data, 1, { opponent: true });
    const model = buildHudModel(sb.state, data, 1, dig, []);
    const out = render(<Hud model={model} onTool={() => {}} />);
    for (const n of ['Crear Imp', 'Llamada a las armas', 'Acelerar', 'Curar', 'Rayo'])
      expect(out).toContain(n);
    expect(out).toContain('Rendirse');
    expect(render(<Hud model={model} onTool={() => {}} surrenderArmed />)).toContain(
      '¿Seguro? Pulsa otra vez',
    );
    sb.state.status = 'ended';
    sb.state.result = { winners: [2], reason: 'lastStanding', tick: 3000 };
    const over = render(
      <Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />,
    );
    expect(over).toContain('Derrota');
    expect(over).toContain('Jugar de nuevo');
    expect(over).not.toContain('Rendirse');
  });
});

describe('trampas en el HUD', () => {
  it('lista las trampas con su tecla (letras G H J K L N), coste y sala que piden', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.traps.map((t) => [t.hotkey, t.id, t.cost, t.requires, t.available])).toEqual([
      ['G', 'spikeTrap', 300, 'Taller', false],
      ['H', 'boulderTrap', 600, 'Taller', false],
      ['J', 'crushingWalls', 800, 'Taller', false],
      ['K', 'frostTrap', 450, 'Taller, Cámara de tortura y Biblioteca', false],
      ['L', 'fireTrap', 500, 'Taller, Cámara de tortura y Biblioteca', false],
      ['N', 'lightningTrap', 650, 'Taller, Cámara de tortura y Biblioteca', false],
    ]);
  });

  it('las puertas van aparte, con sus teclas O e I: la básica sin requisitos y la reforzada con Taller', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.doors.map((t) => [t.hotkey, t.id, t.cost, t.requires, t.available])).toEqual([
      ['O', 'basicDoor', 250, '', true],
      ['I', 'reinforcedDoor', 600, 'Taller', false],
    ]);
    // Y no se mezclan con las trampas.
    expect(m.traps.map((t) => t.id)).not.toContain('basicDoor');
  });

  it('quedan disponibles al construir sus salas y marcan la activa y las que no se pueden pagar', () => {
    const sb = fresh();
    for (const [i, type] of ['workshop', 'tortureChamber', 'library'].entries())
      sb.state.rooms.push({
        id: 90 + i,
        type,
        owner: 1,
        tiles: [],
        timer: 0,
        stock: 0,
        piglets: 0,
        pigletTimer: 0,
      });
    sb.state.players[0]!.gold = 400;
    const m = buildHudModel(sb.state, data, 1, { kind: 'trap', trap: 'fireTrap' }, []);
    expect(m.traps.every((t) => t.available)).toBe(true);
    expect(m.traps.find((t) => t.id === 'spikeTrap')!.affordable).toBe(true);
    expect(m.traps.find((t) => t.id === 'fireTrap')).toMatchObject({
      affordable: false,
      active: true,
    });
  });

  it('el HUD pinta las trampas y marca como bloqueadas las que aún no se pueden usar', () => {
    const sb = fresh();
    const out = render(<Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />);
    expect(out).toContain('Trampa de pinchos');
    expect(out).toContain('Trampa de fuego');
    expect(out).toContain('btn locked');
    expect(out).toContain('Cámara de tortura');
  });
});
