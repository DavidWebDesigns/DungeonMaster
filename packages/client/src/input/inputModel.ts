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
  | { kind: 'reinforce' }
  | { kind: 'cancelDig' }
  | { kind: 'build'; room: string }
  | { kind: 'sell' }
  | { kind: 'spell'; spell: string };

export type Preview =
  | { kind: 'none' }
  | { kind: 'tiles'; action: TileAction; valid: Point[]; invalid: Point[] }
  | { kind: 'room'; room: RoomPreview }
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
  /** Criatura propia bajo el cursor (la calcula el dibujo, que sabe dónde se ven). */
  hoverCreature: number | null = null;
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

  pointerMove(tile: Point | null, creatureId: number | null = null): void {
    this.hover = tile;
    this.hoverCreature = creatureId;
  }

  /** Criaturas que lleva el jugador en la mano. */
  get handSize(): number {
    return this.host.state.players.find((p) => p.id === this.host.player)?.hand.length ?? 0;
  }

  pointerDown(
    tile: Point | null,
    button: 0 | 2,
    shift = false,
    creatureId: number | null = null,
  ): void {
    if (button === 2) {
      // Clic derecho: con criaturas en la mano las suelta; si no, cancela el arrastre o vuelve a excavar.
      if (this.handSize > 0 && tile) this.dispatch({ type: 'drop', tile });
      else if (this.drag) this.drag = null;
      else this.setTool({ kind: 'dig' });
      return;
    }
    // Un clic sobre una criatura propia la recoge (salvo con las herramientas de construir, vender o lanzar hechizos).
    if (creatureId !== null && TILE_TOOLS.has(this.tool.kind)) {
      this.dispatch({ type: 'pickUp', id: creatureId });
      return;
    }
    if (!tile) return;
    const t = this.tool;
    if (TILE_TOOLS.has(t.kind) || t.kind === 'build') {
      this.drag = { start: tile, cancelMode: shift && t.kind === 'dig' };
    } else if (t.kind === 'sell') {
      this.dispatch({ type: 'sellRoom', tile });
    } else if (t.kind === 'spell') {
      this.dispatch(this.spellCommand(t.spell, tile, creatureId));
    }
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
    if (this.hoverCreature !== null) this.dispatch({ type: 'slap', id: this.hoverCreature });
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
      return { kind: 'tiles', action, ...highlightSelection(action, state, rules, tiles, player) };
    }

    if (t.kind === 'build') {
      const def = data.rooms.find((r) => r.id === t.room);
      const anchor = this.drag?.start ?? this.hover;
      if (!def || !anchor) return { kind: 'none' };
      const rect = roomRectFromDrag(def.minSize, anchor, this.hover ?? anchor, data.map);
      return { kind: 'room', room: previewRoom(state, data, player, t.room, rect) };
    }

    if (!this.hover) return { kind: 'none' };
    const cmd: Command =
      t.kind === 'sell'
        ? { type: 'sellRoom', tile: this.hover }
        : this.spellCommand((t as { spell: string }).spell, this.hover, this.hoverCreature);
    return { kind: 'target', tile: this.hover, ok: previewCommand(state, data, player, cmd).ok };
  }
}
