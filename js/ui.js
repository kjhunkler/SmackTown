// Screen management + all menu/builder/lobby DOM. Game HUD lives here too.

import {
  COLORS, TOTAL_CREDITS, STATS, ABILITIES, AUGMENTS, WEAPONS,
  MAX_ABILITIES, MAX_AUGMENTS, buildCost, buildSummary,
  loadLoadouts, deleteLoadout, hatArt, loadHats, selectedLoadout, selectLoadout,
  HAT_W, HAT_H, HAT_PX, HAT_FACE_ROWS, HAT_CHARS, HAT_PALETTE, sanitizeHat,
} from './profile.js';
import { MAPS, MAP_SIZES, mapsOfSize } from './game.js';
import { BOX_X, BOX_Y, BOX_W, BOX_H } from './hat.js';
import { SFX } from './sfx.js';
import { settings, KEY_ACTIONS, PAD_ACTIONS, padBtnLabel } from './settings.js';

// ---------- pixel hats ----------
// Rasterize a hat string once to a tiny offscreen canvas; scaled draws stay
// pixel-crisp with imageSmoothing off. Shared by the renderer and previews.
const hatCache = new Map();
export function hatImage(hat) {
  const s = sanitizeHat(hat);
  if (!s) return null;
  let img = hatCache.get(s);
  if (img) return img;
  img = document.createElement('canvas');
  img.width = HAT_W;
  img.height = HAT_H;
  const x = img.getContext('2d');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '.') continue;
    x.fillStyle = HAT_PALETTE[HAT_CHARS.indexOf(s[i])] || '#fff';
    x.fillRect(i % HAT_W, (i / HAT_W) | 0, 1, 1);
  }
  if (hatCache.size > 64) hatCache.clear();   // hats are tiny; cap anyway
  hatCache.set(s, img);
  return img;
}

const $ = s => document.querySelector(s);

export function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
  $('#screen-' + name).classList.remove('hidden');
  // the theme song adds its drum kit during fights, mellows out elsewhere
  SFX.setMode(name === 'game' ? 'fight' : 'menu');
}

export function banner(text, kind = 'warn', ms = 3000, onClick = null) {
  const el = $('#net-banner');
  el.textContent = text;
  el.className = kind + (onClick ? ' tappable' : '');   // warn (default style) | bad | good
  el.classList.remove('hidden');
  if (el._click) el.removeEventListener('click', el._click);
  el._click = onClick ? () => { el.classList.add('hidden'); onClick(); } : null;
  if (el._click) el.addEventListener('click', el._click, { once: true });
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

export function toast(text, ms = 1300) {
  const el = $('#game-toast');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

// ---------- color picker ----------

export function renderColorGrid(container, selected, onPick) {
  container.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'color-swatch' + (c === selected ? ' sel' : '');
    b.style.background = c;
    b.addEventListener('click', () => onPick(c));
    container.appendChild(b);
  }
}

// ---------- fighter preview (menu card) ----------

export function drawPreview(canvas, color, hat = null) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2 + 8);
  ctx.fillStyle = color;
  rr(ctx, -26, -34, 52, 68, 15); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  rr(ctx, -21, -29, 42, 34, 10); ctx.fill();
  ctx.fillStyle = '#10122a';
  ctx.beginPath(); ctx.arc(2, -12, 3.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(15, -12, 3.6, 0, 7); ctx.fill();
  const img = hatImage(hat);
  if (img) {
    // preview body is 52x68 vs the in-game 46x64 — scale the hat to match.
    // Same brim-anchored box as hat.js: crown rows above y=-16, face rows below.
    const s = 68 / 64;
    const bw = HAT_W * HAT_PX, bh = HAT_H * HAT_PX;
    const by = -32 + 16 - (HAT_H - HAT_FACE_ROWS) * HAT_PX;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (-bw / 2) * s, by * s, bw * s, bh * s);
  }
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- fighter builder ----------

export function renderBuilder(work) {
  // work: {color, build, budget?, pve?, unlocked?} — mutated in place as the
  // user shops. In a co-op expedition the budget is the credits earned this
  // run, and gear must first be unlocked from a loot box (work.unlocked)
  // before CR can buy it.
  const spent = buildCost(work.build);
  const budget = work.budget ?? TOTAL_CREDITS;
  const left = budget - spent;
  $('#builder-credits').textContent = left;

  renderBuilderPreview(work);
  renderEditingBadge();
  renderLoadouts(work);

  renderColorGrid($('#builder-colors'), work.color, c => {
    work.color = c;
    renderBuilder(work);
  });

  // stat upgrade rows
  const statsBox = $('#builder-stats');
  statsBox.innerHTML = '';
  for (const s of STATS) {
    const lvl = work.build.stats[s.id];
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-info">
        <div class="stat-name">${s.name}</div>
        <div class="stat-desc">${s.desc}</div>
        <div class="stat-pips">${Array.from({ length: s.max }, (_, i) =>
          `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('')}</div>
      </div>
      <div>
        <div class="stat-btns">
          <button data-d="-1" ${lvl <= 0 ? 'disabled' : ''}>−</button>
          <button data-d="1" ${lvl >= s.max || left < s.cost ? 'disabled' : ''}>+</button>
        </div>
        <div class="stat-cost">${s.cost} cr / lvl</div>
      </div>`;
    row.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => {
        work.build.stats[s.id] = lvl + Number(b.dataset.d);
        renderBuilder(work);
      }));
    statsBox.appendChild(row);
  }

  renderWeaponShop($('#builder-weapons'), work, left);
  renderShop($('#builder-abilities'), ABILITIES, work.build.abilities, MAX_ABILITIES, left, work);
  renderShop($('#builder-augments'), AUGMENTS, work.build.augments, MAX_AUGMENTS, left, work);
  wireGearDock();
  renderGearDock(work);
}

