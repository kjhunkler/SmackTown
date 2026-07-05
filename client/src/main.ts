import './style.css';
import { appState } from '@/state/appState';
import { renderLoginScreen } from '@/ui/loginScreen';
import { renderBuilderScreen } from '@/ui/builderScreen';
import { renderLobbyScreen, type LobbyDoneEvent } from '@/ui/lobbyScreen';
import { renderMatchScreen } from '@/ui/matchScreen';
import { renderResultScreen } from '@/ui/resultScreen';

const app = document.getElementById('app')!;
let unmountCurrent: (() => void) | null = null;

function show(render: (root: HTMLElement) => () => void) {
  unmountCurrent?.();
  unmountCurrent = render(app);
}

function goLogin() {
  show((root) => renderLoginScreen(root, goBuilder));
}

function goBuilder() {
  show((root) => renderBuilderScreen(root, goLobby));
}

function goLobby() {
  show((root) => renderLobbyScreen(root, goMatch, goBuilder));
}

function goMatch(ev: LobbyDoneEvent) {
  const usernames = new Map(ev.players.map((p) => [p.clientId, p.username]));
  show((root) =>
    renderMatchScreen(root, ev, (results) => {
      if (results) {
        show((r2) => renderResultScreen(r2, results, usernames, goLobby));
      } else {
        goLobby();
      }
    }),
  );
}

if (!appState.identity) {
  goLogin();
} else {
  goLobby();
}
