/**
 * Espejo del cliente: reconstruye, a partir de los deltas del servidor, un `MatchState` con lo que este jugador sabe.
 * Lo desconocido es roca sólida sin dueño. Así el código del cliente (dibujo, HUD, vista previa de comandos) funciona igual
 * que con el sandbox: solo lee el estado y manda comandos; el servidor decide.
 */
import type { DataSet } from '../data';
import { makeImp } from '../sim/createMatch';
import { newCreature } from './../sim/portal';
import { rulesOf } from '../sim/rules';
import type { Creature, MatchState, PlayerId, PlayerState, Room, Task, Trap } from '../sim/types';
import { STATUS_KINDS, type Delta, type EntityRec } from './view';

const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

export class Mirror {
  readonly state: MatchState;
  private readonly rules: ReturnType<typeof rulesOf>;
  private readonly unknownTerrain: number;
  private creatures = new Map<number, Creature>();
  private imps = new Map<number, MatchState['imps'][number]>();
  private rooms = new Map<number, Room>();
  private traps = new Map<number, Trap>();
  private tasks = new Map<number, Task>();
  /** Mensajes recibidos (para medir ancho de banda en pruebas). */
  deltas = 0;

  constructor(
    private readonly data: DataSet,
    readonly me: PlayerId,
  ) {
    this.rules = rulesOf(data);
    this.unknownTerrain = this.rules.terrainIndex['solidRock'] as number;
    this.state = this.blankState();
  }

  private blankState(): MatchState {
    const { width, height } = this.data.map;
    const n = width * height;
    return {
      tick: 0,
      seed: 0,
      rng: 0,
      mapVersion: 1,
      width,
      height,
      terrain: new Array<number>(n).fill(this.unknownTerrain),
      owner: new Array<number>(n).fill(0),
      goldLeft: new Array<number>(n).fill(0),
      roomAt: new Array<number>(n).fill(0),
      players: [],
      imps: [],
      creatures: [],
      tasks: [],
      rooms: [],
      traps: [],
      nextTrapId: 1,
      nextImpId: 1,
      nextCreatureId: 1,
      nextPayTick: 0,
      nextTaskId: 1,
      nextRoomId: 1,
      revives: [],
      tileDamage: new Array<number>(n).fill(0),
      status: 'playing',
      result: null,
      queue: [],
      log: [],
    };
  }

  private player(id: PlayerId, slot = 0): PlayerState {
    let p = this.state.players.find((k) => k.id === id);
    if (!p) {
      p = {
        id,
        slot,
        gold: 0,
        mana: 0,
        heartHp: 0,
        eliminated: false,
        cooldowns: {},
        rateSecond: -1,
        rateCount: 0,
        hand: [],
        slapReadyTick: 0,
        rallyTile: -1,
        rallyUntil: 0,
        seen: new Array<number>(this.state.width * this.state.height).fill(0),
      };
      this.state.players.push(p);
      this.state.players.sort((a, b) => a.id - b.id);
    }
    return p;
  }

  /** Aplica un delta del servidor. */
  apply(d: Delta): void {
    const s = this.state;
    this.deltas++;
    if (d.snapshot) {
      Object.assign(s, this.blankState());
      this.creatures.clear();
      this.imps.clear();
      this.rooms.clear();
      this.traps.clear();
      this.tasks.clear();
    }
    s.tick = d.tick;

    let tilesChanged = false;
    if (d.tiles) {
      for (let k = 0; k < d.tiles.length; k += 4) {
        const i = d.tiles[k] as number;
        s.terrain[i] = d.tiles[k + 1] as number;
        s.owner[i] = d.tiles[k + 2] as number;
        s.roomAt[i] = Math.max(0, d.tiles[k + 3] as number);
      }
      tilesChanged = true;
    }
    if (d.scalars) this.applyScalars(d.scalars);
    if (d.seen) {
      const me = this.player(this.me);
      for (const i of d.seen) me.seen[i] = 1;
    }
    if (d.set) for (const [key, rec] of Object.entries(d.set)) this.upsert(key, rec);
    if (d.del) for (const key of d.del) this.remove(key);
    if (tilesChanged || d.set) this.rebuildRooms();
    s.creatures = [...this.creatures.values()].sort((a, b) => a.id - b.id);
    s.imps = [...this.imps.values()].sort((a, b) => a.id - b.id);
    s.traps = [...this.traps.values()].sort((a, b) => a.id - b.id);
    s.tasks = [...this.tasks.values()].sort((a, b) => a.id - b.id);
    if (tilesChanged) s.mapVersion++;
  }

  private applyScalars(sc: Record<string, unknown>): void {
    const s = this.state;
    if ('status' in sc) s.status = sc['status'] === 'ended' ? 'ended' : 'playing';
    if ('result' in sc) s.result = (sc['result'] as MatchState['result']) ?? null;
    if ('nextPay' in sc) s.nextPayTick = num(sc['nextPay']);
    if ('pl' in sc) {
      for (const row of sc['pl'] as number[][]) {
        const p = this.player(row[0] as number, row[1] as number);
        p.slot = row[1] as number;
        p.eliminated = row[2] === 1;
        if ((row[3] as number) >= 0) p.heartHp = row[3] as number;
      }
    }
    const me = this.player(this.me);
    if ('gold' in sc) me.gold = num(sc['gold']);
    if ('mana' in sc) me.mana = num(sc['mana']);
    if ('cd' in sc) me.cooldowns = { ...(sc['cd'] as Record<string, number>) };
    if ('hand' in sc)
      me.hand = (sc['hand'] as number[][]).map(([kind, id]) => ({
        kind: kind === 1 ? 'imp' : 'creature',
        id: id as number,
      }));
    if ('slapAt' in sc) me.slapReadyTick = num(sc['slapAt']);
    if ('rally' in sc) {
      const r = sc['rally'] as number[];
      me.rallyTile = r[0] as number;
      me.rallyUntil = r[1] as number;
    }
  }