// ---------- gear dock ----------
// The weapon / ability / augment shops live behind a sticky tab rail: one
// pane shows at a time, and the rail pins to the top of the workshop
// scroll so hopping between the three is one tap from anywhere. Badges
// keep the whole loadout readable without opening a tab — the equipped
// weapon's icon and the two pick counts, green once a list is full.
let gearTab = 'weapons';
let gearWork = null;
let gearWired = false;

function wireGearDock() {
  if (gearWired) return;
  gearWired = true;
  for (const tab of document.querySelectorAll('.gear-tab')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.gear === gearTab) return;
      gearTab = tab.dataset.gear;
      renderGearDock(gearWork);
      // snap: replay the pane's pop-in so the switch reads as motion
      const pane = $('#gear-pane-' + gearTab);
      pane.classList.remove('gear-pane-in');
      void pane.offsetWidth;
      pane.classList.add('gear-pane-in');
    });
  }
}

function renderGearDock(work) {
  if (!work) return;
  gearWork = work;
  for (const tab of document.querySelectorAll('.gear-tab'))
    tab.classList.toggle('on', tab.dataset.gear === gearTab);
  for (const name of ['weapons', 'abilities', 'augments'])
    $('#gear-pane-' + name).classList.toggle('hidden', name !== gearTab);
  $('#gear-badge-weapons').textContent =
    WEAPONS.find(w => w.id === work.build.weapon)?.icon || '👊';
  const pick = (sel, owned, max) => {
    const el = $(sel);
    el.textContent = `${owned.length}/${max}`;
    el.classList.toggle('full', owned.length >= max);
  };
  pick('#gear-badge-abilities', work.build.abilities, MAX_ABILITIES);
  pick('#gear-badge-augments', work.build.augments, MAX_AUGMENTS);
}

// Expedition loot gating: an item the run hasn't unlocked yet renders as a
// sealed card — the loot boxes on the trail are the only way to open it.
function lootGated(work, id) {
  return !!(work.pve && work.unlocked && !work.unlocked.has(id));
}

// Weapon rack: exactly one is equipped, so tapping a weapon swaps to it.
// Affordability is judged against the credits the swap itself frees up.
function renderWeaponShop(box, work, left) {
  box.innerHTML = '';
  const curCost = WEAPONS.find(w => w.id === work.build.weapon)?.cost || 0;
  for (const w of WEAPONS) {
    const has = work.build.weapon === w.id;
    const gated = lootGated(work, w.id);
    const affordable = !gated && (has || left + curCost >= w.cost);
    const el = document.createElement('div');
    el.className = 'shop-item' + (gated ? ' gated' : has ? ' owned' : affordable ? '' : ' locked');
    el.innerHTML = `
      <div class="si-icon">${gated ? '🔒' : w.icon}</div>
      <div class="si-cost">${gated ? '🎁 loot box' : has ? '✓ equipped' : w.cost ? w.cost + ' cr' : 'free'}</div>
      <div class="si-name">${w.name}</div>
      <div class="si-desc">${w.desc}</div>`;
    el.addEventListener('click', () => {
      if (has || !affordable) return;
      work.build.weapon = w.id;
      renderBuilder(work);
    });
    box.appendChild(el);
  }
}

// Live fighter preview in the workshop: the fighter wearing work.hatId,
// with a label placing that hat in the library cycle (arrows flip through).
export function renderBuilderPreview(work) {
  drawPreview($('#builder-preview-canvas'), work.color, hatArt(work.hatId));
  const label = $('#builder-hat-label');
  const hats = loadHats();
  const i = work.hatId ? hats.findIndex(h => h.id === work.hatId) : -1;
  label.textContent = i >= 0 ? `Hat ${i + 1} of ${hats.length}`
    : hats.length ? 'No hat' : 'No hat — draw one in the library!';
}

// Which character the workshop is editing, mirrored in the header badge.
function renderEditingBadge() {
  const sel = selectedLoadout();
  $('#builder-editing').textContent = sel ? `editing \u201c${sel}\u201d` : 'unsaved fighter';
}

// Saved builds: tap a chip to load it into the workshop, ✕ to forget it.
function renderLoadouts(work) {
  const box = $('#builder-loadouts');
  const list = loadLoadouts();
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<p class="loadout-empty">No saved builds yet — tune a build below and stash it with a nickname.</p>';
    return;
  }
  const sel = selectedLoadout();
  for (const lo of list) {
    const row = document.createElement('div');
    row.className = 'loadout-chip' + (lo.name === sel ? ' selected' : '');
    row.innerHTML = `
      <button class="lo-main">
        <span class="lo-fig">
          <span class="r-swatch" style="background:${esc(lo.color)}"></span>
        </span>
        <span class="lo-text">
          <span class="lo-name">${esc(lo.name)}</span>
          <span class="lo-sum">${esc(buildSummary(lo.build).replace(/\n/g, ' · '))}</span>
        </span>
      </button>
      <button class="lo-del" aria-label="Delete ${esc(lo.name)}">✕</button>`;
    const img = hatImage(hatArt(lo.hatId));
    if (img) {
      const c = document.createElement('canvas');
      c.width = HAT_W;
      c.height = HAT_H;
      c.className = 'lo-hat';
      c.getContext('2d').drawImage(img, 0, 0);
      row.querySelector('.lo-fig').appendChild(c);
    }
    row.querySelector('.lo-main').addEventListener('click', () => {
      work.color = lo.color;
      work.build = JSON.parse(JSON.stringify(lo.build));
      work.hatId = lo.hatId;
      selectLoadout(lo.name);
      $('#loadout-name').value = lo.name;
      renderBuilder(work);
    });
    row.querySelector('.lo-del').addEventListener('click', () => {
      deleteLoadout(lo.name);
      renderBuilder(work);
    });
    box.appendChild(row);
  }
}

