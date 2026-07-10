// App orchestration: boot, screens, room flow, and the game session driver.

import {
  loadProfile, saveProfile, validName, COLORS, emptyBuild, sanitizeBuild, saveLoadout, sanitizeHat,
  loadHats, hatArt, saveHat, deleteHat, loadLoadouts, selectedLoadout, selectLoadout,
  HAT_CHARS, HAT_PALETTE, buildCost, earnedCredits, MAX_BUILD_COST,
} from './profile.js';
import { Net } from './net.js';
import { Presence } from './presence.js';
import { Game, gameFromSnapshot, restoreFighter, interpolateEnemyRows, packEnemyDelta, unpackEnemyDelta, blankInput, TICK, SNAP_RATE, MAPS, MAP_IDS, DEFAULT_MAP, expanseBiomeAt, platsAt, HEART_LIFE } from './game.js';
import { TouchInput } from './input.js';
import { HatStudio } from './hat.js';
import { Renderer } from './render.js';
import { VoiceChat } from './voice.js';
import * as UI from './ui.js';
import { SFX } from './sfx.js';
import { settings } from './settings.js';

const $ = s => document.querySelector(s);
for (const el of document.querySelectorAll('.logo-version')) el.textContent = self.SMACKTOWN_VERSION || '';

function smartColorConvertHat(hat, fromColor, toColor) {
  const art = sanitizeHat(hat);
  if (!art || !fromColor || !toColor) return art;
  const from = nearestHatColor(fromColor);
  const to = nearestHatColor(toColor);
  if (from < 0 || to < 0 || from === to) return art;
  return art.replaceAll(HAT_CHARS[from], HAT_CHARS[to]);
}

function nearestHatColor(color) {
  const rgb = hexRgb(color);
  if (!rgb) return -1;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < HAT_PALETTE.length; i++) {
    const p = hexRgb(HAT_PALETTE[i]);
    if (!p) continue;
    const d = (rgb.r - p.r) ** 2 + (rgb.g - p.g) ** 2 + (rgb.b - p.b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function hexRgb(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}

// ---------------- audio ----------------
// Audio can only start after a user gesture: the first press anywhere
// unlocks the WebAudio context and starts the theme song.
addEventListener('pointerdown', () => SFX.unlock());
addEventListener('keydown', () => SFX.unlock());

// Every tappable control blips; a few get their own signature sound.
const BTN_SFX = {
  'loadout-save': 'save', 'builder-save': 'save',
  'hat-save': 'save', 'hat-dup': 'save',
  'login-go': 'ready',
};
const BTN_SILENT = new Set(['ability-btn-0', 'ability-btn-1', 'lobby-ready', 'lobby-start']);
document.addEventListener('click', e => {
  const b = e.target.closest(
    'button, [role="button"], .color-swatch, .loadout-chip, .shop-item, .map-card, .stat-pips');
  if (!b || b.disabled || BTN_SILENT.has(b.id)) return;
  SFX.play(BTN_SFX[b.id] || 'click');
}, true);

// The toggle silences the theme song only — game/UI sounds keep playing.
const muteBtn = $('#sfx-mute');
function renderMute() { muteBtn.textContent = SFX.muted ? '🔇' : '🎵'; }
muteBtn.addEventListener('click', () => { SFX.setMuted(!SFX.muted); renderMute(); });
renderMute();

// Push the saved mixer levels into the audio engine at boot (and whenever
// the settings store changes), so a fresh unlock() already honors them.
SFX.setLevels(settings.getAudio());
settings.onChange(s => SFX.setLevels(s.getAudio()));

// ---------------- global state ----------------
let profile = null;
let net = null;             // Net instance while in a room
let session = null;         // active game session
let voice = null;           // lobby voice chat channel (lives with net)
let presence = null;        // town-square presence (menu roster + invites)
let pendingInvite = null;   // {id, name} to ping once our fresh room opens
let pendingTraining = false; // start the training room once our room opens
let pendingExpedition = false; // start a PvE expedition once our room opens
const touch = new TouchInput(document);
touch.onPad = on => UI.banner(
  on ? '🎮 Controller connected — stick moves · A jumps · X quick · B/Y smash · bumpers = abilities'
     : '🎮 Controller disconnected',
  on ? 'good' : 'warn', on ? 4500 : 2500);
const renderer = new Renderer($('#game-canvas'));

// ---------------- boot ----------------
// The service worker precaches everything cache-first, so a deployed update
// only reaches the page once the new worker takes control. When that happens,
// reload immediately if we're just sitting in a menu; mid-room or mid-fight,
// offer a tap-to-refresh banner instead of yanking the session away.
if ('serviceWorker' in navigator) {
  addEventListener('load', async () => {
    // updateViaCache:'none' keeps the HTTP cache out of sw.js update checks
    const reg = await navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' }).catch(() => null);
    if (!reg) return;
    // Check for a new version on every launch (mobile Safari especially is
    // lazy about update checks) and whenever the app returns to the
    // foreground — installed PWAs can stay alive for days without a load.
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    // On a first visit the page loads uncontrolled and the fresh worker's
    // clients.claim() fires one controllerchange that is not an update —
    // swallow that one; every later controllerchange is a real new version.
    let firstClaim = !navigator.serviceWorker.controller;
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (firstClaim) { firstClaim = false; return; }
      if (refreshed) return;
      refreshed = true;
      if (!net && !session) { location.reload(); return; }
      UI.banner('Update ready — tap to refresh', 'good', 60000, () => location.reload());
    });
  });
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

// invite deep link: opening ?join=CODE drops you into that room directly
const urlJoin = new URLSearchParams(location.search).get('join');
let pendingJoinCode = urlJoin && /^[A-Za-z]{4}$/.test(urlJoin) ? urlJoin.toUpperCase() : null;
if (urlJoin) history.replaceState(null, '', location.pathname); // don't re-join on refresh

profile = loadProfile();
if (profile) {
  UI.renderMenuCard(profile);
  UI.showScreen('menu');
  startPresence();
  if (pendingJoinCode) { enterRoom(pendingJoinCode); pendingJoinCode = null; }
} else {
  initLogin();
  UI.showScreen('login');
}

// ---------------- idle & activity tracking ----------------
// No taps or keys for a while -> flagged idle on the town and room rosters.
const IDLE_MS = 90000;
let lastInputT = Date.now();
const isIdle = () => Date.now() - lastInputT > IDLE_MS;
function noteActivity() {
  const wasIdle = isIdle();
  lastInputT = Date.now();
  if (wasIdle) { presence?.update(); net?.pushPresence(); }   // wake up promptly
}
addEventListener('pointerdown', noteActivity, true);
addEventListener('keydown', noteActivity, true);

// Which screen the player is parked on, for presence/roster flavor.
// Heartbeats (~2.5s) pick this up, so no push is needed on screen changes.
function currentAct() {
  if (!$('#settings-modal').classList.contains('hidden')) return 'settings';
  if (!$('#hat-library').classList.contains('hidden')) return 'hatlib';
  const vis = id => !$('#screen-' + id).classList.contains('hidden');
  if (vis('hat')) return 'hat';
  if (vis('builder')) return 'builder';
  if (vis('results')) return 'results';
  if (vis('game')) return 'fighting';
  if (vis('lobby')) return 'lobby';
  return 'menu';
}

// ---------------- town-square presence ----------------
function presenceState() {
  // The room stays open even mid-fight — late joiners drop straight in.
  const base = session && !session.backgrounded
    ? { status: 'fighting', code: net?.roomCode || null, open: !!net?.roomCode }
    : net?.roomCode ? { status: 'lobby', code: net.roomCode, open: true }
    : session ? { status: 'fighting', code: null, open: false }
    : { status: 'menu', code: null, open: false };
  return { ...base, act: currentAct(), idle: isIdle() };
}

function startPresence() {
  if (presence || !profile) return;
  presence = new Presence(profile, presenceState);
  presence.on('roster', refreshOnline);
  presence.on('hats', list => {
    // Only paint if the Town Hats tab is actually on screen.
    if (!$('#hat-library').classList.contains('hidden')
      && !$('#hatlib-town').classList.contains('hidden')) renderTownHats(list);
  });
  presence.on('invite', inv => {
    if (!inv.code) return;
    if (session) { UI.banner(`${inv.from.name} invited you — room ${inv.code}`, 'warn', 6000); return; }
    if (net?.roomCode) {
      // Already in a different lobby: ask, don't yank.
      if (net.roomCode === inv.code) return;
      UI.banner(`⚔️ ${inv.from.name} challenged you! Tap to switch to room ${inv.code}`, 'good', 12000,
        () => enterRoom(inv.code));
      return;
    }
    // Not in a lobby: the invite pulls you straight in.
    UI.banner(`⚔️ ${inv.from.name} pulled you into room ${inv.code}!`, 'good', 5000);
    enterRoom(inv.code);
  });
  presence.start();
  publishHats();                  // share my hat collection with the town
  refreshOnline();
}

function refreshOnline() {
  if (!presence) return;
  UI.renderOnline(presence.list(), presence.ready, {
    onJoin: e => enterRoom(e.code),
    onInvite: e => {
      if (net?.roomCode) {
        presence.invite(e.id, net.roomCode);
        UI.banner(`Challenge sent to ${e.name}!`, 'good');
      } else {
        // No room yet: open one, then ping them once the code exists.
        pendingInvite = { id: e.id, name: e.name };
        enterRoom(null);
      }
    },
  });
  if (net?.roomCode && !$('#screen-lobby').classList.contains('hidden')) renderLobbyInvites();
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
let builderReturn = 'menu';        // 'menu' | 'lobby' — where Save goes back to

function openBuilder(firstRun = false, returnTo = 'menu') {
  builderFirstRun = firstRun;
  builderReturn = returnTo;
  // In a co-op expedition the workshop edits your run build against earned
  // credits — your saved character (and its 1000-cr purse) is left untouched.
  const pve = returnTo === 'lobby' && !!session && !session.ended && session.coop;
  builderWork = {
    color: profile.color,
    build: JSON.parse(JSON.stringify(pve ? session.myRunBuild() : profile.build)),
    hatId: profile.hatId,
    pve,
    budget: pve ? session.myCredits() : undefined,
  };
  $('#screen-builder').classList.toggle('pve', pve);
  $('#builder-name').value = profile.name;
  $('#builder-name-error').classList.add('hidden');
  $('#loadout-name').value = selectedLoadout() || '';
  UI.renderBuilder(builderWork);
  UI.showScreen('builder');
}

$('#builder-reset').addEventListener('click', () => {
  builderWork.build = emptyBuild();
  UI.renderBuilder(builderWork);
});

$('#loadout-save').addEventListener('click', () => {
  const nameEl = $('#loadout-name');
  const err = $('#loadout-error');
  const res = saveLoadout(nameEl.value, builderWork.color, builderWork.build, builderWork.hatId);
  if (res.ok) {
    selectLoadout(nameEl.value);           // the freshly saved build is now "me"
    nameEl.value = selectedLoadout() || '';
    err.classList.add('hidden');
    UI.renderBuilder(builderWork);
  } else {
    err.textContent = res.error;
    err.classList.remove('hidden');
  }
});

$('#builder-save').addEventListener('click', () => {
  // Co-op run build: apply to my fighter against earned credits, then straight
  // back to the lobby. Never persisted to my profile or saved characters.
  if (builderWork.pve) {
    if (!session || session.ended) { UI.showScreen('menu'); return; }
    if (!session.applyRunBuild(builderWork.build)) {
      UI.banner('That build costs more than you’ve earned!', 'bad');
      return;
    }
    UI.renderLobbyCard(profile);
    renderLobby();
    UI.showScreen('lobby');
    return;
  }
  const nameEl = $('#builder-name');
  const nameErr = $('#builder-name-error');
  if (!validName(nameEl.value)) {
    nameErr.textContent = '2–14 letters, numbers or basic punctuation, please!';
    nameErr.classList.remove('hidden');
    nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  nameErr.classList.add('hidden');
  profile = saveProfile({ name: nameEl.value, color: builderWork.color, build: builderWork.build, hatId: builderWork.hatId });
  const sel = selectedLoadout();
  if (sel) saveLoadout(sel, builderWork.color, builderWork.build, builderWork.hatId);   // edits stick to the character
  UI.renderMenuCard(profile);
  if (builderReturn === 'lobby' && net?.roomCode) {
    net.updateProfile(profile);      // let the room see the new colors/build
    renderLobby();
    UI.showScreen('lobby');
  } else {
    UI.showScreen('menu');
    startPresence();
  }
  presence?.setProfile(profile);
  if (builderFirstRun) UI.banner(`Welcome to SmackTown, ${profile.name}!`, 'good');
  if (builderFirstRun && pendingJoinCode) { enterRoom(pendingJoinCode); pendingJoinCode = null; }
});

$('#menu-builder').addEventListener('click', () => openBuilder());

// ----- menu character switching -----
// The fighter card is the "edit me" button; the arrows swap which saved
// build (character) is active — applied to the profile on the spot.
$('#menu-card').addEventListener('click', () => openBuilder());
$('#menu-card').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBuilder(); }
});

