import { el, clear } from './components';
import { appState } from '@/state/appState';
import { ABILITIES, type FighterBuild } from '@/builder/catalog';
import { MatchSession } from '@/net/matchSession';
import { WebRTCManager } from '@/net/webrtcManager';
import type { MatchResult } from '@/game/engine';

export interface MatchScreenPlayers {
  players: { clientId: string; username: string; build: FighterBuild }[];
  startAt: number;
}

export function renderMatchScreen(root: HTMLElement, data: MatchScreenPlayers, onExit: (results: MatchResult[] | null) => void) {
  const identity = appState.identity!;
  const signaling = appState.ensureSignaling();

  const screen = el('div', { class: 'match-screen' });
  const canvas = el('canvas', { class: 'match-canvas' }) as HTMLCanvasElement;
  const touchLayer = el('div', { class: 'touch-layer' });
  const abilityLayer = el('div', { class: 'ability-buttons' });
  const exitBtn = el('button', { class: 'exit-btn', onclick: () => finish(null) }, ['✕ Leave']);

  const selfBuild = data.players.find((p) => p.clientId === identity.clientId)?.build;
  const abilityEls: { el: HTMLElement; slot: 1 | 2 }[] = [];
  (selfBuild?.abilities ?? []).forEach((abilityId, i) => {
    const def = ABILITIES.find((a) => a.id === abilityId)!;
    const btn = el('div', { class: 'ability-btn' }, [def.icon]);
    abilityLayer.append(btn);
    abilityEls.push({ el: btn, slot: (i + 1) as 1 | 2 });
  });

  screen.append(
    canvas,
    touchLayer,
    el('div', { class: 'zone-hint left' }, ['swipe to move · swipe up to jump']),
    el('div', { class: 'zone-hint right' }, ['tap: jab · swipe: smash · hold: shield']),
    abilityLayer,
    exitBtn,
  );
  root.append(screen);

  const webrtc = new WebRTCManager(identity.clientId, signaling);
  webrtc.connectToPeers(data.players.map((p) => p.clientId).filter((id) => id !== identity.clientId));

  let session: MatchSession | null = null;
  let finished = false;

  function finish(results: MatchResult[] | null) {
    if (finished) return;
    finished = true;
    session?.stop();
    webrtc.destroy();
    screen.remove();
    onExit(results);
  }

  session = new MatchSession({
    selfId: identity.clientId,
    players: data.players,
    webrtc,
    canvas,
    touchRoot: touchLayer,
    abilityButtons: abilityEls,
    startTime: data.startAt,
    onMatchEnd: (results) => finish(results),
  });
  session.start();

  return () => finish(null);
}