function renderShop(box, defs, owned, maxOwned, left, work) {
  box.innerHTML = '';
  for (const item of defs) {
    const has = owned.includes(item.id);
    const gated = lootGated(work, item.id);
    const affordable = !gated && (has || (left >= item.cost && owned.length < maxOwned));
    const el = document.createElement('div');
    el.className = 'shop-item' + (gated ? ' gated' : has ? ' owned' : affordable ? '' : ' locked');
    el.innerHTML = `
      <div class="si-icon">${gated ? '🔒' : item.icon}</div>
      <div class="si-cost">${gated ? '🎁 loot box' : has ? '✓ owned' : item.cost + ' cr'}</div>
      <div class="si-name">${item.name}</div>
      <div class="si-desc">${work.pve && item.pveDesc ? item.pveDesc : item.desc}</div>`;
    el.addEventListener('click', () => {
      if (gated) return;
      if (has) owned.splice(owned.indexOf(item.id), 1);
      else if (affordable) owned.push(item.id);
      else return;
      renderBuilder(work);
    });
    box.appendChild(el);
  }
}

function appendHat(box, hat) {
  const img = hatImage(hat);
  if (!img) return;
  const c = document.createElement('canvas');
  c.width = HAT_W;
  c.height = HAT_H;
  c.className = 'r-hat';
  c.getContext('2d').drawImage(img, 0, 0);
  box.appendChild(c);
}

function fighterThumb(color, hat) {
  const c = document.createElement('canvas');
  c.width = 72;
  c.height = 72;
  c.className = 'r-fighter';
  drawPreview(c, color || '#f5f5f5', hat);
  return c;
}

// ---------- animated lobby fighters ----------
// The lobby roster shows everyone at full in-game detail — true body
// proportions, the worn weapon from their build, their hat on the real
// in-game anchor — idling with the same blink-and-glance life as the Hat
// Studio fighter. One shared rAF loop drives every visible canvas, and
// canvases persist across roster re-renders so the gaze never pops.
const lobbyFighters = new Map();       // peerId -> canvas + eye state
let lobbyFighterRaf = 0;

// Local units match render.js fighter space (body 46x64 centered on 0,0;
// hat box from hat.js). The view frames hat top through feet: 80 wide,
// 100 tall, with the body center 66 units down.
const LF_VIEW_W = 80, LF_VIEW_H = 100, LF_CY = 66;
const LF_SCALE = 1.4;                  // backing pixels per unit

function lobbyFighter(m) {
  let s = lobbyFighters.get(m.peerId);
  if (!s) {
    const canvas = document.createElement('canvas');
    canvas.width = LF_VIEW_W * LF_SCALE;
    canvas.height = LF_VIEW_H * LF_SCALE;
    canvas.className = 'r-fighter-live';
    s = {
      canvas, ctx: canvas.getContext('2d'),
      blink: 0, nextBlink: 1 + Math.random() * 3,
      pupil: { x: 0, y: 0 }, pupilTgt: { x: 0, y: 0 },
      nextGlance: Math.random() * 2, lastT: 0,
    };
    lobbyFighters.set(m.peerId, s);
  }
  s.color = m.color || '#f5f5f5';
  s.hat = m.hat || null;
  s.weapon = m.build?.weapon || null;
  s.asleep = !!m.idle || m.status === 'away';
  if (!lobbyFighterRaf) lobbyFighterRaf = requestAnimationFrame(lobbyFighterStep);
  return s.canvas;
}

function lobbyFighterStep(t) {
  lobbyFighterRaf = 0;
  for (const [id, s] of lobbyFighters) {
    if (!s.canvas.isConnected) { lobbyFighters.delete(id); continue; }
    const dt = Math.min(0.05, (t - s.lastT) / 1000);
    s.lastT = t;
    if (!s.canvas.offsetParent) continue;    // lobby hidden — keep state, skip draw
    // idle life: blink every few seconds, glance somewhere now and then
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 0.13; s.nextBlink = 2 + Math.random() * 2.5; }
    s.blink = Math.max(0, s.blink - dt);
    s.nextGlance -= dt;
    if (s.nextGlance <= 0) {
      s.pupilTgt = Math.random() < 0.3
        ? { x: 0, y: 0 }                     // back to center
        : { x: (Math.random() * 6 - 3) | 0, y: (Math.random() * 3 - 1.5) | 0 };
      s.nextGlance = 1.2 + Math.random() * 2.4;
    }
    const k = 1 - Math.pow(0.0005, dt);
    s.pupil.x += (s.pupilTgt.x - s.pupil.x) * k;
    s.pupil.y += (s.pupilTgt.y - s.pupil.y) * k;
    drawLobbyFighter(s);
  }
  if (lobbyFighters.size) lobbyFighterRaf = requestAnimationFrame(lobbyFighterStep);
}

