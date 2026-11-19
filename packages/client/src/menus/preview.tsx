import { render } from 'preact';
import type { DataSet } from '@dm/shared';
import { MainMenu, PveSetup, Results } from './Screens';

const noop = () => {};

/** Muestra las tres pantallas de maqueta una tras otra, con datos de ejemplo y botones que no hacen nada. */
export function showMenusPreview(host: HTMLElement, data: DataSet): void {
  const root = document.createElement('div');
  root.className = 'menus-preview';
  host.appendChild(root);
  render(
    <>
      <MainMenu onPve={noop} onOnline={noop} onSandbox={noop} />
      <PveSetup
        pve={data.pve}
        rivals={data.pve.defaultRivals}
        maxRivals={data.global.players.max - 1}
        difficulty={data.pve.defaultDifficulty}
        seed={1}
        onRivals={noop}
        onDifficulty={noop}
        onSeed={noop}
        onStart={noop}
        onBack={noop}
      />
      <Results
        title="¡Victoria!"
        reason="El Corazón rival cayó"
        minutes={18}
        rows={[
          {
            id: 1,
            nick: 'Tú',
            winner: true,
            goldMined: 14200,
            creaturesLost: 3,
            creaturesAttracted: 9,
            heartDamage: 4000,
          },
          {
            id: 2,
            nick: 'Bot 1',
            winner: false,
            goldMined: 9800,
            creaturesLost: 11,
            creaturesAttracted: 9,
            heartDamage: 4000,
          },
        ]}
        onAgain={noop}
        onMenu={noop}
      />
    </>,
    root,
  );
}