function cycleCharacter(dir) {
  const list = loadLoadouts();
  if (!list.length) return;
  const sel = selectedLoadout();
  const i = sel ? list.findIndex(l => l.name === sel) : -1;
  const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length];
  selectLoadout(next.name);
  profile = saveProfile({ name: profile.name, color: next.color, build: next.build, hatId: next.hatId });
  UI.renderMenuCard(profile);
  if (net?.roomCode) {
    net.setReady(false);
    net.updateProfile(profile);
    UI.renderLobbyCard(profile);
  }
  presence?.setProfile(profile);            // town roster shows the new colors
}
$('#menu-char-prev').addEventListener('click', () => cycleCharacter(-1));
$('#menu-char-next').addEventListener('click', () => cycleCharacter(1));
$('#lobby-char-prev').addEventListener('click', () => cycleCharacter(-1));
$('#lobby-char-next').addEventListener('click', () => cycleCharacter(1));
$('#lobby-card').addEventListener('click', () => {
  net?.setReady(false);
  openBuilder(false, 'lobby');
});
$('#lobby-card').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    net?.setReady(false);
    openBuilder(false, 'lobby');
  }
});

// ---------------- hats: builder arrows, library modal, studio ----------------
const hatStudio = new HatStudio();
let editingHatId = null;           // library entry the studio canvas holds

// Publish my hat collection to the town lobby (low-priority presence freight).
function publishHats() {
  presence?.setHats(loadHats().map(h => h.art));
}

// tiny canvas copy of a hat, for cards and chips
function hatThumb(art) {
  const img = UI.hatImage(art);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// ----- builder preview arrows: cycle [bare-headed, ...library] -----
function cycleHat(dir) {
  const ids = [null, ...loadHats().map(h => h.id)];
  const i = Math.max(0, ids.indexOf(builderWork.hatId));   // stale id -> start at "no hat"
  builderWork.hatId = ids[(i + dir + ids.length) % ids.length];
  UI.renderBuilder(builderWork);
}
$('#builder-hat-prev').addEventListener('click', () => cycleHat(-1));
$('#builder-hat-next').addEventListener('click', () => cycleHat(1));

// ----- hat library modal -----
function openHatLibrary() {
  $('#hat-library').classList.remove('hidden');
  showHatLibTab('mine');
}

function closeHatLibrary() {
  $('#hat-library').classList.add('hidden');
}

function showHatLibTab(which) {
  $('#hatlib-tab-mine').classList.toggle('on', which === 'mine');
  $('#hatlib-tab-town').classList.toggle('on', which === 'town');
  $('#hatlib-mine').classList.toggle('hidden', which !== 'mine');
  $('#hatlib-town').classList.toggle('hidden', which !== 'town');
  if (which === 'mine') {
    renderHatLibrary();
  } else {
    renderTownHats(null);           // "looking…" until the hub answers
    presence?.requestHats();
  }
}

$('#builder-hat-library').addEventListener('click', openHatLibrary);
$('#hatlib-close').addEventListener('click', closeHatLibrary);
$('#hat-library').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHatLibrary();    // tap the backdrop to close
});
$('#hatlib-tab-mine').addEventListener('click', () => showHatLibTab('mine'));
$('#hatlib-tab-town').addEventListener('click', () => showHatLibTab('town'));
$('#hatlib-new').addEventListener('click', () => openHatStudio(null));

// ---------------- settings modal ----------------
// Sound sliders write straight through to the audio engine; the keyboard and
// controller tabs rebind inputs by capturing the next press. Touch controls
// are gesture-based and shown read-only. `settingsCap` is the row currently
// listening for input, or null.
let settingsTab = 'sound';
let settingsCap = null;         // { kind:'key'|'pad', id }
let padCapRAF = 0;              // rAF handle while scanning for a pad button

function paintSettings() {
  UI.renderSettings({
    active: settingsTab,
    capture: settingsCap,
    onAudio: (which, v) => {
      settings.setAudio(which, v);
      // dragging music above zero clears the corner mute so it's actually heard
      if (which === 'music' && v > 0 && SFX.muted) { SFX.setMuted(false); renderMute(); }
    },
    onRebindKey: (id, capturing) => startCapture(capturing ? null : { kind: 'key', id }),
    onRebindPad: (id, capturing) => startCapture(capturing ? null : { kind: 'pad', id }),
    onResetKey: () => { settings.resetKeys(); stopCapture(); paintSettings(); },
    onResetPad: () => { settings.resetPad(); stopCapture(); paintSettings(); },
  });
}

function openSettings() {
  settingsTab = 'sound';
  stopCapture();
  $('#settings-modal').classList.remove('hidden');
  paintSettings();
}
function closeSettings() {
  stopCapture();
  $('#settings-modal').classList.add('hidden');
}