function drawLobbyFighter(s) {
  const { ctx, canvas } = s;
  const bw = 46, bh = 64, bTop = -bh / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, LF_CY * LF_SCALE);
  ctx.scale(LF_SCALE, LF_SCALE);

  // worn weapon at rest, slung behind the body (same art as render.js)
  if (s.weapon === 'sword') {
    ctx.save();
    ctx.translate(-bw / 2 + 9, bTop + 6);
    ctx.rotate(-0.55);
    ctx.fillStyle = '#cfd8ea';                       // blade stub
    ctx.fillRect(-2, -14, 4, 16);
    ctx.fillStyle = '#ffd23e';                       // crossguard
    ctx.fillRect(-6.5, -16, 13, 3.5);
    ctx.fillStyle = '#8a6a48';                       // grip
    ctx.fillRect(-1.8, -26, 3.6, 10);
    ctx.fillStyle = '#ffd23e';                       // pommel
    ctx.beginPath(); ctx.arc(0, -27.5, 2.8, 0, 7); ctx.fill();
    ctx.restore();
  } else if (s.weapon === 'boomerang') {
    ctx.save();
    ctx.translate(-bw / 2 + 7, bTop + 12);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#35a4e8';
    rr(ctx, -10, -3.5, 20, 7, 3.5); ctx.fill();
    rr(ctx, -3.5, -10, 7, 20, 3.5); ctx.fill();
    ctx.strokeStyle = 'rgba(8, 18, 40, .7)';
    ctx.lineWidth = 1.8;
    rr(ctx, -10, -3.5, 20, 7, 3.5); ctx.stroke();
    rr(ctx, -3.5, -10, 7, 20, 3.5); ctx.stroke();
    ctx.fillStyle = '#eaf7ff';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
    ctx.restore();
  } else if (s.weapon === 'shield') {
    ctx.save();
    ctx.translate(-bw / 2 + 3, bTop + bh / 2);
    ctx.fillStyle = '#9aa3c7';
    ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 16, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#eaf7ff';
    ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 6, 0, 0, 7); ctx.fill();
    ctx.restore();
  } else if (s.weapon === 'spear') {
    ctx.save();
    ctx.translate(-bw / 2 + 8, bTop + 4);
    ctx.rotate(-0.62);
    ctx.strokeStyle = '#8a6a48';                     // wood shaft
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 30); ctx.stroke();
    ctx.fillStyle = '#cfd8ea';                       // leaf-shaped head
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(-3.4, -9); ctx.lineTo(3.4, -9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // body (same proportions as the in-game fighter, facing right)
  ctx.fillStyle = s.color;
  rr(ctx, -bw / 2, bTop, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  rr(ctx, -bw / 2 + 5, bTop + 5, bw - 10, bh / 2, 10); ctx.fill();

  // eyes: dark dots that glance around and blink shut; idle/away
  // players doze with their eyes closed
  const ex = 8, ey = -bh / 6;
  ctx.fillStyle = '#10122a';
  for (const off of [-6, 6]) {
    if (s.asleep || s.blink > 0) {
      ctx.fillRect(ex + off - 3.6, ey - 1, 7.2, 2.2);
    } else {
      ctx.beginPath();
      ctx.arc(ex + off + s.pupil.x, ey + s.pupil.y, 3.4, 0, 7);
      ctx.fill();
    }
  }

  // pixel hat on the true in-game anchor
  const img = hatImage(s.hat);
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, BOX_X, BOX_Y, BOX_W, BOX_H);
  }
  ctx.restore();
}

// ---------- menu card ----------

export function renderMenuCard(profile) {
  renderCharacterCard('menu', profile);
}

export function renderLobbyCard(profile) {
  renderCharacterCard('lobby', profile);
}

function renderCharacterCard(prefix, profile) {
  $('#' + prefix + '-name').textContent = profile.name;
  $('#' + prefix + '-build').textContent = buildSummary(profile.build);
  drawPreview($('#' + prefix + '-preview'), profile.color, profile.hat);
  // Selected character label + arrow availability. The arrows cycle saved
  // builds; from an unsaved fighter the first tap lands on a saved one.
  const list = loadLoadouts();
  const sel = selectedLoadout();
  const i = sel ? list.findIndex(l => l.name === sel) : -1;
  $('#' + prefix + '-loadout').textContent = i >= 0 ? `${sel} · ${i + 1} of ${list.length}`
    : list.length ? 'unsaved fighter' : '';
  const lock = !list.length || (list.length === 1 && i >= 0);
  $('#' + prefix + '-char-prev').disabled = lock;
  $('#' + prefix + '-char-next').disabled = lock;
}

// ---------- main-menu presence ----------

// Flavor line for what someone is up to, shown in presence/roster lists.
const ACT_DETAIL = {
  builder: '🔧 tuning a fighter',
  hat: '🎨 drawing a hat',
  hatlib: '🎩 browsing hats',
  settings: '⚙️ in settings',
  results: '🏆 at the podium',
};

export function renderOnline(entries, ready, { onJoin, onInvite, root = 'menu', inviteOnly = false } = {}) {
  const list = $('#' + root + '-online-list');
  const empty = $('#' + root + '-online-empty');
  $('#' + root + '-online-count').textContent = entries.length ? `${entries.length} in town` : '';
  empty.classList.toggle('hidden', entries.length > 0);
  empty.textContent = ready
    ? (root === 'lobby' ? 'No active fighters outside this lobby right now.' : 'No one else is in town — send someone an invite link!')
    : 'Looking for fighters…';
  list.innerHTML = '';
  for (const e of entries) {
    const li = document.createElement('li');
    let where = e.status === 'fighting' ? 'in a fight'
      : e.status === 'lobby' ? 'in room ' + esc(e.code || '????')
      : 'in the menu';
    const detail = ACT_DETAIL[e.act];
    if (detail) where += ' · ' + detail;
    if (e.idle) where += ' · 💤 idle';
    li.innerHTML = `
      <span class="presence-dot ${e.idle ? 'away' : 'online'}"></span>
      <span class="r-fig"></span>
      <span class="r-name">${esc(e.name)}<span class="r-where">${where}</span></span>`;
    li.querySelector('.r-fig').appendChild(fighterThumb(e.color, e.hat));
    if (inviteOnly) {
      const b = document.createElement('button');
      b.className = 'btn tiny ghost';
      b.textContent = 'Invite';
      b.addEventListener('click', () => onInvite?.(e));
      li.appendChild(b);
    } else if ((e.status === 'lobby' || e.status === 'fighting') && e.open && e.code) {
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.textContent = 'Join';
      b.addEventListener('click', () => onJoin?.(e));
      li.appendChild(b);
    } else if (e.status === 'menu') {
      const b = document.createElement('button');
      b.className = 'btn tiny ghost';
      b.textContent = 'Invite';
      b.addEventListener('click', () => onInvite?.(e));
      li.appendChild(b);
    }
    list.appendChild(li);
  }
}

