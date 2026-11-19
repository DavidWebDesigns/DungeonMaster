import type { Tool } from '../input/inputModel';
import type { HudModel } from './hudModel';

export interface HudProps {
  model: HudModel;
  onTool(tool: Tool): void;
  /** Clic en una criatura de la lista (centra la cámara en ella). */
  onSelectCreature?(id: number): void;
  /** Pulsó el botón de rendirse (el juego pide confirmación). */
  onSurrender?(): void;
  /** Pulsó "Jugar de nuevo" en la pantalla final. */
  onRestart?(): void;
  /** Estadísticas de fin de partida (en red). */
  endStats?: Array<{ id: number; nick: string; goldMined: number; creaturesLost: number }>;
  /** El botón de rendirse espera confirmación. */
  surrenderArmed?: boolean;
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

export function Hud({
  model,
  onTool,
  onSelectCreature,
  onSurrender,
  onRestart,
  surrenderArmed,
  endStats,
}: HudProps) {
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
        <div class="chip" title="Tiempo hasta que tus criaturas cobren">
          Pago {Math.ceil(model.payday)} s
        </div>
        {model.hand.count > 0 && (
          <div class="chip hand" title="Criaturas en tu mano: clic derecho para soltarlas">
            Mano {model.hand.count}/{model.hand.capacity}
          </div>
        )}
      </div>

      {model.canSurrender && (
        <button
          class={`surrender${surrenderArmed ? ' armed' : ''}`}
          onClick={() => onSurrender?.()}
        >
          {surrenderArmed ? '¿Seguro? Pulsa otra vez' : 'Rendirse'}
        </button>
      )}

      {model.gameOver && (
        <div class={`gameover ${model.gameOver.outcome}`}>
          <div class="gameover-card">
            <h1>{model.gameOver.title}</h1>
            <p>{model.gameOver.detail}</p>
            {endStats && endStats.length > 0 && (
              <table class="endstats">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Oro minado</th>
                    <th>Criaturas perdidas</th>
                  </tr>
                </thead>
                <tbody>
                  {endStats.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nick}</td>
                      <td>{p.goldMined}</td>
                      <td>{p.creaturesLost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button class="btn" onClick={() => onRestart?.()}>
              Jugar de nuevo
            </button>
          </div>
        </div>
      )}

      <div class="notices">
        {model.notices.map((text, i) => (
          <div key={`${i}-${text}`} class="notice">
            {text}
          </div>
        ))}
      </div>

      {model.creatures.length > 0 && (
        <div class="creatures panel">
          <div class="creatures-title">Criaturas ({model.creatures.length})</div>
          {model.creatures.map((c) => (
            <button
              key={c.id}
              class={`creature ${c.band}`}
              onClick={() => onSelectCreature?.(c.id)}
              title={`${c.bandName} · ánimo ${c.mood}`}
            >
              <span class="glyph">{c.glyph}</span>
              <span class="cname">
                {c.name} <small>nv {c.level}</small>
              </span>
              <span class="cact">{c.activity}</span>
              <span class="hpbar">
                <span class="hpfill" style={{ width: `${Math.round(c.hpFraction * 100)}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}

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

        <div class="panel traps">
          {model.traps.map((t) => (
            <button
              key={t.id}
              class={`btn${t.active ? ' active' : ''}${t.available ? '' : ' locked'}${t.affordable ? '' : ' poor'}`}
              title={
                t.available
                  ? `${t.name}: la construyen los Imps y se dispara sola contra los enemigos. Invisible para el rival.`
                  : `Requiere: ${t.requires}`
              }
              onClick={() => onTool({ kind: 'trap', trap: t.id })}
            >
              <span class="name">{t.name}</span>
              <span class="cost">{t.available ? t.cost : `🔒 ${t.requires}`}</span>
              <kbd>{t.hotkey}</kbd>
            </button>
          ))}
        </div>

        <div class="panel spells">
          {model.spells.map((sp) => (
            <button
              key={sp.id}
              class={`btn${sp.active ? ' active' : ''}${sp.affordable ? '' : ' poor'}`}
              title={sp.hint}
              onClick={() => onTool({ kind: 'spell', spell: sp.id })}
            >
              <span class="name">{sp.name}</span>
              <span class="cost">
                {sp.cooldownLeft > 0 ? `${sp.cooldownLeft.toFixed(1)} s` : `${sp.cost} maná`}
              </span>
              <kbd>{sp.hotkey}</kbd>
            </button>
          ))}
        </div>
      </div>

      <div class="help">
        WASD o ratón en el borde: mover · Rueda: zoom · Z / X: girar · Espacio: ir al Corazón · Esc
        o clic derecho: volver a excavar
      </div>
    </div>
  );
}