// Begin (or clear) an input-capture. Only one row listens at a time.
function startCapture(cap) {
  stopCapture();
  settingsCap = cap;
  if (cap?.kind === 'pad') scanPadForCapture();
  paintSettings();
}
function stopCapture() {
  settingsCap = null;
  if (padCapRAF) { cancelAnimationFrame(padCapRAF); padCapRAF = 0; }
}

// Keyboard capture: the next key pressed while listening becomes the binding.
addEventListener('keydown', e => {
  if (!settingsCap || settingsCap.kind !== 'key') return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopCapture(); paintSettings(); return; }
  settings.bindKey(settingsCap.id, e.key.toLowerCase());
  stopCapture();
  paintSettings();
}, true);

// Controller capture: poll the pad each frame for a freshly-pressed button.
function scanPadForCapture() {
  const base = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
  const wasDown = base ? base.buttons.map(b => b.pressed) : [];
  const tick = () => {
    if (!settingsCap || settingsCap.kind !== 'pad') { padCapRAF = 0; return; }
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) {
        if (pad.buttons[i].pressed && !wasDown[i]) {
          settings.bindPad(settingsCap.id, i);
          stopCapture();
          paintSettings();
          return;
        }
        wasDown[i] = pad.buttons[i].pressed;
      }
    }
    padCapRAF = requestAnimationFrame(tick);
  };
  padCapRAF = requestAnimationFrame(tick);
}

$('#menu-settings').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-done').addEventListener('click', closeSettings);
$('#settings-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSettings();      // tap the backdrop to close
});
for (const tab of document.querySelectorAll('.settings-tab')) {
  tab.addEventListener('click', () => { settingsTab = tab.dataset.tab; stopCapture(); paintSettings(); });
}
$('#settings-reset').addEventListener('click', () => {
  settings.reset();
  stopCapture();
  renderMute();
  paintSettings();
});

// My hats: tap the art to wear it (tap again to take it off), ✏️ edit, ✕ delete.
function renderHatLibrary() {
  const box = $('#hatlib-grid');
  box.innerHTML = '';
  const hats = loadHats();
  if (!hats.length) {
    box.innerHTML = '<p class="hatlib-empty">No hats yet — draw your first one below!</p>';
    return;
  }
  for (const h of hats) {
    const worn = h.id === builderWork.hatId;
    const card = document.createElement('div');
    card.className = 'hatlib-card' + (worn ? ' worn' : '');
    const wear = document.createElement('button');
    wear.className = 'hatlib-art';
    wear.title = worn ? 'Take this hat off' : 'Wear this hat';
    wear.appendChild(hatThumb(h.art));
    if (worn) {
      const badge = document.createElement('span');
      badge.className = 'hatlib-worn';
      badge.textContent = 'WORN';
      wear.appendChild(badge);
    }
    wear.addEventListener('click', () => {
      builderWork.hatId = worn ? null : h.id;
      UI.renderBuilder(builderWork);
      renderHatLibrary();
    });
    const actions = document.createElement('div');
    actions.className = 'hatlib-actions';
    const edit = document.createElement('button');
    edit.className = 'hatlib-btn';
    edit.setAttribute('aria-label', 'Edit hat');
    edit.textContent = '✏️';
    edit.addEventListener('click', () => openHatStudio(h.id));
    const del = document.createElement('button');
    del.className = 'hatlib-btn';
    del.setAttribute('aria-label', 'Delete hat');
    del.textContent = '✕';
    del.addEventListener('click', () => {
      deleteHat(h.id);
      if (builderWork.hatId === h.id) builderWork.hatId = null;
      publishHats();
      UI.renderBuilder(builderWork);
      renderHatLibrary();
    });
    actions.append(edit, del);
    card.append(wear, actions);
    box.appendChild(card);
  }
}

// Town hats: everyone's shared hats, grouped by owner. list = null while loading.
function renderTownHats(list) {
  const box = $('#hatlib-town-list');
  const empty = $('#hatlib-town-empty');
  box.innerHTML = '';
  if (!list) {
    empty.textContent = presence ? 'Looking for town hats…' : 'Town hats need a connection.';
    empty.classList.remove('hidden');
    return;
  }
  const others = list.filter(e => e.id !== presence?.myId && e.hats.length);
  if (!others.length) {
    empty.textContent = 'No town hats right now — your hats are shared automatically, so check back soon!';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const e of others) {
    const row = document.createElement('div');
    row.className = 'town-row';
    const owner = document.createElement('div');
    owner.className = 'town-owner';
    const sw = document.createElement('span');
    sw.className = 'r-swatch';
    sw.style.background = e.color;
    const nm = document.createElement('span');
    nm.className = 'town-name';
    nm.textContent = e.name;
    owner.append(sw, nm);
    const hatsBox = document.createElement('div');
    hatsBox.className = 'town-hats';
    for (const art of e.hats) {
      const chip = document.createElement('div');
      chip.className = 'town-hat';
      chip.appendChild(hatThumb(art));
      const copy = document.createElement('button');
      copy.className = 'town-copy';
      copy.title = 'Copy to my hats';
      copy.textContent = '📋';
      copy.addEventListener('click', () => {
        const res = saveHat(art);           // mints a fresh local copy
        if (!res.ok) { UI.banner(res.error, 'bad'); return; }
        publishHats();
        UI.renderBuilder(builderWork);      // hat count in the cycle label changed
        UI.banner(`Copied ${e.name}'s hat to your library! 🎩`, 'good');
      });
      chip.appendChild(copy);
      hatsBox.appendChild(chip);
    }
    row.append(owner, hatsBox);
    box.appendChild(row);
  }
}

// ----- hat studio (drawing screen) -----
// Reached only through the library modal: New Hat or ✏️ on a card. Saving
// and cancelling both land back in the library.
function openHatStudio(hatId) {
  editingHatId = hatId;
  closeHatLibrary();
  UI.showScreen('hat');                 // show first so the canvas has a size
  hatStudio.open(builderWork.color, hatArt(editingHatId), {
    onSave: art => {
      const res = saveHat(art, editingHatId);   // empty canvas -> friendly error
      if (!res.ok) { UI.banner(res.error, 'bad'); return; }
      builderWork.hatId = res.id;
      publishHats();
      closeHatStudio();
      UI.banner('Hat saved! 🎩', 'good');
    },
    onDuplicate: art => {
      const res = saveHat(art, null);   // always mints a new hat
      if (!res.ok) { UI.banner(res.error, 'bad'); return; }
      builderWork.hatId = res.id;
      publishHats();
      closeHatStudio();
      UI.banner('Saved as a new hat! 🎩', 'good');
    },
    onCancel: () => closeHatStudio(),
  });
}

function closeHatStudio() {
  hatStudio.close();
  UI.showScreen('builder');
  UI.renderBuilder(builderWork);
  openHatLibrary();                     // back to managing the library
}

// ---------------- menu actions ----------------
$('#menu-solo').addEventListener('click', () => {
  startSession({
    mode: 'solo',
    myId: 'me',
    map: MAP_IDS[(Math.random() * MAP_IDS.length) | 0],
    players: [
      { id: 'me', name: profile.name, color: profile.color, build: profile.build, hat: profile.hat },
      {
        id: 'bot', name: 'Trainer Bot', isBot: true,
        color: COLORS.find(c => c !== profile.color) || '#38b6ff',
        build: { stats: { power: 2, speed: 2, defense: 1, agility: 1 }, abilities: ['fireball'], augments: [] },
      },
    ],
  });
});

// Training room: hosts a normal joinable room, but skips the lobby and
// starts straight on the hidden training map with an endlessly
// respawning sandbag. Friends can drop in like any running fight.
$('#menu-training').addEventListener('click', () => {
  pendingTraining = true;
  enterRoom(null);
});

function startTraining() {
  const players = [
    {
      id: net.myId, pid: profile.pid || null, name: profile.name, color: profile.color,
      build: sanitizeBuild(profile.build), hat: sanitizeHat(profile.hat),
    },
    { id: 'sandbag', name: 'Sandbag', sandbag: true, color: '#d9b45c', build: emptyBuild() },
  ];
  const seed = (Math.random() * 1e9) | 0;
  startSession({ mode: 'host', myId: net.myId, players, seed, map: 'training' });
}

// Expedition (PvE co-op): auto-hosts a joinable room and drops the player
// straight onto the endless map — no lobby, no vote. Friends walk in like any
// running fight and fight alongside you; the run never ends.
$('#menu-pve').addEventListener('click', () => {
  pendingExpedition = true;
  enterRoom(null);
});

function startExpedition() {
  // Expeditions start from scratch: a stock fighter with 0 credits, earned and
  // spent over the run. Your saved character supplies only name/color/hat.
  const players = [
    {
      id: net.myId, pid: profile.pid || null, name: profile.name, color: profile.color,
      build: emptyBuild(), hat: sanitizeHat(profile.hat),
    },
  ];
  const seed = (Math.random() * 1e9) | 0;
  startSession({ mode: 'host', myId: net.myId, players, seed, map: 'expanse' });
}

