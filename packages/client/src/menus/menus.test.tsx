import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { loadGameData } from '../data/loadGameData';
import { MENUS_ENABLED, menusPreviewRequested } from './flag';
import { MainMenu, PveSetup, Results } from './Screens';

const data = loadGameData();
const noop = () => {};

describe('maqueta de menús (desactivada)', () => {
  it('está desactivada por defecto y solo se ve con ?menus=preview', () => {
    expect(MENUS_ENABLED).toBe(false);
    expect(menusPreviewRequested(new URLSearchParams(''))).toBe(false);
    expect(menusPreviewRequested(new URLSearchParams('menus=preview'))).toBe(true);
  });

  it('el menú principal ofrece los tres modos', () => {
    const html = render(<MainMenu onPve={noop} onOnline={noop} onSandbox={noop} />);
    expect(html).toContain('Contra la IA');
    expect(html).toContain('Partida en línea');
    expect(html).toContain('sin rival');
  });

  it('los ajustes PvE salen de pve.json: una dificultad y un rival marcados', () => {
    const html = render(
      <PveSetup
        pve={data.pve}
        rivals={3}
        maxRivals={3}
        difficulty="normal"
        seed={1}
        onRivals={noop}
        onDifficulty={noop}
        onSeed={noop}
        onStart={noop}
        onBack={noop}
      />,
    );
    for (const d of data.pve.difficulties) expect(html).toContain(d.name);
    expect(html.match(/class="sel"/g)).toHaveLength(2);
  });

  it('los resultados marcan al ganador y listan las estadísticas', () => {
    const html = render(
      <Results
        title="¡Victoria!"
        reason="x"
        minutes={5}
        rows={[
          {
            id: 1,
            nick: 'Ana',
            winner: true,
            goldMined: 100,
            creaturesLost: 2,
            creaturesAttracted: 9,
            heartDamage: 4000,
          },
          {
            id: 2,
            nick: 'Bot',
            winner: false,
            goldMined: 50,
            creaturesLost: 7,
            creaturesAttracted: 9,
            heartDamage: 4000,
          },
        ]}
        onAgain={noop}
        onMenu={noop}
      />,
    );
    expect(html).toContain('¡Victoria!');
    expect(html).toContain('Ana');
    expect(html.match(/class="winner"/g)).toHaveLength(1);
  });
});