// ---------- lobby ----------

export function renderLobby(net, onVote = null, fightOn = false) {
  $('#lobby-code').textContent = net.roomCode || '····';
  const list = $('#lobby-roster');
  list.innerHTML = '';
  const roster = net.rosterList();
  const ROOM_ACT = { ...ACT_DETAIL, fighting: '⚔️ in the fight' };
  for (const m of roster) {
    const li = document.createElement('li');
    const isHost = m.peerId === net.hostId;
    const isMe = m.peerId === net.myId;
    const dot = m.status === 'gone' ? 'gone' : m.status === 'away' || m.idle ? 'away' : 'online';
    const doing = m.status === 'gone' ? '' : ROOM_ACT[m.act] || '';
    const idleTag = m.idle && m.status !== 'gone' ? '💤 idle' : '';
    const build = buildSummary(m.build).replace(/\n/g, ' · ');
    li.innerHTML = `
      <span class="presence-dot ${dot}"></span>
      <span class="r-fig"></span>
      <span class="r-col">
        <span class="r-name">${esc(m.name)}${isMe ? ' (you)' : ''}${isHost ? '<span class="r-host">HOST</span>' : ''}${m.voice ? '<span class="r-voice" title="In voice chat">🎙</span>' : ''}</span>
        <span class="r-build">${esc(build)}</span>
      </span>
      <span class="r-meta">${m.ready ? '<div class="r-ready">READY</div>' : ''}${doing ? `<div class="r-act">${doing}</div>` : ''}${idleTag ? `<div class="r-act">${idleTag}</div>` : ''}${!isMe && m.ping ? m.ping + 'ms' : ''}</span>`;
    li.querySelector('.r-fig').appendChild(lobbyFighter(m));
    list.appendChild(li);
  }

  // map vote grid: tap to vote, tap again to clear
  const grid = $('#lobby-maps');
  grid.innerHTML = '';
  const active = roster.filter(m => m.status !== 'gone');
  const myVote = net.members.get(net.myId)?.vote || null;
  // size cards first: back a whole size class and let fate pick the arena
  for (const size of MAP_SIZES) {
    const votes = active.filter(m => m.vote === size).length;
    const card = document.createElement('button');
    card.className = 'map-card size-card' + (myVote === size ? ' voted' : '');
    card.innerHTML = `
      <span class="map-thumb size-thumb size-thumb-${size}"></span>
      <span class="map-name">Any ${size[0].toUpperCase()}${size.slice(1)}</span>
      <span class="map-votes${votes ? '' : ' none'}">${votes ? '🗳️ ' + votes : mapsOfSize(size).length + ' maps'}</span>`;
    card.addEventListener('click', () => onVote?.(size));
    grid.appendChild(card);
  }

  // then individual maps, grouped small → medium → large
  for (const id of MAP_SIZES.flatMap(mapsOfSize)) {
    const map = MAPS[id];
    const votes = active.filter(m => m.vote === id).length;
    const card = document.createElement('button');
    card.className = 'map-card' + (myVote === id ? ' voted' : '');
    card.innerHTML = `
      <span class="map-thumb map-thumb-${id}"></span>
      <span class="map-name">${esc(map.name)}</span>
      <span class="map-votes${votes ? '' : ' none'}">${votes ? '🗳️ ' + votes : '—'}</span>`;
    card.addEventListener('click', () => onVote?.(id));
    grid.appendChild(card);
  }

  const me = net.members.get(net.myId);
  const readyBtn = $('#lobby-ready');
  readyBtn.textContent = me?.ready ? 'Ready ✓' : "I'm Ready";
  readyBtn.classList.toggle('ready-on', !!me?.ready);
  readyBtn.classList.toggle('hidden', fightOn);

  if (fightOn) {
    // a fight is running in this room — the only way forward is back in
    $('#lobby-start').classList.add('hidden');
    $('#lobby-status').textContent = 'The fight is still going — jump back in!';
    return;
  }

  const everyoneReady = active.length >= 1 && active.every(m => m.ready);
  const allReady = active.length >= 2 && everyoneReady;
  const soloReady = active.length === 1 && everyoneReady;   // host alone: practice mode
  const startBtn = $('#lobby-start');
  startBtn.classList.toggle('hidden', !net.isHost);
  startBtn.disabled = !(allReady || (soloReady && net.isHost));
  $('#lobby-status').textContent =
    soloReady ? 'Solo practice ready — hit Start Fight! Friends can join mid-fight.'
      : active.length < 2 ? 'Waiting for challengers — or ready up to practice solo…'
      : allReady ? 'All ready — starting…'
      : 'Waiting for everyone to ready up…';
}

// ---------- game HUD ----------

export function buildHud(players, { myId = null, onTry = null, onTrySelf = null, tryingId = null, infiniteStocks = false, coop = false } = {}) {
  const hud = $('#game-hud');
  hud.innerHTML = '';
  hud.dataset.infiniteStocks = infiniteStocks ? '1' : '';
  hud.dataset.coop = coop ? '1' : '';
  hud.classList.toggle('coop', !!coop);
  for (const p of players) {
    // Expedition tiles have no Try button — trying a build mid-run would
    // sidestep the CR wallet, so co-op shows everyone's credits instead.
    const canTry = !coop && onTry && p.id !== myId;
    const isTrying = canTry && p.id === tryingId;
    const tile = document.createElement('div');
    tile.className = 'hud-tile';
    tile.id = 'hud-' + cssId(p.id);
    tile.style.borderTopColor = p.color;
    // Co-op tiles trade the percent + stock dots for a health bar.
    tile.innerHTML = coop ? `
      <div class="h-name">${esc(p.name)}</div>
      <div class="h-hp"><div class="h-hp-fill" style="background:${p.color}"></div></div>
      <div class="h-hp-txt"></div>
      <div class="h-cr">💰 —</div>`
    : `
      <div class="h-name">${esc(p.name)}</div>
      <div class="h-pct" style="color:${p.color}">0%</div>
      <div class="h-stocks">${infiniteStocks ? '∞' : '●●●●'}</div>
      ${canTry ? `<button class="h-try${isTrying ? ' h-trying' : ''}">${isTrying ? 'Trying' : 'Try'}</button>` : ''}`;
    if (canTry) tile.querySelector('.h-try').addEventListener('click', () => isTrying ? onTrySelf?.() : onTry(p.id));
    hud.appendChild(tile);
  }
}

