import { el } from './components';
import type { MatchResult } from '@/game/engine';

export function renderResultScreen(root: HTMLElement, results: MatchResult[], usernames: Map<string, string>, onContinue: () => void) {
  const ordered = [...results].sort((a, b) => a.place - b.place);
  const medal = (place: number) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `#${place}`);

  const screen = el('div', { class: 'screen center-screen' }, [
    el('h2', {}, ['Match Complete']),
    el(
      'div',
      { class: 'results-list' },
      ordered.map((r) =>
        el('div', { class: `results-row ${r.place === 1 ? 'first' : ''}` }, [
          el('span', {}, [`${medal(r.place)} ${usernames.get(r.clientId) ?? 'Player'}`]),
        ]),
      ),
    ),
    el('button', { class: 'primary', onclick: onContinue }, ['Back to Lobby']),
  ]);
  root.append(screen);
  return () => screen.remove();
}
