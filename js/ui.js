// Screen management + all menu/builder/lobby DOM. Game HUD lives here too.

import {
  COLORS, TOTAL_CREDITS, STATS, ABILITIES, AUGMENTS,
  MAX_ABILITIES, MAX_AUGMENTS, buildCost, buildSummary,
} from './profile.js';

const $ = s => document.querySelector(s);

export function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
  $('#screen-' + name).classList.remove('hidden');
}

export function banner(text, kind = 'warn', ms = 3000) {
  const el = $('#net-banner');
  el.textContent = text;
  el.className = kind;   // warn (default style) | bad | good
  el.classList.remove('hidden');
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

export function drawPreview(canvas, color) {
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
  // work: {color, build} — mutated in place as the user shops
  const spent = buildCost(work.build);
  const left = TOTAL_CREDITS - spent;
  $('#builder-credits').textContent = left;

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

  renderShop($('#builder-abilities'), ABILITIES, work.build.abilities, MAX_ABILITIES, left, work);
  renderShop($('#builder-augments'), AUGMENTS, work.build.augments, MAX_AUGMENTS, left, work);
}

function renderShop(box, defs, owned, maxOwned, left, work) {
  box.innerHTML = '';
  for (const item of defs) {
    const has = owned.includes(item.id);
    const affordable = has || (left >= item.cost && owned.length < maxOwned);
    const el = document.createElement('div');
    el.className = 'shop-item' + (has ? ' owned' : affordable ? '' : ' locked');
    el.innerHTML = `
      <div class="si-icon">${item.icon}</div>
      <div class="si-cost">${has ? '✓ owned' : item.cost + ' cr'}</div>
      <div class="si-name">${item.name}</div>
      <div class="si-desc">${item.desc}</div>`;
    el.addEventListener('click', () => {
      if (has) owned.splice(owned.indexOf(item.id), 1);
      else if (affordable) owned.push(item.id);
      else return;
      renderBuilder(work);
    });
    box.appendChild(el);
  }
}

// ---------- menu card ----------

export function renderMenuCard(profile) {
  $('#menu-name').textContent = profile.name;
  $('#menu-build').textContent = buildSummary(profile.build);
  drawPreview($('#menu-preview'), profile.color);
}

// ---------- lobby ----------

export function renderLobby(net) {
  $('#lobby-code').textContent = net.roomCode || '····';
  const list = $('#lobby-roster');
  list.innerHTML = '';
  const roster = net.rosterList();
  for (const m of roster) {
    const li = document.createElement('li');
    const isHost = m.peerId === net.hostId;
    const isMe = m.peerId === net.myId;
    li.innerHTML = `
      <span class="presence-dot ${m.status === 'gone' ? 'gone' : m.status === 'away' ? 'away' : 'online'}"></span>
      <span class="r-swatch" style="background:${m.color}"></span>
      <span class="r-name">${esc(m.name)}${isMe ? ' (you)' : ''}${isHost ? '<span class="r-host">HOST</span>' : ''}</span>
      <span class="r-meta">${m.ready ? '<div class="r-ready">READY</div>' : ''}${!isMe && m.ping ? m.ping + 'ms' : ''}</span>`;
    list.appendChild(li);
  }

  // pending join requests — host decides who gets in
  const reqBox = $('#lobby-requests');
  const requests = net.isHost ? net.requestList() : [];
  reqBox.classList.toggle('hidden', !requests.length);
  reqBox.innerHTML = requests.length ? '<div class="req-title">Knocking…</div>' : '';
  for (const r of requests) {
    const row = document.createElement('div');
    row.className = 'req-row';
    row.innerHTML = `
      <span class="r-swatch" style="background:${r.color}"></span>
      <span class="r-name">${esc(r.name)}</span>
      <button class="btn tiny req-ok">Let in</button>
      <button class="btn tiny ghost req-no">Deny</button>`;
    row.querySelector('.req-ok').addEventListener('click', () => net.approveJoin(r.peerId));
    row.querySelector('.req-no').addEventListener('click', () => net.denyJoin(r.peerId));
    reqBox.appendChild(row);
  }

  const me = net.members.get(net.myId);
  const readyBtn = $('#lobby-ready');
  readyBtn.textContent = me?.ready ? 'Ready ✓' : "I'm Ready";
  readyBtn.classList.toggle('ready-on', !!me?.ready);

  const active = roster.filter(m => m.status !== 'gone');
  const allReady = active.length >= 2 && active.every(m => m.ready);
  const startBtn = $('#lobby-start');
  startBtn.classList.toggle('hidden', !net.isHost);
  startBtn.disabled = !allReady;
  $('#lobby-status').textContent =
    active.length < 2 ? 'Waiting for challengers to join…'
      : allReady ? (net.isHost ? 'All ready — start when you like!' : 'Waiting for host to start…')
      : 'Waiting for everyone to ready up…';
}

// ---------- game HUD ----------

export function buildHud(players) {
  const hud = $('#game-hud');
  hud.innerHTML = '';
  for (const p of players) {
    const tile = document.createElement('div');
    tile.className = 'hud-tile';
    tile.id = 'hud-' + cssId(p.id);
    tile.style.borderTopColor = p.color;
    tile.innerHTML = `
      <div class="h-name">${esc(p.name)}</div>
      <div class="h-pct" style="color:${p.color}">0%</div>
      <div class="h-stocks">●●●</div>`;
    hud.appendChild(tile);
  }
}

export function updateHud(fighters) {
  for (const f of fighters) {
    const tile = document.getElementById('hud-' + cssId(f.id));
    if (!tile) continue;
    const pctEl = tile.querySelector('.h-pct');
    const cur = Math.round(f.pct);
    if (cur > (+tile.dataset.pct || 0)) {   // took damage: punch the number
      pctEl.classList.remove('h-pct-hit');
      void pctEl.offsetWidth;               // restart the animation
      pctEl.classList.add('h-pct-hit');
    }
    tile.dataset.pct = cur;
    pctEl.textContent = cur + '%';
    tile.querySelector('.h-stocks').textContent = '●'.repeat(Math.max(0, f.stocks)) || '—';
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
    if (id) {
      const def = ABILITIES.find(a => a.id === id);
      btn.querySelector('.ab-icon').textContent = def?.icon || '?';
      btn.dataset.cd = def?.cd || 3;
    }
  });
}

