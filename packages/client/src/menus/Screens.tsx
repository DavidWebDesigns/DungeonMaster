/**
 * Pantallas de maqueta: solo dibujan y avisan por callbacks (que en la maqueta no hacen nada).
 * No leen ni cambian el estado de la partida.
 */
import type { PveConfig } from '@dm/shared';

export interface MainMenuProps {
  onPve(): void;
  onOnline(): void;
  onSandbox(): void;
}

export function MainMenu({ onPve, onOnline, onSandbox }: MainMenuProps) {
  return (
    <div class="menu-screen mainmenu">
      <div class="menu-card">
        <h1>Dungeon Master</h1>
        <p class="menu-sub">Nombre de trabajo</p>
        <button class="primary pve" onClick={onPve}>
          Contra la IA
        </button>
        <button class="online" onClick={onOnline}>
          Partida en línea
        </button>
        <button class="sandbox" onClick={onSandbox}>
          Mazmorra libre (sin rival)
        </button>
      </div>
    </div>
  );
}

export interface PveSetupProps {
  pve: PveConfig;
  rivals: number;
  maxRivals: number;
  difficulty: string;
  seed: number;
  onRivals(n: number): void;
  onDifficulty(id: string): void;
  onSeed(n: number): void;
  onStart(): void;
  onBack(): void;
}

export function PveSetup(p: PveSetupProps) {
  const rivalOptions = Array.from({ length: p.maxRivals }, (_, i) => i + 1);
  return (
    <div class="menu-screen pvesetup">
      <div class="menu-card">
        <h2>Partida contra la IA</h2>
        <div class="field">
          <span class="label">Rivales</span>
          <div class="choices rivals">
            {rivalOptions.map((n) => (
              <button key={n} class={n === p.rivals ? 'sel' : ''} onClick={() => p.onRivals(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span class="label">Dificultad</span>
          <div class="choices difficulties">
            {p.pve.difficulties.map((d) => (
              <button
                key={d.id}
                class={d.id === p.difficulty ? 'sel' : ''}
                onClick={() => p.onDifficulty(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <label class="field">
          <span class="label">Semilla</span>
          <input
            class="seed"
            type="number"
            value={p.seed}
            onInput={(e) => p.onSeed(Number((e.target as HTMLInputElement).value) || 1)}
          />
        </label>
        <div class="menu-actions">
          <button class="primary start" onClick={p.onStart}>
            Empezar
          </button>
          <button class="back" onClick={p.onBack}>
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ResultsRow {
  id: number;
  nick: string;
  winner: boolean;
  goldMined: number;
  creaturesLost: number;
  creaturesAttracted: number;
  heartDamage: number;
}

export interface ResultsProps {
  title: string;
  reason: string;
  rows: ResultsRow[];
  minutes: number;
  onAgain(): void;
  onMenu(): void;
}

export function Results({ title, reason, rows, minutes, onAgain, onMenu }: ResultsProps) {
  return (
    <div class="menu-screen results">
      <div class="menu-card">
        <h2>{title}</h2>
        <p class="menu-sub">
          {reason} · {minutes} min
        </p>
        <table class="endstats">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Oro minado</th>
              <th>Atraídas</th>
              <th>Perdidas</th>
              <th>Daño al Corazón</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} class={r.winner ? 'winner' : ''}>
                <td>
                  {r.nick}
                  {r.winner ? ' 👑' : ''}
                </td>
                <td>{r.goldMined}</td>
                <td>{r.creaturesAttracted}</td>
                <td>{r.creaturesLost}</td>
                <td>{r.heartDamage}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="menu-actions">
          <button class="primary again" onClick={onAgain}>
            Jugar otra vez
          </button>
          <button class="menu" onClick={onMenu}>
            Menú principal
          </button>
        </div>
      </div>
    </div>
  );
}
