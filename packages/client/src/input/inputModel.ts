/**
 * Modelo de la entrada del jugador: qué herramienta tiene, qué está arrastrando y qué comandos genera.
 * Puro: no toca el DOM ni Babylon. El cliente nunca cambia el estado por su cuenta; solo envía comandos.
 */
import {
  previewCommand,
  type Command,
  type CommandResult,
  type DataSet,
  type MatchState,
  type Point,
  rulesOf,
} from '@dm/shared';
import { previewRoom, roomRectFromDrag, type RoomPreview } from './buildPreview';
import {
  dragRect,
  highlightSelection,
  rectTiles,
  selectionCommands,
  type TileAction,
} from './selection';

export type Tool =
  | { kind: 'dig' }
  | { kind: 'claim' }
  /** `level` es el nivel de muro al que se quiere llegar (sin él, 1; con 2 se mejoran muros de nivel 1). */
  | { kind: 'reinforce'; level?: number }
  | { kind: 'cancelDig' }
  | { kind: 'build'; room: string }
  | { kind: 'sell' }
  | { kind: 'trap'; trap: string }
  | { kind: 'spell'; spell: string };

/** Una criatura o un Imp propios bajo el cursor. */
export interface HoverUnit {
  kind: 'creature' | 'imp';
  id: number;
}

/** Acepta un número suelto como criatura (así se usaba antes de poder recoger Imps). */
const asUnit = (u: number | HoverUnit | null): HoverUnit | null =>
  u === null ? null : typeof u === 'number' ? { kind: 'creature', id: u } : u;

export type Preview =
  | { kind: 'none' }
  | { kind: 'tiles'; action: TileAction; valid: Point[]; invalid: Point[] }
  | {
      kind: 'room';
      room: RoomPreview;
      /** Ancho del mapa, para pasar de índice de tile a coordenadas. */ width: number;
    }
  | { kind: 'target'; tile: Point; ok: boolean };

export interface InputHost {
  readonly state: MatchState;
  readonly data: DataSet;
  readonly player: number;
  send(cmd: Command): CommandResult;
}

export type ResultListener = (cmd: Command, result: CommandResult) => void;

const TILE_TOOLS = new Set(['dig', 'claim', 'reinforce', 'cancelDig']);

export class InputModel {
  tool: Tool = { kind: 'dig' };
  hover: Point | null = null;
  /** Criatura o Imp propio bajo el cursor (lo calcula el dibujo, que sabe dónde se ven). */
  hoverUnit: HoverUnit | null = null;

  /** Id de la criatura bajo el cursor, si es una criatura (los Imps no cuentan). */
  get hoverCreature(): number | null {
    return this.hoverUnit?.kind === 'creature' ? this.hoverUnit.id : null;
  }
  private drag: { start: Point; cancelMode: boolean } | null = null;
  private queue: Command[] = [];
  private lastSentTick = -1;

  constructor(
    private readonly host: InputHost,
    private readonly onResult: ResultListener = () => {},
  ) {}

  get dragging(): boolean {
    return this.drag !== null;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.drag = null;
  }

  pointerMove(tile: Point | null, unit: number | HoverUnit | null = null): void {
    this.hover = tile;
    this.hoverUnit = asUnit(unit);
  }

  /** Criaturas que lleva el jugador en la mano. */
  get handSize(): number {
    return this.host.state.players.find((p) => p.id === this.host.player)?.hand.length ?? 0;
  }

  pointerDown(
    tile: Point | null,
    button: 0 | 2,
    shift = false,
    unitArg: number | HoverUnit | null = null,
  ): void {
    const unit = asUnit(unitArg);
    if (button === 2) {
      // Clic derecho: con criaturas en la mano las suelta todas en el tile bajo el cursor; si no, cancela el arrastre o vuelve a excavar.
      if (this.handSize > 0 && tile) {
        for (let n = this.handSize; n > 0; n--)
          this.dispatch({ type: 'drop', tile }, n < this.handSize);
      } else if (this.drag) this.drag = null;
      else this.setTool({ kind: 'dig' });
      return;
    }
    // Un clic sobre una criatura propia la recoge con cualquier herramienta, salvo los hechizos
    // (Acelerar y Curar apuntan a una criatura; los demás, a un tile).
    if (unit !== null && this.tool.kind !== 'spell') {
      this.dispatch(
        unit.kind === 'imp'
          ? { type: 'pickUp', id: unit.id, kind: 'imp' }
          : { type: 'pickUp', id: unit.id },
      );
      return;
    }
    if (!tile) return;
    const t = this.tool;
    if (TILE_TOOLS.has(t.kind) || t.kind === 'build') {
      // Con excavar, pulsar sobre un tile ya marcado (o con Mayús) desmarca en vez de volver a marcar.
      const marked = this.isMarkedForDig(tile);
      this.drag = { start: tile, cancelMode: (shift || marked) && t.kind === 'dig' };
    } else if (t.kind === 'sell') {
      // Con una trampa propia en el tile, se desmonta la trampa; si no, se vende la sala.
      const i = tile.y * this.host.state.width + tile.x;
      const trap = this.host.state.traps.find((k) => k.tile === i && k.owner === this.host.player);
      this.dispatch(trap ? { type: 'sellTrap', tile } : { type: 'sellRoom', tile });
    } else if (t.kind === 'trap') {
      this.dispatch({ type: 'buildTrap', trap: t.trap, tile });
    } else if (t.kind === 'spell') {
      this.dispatch(this.spellCommand(t.spell, tile, unit?.kind === 'creature' ? unit.id : null));
    }
  }