export function updateAbilityButtons(cds) {
  [$('#ability-btn-0'), $('#ability-btn-1')].forEach((btn, i) => {
    if (btn.classList.contains('hidden')) return;
    const total = Number(btn.dataset.cd) || 3;
    const left = cds?.[i] || 0;
    const frac = Math.max(0, Math.min(1, left / total));
    btn.querySelector('.cd-ring').style.strokeDashoffset = String(113 * frac);
    btn.classList.toggle('cooling', left > 0.05);
  });
}

// ---------- results ----------

export function renderResults(players, winnerId, finalFighters) {
  $('#results-title').textContent = winnerId
    ? `${esc(players.find(p => p.id === winnerId)?.name || '???')} wins!`
    : 'Draw!';
  const list = $('#results-list');
  list.innerHTML = '';
  const rows = [...players].sort((a, b) => {
    const fa = finalFighters.find(f => f.id === a.id) || { stocks: 0, pct: 999 };
    const fb = finalFighters.find(f => f.id === b.id) || { stocks: 0, pct: 999 };
    return (fb.stocks - fa.stocks) || (fa.pct - fb.pct);
  });
  rows.forEach((p, i) => {
    const f = finalFighters.find(x => x.id === p.id);
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="r-score">${p.id === winnerId ? '🏆' : '#' + (i + 1)}</span>
      <span class="r-swatch" style="background:${p.color}"></span>
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-meta">${f ? (f.stocks > 0 ? f.stocks + ' stocks left' : 'KO’d') : ''}</span>`;
    list.appendChild(li);
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssId(s) { return String(s).replace(/[^\w-]/g, '_'); }
