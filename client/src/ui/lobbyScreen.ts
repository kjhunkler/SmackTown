import { el, clear } from './components';
import { appState } from '@/state/appState';
import type { PresenceUser, RoomState, ServerToClient } from '@/net/protocol';

export interface LobbyDoneEvent {
  players: { clientId: string; username: string; build: import('@/builder/catalog').FighterBuild }[];
  startAt: number;
}

export function renderLobbyScreen(root: HTMLElement, onMatchStart: (ev: LobbyDoneEvent) => void, onEditBuild: () => void) {
  const identity = appState.identity!;
  const signaling = appState.ensureSignaling();

  let presence: PresenceUser[] = [];
  let room: RoomState | null = null;
  let toast: string | null = null;
  let toastTimer: number | null = null;

  const screen = el('div', { class: 'screen' });
  const layout = el('div', { class: 'lobby-layout' });
  screen.append(layout);
  root.append(screen);

  const unsubs: (() => void)[] = [];

  function showToast(msg: string) {
    toast = msg;
    repaint();
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = null;
      repaint();
    }, 4000);
  }

  unsubs.push(
    signaling.on('open', () => {
      signaling.send({ t: 'register', clientId: identity.clientId, username: identity.username });
    }),
  );
  unsubs.push(
    signaling.on('registered', () => {
      signaling.send({ t: 'presence:subscribe' });
    }),
  );
  unsubs.push(
    signaling.on('presence:update', (msg: Extract<ServerToClient, { t: 'presence:update' }>) => {
      presence = msg.users.filter((u) => u.clientId !== identity.clientId);
      repaint();
    }),
  );
  unsubs.push(
    signaling.on('room:update', (msg: Extract<ServerToClient, { t: 'room:update' }>) => {
      room = msg.room;
      repaint();
    }),
  );
  unsubs.push(
    signaling.on('room:closed', () => {
      room = null;
      repaint();
    }),
  );
  unsubs.push(
    signaling.on('room:invited', (msg: Extract<ServerToClient, { t: 'room:invited' }>) => {
      showToast(`${msg.fromUsername} invited you — code ${msg.code}`);
    }),
  );
  unsubs.push(
    signaling.on('room:error', (msg: Extract<ServerToClient, { t: 'room:error' }>) => {
      showToast(msg.message);
    }),
  );
  unsubs.push(
    signaling.on('match:start', (msg: Extract<ServerToClient, { t: 'match:start' }>) => {
      onMatchStart({ players: msg.players, startAt: msg.startAt });
    }),
  );

  if (signaling.status === 'open') {
    signaling.send({ t: 'register', clientId: identity.clientId, username: identity.username });
  }

  let joinCode = '';

  function repaint() {
    clear(layout);

    layout.append(
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('h2', {}, [`Hey, ${identity.username}`]),
        el('button', { class: 'ghost', onclick: onEditBuild }, ['Edit Build']),
      ]),
    );

    if (toast) {
      layout.append(el('div', { class: 'card', style: { marginBottom: '14px', borderColor: 'var(--accent)' } }, [toast]));
    }

    if (room) {
      layout.append(renderRoomCard(room));
    } else {
      layout.append(
        el('div', { class: 'card', style: { marginBottom: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' } }, [
          el('button', { class: 'primary', onclick: () => signaling.send({ t: 'room:create' }) }, ['Create Room']),
          el('input', {
            type: 'text',
            placeholder: 'Room code',
            maxlength: '5',
            style: { width: '110px', textTransform: 'uppercase' },
            oninput: (e: Event) => (joinCode = (e.target as HTMLInputElement).value.toUpperCase()),
          }),
          el('button', { onclick: () => joinCode && signaling.send({ t: 'room:join', code: joinCode }) }, ['Join']),
        ]),
      );
    }

    layout.append(el('h3', {}, ['Online Players']));
    if (presence.length === 0) {
      layout.append(el('div', { style: { color: 'var(--text-dim)' } }, ['No one else online right now — invite a friend to this app!']));
    }
    for (const user of presence) {
      layout.append(
        el('div', { class: 'user-row' }, [
          el('div', {}, [el('span', { class: 'status-dot' }), user.username, ` (${user.status})`]),
          el('button', { onclick: () => invite(user) }, ['Challenge']),
        ]),
      );
    }
  }

  function invite(user: PresenceUser) {
    if (!room) {
      signaling.send({ t: 'room:create' });
      // Wait a tick for room:update to land, then invite.
      const off = signaling.on('room:update', () => {
        signaling.send({ t: 'room:invite', targetClientId: user.clientId });
        off();
      });
    } else {
      signaling.send({ t: 'room:invite', targetClientId: user.clientId });
    }
  }

  function renderRoomCard(r: RoomState) {
    const self = r.members.find((m) => m.clientId === identity.clientId);
    return el('div', { class: 'card', style: { marginBottom: '18px' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', {}, ['Room code', el('div', { class: 'room-code' }, [r.code])]),
        el('button', { class: 'ghost', onclick: () => signaling.send({ t: 'room:leave' }) }, ['Leave']),
      ]),
      el(
        'div',
        { style: { marginTop: '12px' } },
        r.members.map((m) =>
          el('div', { class: 'user-row' }, [
            el('div', {}, [el('span', { class: 'status-dot', style: { background: m.ready ? 'var(--good)' : '#665' } }), m.username]),
            el('div', {}, [m.ready ? 'Ready' : 'Not ready']),
          ]),
        ),
      ),
      el(
        'button',
        {
          class: 'primary',
          style: { marginTop: '12px', width: '100%' },
          onclick: () => signaling.send({ t: 'room:ready', ready: !self?.ready, build: appState.build }),
        },
        [self?.ready ? 'Cancel Ready' : 'Ready Up'],
      ),
      r.members.length < 2 ? el('div', { style: { color: 'var(--text-dim)', marginTop: '8px', fontSize: '0.85rem' } }, ['Waiting for at least one more player…']) : null,
    ].filter(Boolean) as Node[]);
  }

  repaint();

  return () => {
    for (const off of unsubs) off();
    if (toastTimer) window.clearTimeout(toastTimer);
    screen.remove();
  };
}