export function updateHud(fighters) {
  const hud = $('#game-hud');
  const infiniteStocks = hud.dataset.infiniteStocks === '1';
  const coop = hud.dataset.coop === '1';
  for (const f of fighters) {
    const tile = document.getElementById('hud-' + cssId(f.id));
    if (!tile) continue;
    if (coop) {
      const maxHp = f.maxHp || 100;
      const hp = Math.max(0, Math.round(f.hp ?? maxHp));
      const frac = Math.max(0, Math.min(1, hp / maxHp));
      const fill = tile.querySelector('.h-hp-fill');
      const txt = tile.querySelector('.h-hp-txt');
      fill.style.width = (frac * 100).toFixed(1) + '%';
      // full green → low red, so a glance reads the danger
      fill.style.filter = `saturate(${(0.6 + frac * 0.6).toFixed(2)})`;
      fill.style.opacity = frac < 0.33 ? (0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 180))).toFixed(2) : '1';
      txt.textContent = f.dead ? 'DOWN' : `${hp}/${maxHp}`;
      if (hp < (+tile.dataset.hp || maxHp)) {   // took a hit: flash the bar
        tile.classList.remove('h-hp-hit'); void tile.offsetWidth; tile.classList.add('h-hp-hit');
      }
      tile.dataset.hp = hp;
      // everyone's expedition wallet, straight from the authoritative score
      const crEl = tile.querySelector('.h-cr');
      const crTxt = `💰 ${f.score?.cr || 0}`;
      if (crEl && crEl.textContent !== crTxt) crEl.textContent = crTxt;
      tile.classList.toggle('dead', !!f.dead);
      continue;
    }
    const pctEl = tile.querySelector('.h-pct');
    const cur = Math.round(f.pct);
    if (cur > (+tile.dataset.pct || 0)) {   // took damage: punch the number
      pctEl.classList.remove('h-pct-hit');
      void pctEl.offsetWidth;               // restart the animation
      pctEl.classList.add('h-pct-hit');
    }
    tile.dataset.pct = cur;
    pctEl.textContent = cur + '%';
    tile.querySelector('.h-stocks').textContent = infiniteStocks ? '∞' : ('●'.repeat(Math.max(0, f.stocks)) || '—');
    tile.classList.toggle('dead', !!f.dead);
    const heat = Math.min(1, f.pct / 150);
    pctEl.style.color =
      f.pct > 0 ? `rgb(255, ${Math.round(220 - 150 * heat)}, ${Math.round(160 - 130 * heat)})` : '';
  }
}

export function setupAbilityButtons(abilityIds) {
  const btns = [$('#ability-btn-0'), $('#ability-btn-1')];
  btns.forEach((btn, i) => {
    const id = abilityIds[i];
    btn.classList.toggle('hidden', !id);
    btn.classList.remove('cooling', 'ab-live');
    if (id) {
      const def = ABILITIES.find(a => a.id === id);
      btn.dataset.ability = id;
      btn.dataset.icon = def?.icon || '?';
      btn.querySelector('.ab-icon').textContent = def?.icon || '?';
      btn.dataset.cd = def?.cd || 3;
    }
  });
}

// Abilities whose "cooldown" isn't dead time: the teleport anchor sits armed
// on the field for that whole window, so its button doubles as the activate
// control instead of just counting down. The cooldown ring still runs (it's
// the anchor's remaining life), but the button reads as live, not disabled.
const LIVE_THROUGH_COOLDOWN = new Set(['anchor']);
const ACTIVATE_ICON = '🌀';

export function updateAbilityButtons(cds) {
  [$('#ability-btn-0'), $('#ability-btn-1')].forEach((btn, i) => {
    if (btn.classList.contains('hidden')) return;
    const total = Number(btn.dataset.cd) || 3;
    const left = cds?.[i] || 0;
    const frac = Math.max(0, Math.min(1, left / total));
    btn.querySelector('.cd-ring').style.strokeDashoffset = String(113 * frac);
    const live = left > 0.05 && LIVE_THROUGH_COOLDOWN.has(btn.dataset.ability);
    btn.querySelector('.ab-icon').textContent = live ? ACTIVATE_ICON : btn.dataset.icon;
    btn.classList.toggle('cooling', left > 0.05 && !live);
    btn.classList.toggle('ab-live', live);
  });
}

// ---------- results ----------

// Funny podium awards. Each picks a strict (untied) leader in some stat,
// with a floor so a quiet match doesn't hand out embarrassing trophies.
const AWARD_DEFS = [
  { icon: '🩸', name: 'Bloodthirsty', pick: rows => topBy(rows, s => s.ko, 2) },
  { icon: '🔨', name: 'Wrecking Ball', pick: rows => topBy(rows, s => s.maxHit, 14) },
  { icon: '🧲', name: 'Damage Magnet', pick: rows => topBy(rows, s => s.taken, 80) },
  { icon: '🕳️', name: 'Gravity’s Friend', pick: rows => topBy(rows, s => s.sd, 1) },
  { icon: '🕊️', name: 'Pacifist',
    pick: rows => rows.length >= 3 && Math.max(...rows.map(r => r.s.dmg)) >= 60
      ? topBy(rows, s => -s.dmg, -Infinity) : null },
];