$('#menu-join').addEventListener('click', () => {
  const code = $('#menu-code').value.trim().toUpperCase();
  if (!code) return enterRoom(null);          // no code — host a fresh room
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
  voice?.destroy(); voice = null;
  net = new Net(profile);
  net.getMood = () => ({ idle: isIdle(), act: currentAct() });
  voice = new VoiceChat(net);
  voice.onChange = () => { renderVoiceButtons(); renderLobby(); };
  net.on('voice', (pid, on) => {
    voice?.onPeerVoice(pid, on);
    if (on && pid !== net.myId) {
      const name = net.members.get(pid)?.name || 'A fighter';
      UI.banner(`🎙 ${name} joined voice chat`, 'good');
    }
  });

  net.on('room', () => {
    // training: skip the lobby — the room exists purely so friends can
    // drop into the session, which starts the moment the room opens
    if (pendingTraining && net.isHost) {
      pendingTraining = false;
      startTraining();
      return;
    }
    if (pendingExpedition && net.isHost) {
      pendingExpedition = false;
      startExpedition();
      return;
    }
    renderLobby();
    UI.showScreen('lobby');
    presence?.update();               // advertise the joinable room
    if (pendingInvite && net.isHost) {
      presence?.invite(pendingInvite.id, net.roomCode);
      UI.banner(`Challenge sent to ${pendingInvite.name}!`, 'good');
      pendingInvite = null;
    }
  });
  net.on('roster', () => {
    if (!$('#screen-lobby').classList.contains('hidden')) renderLobby();
    voice?.prune();
    session?.onRoster();
    maybeAutoStart();
  });
  net.on('profile-changed', (pid, m) => session?.onProfileChanged(pid, m));
  net.on('error', text => {
    if (session) return;
    UI.showScreen('menu');
    menuError(text);
    voice?.destroy(); voice = null;
    net?.leave(); net = null;
    pendingInvite = null;
    pendingTraining = false;
    pendingExpedition = false;
    presence?.update();
  });
  net.on('banner', (text, kind) => UI.banner(text, kind));
  net.on('peer-joined', rec => {
    // A player walked in while a fight is running: as host, drop them into
    // the live game and re-broadcast the player list so everyone syncs up.
    if (!session || session.ended || !net.isHost || session.mode === 'solo') return;
    // Co-op newcomers start stock with 0 credits, same as everyone did — only
    // a returning player (matched by pid in addPlayer) keeps their run build.
    const coop = !!MAPS[session.map]?.coop;
    const build = coop ? emptyBuild() : sanitizeBuild(rec.build);
    session.addPlayer({ id: rec.peerId, pid: rec.pid || null, name: rec.name, color: rec.color, build, hat: sanitizeHat(rec.hat) });
    session.broadcastPlayers();
    UI.banner(`${rec.name} joined the fight!`, 'good');
  });
  net.on('host-changed', () => {
    if (!$('#screen-lobby').classList.contains('hidden')) renderLobby();
    session?.onHostChanged();
    maybeAutoStart();
  });
  net.on('game:start', (msg, pid) => {
    if (pid !== net.hostId) return;
    const map = MAPS[msg.map] ? msg.map : DEFAULT_MAP;
    const cap = MAPS[map]?.coop ? MAX_BUILD_COST : undefined;
    const players = msg.players.map(p => ({ ...p, build: sanitizeBuild(p.build, cap), hat: sanitizeHat(p.hat) }));
    if (session) { session.syncPlayers(players, map, msg.trying || null); return; }  // mid-game roster update
    startSession({ mode: 'client', myId: net.myId, players, seed: msg.seed, map });
  });
  net.on('game:input', (msg, pid) => session?.onRemoteInput(pid, msg.inp, msg.seq));
  net.on('game:snap', (msg, pid) => session?.onSnapshot(msg.s, pid));
  net.on('game:park', (msg, pid) => session?.onPark(pid, msg.on));
  net.on('game:try', (msg, pid) => session?.onTry(pid, msg.target));
  net.on('game:try-self', (msg, pid) => session?.onTrySelf(pid));

  if (joinCode) net.join(joinCode); else net.host();
  UI.banner(joinCode ? 'Joining room…' : 'Opening room…', 'warn', 8000);
}

$('#lobby-ready').addEventListener('click', () => {
  const me = net?.members.get(net.myId);
  if (me) {
    const nowReady = !me.ready;
    net.setReady(nowReady);
    SFX.play(nowReady ? 'ready' : 'unready');
  }
  renderLobby();
});

// Map voting: tap a card to vote, tap it again to clear your vote.
function voteMap(id) {
  if (!net) return;
  const me = net.members.get(net.myId);
  net.setVote(me?.vote === id ? null : id);
  renderLobby();
}

// Voice chat: join/leave the room's mic channel; mute toggles the mic track.
function renderVoiceButtons() {
  const joinBtn = $('#lobby-voice');
  const muteBtn2 = $('#lobby-voice-mute');
  const on = !!voice?.active;
  joinBtn.textContent = on ? '🎙 Leave Voice' : '🎙 Join Voice';
  joinBtn.classList.toggle('voice-on', on);
  joinBtn.disabled = !voice?.supported();
  if (!voice?.supported()) joinBtn.textContent = '🎙 Voice unavailable';
  muteBtn2.classList.toggle('hidden', !on);
  muteBtn2.textContent = voice?.muted ? '🔇' : '🔊';
}

$('#lobby-voice').addEventListener('click', async () => {
  if (!voice) return;
  if (voice.active) { voice.stop(); return; }
  const ok = await voice.start();
  if (!ok) UI.banner('Couldn\u2019t start voice — check mic permission', 'warn');
});

$('#lobby-voice-mute').addEventListener('click', () => voice?.setMuted(!voice.muted));

function renderLobby() {
  if (net) {
    const me = net.members.get(net.myId);
    UI.renderLobbyCard(me ? {
      name: me.name,
      color: me.color,
      build: sanitizeBuild(me.build),
      hat: sanitizeHat(me.hat),
    } : profile);
    const fightOn = !!session && !session.ended && session.mode !== 'solo';
    $('#lobby-rejoin').classList.toggle('hidden', !fightOn);
    UI.renderLobby(net, voteMap, fightOn);
    renderLobbyInvites();
  }
  renderVoiceButtons();
}

function renderLobbyInvites() {
  if (!presence || !net?.roomCode) return;
  const currentRoom = net.roomCode;
  const entries = presence.list().filter(e => e.status !== 'fighting' && e.code !== currentRoom);
  UI.renderOnline(entries, presence.ready, {
    root: 'lobby',
    inviteOnly: true,
    onInvite: e => {
      presence.invite(e.id, currentRoom);
      UI.banner(`Invite sent to ${e.name}!`, 'good');
    },
  });
}

// Everyone ready -> the host counts down and starts the fight automatically.
let autoStartTimer = null;
let autoStartAt = 0;
let lastCountTick = 0;    // last countdown second we blipped for

function cancelAutoStart() {
  clearInterval(autoStartTimer);
  autoStartTimer = null;
  lastCountTick = 0;
}

function lobbyAllReady() {
  const active = net.rosterList().filter(m => m.status !== 'gone');
  return active.length >= 2 && active.every(m => m.ready);
}

function maybeAutoStart() {
  const armed = net?.isHost && !session
    && !$('#screen-lobby').classList.contains('hidden') && lobbyAllReady();
  if (!armed) {
    if (autoStartTimer) {
      cancelAutoStart();
      if (net && !$('#screen-lobby').classList.contains('hidden')) renderLobby();
    }
    return;
  }
  if (!autoStartTimer) {
    autoStartAt = Date.now() + 3000;
    autoStartTimer = setInterval(maybeAutoStart, 250);
  }
  const left = Math.ceil((autoStartAt - Date.now()) / 1000);
  if (left <= 0) { startFight(); return; }
  if (left !== lastCountTick) { lastCountTick = left; SFX.play('tick'); }
  $('#lobby-status').textContent = `All ready — starting in ${left}…`;
}

// Tally the lobby's map votes: most votes wins, ties break randomly among
// the leaders, and nobody voting means a random map for everyone.
function tallyMapVotes(active) {
  const counts = new Map();
  for (const m of active) {
    if (m.vote && MAP_IDS.includes(m.vote)) counts.set(m.vote, (counts.get(m.vote) || 0) + 1);
  }
  if (!counts.size) return MAP_IDS[(Math.random() * MAP_IDS.length) | 0];
  const top = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
  return leaders[(Math.random() * leaders.length) | 0];
}

function startFight() {
  cancelAutoStart();
  if (!net?.isHost || session) return;
  const active = net.rosterList().filter(m => m.status !== 'gone');
  // One active player = solo practice: the host still runs a normal
  // authoritative session so friends can drop in mid-fight.
  if (!active.length || !active.every(m => m.ready)) return;
  const players = active.map(m => ({
    id: m.peerId, pid: m.pid || null, name: m.name, color: m.color, build: sanitizeBuild(m.build), hat: sanitizeHat(m.hat),
  }));
  const seed = (Math.random() * 1e9) | 0;
  const votedMap = tallyMapVotes(active);
  const map = MAPS[votedMap] ? votedMap : DEFAULT_MAP;
  net.broadcast({ t: 'start', players, seed, map });
  startSession({ mode: 'host', myId: net.myId, players, seed, map });
}

$('#lobby-start').addEventListener('click', startFight);

$('#lobby-edit').addEventListener('click', () => {
  // Editing un-readies you so the fight can't auto-start while you shop.
  net?.setReady(false);
  openBuilder(false, 'lobby');
});

$('#lobby-leave').addEventListener('click', () => {
  cancelAutoStart();
  session?.stop(); session = null;    // abandon any backgrounded fight
  voice?.destroy(); voice = null;
  net?.leave(); net = null;
  pendingInvite = null;
  UI.showScreen('menu');
  presence?.update();
});

$('#lobby-invite').addEventListener('click', async () => {
  if (!net?.roomCode) return;
  const url = `${location.origin}${location.pathname}?join=${net.roomCode}`;
  const text = `Fight me in SmackTown! Room ${net.roomCode}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'SmackTown', text, url }); } catch (_) {} // cancel = fine
  } else {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      UI.banner('Invite link copied!', 'good');
    } catch (_) {
      UI.banner(`Share this code: ${net.roomCode}`, 'warn');
    }
  }
});

// ---------------- game session ----------------
function startSession(cfg) {
  session?.stop();
  session = new Session(cfg);
  session.start();
  SFX.play('go');
  presence?.update();
}

// Cosmetic events the client already plays locally via prediction; the
// host's copies are dropped for our own fighter to avoid double effects.
const PREDICTED_EV = new Set(['jump', 'land', 'ledge', 'roll', 'swing', 'charge', 'fizzle', 'ability', 'shockwave', 'gale', 'mend', 'duck']);
const SNAPSHOT_INTEREST_RADIUS = 1800;
const FULL_SNAPSHOT_TICKS = 60;

class PerfStats {
  constructor() {
    this.size = 300;
    this.series = new Map();
    this.heap = 0;
    this.longTasks = 0;
    this.longTaskMs = 0;
    this.lastHeapSample = 0;
    this.observer = null;
    try {
      this.observer = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          this.longTasks++;
          this.longTaskMs += e.duration;
        }
      });
      this.observer.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  add(name, value) {
    let s = this.series.get(name);
    if (!s) {
      s = { values: new Float32Array(this.size), next: 0, count: 0 };
      this.series.set(name, s);
    }
    s.values[s.next] = value;
    s.next = (s.next + 1) % this.size;
    s.count = Math.min(this.size, s.count + 1);
  }

  sampleHeap(now) {
    if (now - this.lastHeapSample < 1000) return;
    this.lastHeapSample = now;
    this.heap = performance.memory?.usedJSHeapSize || 0;
  }

  snapshot() {
    const phases = {};
    for (const [name, s] of this.series) {
      const values = Array.from(s.values.slice(0, s.count)).sort((a, b) => a - b);
      const sum = values.reduce((n, v) => n + v, 0);
      phases[name] = {
        avgMs: +(sum / values.length).toFixed(2),
        p95Ms: +values[Math.floor((values.length - 1) * 0.95)].toFixed(2),
        maxMs: +values[values.length - 1].toFixed(2),
        samples: values.length,
      };
    }
    return {
      phases,
      heapMB: this.heap ? +(this.heap / 1048576).toFixed(1) : null,
      longTasks: this.longTasks,
      longTaskMs: +this.longTaskMs.toFixed(1),
    };
  }

  stop() { this.observer?.disconnect(); }
}

class Session {
  constructor({ mode, myId, players, seed = 1, map = DEFAULT_MAP }) {
    this.mode = mode;               // 'solo' | 'host' | 'client'
    this.backgrounded = false;      // player stepped out to the lobby; sim carries on
    this.myId = myId;
    this.players = players;
    this.meta = new Map(players.map(p => [p.id, p]));
    this.seed = seed;
    this.map = MAPS[map] ? map : DEFAULT_MAP;
    this.game = null;               // authoritative sim (solo/host)
    this.snaps = [];                // client: interpolation buffer
    this.lastSnap = null;
    this.lastFullSnap = null;
    this.entityRows = { p: new Map(), en: new Map(), ht: new Map() };
    this.snapshotCaches = new Map(); // host: recipient -> last transmitted entity rows
    this._enemyInterpolation = { from: new Map(), out: [] };
    this.pendingEv = [];
    this.acc = 0;
    this.lastT = 0;
    this.lastInputSend = 0;
    this.pred = null;               // client: local mirror sim (prediction)
    this.inputSeq = 0;              // client: monotonically increasing per tick
    this.tickLog = [];              // client: per-tick inputs awaiting host ack
    this.corr = { x: 0, y: 0 };     // client: reconciliation smoothing offset
    this.pendActs = {};             // client: actions waiting for a sim tick
    this.acks = new Map();          // host: last input seq processed per client
    this.trying = new Map();        // player id -> {targetId, build, hat} until next life
    this.running = false;
    this.ended = false;
    this.raf = 0;
    this.perf = new PerfStats();
    this.lastSnapshotAt = 0;
  }

  start() {
    if (this.mode !== 'client') this.game = new Game(this.players, this.seed, this.map);
    else this.pred = new Game(this.players, this.seed, this.map);
    renderer.setMap(this.map);
    renderer.expanseSeed = this.seed >>> 0;      // deterministic endless world
    const me = this.meta.get(this.myId);
    UI.showScreen('game');
    this.buildHud();
    $('#game-credits').classList.toggle('hidden', !this.coop);
    UI.setupAbilityButtons(sanitizeBuild(me.build, this.coop ? MAX_BUILD_COST : undefined).abilities);
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
    this.perf.stop();
    touch.setEnabled(false);
  }

  // Step out to the lobby (or back in) while the fight keeps running.
  // Backgrounded: inputs off, rendering/FX skipped — sim and net carry on.
  // The fighter is parked meanwhile: asleep and untouchable, and waking up
  // drops their stocks to match the lowest fighter still brawling.
  setBackgrounded(on) {
    this.backgrounded = on;
    touch.setEnabled(!on && this.running);
    if (this.game) this.game.setParked(this.myId, on);       // solo/host: authoritative
    else net?.sendToHost({ t: 'park', on: !!on });           // client: ask the host
  }

  // Host: a client stepped out to (or back from) the lobby.
  onPark(pid, on) {
    if (this.game && this.meta.has(pid)) this.game.setParked(pid, !!on);
  }

  // A player re-tuned their character in the lobby workshop mid-fight:
  // their fighter adopts the new kit on the spot, so stepping out to the
  // lobby and rejoining doubles as a character switch.
  onProfileChanged(pid, m) {
    if (this.ended || !this.meta.has(pid)) return;
    const p = this.meta.get(pid);
    p.name = m.name;
    p.color = m.color;
    p.build = sanitizeBuild(m.build, this.coop ? MAX_BUILD_COST : undefined);
    p.hat = sanitizeHat(m.hat);
    this.trying.delete(pid);
    this.game?.updateBuild(pid, p.build);
    this.pred?.updateBuild(pid, p.build);
    if (pid === this.myId) UI.setupAbilityButtons(p.build.abilities);
    // host: re-broadcast the roster so clients repaint colors/hats/builds
    if (this.mode === 'host' && net) this.broadcastPlayers();
    this.buildHud();
  }

  wirePlayers() {
    return this.players.map(p => {
      const tr = this.trying.get(p.id);
      return tr ? { ...p, build: tr.build, hat: tr.hat } : p;
    });
  }

  wireTrying() {
    return Object.fromEntries([...this.trying].map(([id, tr]) => [id, tr.targetId || null]));
  }

  broadcastPlayers() {
    if (this.mode === 'host' && net) {
      net.broadcast({ t: 'start', players: this.wirePlayers(), seed: this.seed, map: this.map, trying: this.wireTrying() });
    }
  }

  buildHud() {
    UI.buildHud(this.players, {
      myId: this.myId,
      onTry: id => this.requestTry(id),
      onTrySelf: () => this.requestTrySelf(),
      tryingId: this.trying.get(this.myId)?.targetId || null,
      infiniteStocks: this.map === 'training' || !!MAPS[this.map]?.coop,
      coop: !!MAPS[this.map]?.coop,
    });
  }

  requestTry(targetId) {
    if (!targetId || targetId === this.myId || !this.meta.has(targetId)) return;
    if (this.mode === 'host') this.applyTry(this.myId, targetId);
    else net?.sendToHost({ t: 'try', target: targetId });
  }

  onTry(pid, targetId) {
    if (this.mode === 'host') this.applyTry(pid, targetId);
  }

  requestTrySelf() {
    if (!this.trying.has(this.myId)) return;
    if (this.mode === 'host') this.endTry(this.myId);
    else net?.sendToHost({ t: 'try-self' });
  }

  onTrySelf(pid) {
    if (this.mode === 'host') this.endTry(pid);
  }

  applyTry(pid, targetId) {
    if (!this.game || this.ended) return;
    const me = this.meta.get(pid);
    const target = this.meta.get(targetId);
    if (!me || !target || pid === targetId) return;
    const build = sanitizeBuild(target.build);
    const hat = smartColorConvertHat(target.hat, target.color, me.color);
    this.trying.set(pid, { targetId, build, hat });
    this.game.tryBuild(pid, build);
    const original = { build: me.build, hat: me.hat };
    me.build = build;
    me.hat = hat;
    if (pid === this.myId) UI.setupAbilityButtons(build.abilities);
    this.broadcastPlayers();
    me.build = original.build;
    me.hat = original.hat;
    this.buildHud();
    UI.toast(pid === this.myId ? `Trying ${target.name}!` : `${me.name} is trying ${target.name}!`);
  }

  activeMeta(id) {
    const p = this.meta.get(id);
    const tr = this.trying.get(id);
    return tr && p ? { ...p, build: tr.build, hat: tr.hat } : p;
  }

  // ----- co-op expedition economy -----
  get coop() { return !!MAPS[this.map]?.coop; }

  // My live fighter, whether I'm the authority or a client reading snapshots.
  myFighter() {
    if (this.game) return this.game.fighters.find(f => f.id === this.myId);
    const rows = this.lastSnap?.f;
    return rows ? this.rowsToFighters(rows).find(f => f.id === this.myId) : null;
  }

  // Credits earned so far this run, straight from my authoritative score.
  myCredits() { return earnedCredits(this.myFighter()?.score); }

  // The build I'm currently running (my in-session loadout, not my profile).
  myRunBuild() { return sanitizeBuild(this.meta.get(this.myId)?.build, MAX_BUILD_COST); }

  // Re-tune my run character in the workshop. Refused if it would spend beyond
  // what I've earned; otherwise it broadcasts and my fighter adopts it live.
  applyRunBuild(build) {
    const b = sanitizeBuild(build, MAX_BUILD_COST);
    if (buildCost(b) > this.myCredits()) return false;
    net?.updateProfile({ ...profile, build: b });   // fans out via profile-changed → onProfileChanged
    return true;
  }

  endTry(pid) {
    if (!this.trying.has(pid)) return;
    this.trying.delete(pid);
    const p = this.meta.get(pid);
    if (!p) return;
    this.game?.clearTryBuild(pid);
    this.pred?.clearTryBuild(pid);
    if (pid === this.myId) {
      UI.setupAbilityButtons(sanitizeBuild(p.build, this.coop ? MAX_BUILD_COST : undefined).abilities);
      UI.toast('Back to your fighter!');
    }
    this.buildHud();
    this.broadcastPlayers();
  }

  frame(t) {
    if (!this.running) return;
    const frameStart = performance.now();
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.perf.add('schedule', dt * 1000);
    this.perf.sampleHeap(t);

    if (this.mode === 'client') this.clientFrame(t, dt);
    else this.hostFrame(t, dt);

    this.perf.add('frame', performance.now() - frameStart);

    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  perfReport() {
    return {
      mode: this.mode,
      map: this.map,
      fighters: this.game?.fighters.length ?? this.lastSnap?.f?.length ?? 0,
      enemies: this.game?.enemies.length ?? this.lastSnap?.en?.length ?? 0,
      projectiles: this.game?.projectiles.length ?? this.lastSnap?.p?.length ?? 0,
      ...this.perf.snapshot(),
    };
  }

  // ----- authoritative loop (solo & host) -----
  hostFrame(t, dt) {
    this.game.setInput(this.myId, touch.poll());
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      const simStart = performance.now();
      this.game.step();
      this.perf.add('simulation', performance.now() - simStart);
      if (this.game.events.length) {
        if (!this.backgrounded) {
          renderer.onEvents(this.game.events);
          this.gameEvents(this.game.events);
        }
        this.pendingEv.push(...this.game.events);
      }
      if (this.mode === 'host' && net &&
          (this.game.tick % SNAP_RATE === 0 || this.game.over)) {
        const snapshotStart = performance.now();
        const full = this.game.over || this.game.tick % FULL_SNAPSHOT_TICKS === 0;
        const ev = this.pendingEv.splice(0);
        const ack = Object.fromEntries(this.acks);
        if (full) {
          const s = this.game.snapshot();
          s.full = true;
          s.ev = ev;
          s.ack = ack;
          net.broadcast({ t: 'snap', s });
          this.snapshotCaches.clear();
        } else {
          for (const [pid] of net.conns) {
            const fighter = this.game.fighters.find(f => f.id === pid);
            let cache = this.snapshotCaches.get(pid);
            if (!cache) {
              cache = { p: new Map(), en: new Map(), ht: new Map() };
              this.snapshotCaches.set(pid, cache);
            }
            const s = this.game.snapshotDelta(cache, fighter?.x ?? null, SNAPSHOT_INTEREST_RADIUS);
            s.eb = packEnemyDelta(s.den);
            delete s.den;
            s.ev = ev;
            s.ack = ack;
            net.send(pid, { t: 'snap', s });
          }
        }
        this.perf.add('snapshot+send', performance.now() - snapshotStart);
      }
      // Refresh lag compensation ~1/s from measured pings: victims are
      // rewound by each attacker's one-way latency + interp delay.
      if (this.mode === 'host' && net && this.game.tick % 60 === 0) {
        for (const [pid, m] of net.members) {
          if (pid === this.myId || !this.meta.has(pid)) continue;
          this.game.setLag(pid, Math.round((m.ping / 2 + 130) / 1000 / TICK));
        }
      }
      if (this.game.over) break;
    }
    const view = {
      tick: this.game.tick,
      fighters: this.game.fighters.map(f => ({
        id: f.id, x: f.x, y: f.y, vx: f.vx, vy: f.vy, facing: f.facing,
        pct: f.pct, stocks: f.stocks, state: f.state, dead: f.dead,
        invuln: f.invuln > 0, atk: f.atk, hb: this.game.hitboxFor(f), guard: f.guard,
        mana: f.mana, weapon: f.st.weapon,
        color: this.meta.get(f.id)?.color, hat: this.activeMeta(f.id)?.hat, cds: f.cds,
        score: f.score, parked: f.parked,
        hp: f.hp, maxHp: f.maxHp, downT: f.downT,
      })),
      projectiles: this.game.projectiles,
      enemies: this.game.enemies.map(e => ({
        eid: e.eid, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, facing: e.facing,
        hurt: e.hurt > 0, kind: e.kind, windup: e.windup || 0, temperament: e.temperament, elite: e.elite,
      })),
      hearts: this.game.hearts.map(h => ({ hid: h.hid, x: h.x, y: h.y, tLeft: HEART_LIFE - h.t })),
    };
    this.renderView(view, dt);
    if (this.game.over && !this.ended) this.finish(this.game.winner?.id ?? null, view.fighters);
  }

  // ----- predicted loop (client) -----
  clientFrame(t, dt) {
    const inp = touch.poll();

    // Predict our own fighter locally at the sim rate so controls feel
    // instant; the host remains authoritative and corrects us via snapshots.
    // Edge actions are carried until a tick consumes them — render frames
    // can outpace sim ticks.
    for (const k of ['jump', 'ff', 'drop', 'ab0', 'ab1']) if (inp[k]) this.pendActs[k] = true;
    if (inp.atk) this.pendActs.atk = inp.atk;
    if (inp.roll) this.pendActs.roll = inp.roll;   // signed edge (-1|1), like atk
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.inputSeq++;
      const tin = { mx: inp.mx, my: inp.my, jr: !!inp.jr, chg: inp.chg || null, ...this.pendActs };
      this.pendActs = {};
      this.pred.setInput(this.myId, tin);
      this.tickLog.push({ seq: this.inputSeq, inp: tin });
      if (this.tickLog.length > 180) this.tickLog.shift();
      const ev = this.pred.predictStep(this.myId);
      if (ev.length && !this.backgrounded) renderer.onEvents(ev.filter(e => e.id === this.myId));
    }

    // ship inputs to the host (fresh actions immediately, stick at ~30 Hz)
    const chgEdge = !!inp.chg !== !!this.wasChg;
    this.wasChg = !!inp.chg;
    const hasAction = inp.jump || inp.ff || inp.atk || inp.ab0 || inp.ab1 || inp.drop || inp.roll || chgEdge;
    if (hasAction || t - this.lastInputSend > 33) {
      this.lastInputSend = t;
      net?.sendToHost({ t: 'input', inp, seq: this.inputSeq });
    }

    // bleed off any reconciliation correction so fixes never pop
    const decay = Math.pow(0.002, dt);
    this.corr.x *= decay; this.corr.y *= decay;

    const interpolateStart = performance.now();
    const view = this.interpolate(performance.now() - 130);
    this.perf.add('interpolation', performance.now() - interpolateStart);
    if (view) this.renderView(view, dt);

    const s = this.lastSnap;
    if (s && s.over && !this.ended) {
      this.finish(s.win, this.rowsToFighters(s.f));
    }
  }

  renderView(view, dt) {
    if (this.backgrounded) return;
    const renderStart = performance.now();
    renderer.draw(view, dt, this.myId);
    UI.updateHud(view.fighters);
    const mine = view.fighters.find(f => f.id === this.myId);
    UI.updateAbilityButtons(mine?.cds);
    if (this.coop) {
      const cr = earnedCredits(mine?.score);
      const el = $('#game-credits-val');
      if (el && el.textContent !== '' + cr) el.textContent = cr;
      const biome = expanseBiomeAt(this.seed, mine?.x || 0);
      $('#game-expedition').classList.remove('hidden');
      $('#expedition-biome').textContent = MAPS[biome.id].name;
      $('#expedition-progress').textContent = `${Math.max(0, Math.floor((mine?.x || 0) / 100)) * 100}m · Tier ${Math.floor((view.tick || 0) / 900) + 1}`;
    } else {
      $('#game-expedition').classList.add('hidden');
    }
    this.perf.add('render+ui', performance.now() - renderStart);
  }

  // ----- network callbacks -----
  onRemoteInput(pid, inp, seq) {
    if (this.game && this.meta.has(pid)) {
      this.game.setInput(pid, inp || blankInput());
      if (seq) this.acks.set(pid, seq);
    }
  }

  onSnapshot(s, pid) {
    if (this.mode !== 'client' || pid !== net?.hostId) return;
    const now = performance.now();
    if (this.lastSnapshotAt) this.perf.add('snapshot-gap', now - this.lastSnapshotAt);
    this.lastSnapshotAt = now;
    if (s.map && MAPS[s.map] && s.map !== this.map) {
      this.map = s.map;
      this.pred = new Game(this.players, this.seed, this.map);
      renderer.setMap(this.map);
      this.snaps.length = 0;
      this.tickLog.length = 0;
      this.corr = { x: 0, y: 0 };
    }
    if (s.full) {
      for (const type of ['p', 'en', 'ht']) {
        this.entityRows[type].clear();
        for (const row of s[type] || []) this.entityRows[type].set(row[0], row);
      }
      this.lastFullSnap = s;
    } else {
      if (s.eb instanceof ArrayBuffer) s.den = unpackEnemyDelta(s.eb);
      for (const type of ['p', 'en', 'ht']) {
        const [changed, removed] = s['d' + type] || [[], []];
        for (const row of changed) this.entityRows[type].set(row[0], row);
        for (const id of removed) this.entityRows[type].delete(id);
      }
      s = { ...s, p: [...this.entityRows.p.values()], en: [...this.entityRows.en.values()], ht: [...this.entityRows.ht.values()] };
    }
    this.lastSnap = s;
    this.snaps.push({ rt: now, s });
    if (this.snaps.length > 40) this.snaps.shift();
    if (s.ev?.length) {
      // our own movement cosmetics already fired locally via prediction
      const evs = s.ev.filter(e => !(e.id === this.myId && PREDICTED_EV.has(e.e)));
      if (evs.length) renderer.onEvents(evs);
      this.gameEvents(s.ev);
    }
    this.reconcile(s);
  }

  // Reconciliation: overwrite our predicted fighter with the authoritative
  // row, replay inputs the host hasn't processed yet, then fold whatever
  // error remains into a decaying render offset so corrections are seamless.
  reconcile(s) {
    if (!this.pred) return;
    this.pred.projectiles.length = 0; // authoritative ones come via snapshots
    const row = (s.f || []).find(r => r[0] === this.myId);
    const mine = this.pred.fighters.find(f => f.id === this.myId);
    if (!row || !mine) return;
    const px = mine.x, py = mine.y;
    restoreFighter(mine, row);
    // platform motion is a function of the sim tick — keep the predicted sim
    // on the host's clock so moving platforms carry us identically
    if (s.tk) this.pred.tick = s.tk;
    const ack = (s.ack && s.ack[this.myId]) || 0;
    if (this.tickLog.length && ack) {
      this.tickLog = this.tickLog.filter(e => e.seq > ack);
    }
    for (const e of this.tickLog) {
      this.pred.setInput(this.myId, e.inp);
      this.pred.predictStep(this.myId); // replay: events discarded
    }
    const ex = px - mine.x + this.corr.x, ey = py - mine.y + this.corr.y;
    // small error: smooth it; big error (KO, teleport): snap
    const big = Math.hypot(ex, ey) > 150;
    this.corr.x = big ? 0 : ex;
    this.corr.y = big ? 0 : ey;
  }

  onHostChanged() {
    if (!net || this.ended) return;
    if (this.mode === 'client' && net.isHost) {
      // Host dropped mid-fight and we won the election: resurrect the sim
      // from the freshest snapshot and carry on as the authority.
      this.mode = 'host';
      this.game = gameFromSnapshot(this.players, this.lastFullSnap || this.lastSnap, this.seed + 1);
      this.map = this.game.map;
      renderer.setMap(this.map);
      this.pred = null;
      this.tickLog = [];
      this.acc = 0;
      this.pendingEv = [];
      // Drop the departed host's fighter if they're no longer around.
      this.onRoster();
      UI.toast('You are now the host!');
    }
  }

  // Host: admit a late joiner into the running fight.
  addPlayer(p) {
    if (this.meta.has(p.id) || this.ended || this.game?.over) return;
    // Same human back under a fresh peer id? Hand them their old fighter
    // so the results screen doesn't seat a ghost duplicate of them.
    const old = p.pid ? this.players.find(x => x.pid && x.pid === p.pid && x.id !== p.id) : null;
    if (old) { this.rebindPlayer(old.id, p); return; }
    this.players.push(p);
    this.meta.set(p.id, p);
    this.game?.addFighter(p);
    this.buildHud();
  }

  // Host: swap a leaver's seat over to their rejoined self.
  rebindPlayer(oldId, p) {
    const i = this.players.findIndex(x => x.id === oldId);
    if (i >= 0) this.players[i] = p; else this.players.push(p);
    this.meta.delete(oldId);
    this.meta.set(p.id, p);
    this.acks.delete(oldId);
    this.game?.rebindFighter(oldId, p);
    this.buildHud();
  }

  // Client: the host re-broadcast the player list (someone joined mid-game).
  // Fold in anyone new; authoritative state arrives via snapshots.
  syncPlayers(players, map = this.map, trying = null) {
    const hostMap = MAPS[map] ? map : DEFAULT_MAP;
    if (hostMap !== this.map) {
      this.map = hostMap;
      renderer.setMap(this.map);
      if (this.pred) this.pred = new Game(this.players, this.seed, this.map);
    }
    let changed = false;
    for (const p of players) {
      const cur = this.meta.get(p.id);
      if (cur) {
        // an existing player may have re-tuned their character in the lobby
        const wasTrying = this.trying.has(p.id);
        const targetId = trying && typeof trying[p.id] === 'string' ? trying[p.id] : null;
        const activeChanged = !!targetId;
        if (wasTrying || cur.name !== p.name || cur.color !== p.color || (!activeChanged && cur.hat !== p.hat)
            || JSON.stringify(cur.build) !== JSON.stringify(p.build)) {
          cur.name = p.name;
          cur.color = p.color;
          if (!activeChanged) {
            cur.build = p.build;
            cur.hat = p.hat;
          }
          const cap = this.coop ? MAX_BUILD_COST : undefined;
          if (activeChanged) this.trying.set(p.id, { targetId, build: sanitizeBuild(p.build, cap), hat: sanitizeHat(p.hat) });
          else this.trying.delete(p.id);
          this.pred?.updateBuild(p.id, cur.build);
          this.game?.updateBuild(p.id, cur.build);
          if (activeChanged) {
            this.pred?.tryBuild(p.id, sanitizeBuild(p.build, cap));
            this.game?.tryBuild(p.id, sanitizeBuild(p.build, cap));
          }
          if (p.id === this.myId) UI.setupAbilityButtons(sanitizeBuild(activeChanged ? p.build : cur.build, cap).abilities);
          changed = true;
        }
        continue;
      }
      this.players.push(p);
      this.meta.set(p.id, p);
      this.pred?.addFighter(p);
      this.game?.addFighter(p);
      changed = true;
    }
    // The host's list is authoritative: drop anyone it no longer carries
    // (e.g. a leaver whose fighter was handed to their rejoined self).
    const ids = new Set(players.map(p => p.id));
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      if (ids.has(p.id) || p.id === this.myId) continue;
      this.players.splice(i, 1);
      this.meta.delete(p.id);
      changed = true;
    }
    if (changed) this.buildHud();
  }

  onRoster() {
    // Authoritative side: fighters whose player vanished forfeit their stocks.
    if (!net || !this.game || this.mode === 'solo' || this.ended) return;
    for (const f of this.game.fighters) {
      // sandbags and bots have no peer to lose — never forfeit them
      if (f.dead || f.isBot || f.sandbag || f.id === this.myId) continue;
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
      hb: r[14] ? { dx: r[14][0], dy: r[14][1], hw: r[14][2], hh: r[14][3], active: !!r[14][4], round: r[11] === 'nspin', blade: r[11] === 'slash', spear: r[11] === 'thrust', chg: r[14][5] || 0 } : null,
      guard: r[28],
      mana: r[38], weapon: this.activeMeta(r[0])?.build?.weapon,
      color: this.meta.get(r[0])?.color, hat: this.activeMeta(r[0])?.hat,
      score: r[34] ? { ko: r[34][0], fall: r[34][1], sd: r[34][2], dmg: r[34][3], taken: r[34][4], maxHit: r[34][5], cr: r[34][6] || 0, elite: r[34][7] || 0 } : null,
      parked: !!r[37],
      hp: r[42], maxHp: r[43], downT: r[44],
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
    // our own fighter comes from the predicted sim, not the (delayed) buffer
    const mine = this.pred?.fighters.find(f => f.id === this.myId);
    if (mine) {
      const pv = {
        id: mine.id, x: mine.x + this.corr.x, y: mine.y + this.corr.y,
        vx: mine.vx, vy: mine.vy, facing: mine.facing,
        pct: mine.pct, stocks: mine.stocks, state: mine.state, dead: mine.dead,
        invuln: mine.invuln > 0, atk: mine.atk, hb: this.pred.hitboxFor(mine),
        guard: mine.guard, mana: mine.mana, weapon: mine.st.weapon,
        cds: mine.cds, color: this.meta.get(mine.id)?.color, hat: this.activeMeta(mine.id)?.hat,
      };
      // HP, downed state and score are authoritative-only (prediction never
      // runs combat) — carry them from the latest snapshot row for my fighter
      const auth = fb.find(f => f.id === this.myId);
      if (auth) { pv.hp = auth.hp; pv.maxHp = auth.maxHp; pv.downT = auth.downT; pv.score = auth.score; pv.dead = auth.dead; }
      const i = fighters.findIndex(f => f.id === this.myId);
      if (i >= 0) fighters[i] = pv; else fighters.push(pv);
    }
    const projectiles = (b.s.p || []).map(p => ({ eid: p[0], kind: p[1], x: p[2], y: p[3], r: p[5] || 0 }));
    const hearts = (b.s.ht || []).map(h => ({ hid: h[0], x: h[1], y: h[2], tLeft: h[3] || 0 }));
    const enemies = interpolateEnemyRows(a.s.en, b.s.en, k, this._enemyInterpolation.from, this._enemyInterpolation.out);
    const tick = (a.s.tk || 0) + ((b.s.tk || 0) - (a.s.tk || 0)) * k;
    // riding a moving platform: platforms draw on the interpolated (delayed)
    // timeline while our fighter is predicted ahead — shift us by the
    // platform's drift so our feet stay planted on the girder as drawn
    if (mine && mine.ridePlat != null) {
      const drawn = platsAt(this.map, tick)[mine.ridePlat];
      const simmed = platsAt(this.map, this.pred.tick)[mine.ridePlat];
      const i = fighters.findIndex(f => f.id === this.myId);
      if (drawn && simmed && i >= 0) {
        fighters[i].x += drawn.x - simmed.x;
        fighters[i].y += drawn.y - simmed.y;
      }
    }
    return { fighters, projectiles, tick, enemies, hearts };
  }

  // ----- events & endgame -----
  gameEvents(events) {
    for (const ev of events) {
      if (ev.e === 'hit' && ev.vic === this.myId && navigator.vibrate) {
        navigator.vibrate(ev.heavy ? 40 : 15);
      }
      if (ev.e === 'ko') {
        const name = this.meta.get(ev.id)?.name || '???';
        UI.toast(ev.id === this.myId ? 'You got smacked!' : `${name} KO’d!`);
        if (navigator.vibrate && ev.id === this.myId) navigator.vibrate(80);
        this.endTry(ev.id);
      }
      if (ev.e === 'gameover') UI.toast('GAME!', 2000);
    }
  }

  finish(winnerId, finalFighters) {
    this.ended = true;
    const mine = finalFighters.find(f => f.id === this.myId);
    const runSummary = this.coop && mine ? {
      distance: Math.max(0, Math.floor(mine.x / 100)) * 100,
      tier: Math.floor((this.game?.tick || this.lastSnap?.tk || 0) / 900) + 1,
      biomes: Math.max(1, Math.floor(Math.max(0, mine.x) / 3600) + 1),
      defeats: mine.score?.ko || 0,
      elites: mine.score?.elite || 0,
      credits: earnedCredits(mine.score),
    } : null;
    for (const pid of [...this.trying.keys()]) this.endTry(pid);
    setTimeout(() => {
      this.stop();
      const summary = $('#results-expedition');
      summary.classList.toggle('hidden', !runSummary);
      if (runSummary) summary.innerHTML = `<b>Expedition Report</b><span>${runSummary.distance}m · Tier ${runSummary.tier} · ${runSummary.biomes} biome${runSummary.biomes === 1 ? '' : 's'}</span><span>${runSummary.defeats} defeated · ${runSummary.elites} elite${runSummary.elites === 1 ? '' : 's'} · 💰 ${runSummary.credits} CR</span>`;
      UI.renderResults(this.players, winnerId, finalFighters, { myId: this.myId, onCopy: copyCharacter });
      $('#results-again').textContent = this.mode === 'solo' ? 'Rematch' : 'Back to Lobby';
      UI.showScreen('results');
      session = null;
      presence?.update();
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

// ---------------- results: copy a character off the leaderboard ----------------

// A copied character keeps its owner's name unless I already have a saved
// build called that — then it gets bumped to "Name 2", "Name 3", …
function uniqueLoadoutName(raw) {
  const base = String(raw).replace(/[^\w \-'!.]/g, '').trim().slice(0, 16) || 'Fighter';
  const taken = new Set(loadLoadouts().map(l => l.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const tag = ' ' + n;
    const name = base.slice(0, 16 - tag.length).trimEnd() + tag;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

// Adopt a leaderboard player wholesale: their hat lands in my library (reused
// if I already own the same art), and their color + build + name become a new
// saved character. Returns true so the button can flip to a checkmark.
function copyCharacter(p) {
  const art = sanitizeHat(p.hat);
  let hatId = null;
  if (art) {
    hatId = loadHats().find(h => h.art === art)?.id || null;
    if (!hatId) {
      const res = saveHat(art);
      if (!res.ok) { UI.banner(res.error, 'bad'); return false; }
      hatId = res.id;
      publishHats();
    }
  }
  const name = uniqueLoadoutName(p.name);
  const res = saveLoadout(name, p.color, p.build, hatId);
  if (!res.ok) { UI.banner(res.error, 'bad'); return false; }
  UI.banner(name === String(p.name).trim()
    ? `Copied ${p.name} to your characters! 🥊`
    : `Copied ${p.name} to your characters as “${name}”!`, 'good');
  return true;
}

// ---------------- game screen buttons ----------------
$('#help-close').addEventListener('click', () => $('#game-help').classList.add('hidden'));

$('#game-quit').addEventListener('click', () => {
  // Stepping out of a networked fight doesn't end it: the session keeps
  // running in the background (host keeps simulating, client keeps
  // buffering snapshots) so the lobby can offer a Rejoin button.
  if (session && !session.ended && net && session.mode !== 'solo') {
    session.setBackgrounded(true);
    net.setReady(false);
    renderLobby();
    UI.showScreen('lobby');
    presence?.update();
    return;
  }
  session?.stop();
  session = null;
  if (net) {
    renderLobby();
    UI.showScreen('lobby');
    net.setReady(false);
  } else {
    UI.showScreen('menu');
  }
  presence?.update();
});

$('#lobby-rejoin').addEventListener('click', () => {
  if (!session || session.ended) return;
  session.setBackgrounded(false);
  session.buildHud();
  UI.showScreen('game');
  presence?.update();
});

$('#results-again').addEventListener('click', () => {
  if (net) {
    renderLobby();
    UI.showScreen('lobby');
  } else {
    $('#menu-solo').click();
  }
});

$('#results-menu').addEventListener('click', () => {
  voice?.destroy(); voice = null;
  net?.leave(); net = null;
  UI.showScreen('menu');
  presence?.update();
});

// Leaving the page: tell peers instead of ghosting them.
addEventListener('pagehide', () => { voice?.destroy(); net?.leave(); presence?.stop(); });
addEventListener('pageshow', e => { if (e.persisted) presence?.start(); });

// Debug/testing handle (read-only peek at live state).
window.__smack = () => ({ session, net, profile, presence });