  /** ¿El jugador ya tiene este tile marcado para excavar o minar? */
  private isMarkedForDig(tile: Point): boolean {
    const { state, player } = this.host;
    const i = tile.y * state.width + tile.x;
    return state.tasks.some((k) => k.owner === player && k.tile === i && k.kind === 'dig');
  }

  pointerUp(tile: Point | null): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const end = tile ?? this.hover;
    if (!end) return;
    const t = this.tool;
    if (t.kind === 'build') {
      const def = this.host.data.rooms.find((r) => r.id === t.room);
      if (!def) return;
      const rect = roomRectFromDrag(def.minSize, drag.start, end, this.host.data.map);
      this.dispatch({ type: 'buildRoom', room: t.room, rect });
      return;
    }
    const action: TileAction = drag.cancelMode ? 'cancelDig' : (t.kind as TileAction);
    const tiles = rectTiles(dragRect(drag.start, end, this.host.data.map), drag.start);
    const cmds = selectionCommands(
      action,
      tiles,
      this.host.data.global.commands.maxTilesPerCommand,
      t.kind === 'reinforce' ? t.level : undefined,
    );
    const [first, ...rest] = cmds;
    if (first) this.dispatch(first);
    // Un pasillo largo se parte en comandos de 64 tiles; el siguiente solo es válido cuando el anterior ya se ejecutó.
    this.queue.push(...rest);
  }

  /** Orden de lanzar un hechizo: sobre una criatura propia (Acelerar, Curar) o sobre un tile. */
  private spellCommand(spell: string, tile: Point | null, creatureId: number | null): Command {
    const def = this.host.data.spells.find((s) => s.id === spell);
    if (def?.target === 'ownCreature')
      return { type: 'castSpell', spell, creature: creatureId ?? -1 };
    return { type: 'castSpell', spell, target: tile ?? { x: -1, y: -1 } };
  }

  /** Abofetea a la criatura que hay bajo el cursor (tecla B). */
  slapHovered(): void {
    const u = this.hoverUnit;
    if (u === null) return;
    this.dispatch(
      u.kind === 'imp' ? { type: 'slap', id: u.id, kind: 'imp' } : { type: 'slap', id: u.id },
    );
  }

  /** Llamar una vez por frame: envía el siguiente trozo pendiente en cuanto avanza el tick. */
  pump(): void {
    if (this.queue.length === 0 || this.host.state.tick <= this.lastSentTick) return;
    const next = this.queue.shift();
    if (next) this.dispatch(next, true);
  }

  get pending(): number {
    return this.queue.length;
  }

  private dispatch(cmd: Command, silent = false): void {
    const res = this.host.send(cmd);
    this.lastSentTick = this.host.state.tick;
    if (!silent || res.ok) this.onResult(cmd, res);
  }

  /** Qué dibujar sobre el mapa ahora mismo. */
  preview(): Preview {
    const { state, data, player } = this.host;
    const t = this.tool;
    const rules = rulesOf(data);

    // Con criaturas en la mano, el cursor muestra dónde se pueden soltar.
    if (this.handSize > 0 && this.hover) {
      return {
        kind: 'target',
        tile: this.hover,
        ok: previewCommand(state, data, player, { type: 'drop', tile: this.hover }).ok,
      };
    }

    if (TILE_TOOLS.has(t.kind)) {
      const action: TileAction = this.drag?.cancelMode ? 'cancelDig' : (t.kind as TileAction);
      let tiles: Point[];
      if (this.drag) {
        const end = this.hover ?? this.drag.start;
        tiles = rectTiles(dragRect(this.drag.start, end, data.map), this.drag.start);
      } else if (this.hover) {
        tiles = [this.hover];
      } else return { kind: 'none' };
      const level = t.kind === 'reinforce' ? t.level : undefined;
      return {
        kind: 'tiles',
        action,
        ...highlightSelection(action, state, rules, tiles, player, level),
      };
    }

    if (t.kind === 'build') {
      const def = data.rooms.find((r) => r.id === t.room);
      const anchor = this.drag?.start ?? this.hover;
      if (!def || !anchor) return { kind: 'none' };
      const rect = roomRectFromDrag(def.minSize, anchor, this.hover ?? anchor, data.map);
      return {
        kind: 'room',
        room: previewRoom(state, data, player, t.room, rect),
        width: state.width,
      };
    }

    if (!this.hover) return { kind: 'none' };
    let cmd: Command;
    if (t.kind === 'sell') {
      const i = this.hover.y * state.width + this.hover.x;
      const trap = state.traps.find((k) => k.tile === i && k.owner === player);
      cmd = trap ? { type: 'sellTrap', tile: this.hover } : { type: 'sellRoom', tile: this.hover };
    } else if (t.kind === 'trap') {
      cmd = { type: 'buildTrap', trap: t.trap, tile: this.hover };
    } else {
      cmd = this.spellCommand((t as { spell: string }).spell, this.hover, this.hoverCreature);
    }
    return { kind: 'target', tile: this.hover, ok: previewCommand(state, data, player, cmd).ok };
  }
}