// Strict leader by stat (ties award nothing), meeting a minimum.
function topBy(rows, stat, min) {
  let best = null, bv = -Infinity, tie = false;
  for (const r of rows) {
    const v = stat(r.s);
    if (v === bv) tie = true;
    else if (v > bv) { bv = v; best = r; tie = false; }
  }
  return best && !tie && bv >= min ? best : null;
}

function pickAwards(rows) {
  const out = new Map();             // player id -> [{icon,name}]
  if (rows.length < 2) return out;
  for (const def of AWARD_DEFS) {
    const r = def.pick(rows);
    if (!r) continue;
    const got = out.get(r.p.id) || [];
    if (got.length >= 2) continue;   // spread the glory around
    got.push(def);
    out.set(r.p.id, got);
  }
  return out;
}

// Full build breakdown for the results screen: weapon, non-zero base
// stats, abilities, and augments as labeled pill groups (unlike the
// terse buildSummary() line used in the lobby roster).
function buildDetailHtml(build) {
  const b = build || {};
  const stats = b.stats || {};
  const wpn = WEAPONS.find(w => w.id === b.weapon) || WEAPONS.find(w => w.id === 'unarmed');
  const statBits = STATS.filter(s => stats[s.id] > 0).map(s => `${s.name} ${stats[s.id]}`);
  const abilities = (b.abilities || []).map(id => ABILITIES.find(a => a.id === id)).filter(Boolean);
  const augments = (b.augments || []).map(id => AUGMENTS.find(a => a.id === id)).filter(Boolean);
  const groups = [];
  groups.push(`<span class="r-bd-group"><span class="r-bd-label">Weapon</span><span class="r-bd-pill">${wpn.icon} ${esc(wpn.name)}</span></span>`);
  groups.push(`<span class="r-bd-group"><span class="r-bd-label">Stats</span>${
    statBits.length ? statBits.map(s => `<span class="r-bd-pill">${esc(s)}</span>`).join('') : '<span class="r-bd-pill r-bd-empty">—</span>'
  }</span>`);
  groups.push(`<span class="r-bd-group"><span class="r-bd-label">Abilities</span>${
    abilities.length ? abilities.map(a => `<span class="r-bd-pill">${a.icon} ${esc(a.name)}</span>`).join('') : '<span class="r-bd-pill r-bd-empty">—</span>'
  }</span>`);
  groups.push(`<span class="r-bd-group"><span class="r-bd-label">Augments</span>${
    augments.length ? augments.map(a => `<span class="r-bd-pill">${a.icon} ${esc(a.name)}</span>`).join('') : '<span class="r-bd-pill r-bd-empty">—</span>'
  }</span>`);
  return groups.join('');
}

// How a co-op run ended, as podium headlines.
const RUN_OUTCOMES = {
  cleared: '🏆 Road Cleared!',
  extracted: '⛺ Party Extracted!',
  wiped: '💀 The Road Wins',
};

export function renderResults(players, winnerId, finalFighters, { myId = null, onCopy = null, coop = false, outcome = null } = {}) {
  $('#results-title').textContent = coop
    ? RUN_OUTCOMES[outcome] || 'Expedition Over'
    : winnerId
    ? `${esc(players.find(p => p.id === winnerId)?.name || '???')} wins!`
    : players.length === 1 ? 'Practice complete!'
    : 'Draw!';
  const list = $('#results-list');
  list.innerHTML = '';
  const blank = { ko: 0, fall: 0, sd: 0, dmg: 0, taken: 0, maxHit: 0, cr: 0, elite: 0 };
  const rows = [...players].map(p => {
    const f = finalFighters.find(x => x.id === p.id) || null;
    return { p, f, s: f?.score || blank };
  }).sort((a, b) => {
    // Expedition podium ranks the run's contribution; stocks mean nothing
    if (coop) return (b.s.ko - a.s.ko) || ((b.s.cr || 0) - (a.s.cr || 0)) || (b.s.dmg - a.s.dmg);
    const fa = a.f || { stocks: 0, pct: 999 };
    const fb = b.f || { stocks: 0, pct: 999 };
    return (fb.stocks - fa.stocks) || (b.s.ko - a.s.ko) || (fa.pct - fb.pct);
  });
  const awards = pickAwards(rows);
  rows.forEach(({ p, f, s }, i) => {
    const chips = (awards.get(p.id) || [])
      .map(a => `<span class="r-award">${a.icon} ${esc(a.name)}</span>`).join('');
    const li = document.createElement('li');
    // Co-op stat lines: wallet + elite hunting up top, then the fight line
    // with downs where a PvP row would show stocks.
    const meta = coop ? `
          <span>💰 ${s.cr || 0} CR · ⭐ ${s.elite || 0} elite${s.elite === 1 ? '' : 's'}</span>
          <span>👊 ${s.ko} KO${s.ko === 1 ? '' : 's'} · 💥 ${Math.round(s.dmg)} dmg · 💀 ${s.fall || 0} down${s.fall === 1 ? '' : 's'}</span>`
    : `
          <span>${f ? (f.stocks > 0 ? f.stocks + (f.stocks === 1 ? ' stock' : ' stocks') + ' left' : 'KO’d') : ''}</span>
          <span>👊 ${s.ko} KO${s.ko === 1 ? '' : 's'} · 💥 ${Math.round(s.dmg)} dmg</span>`;
    li.innerHTML = `
      <div class="r-top">
        <span class="r-score">${p.id === winnerId || (coop && i === 0) ? '🏆' : '#' + (i + 1)}</span>
        <span class="r-fig"></span>
        <span class="r-col">
          <span class="r-name">${esc(p.name)}</span>
          ${chips ? `<span class="r-awards">${chips}</span>` : ''}
        </span>
        <span class="r-meta">${meta}
        </span>
      </div>
      <div class="r-build-detail">${buildDetailHtml(p.build)}</div>`;
    li.querySelector('.r-fig').appendChild(fighterThumb(p.color, p.hat));
    if (onCopy && p.id !== myId) {
      const copy = document.createElement('button');
      copy.className = 'r-copy';
      copy.title = `Copy ${p.name} to my characters`;
      copy.textContent = '📋';
      copy.addEventListener('click', () => {
        if (!onCopy(p)) return;
        copy.textContent = '✓';
        copy.disabled = true;
      });
      li.querySelector('.r-fig').appendChild(copy);
    }
    list.appendChild(li);
  });
}

