// App orchestration: boot, screens, room flow, and the game session driver.

import {
  loadProfile, saveProfile, validName, COLORS, emptyBuild, sanitizeBuild,
} from './profile.js';
import { Net } from './net.js';
import { Game, gameFromSnapshot, blankInput, TICK, SNAP_RATE } from './game.js';
import { TouchInput } from './input.js';
import { Renderer } from './render.js';
import * as UI from './ui.js';

const $ = s => document.querySelector(s);

// ---------------- global state ----------------
let profile = null;
let net = null;             // Net instance while in a room
let session = null;         // active game session
const touch = new TouchInput(document);
const renderer = new Renderer($('#game-canvas'));

// ---------------- boot ----------------
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------------- PWA install ----------------
// Chrome & friends: surface an in-app Install button when the browser says
// the app qualifies. iOS has no prompt API, so show Add-to-Home-Screen steps.
let installPrompt = null;
const isStandalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
  || navigator.standalone === true;

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('#menu-install').classList.remove('hidden');
  $('#install-hint').classList.add('hidden');
});

$('#menu-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('#menu-install').classList.add('hidden');
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#menu-install').classList.add('hidden');
  $('#install-hint').classList.add('hidden');
  UI.banner('SmackTown installed! 🥊', 'good');
});

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !isStandalone) $('#install-hint').classList.remove('hidden');