  private upsert(key: string, rec: EntityRec): void {
    const id = Number(key.slice(2));
    switch (key[0]) {
      case 'c': {
        let c = this.creatures.get(id);
        if (!c) {
          const tile = Math.floor(num(rec['y'])) * this.state.width + Math.floor(num(rec['x']));
          c = newCreature(this.state, this.rules, num(rec['o']), str(rec['t']), tile);
          c.id = id;
          this.creatures.set(id, c);
        }
        if ('o' in rec) c.owner = num(rec['o']);
        if ('t' in rec) c.type = str(rec['t']);
        if ('x' in rec) c.x = num(rec['x']);
        if ('y' in rec) c.y = num(rec['y']);
        if ('l' in rec) c.level = num(rec['l']);
        if ('h' in rec) c.hp = num(rec['h']);
        if ('hd' in rec) c.held = rec['hd'] === 1;
        if ('m' in rec) c.mood = num(rec['m']);
        if ('b' in rec) c.band = str(rec['b']);
        if ('g' in rec) c.goal = str(rec['g']) as Creature['goal'];
        if ('d' in rec) c.mode = str(rec['d']) as Creature['mode'];
        if ('xp' in rec) c.xp = num(rec['xp']);
        if ('hu' in rec) c.hunger = num(rec['hu']);
        if ('sl' in rec) c.sleep = num(rec['sl']);
        if ('bd' in rec) c.beds = [...(rec['bd'] as number[])];
        if ('su' in rec) c.slapUntil = num(rec['su']);
        if ('ha' in rec) c.hasteUntil = num(rec['ha']);
        if ('st' in rec)
          c.statuses = (rec['st'] as number[][]).map(([k, until, value]) => ({
            kind: STATUS_KINDS[k as number] ?? 'slow',
            until: until as number,
            value: (value as number) / 100,
          }));
        break;
      }
      case 'i': {
        let imp = this.imps.get(id);
        if (!imp) {
          imp = makeImp(
            id,
            num(rec['o']),
            Math.floor(num(rec['x'])),
            Math.floor(num(rec['y'])),
            num(rec['h']),
          );
          this.imps.set(id, imp);
        }
        if ('o' in rec) imp.owner = num(rec['o']);
        if ('x' in rec) imp.x = num(rec['x']);
        if ('y' in rec) imp.y = num(rec['y']);
        if ('h' in rec) imp.hp = num(rec['h']);
        if ('c' in rec) imp.carry = num(rec['c']);
        if ('hd' in rec) imp.held = rec['hd'] === 1;
        if ('su' in rec) imp.slapUntil = num(rec['su']);
        break;
      }
      case 'r': {
        let r = this.rooms.get(id);
        if (!r) {
          r = { id, type: '', owner: 0, tiles: [], timer: 0, stock: 0 };
          this.rooms.set(id, r);
        }
        if ('t' in rec) r.type = str(rec['t']);
        if ('o' in rec) r.owner = num(rec['o']);
        break;
      }
      case 't': {
        let t = this.traps.get(id);
        if (!t) {
          t = { id, type: '', owner: this.me, tile: 0, built: false, readyAt: 0 };
          this.traps.set(id, t);
        }
        if ('y' in rec) t.type = str(rec['y']);
        if ('i' in rec) t.tile = num(rec['i']);
        if ('b' in rec) t.built = rec['b'] === 1;
        break;
      }
      case 'k': {
        let k = this.tasks.get(id);
        if (!k) {
          k = {
            id,
            owner: this.me,
            kind: 'dig',
            tile: 0,
            reservedBy: 0,
            blockedVersion: -1,
            auto: false,
          };
          this.tasks.set(id, k);
        }
        if ('k' in rec) k.kind = str(rec['k']) as Task['kind'];
        if ('i' in rec) k.tile = num(rec['i']);
        break;
      }
      default:
        break;
    }
  }

  private remove(key: string): void {
    const id = Number(key.slice(2));
    if (key[0] === 'c') this.creatures.delete(id);
    else if (key[0] === 'i') this.imps.delete(id);
    else if (key[0] === 't') this.traps.delete(id);
    else if (key[0] === 'k') this.tasks.delete(id);
  }

  /** Reparte los tiles conocidos entre las salas y retira las que ya no cubren ninguno. */
  private rebuildRooms(): void {
    const byRoom = new Map<number, number[]>();
    for (let i = 0; i < this.state.roomAt.length; i++) {
      const id = this.state.roomAt[i] as number;
      if (!id) continue;
      let list = byRoom.get(id);
      if (!list) byRoom.set(id, (list = []));
      list.push(i);
    }
    for (const [id, room] of [...this.rooms]) {
      const tiles = byRoom.get(id);
      if (!tiles) this.rooms.delete(id);
      else room.tiles = tiles;
    }
    this.state.rooms = [...this.rooms.values()].sort((a, b) => a.id - b.id);
  }
}