// ---------- settings ----------

// Pretty-print a raw lowercased key name for the rebind chips.
const KEY_GLYPH = {
  ' ': 'Space', 'arrowleft': '←', 'arrowright': '→', 'arrowup': '↑',
  'arrowdown': '↓', 'escape': 'Esc', 'enter': '⏎', 'tab': 'Tab',
  'backspace': '⌫', 'delete': 'Del', 'control': 'Ctrl', 'shift': 'Shift',
  'alt': 'Alt', 'meta': 'Meta',
};
function keyLabel(k) { return KEY_GLYPH[k] || (k.length === 1 ? k.toUpperCase() : k); }

// Paint every settings pane from the live store. `active` is the visible tab;
// `capture` is the {kind, id} row currently awaiting a keypress/button, or
// null. Callbacks let main.js own the audio engine + capture lifecycle.
export function renderSettings({ active = 'sound', capture = null,
  onAudio, onRebindKey, onRebindPad, onResetKey, onResetPad } = {}) {
  // tab highlight + pane visibility
  for (const tab of document.querySelectorAll('.settings-tab'))
    tab.classList.toggle('on', tab.dataset.tab === active);
  for (const pane of document.querySelectorAll('.settings-pane'))
    pane.classList.toggle('hidden', pane.dataset.pane !== active);

  renderSoundPane($('[data-pane="sound"]'), onAudio);
  renderBindPane($('[data-pane="keyboard"]'), 'key', capture, onRebindKey, onResetKey);
  renderBindPane($('[data-pane="controller"]'), 'pad', capture, onRebindPad, onResetPad);
  renderTouchPane($('[data-pane="touch"]'));
}

function renderSoundPane(box, onAudio) {
  const a = settings.getAudio();
  box.innerHTML = `<p class="settings-hint">Master scales everything; music and effects mix on top.</p>`;
  const rows = [
    ['master', '🔈 Master'], ['music', '🎵 Music'], ['sfx', '💥 Effects'],
  ];
  for (const [id, name] of rows) {
    const row = document.createElement('label');
    row.className = 'vol-row';
    const pct = Math.round(a[id] * 100);
    row.innerHTML = `
      <span class="vol-name">${name}</span>
      <input class="vol-slider" type="range" min="0" max="100" value="${pct}"
             aria-label="${name} volume">
      <span class="vol-val">${pct}%</span>`;
    const slider = row.querySelector('.vol-slider');
    const val = row.querySelector('.vol-val');
    slider.addEventListener('input', () => {
      val.textContent = slider.value + '%';
      onAudio?.(id, slider.value / 100);
    });
    box.appendChild(row);
  }
}

// One pane drives both keyboard and controller — same layout, different
// binding source. `kind` is 'key' or 'pad'.
function renderBindPane(box, kind, capture, onRebind, onReset) {
  const isKey = kind === 'key';
  const actions = isKey ? KEY_ACTIONS : PAD_ACTIONS;
  box.innerHTML = isKey
    ? `<p class="settings-hint">Tap a binding, then press the new key. Move keys can be held for direction.</p>`
    : `<p class="settings-hint">Connect a controller, tap a binding, then press the new button. The stick / D-pad always moves.</p>`;
  for (const act of actions) {
    const bound = isKey ? settings.keysFor(act.id) : settings.padButtonsFor(act.id);
    const capturing = capture && capture.kind === kind && capture.id === act.id;
    const chips = bound.length
      ? bound.map(b => `<span class="bind-chip">${esc(isKey ? keyLabel(b) : padBtnLabel(b))}</span>`).join('')
      : '<span class="bind-chip none">unbound</span>';
    const row = document.createElement('div');
    row.className = 'bind-row';
    row.innerHTML = `
      <div class="bind-info">
        <div class="bind-name">${esc(act.name)}</div>
        ${act.note ? `<div class="bind-note">${esc(act.note)}</div>` : ''}
      </div>
      <div class="bind-keys">${capturing ? '<span class="bind-chip listening">press…</span>' : chips}</div>
      <button class="btn tiny ghost bind-set">${capturing ? 'Cancel' : 'Rebind'}</button>`;
    row.querySelector('.bind-set').addEventListener('click', () => onRebind?.(act.id, capturing));
    box.appendChild(row);
  }
  const reset = document.createElement('button');
  reset.className = 'btn tiny ghost bind-reset';
  reset.textContent = isKey ? '↺ Reset keyboard' : '↺ Reset controller';
  reset.addEventListener('click', () => onReset?.());
  box.appendChild(reset);
}

function renderTouchPane(box) {
  box.innerHTML = `
    <p class="settings-hint">Touch controls are gesture-based, so they can't be
      remapped — here's the reference:</p>
    <div class="touch-ref">
      <div class="touch-ref-row"><b>Left thumb</b><span>drag = move · flick up = jump · flick down = fast-fall / drop · flick sideways while ducked = dodge roll</span></div>
      <div class="touch-ref-row"><b>Right thumb</b><span>tap = quick attack · swipe = smash in that direction (hold to charge)</span></div>
      <div class="touch-ref-row"><b>Corner buttons</b><span>your two equipped abilities</span></div>
    </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssId(s) { return String(s).replace(/[^\w-]/g, '_'); }