// ---------------- gesture guards ----------------
// Mobile browsers zoom on pinch and double-tap even with user-scalable=no
// (iOS ignores it); frantic button mashing triggers both and leaves the page
// zoomed + overflowing. Kill those gestures app-wide; inputs still work.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1 || e.scale && e.scale !== 1) e.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  // Double-tap zoom guard for the game screen only (rapid tap-attacks!).
  // Menus rely on touch-action: manipulation instead, so their taps keep
  // producing synthetic clicks.
  if ($('#screen-game').classList.contains('hidden')) return;
  const now = Date.now();
  if (now - lastTouchEnd < 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('contextmenu', e => {
  if (!$('#screen-game').classList.contains('hidden')) e.preventDefault();
});

profile = loadProfile();
if (profile) {
  UI.renderMenuCard(profile);
  UI.showScreen('menu');
} else {
  initLogin();
  UI.showScreen('login');
}

// ---------------- login (first run) ----------------
function initLogin() {
  let color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const paint = () =>
    UI.renderColorGrid($('#login-colors'), color, c => { color = c; paint(); });
  paint();

  $('#login-go').addEventListener('click', () => {
    const name = $('#login-name').value;
    if (!validName(name)) {
      const err = $('#login-error');
      err.textContent = '2–14 letters, numbers or basic punctuation, please!';
      err.classList.remove('hidden');
      return;
    }
    profile = saveProfile({ name, color, build: emptyBuild() });
    // First run: straight into the workshop to spend starting credits.
    openBuilder(true);
  });
}

// ---------------- builder ----------------
let builderWork = null;
let builderFirstRun = false;

function openBuilder(firstRun = false) {
  builderFirstRun = firstRun;
  builderWork = {
    color: profile.color,
    build: JSON.parse(JSON.stringify(profile.build)),
  };
  UI.renderBuilder(builderWork);
  UI.showScreen('builder');
}

$('#builder-reset').addEventListener('click', () => {
  builderWork.build = emptyBuild();
  UI.renderBuilder(builderWork);
});

$('#builder-save').addEventListener('click', () => {
  profile = saveProfile({ name: profile.name, color: builderWork.color, build: builderWork.build });
  UI.renderMenuCard(profile);
  UI.showScreen('menu');
  if (builderFirstRun) UI.banner(`Welcome to SmackTown, ${profile.name}!`, 'good');
});

$('#menu-builder').addEventListener('click', () => openBuilder());

// ---------------- menu actions ----------------
$('#menu-solo').addEventListener('click', () => {
  startSession({
    mode: 'solo',
    myId: 'me',
    players: [
      { id: 'me', name: profile.name, color: profile.color, build: profile.build },
      {
        id: 'bot', name: 'Trainer Bot', isBot: true,
        color: COLORS.find(c => c !== profile.color) || '#38b6ff',
        build: { stats: { power: 2, speed: 2, defense: 1, agility: 1 }, abilities: ['fireball'], augments: [] },
      },
    ],
  });
});

$('#menu-host').addEventListener('click', () => enterRoom(null));
$('#menu-join').addEventListener('click', () => {
  const code = $('#menu-code').value.trim().toUpperCase();
  if (code.length !== 4) return menuError('Room codes are 4 letters.');
  enterRoom(code);
});

function menuError(text) {
  const el = $('#menu-error');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------------- room / lobby ----------------
function enterRoom(joinCode) {
  if (net) { net.leave(); net = null; }
  net = new Net(profile);

  net.on('room', () => { UI.renderLobby(net); UI.showScreen('lobby'); });
  net.on('roster', () => {
    if (!$('#screen-lobby').classList.contains('hidden')) UI.renderLobby(net);
    session?.onRoster();
  });
  net.on('error', text => {
    if (session) return;
    UI.showScreen('menu');
    menuError(text);
    net?.leave(); net = null;
  });
  net.on('banner', (text, kind) => UI.banner(text, kind));
  net.on('host-changed', () => {
    if (!$('#screen-lobby').classList.contains('hidden')) UI.renderLobby(net);
    session?.onHostChanged();
  });
  net.on('game:start', (msg, pid) => {
    if (pid !== net.hostId || session) return;
    startSession({
      mode: 'client',
      myId: net.myId,
      players: msg.players.map(p => ({ ...p, build: sanitizeBuild(p.build) })),
      seed: msg.seed,
    });
  });
  net.on('game:input', (msg, pid) => session?.onRemoteInput(pid, msg.inp));
  net.on('game:snap', (msg, pid) => session?.onSnapshot(msg.s, pid));

  if (joinCode) net.join(joinCode); else net.host();
  UI.banner(joinCode ? 'Joining room…' : 'Opening room…', 'warn', 8000);
}

$('#lobby-ready').addEventListener('click', () => {
  const me = net?.members.get(net.myId);
  if (me) net.setReady(!me.ready);
  UI.renderLobby(net);
});

$('#lobby-start').addEventListener('click', () => {
  if (!net?.isHost) return;
  const active = net.rosterList().filter(m => m.status !== 'gone');
  const players = active.map(m => ({
    id: m.peerId, name: m.name, color: m.color, build: sanitizeBuild(m.build),
  }));
  const seed = (Math.random() * 1e9) | 0;
  net.broadcast({ t: 'start', players, seed });
  startSession({ mode: 'host', myId: net.myId, players, seed });
});

$('#lobby-leave').addEventListener('click', () => {
  net?.leave(); net = null;
  UI.showScreen('menu');
});

// ---------------- game session ----------------
function startSession(cfg) {
  session?.stop();
  session = new Session(cfg);
  session.start();
}

class Session {
  constructor({ mode, myId, players, seed = 1 }) {
    this.mode = mode;               // 'solo' | 'host' | 'client'
    this.myId = myId;
    this.players = players;
    this.meta = new Map(players.map(p => [p.id, p]));
    this.seed = seed;
    this.game = null;               // authoritative sim (solo/host)
    this.snaps = [];                // client: interpolation buffer
    this.lastSnap = null;
    this.pendingEv = [];
    this.acc = 0;
    this.lastT = 0;
    this.lastInputSend = 0;
    this.running = false;
    this.ended = false;
    this.raf = 0;
  }

  start() {
    if (this.mode !== 'client') this.game = new Game(this.players, this.seed);
    const me = this.meta.get(this.myId);
    UI.showScreen('game');
    UI.buildHud(this.players);
    UI.setupAbilityButtons(sanitizeBuild(me.build).abilities);
    touch.setEnabled(true);
    this.running = true;
    this.lastT = performance.now();

    // one-time controls explainer
    if (!localStorage.getItem('smacktown.helped')) {
      $('#game-help').classList.remove('hidden');
      localStorage.setItem('smacktown.helped', '1');
    }
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}

    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    touch.setEnabled(false);
  }

  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;

    if (this.mode === 'client') this.clientFrame(t, dt);
    else this.hostFrame(t, dt);

    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  // ----- authoritative loop (solo & host) -----
  hostFrame(t, dt) {
    this.game.setInput(this.myId, touch.poll());
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.game.step();
      if (this.game.events.length) {
        renderer.onEvents(this.game.events);
        this.gameEvents(this.game.events);
        this.pendingEv.push(...this.game.events);
      }
      if (this.mode === 'host' && net &&
          (this.game.tick % SNAP_RATE === 0 || this.game.over)) {
        const s = this.game.snapshot();
        s.ev = this.pendingEv.splice(0);
        net.broadcast({ t: 'snap', s });
      }
      if (this.game.over) break;
    }
    const view = {
      fighters: this.game.fighters.map(f => ({
        id: f.id, x: f.x, y: f.y, vx: f.vx, vy: f.vy, facing: f.facing,
        pct: f.pct, stocks: f.stocks, state: f.state, dead: f.dead,
        invuln: f.invuln > 0, atk: f.atk,
        color: this.meta.get(f.id)?.color, cds: f.cds,
      })),
      projectiles: this.game.projectiles,
    };
    this.renderView(view, dt);
    if (this.game.over && !this.ended) this.finish(this.game.winner?.id ?? null, view.fighters);
  }

  // ----- spectating loop (client) -----
  clientFrame(t, dt) {
    // ship inputs to the host (fresh actions immediately, stick at ~30 Hz)
    const inp = touch.poll();
    const hasAction = inp.jump || inp.ff || inp.atk || inp.ab0 || inp.ab1 || inp.drop;
    if (hasAction || t - this.lastInputSend > 33) {
      this.lastInputSend = t;
      net?.sendToHost({ t: 'input', inp });
    }

    const view = this.interpolate(performance.now() - 130);
    if (view) this.renderView(view, dt);

    const s = this.lastSnap;
    if (s && s.over && !this.ended) {
      this.finish(s.win, this.rowsToFighters(s.f));
    }
  }

  renderView(view, dt) {
    renderer.draw(view, dt, this.myId);
    UI.updateHud(view.fighters);
    const mine = view.fighters.find(f => f.id === this.myId);
    UI.updateAbilityButtons(mine?.cds);
  }

  // ----- network callbacks -----
  onRemoteInput(pid, inp) {
    if (this.game && this.meta.has(pid)) this.game.setInput(pid, inp || blankInput());
  }

  onSnapshot(s, pid) {
    if (this.mode !== 'client' || pid !== net?.hostId) return;
    this.lastSnap = s;
    this.snaps.push({ rt: performance.now(), s });
    if (this.snaps.length > 40) this.snaps.shift();
    if (s.ev?.length) {
      renderer.onEvents(s.ev);
      this.gameEvents(s.ev);
    }
  }

  onHostChanged() {
    if (!net || this.ended) return;
    if (this.mode === 'client' && net.isHost) {
      // Host dropped mid-fight and we won the election: resurrect the sim
      // from the freshest snapshot and carry on as the authority.
      this.mode = 'host';
      this.game = gameFromSnapshot(this.players, this.lastSnap, this.seed + 1);
      this.acc = 0;
      this.pendingEv = [];
      // Drop the departed host's fighter if they're no longer around.
      this.onRoster();
      UI.toast('You are now the host!');
    }
  }

  onRoster() {
    // Authoritative side: fighters whose player vanished forfeit their stocks.
    if (!net || !this.game || this.mode === 'solo' || this.ended) return;
    for (const f of this.game.fighters) {
      if (f.dead || f.isBot || f.id === this.myId) continue;
      const m = net.members.get(f.id);
      const connLost = !m || (m.status === 'gone' && !net.conns.get(f.id)?.open);
      if (connLost) {
        f.dead = true;
        f.stocks = 0;
        this.game.events.push({ e: 'ko', x: f.x, y: f.y, id: f.id, stocks: 0 });
        UI.banner(`${this.meta.get(f.id)?.name || 'A fighter'} disconnected`, 'warn');
      }
    }
  }

  // ----- interpolation (client) -----
  rowsToFighters(rows) {
    return (rows || []).map(r => ({
      id: r[0], x: r[1], y: r[2], vx: r[3], vy: r[4], facing: r[5],
      pct: r[6], stocks: r[7], state: r[8], dead: !!r[9],
      invuln: !!r[10], atk: r[11] || null, cds: [r[12], r[13]],
      color: this.meta.get(r[0])?.color,
    }));
  }

  interpolate(renderTime) {
    const buf = this.snaps;
    if (!buf.length) return null;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].rt <= renderTime && buf[i + 1].rt >= renderTime) {
        a = buf[i]; b = buf[i + 1];
        break;
      }
    }
    const span = Math.max(1, b.rt - a.rt);
    const k = Math.max(0, Math.min(1, (renderTime - a.rt) / span));
    const fa = this.rowsToFighters(a.s.f);
    const fb = this.rowsToFighters(b.s.f);
    const fighters = fb.map(f2 => {
      const f1 = fa.find(x => x.id === f2.id) || f2;
      return { ...f2, x: f1.x + (f2.x - f1.x) * k, y: f1.y + (f2.y - f1.y) * k };
    });
    const projectiles = (b.s.p || []).map(p => ({ eid: p[0], kind: p[1], x: p[2], y: p[3] }));
    return { fighters, projectiles };
  }

  // ----- events & endgame -----
  gameEvents(events) {
    for (const ev of events) {
      if (ev.e === 'ko') {
        const name = this.meta.get(ev.id)?.name || '???';
        UI.toast(ev.id === this.myId ? 'You got smacked!' : `${name} KO’d!`);
        if (navigator.vibrate && ev.id === this.myId) navigator.vibrate(80);
      }
      if (ev.e === 'gameover') UI.toast('GAME!', 2000);
    }
  }

  finish(winnerId, finalFighters) {
    this.ended = true;
    setTimeout(() => {
      this.stop();
      UI.renderResults(this.players, winnerId, finalFighters);
      $('#results-again').textContent = this.mode === 'solo' ? 'Rematch' : 'Back to Lobby';
      UI.showScreen('results');
      session = null;
      if (net) {
        // reset ready states for the next round
        net.setReady(false);
        if (net.isHost) {
          for (const m of net.members.values()) m.ready = false;
          net._broadcastRoster();
        }
      }
    }, 1600);
  }
}

// ---------------- game screen buttons ----------------
$('#help-close').addEventListener('click', () => $('#game-help').classList.add('hidden'));

$('#game-quit').addEventListener('click', () => {
  session?.stop();
  session = null;
  if (net) {
    UI.renderLobby(net);
    UI.showScreen('lobby');
    net.setReady(false);
  } else {
    UI.showScreen('menu');
  }
});

$('#results-again').addEventListener('click', () => {
  if (net) {
    UI.renderLobby(net);
    UI.showScreen('lobby');
  } else {
    $('#menu-solo').click();
  }
});

$('#results-menu').addEventListener('click', () => {
  net?.leave(); net = null;
  UI.showScreen('menu');
});

// Leaving the page: tell peers instead of ghosting them.
addEventListener('pagehide', () => { net?.leave(); });

// Debug/testing handle (read-only peek at live state).
window.__smack = () => ({ session, net, profile });
