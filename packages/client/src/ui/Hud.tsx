import type { Tool } from '../input/inputModel';
import type { HudModel } from './hudModel';

export interface HudProps {
  model: HudModel;
  onTool(tool: Tool): void;
}

const fmt = (n: number) => n.toLocaleString('es');

function Bar(props: { value: number; max: number; kind: 'gold' | 'mana'; label: string }) {
  const pct = props.max > 0 ? Math.max(0, Math.min(100, (props.value / props.max) * 100)) : 0;
  return (
    <div class={`bar ${props.kind}`} title={props.label}>
      <div class="bar-fill" style={{ width: `${pct}%` }} />
      <span class="bar-text">{props.label}</span>
    </div>
  );
}

export function Hud({ model, onTool }: HudProps) {
  const { spell } = model;
  return (
    <div class="hud">
      <div class="top">
        <Bar
          kind="gold"
          value={model.gold}
          max={model.goldCapacity}
          label={`Oro ${fmt(model.gold)} / ${fmt(model.goldCapacity)}${model.goldFull ? ' · LLENA' : ''}`}
        />
        <Bar
          kind="mana"
          value={model.mana}
          max={model.manaMax}
          label={`Maná ${fmt(model.mana)} (+${model.manaRegen.toFixed(1)}/s)`}
        />
        <div class="chip" title="Imps">
          Imps {model.imps}/{model.impsMax}
        </div>
        <div class="chip clock">{model.clock}</div>
      </div>

      {model.notice && <div class="notice">{model.notice}</div>}

      <div class="bottom">
        <div class="panel tools">
          {model.tools.map((t) => (
            <button
              key={t.id}
              class={t.active ? 'btn active' : 'btn'}
              title={t.hint}
              onClick={() => onTool(t.tool)}
            >
              <span class="name">{t.label}</span>
              <kbd>{t.hotkey}</kbd>
            </button>
          ))}
        </div>

        <div class="panel rooms">
          {model.rooms.map((r) => (
            <button
              key={r.id}
              class={`btn${r.active ? ' active' : ''}${r.affordable ? '' : ' poor'}`}
              title={`${r.name}: ${fmt(r.costPerTile)} de oro por tile, mínimo ${r.minSize}`}
              onClick={() => onTool({ kind: 'build', room: r.id })}
            >
              <span class="name">{r.name}</span>
              <span class="cost">{fmt(r.minCost)}</span>
              <kbd>{r.hotkey}</kbd>
            </button>
          ))}
        </div>

        <div class="panel spells">
          <button
            class={`btn${spell.active ? ' active' : ''}${spell.affordable ? '' : ' poor'}`}
            title="Crea un Imp nuevo en suelo propio. Cada Imp extra cuesta 50 más."
            onClick={() => onTool({ kind: 'spell', spell: spell.id })}
          >
            <span class="name">{spell.name}</span>
            <span class="cost">
              {spell.cooldownLeft > 0 ? `${spell.cooldownLeft.toFixed(1)} s` : `${spell.cost} maná`}
            </span>
            <kbd>{spell.hotkey}</kbd>
          </button>
        </div>
      </div>

      <div class="help">
        WASD o ratón en el borde: mover · Rueda: zoom · Z / X: girar · Espacio: ir al Corazón · Esc
        o clic derecho: volver a excavar
      </div>
    </div>
  );
}
