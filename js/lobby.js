/* ============================================================
 * AETHER ARENA — lobby.js
 * Meta-game UI: gem + skin shop, leaderboard, replay browser
 * & player. Requires game.js + net.js loaded first.
 * ============================================================ */
'use strict';

/* which skins the player owns (online: from account; offline: all) */
function skinOwned(heroId, idx) {
  if (idx === 0) return true;
  if (typeof net === 'undefined' || !net.online) return true;   // offline practice: everything unlocked
  const me = net.me;
  return !!(me && me.skins && (me.skins[heroId] || []).includes(idx));
}

const Lobby = {
  el(id) { return document.getElementById(id); },

  modal(html) {
    const host = this.el('modal');
    host.innerHTML = `<div class="modal-box">${html}</div>`;
    host.classList.add('on');
    return host;
  },
  closeModal() {
    const host = this.el('modal');
    host.classList.remove('on');
    host.innerHTML = '';
  },

  /* ---------------- skin shop ---------------- */
  openSkinShop(heroId) {
    const h = heroById(heroId);
    const me = net.me || { gems: 0, skins: {} };
    const owned = (me.skins && me.skins[heroId]) || [];
    let rows = '';
    SKINS.forEach((sk, si) => {
      const has = si === 0 || owned.includes(si);
      const swatch = { classic: h.tint, emerald: '#34d399', frost: '#7dd3fc', inferno: '#f87171' }[sk.id] || '#888';
      rows += `<div class="shop-row">
        <span class="swatch" style="background:${swatch}"></span>
        <div style="flex:1"><b>${sk.name}</b><small>${si === 0 ? 'Default look' : 'Cosmetic color variant'}</small></div>
        ${has ? '<span class="owned-tag">✅ OWNED</span>'
              : `<button class="buy-skin" data-h="${heroId}" data-s="${si}" ${me.gems < sk.price ? 'disabled' : ''}>💎 ${sk.price}</button>`}
      </div>`;
    });
    this.modal(`
      <h2>${h.emoji} ${h.name} — Skins</h2>
      <div class="shop-gems">You have <b id="gem-count">💎 ${me.gems}</b> gems · earn 60–100 per match</div>
      ${rows}
      <button class="linkish" id="open-packs">💎 Get more gems…</button>
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelectorAll('.buy-skin').forEach(b => {
      b.addEventListener('click', () => this.buySkin(b.dataset.h, parseInt(b.dataset.s, 10)));
    });
    const op = this.el('open-packs');
    if (op) op.addEventListener('click', () => this.openPacks());
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => { this.closeModal(); buildSelectScreen(); });
  },

  async buySkin(heroId, skinIdx) {
    const r = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: net.token, heroId, skinIdx }),
    });
    const j = await r.json();
    if (j.ok) {
      net.me = net.me || {};
      net.me.gems = j.gems; net.me.skins = j.skins;
      sfxShopDing();
      this.openSkinShop(heroId);
    } else {
      alert(j.error || 'Purchase failed');
      if (typeof j.gems === 'number' && net.me) net.me.gems = j.gems;
    }
  },

  openPacks() {
    let rows = '';
    for (const p of [
      { id: 'p1', gems: 500, usd: 1.99 }, { id: 'p2', gems: 1200, usd: 4.49 }, { id: 'p3', gems: 3000, usd: 9.99 },
    ]) {
      rows += `<div class="shop-row"><div style="flex:1"><b>💎 ${p.gems} gems</b><small>one-time purchase</small></div>
        <button class="buy-pack" data-p="${p.id}">$${p.usd.toFixed(2)}</button></div>`;
    }
    this.modal(`
      <h2>💎 Gem Packs</h2>
      <div class="shop-gems">Gems buy <b>cosmetic skins only</b> — never power. 🎯</div>
      ${rows}
      <div class="note">Payments are a stub in this build — wire Lemon Squeezy / Paddle / Stripe here.</div>
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelectorAll('.buy-pack').forEach(b => {
      b.addEventListener('click', async () => {
        const r = await fetch('/api/shop/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: net.token, packId: b.dataset.p }),
        });
        const j = await r.json();
        if (j.ok && j.granted) { net.me.gems = j.gems; alert(`✅ +gems granted (dev mode). Balance: ${j.gems}`); }
        else alert(j.note || 'Checkout not configured yet.');
      });
    });
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.openSkinShop(selectedHero));
  },

  /* ---------------- leaderboard ---------------- */
  async openLeaderboard() {
    const r = await fetch('/api/leaderboard');
    const j = await r.json();
    const rows = (j.rows || []).map((u, i) => `
      <div class="lb-row ${net.username === u.username ? 'me' : ''}">
        <span class="lb-rank">#${i + 1}</span>
        <b style="flex:1">${u.username}</b>
        <span>${u.wins}W ${u.losses}L</span>
        <span class="lb-elo">${u.elo}</span>
      </div>`).join('') || '<div class="note">No ranked matches yet — be the first!</div>';
    this.modal(`
      <h2>🏅 Ranked Leaderboard <small style="font-size:11px;color:#7c8db0">ELO · top 20</small></h2>
      ${rows}
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  /* ---------------- match history ---------------- */
  openHistory() {
    const hist = (net.me && net.me.history) || [];
    const rows = hist.length ? hist.map(h => `
      <div class="shop-row">
        <span style="font-size:20px">${heroById(h.hero).emoji}</span>
        <div style="flex:1"><b style="color:${h.win ? '#4ade80' : '#f87171'}">${h.win ? 'VICTORY' : 'DEFEAT'}</b>
        <small>${heroById(h.hero).name} · ${h.k}/${h.dt}/${h.a} · ${Math.floor(h.dur / 60)}m${Math.round(h.dur % 60)}s</small></div>
        <small style="color:#5c7099">${new Date(h.d).toLocaleDateString()}</small>
      </div>`).join('') : '<div class="note">No online matches yet — go play some ranked!</div>';
    this.modal(`
      <h2>📜 Match History <small style="font-size:11px;color:#7c8db0">last 12</small></h2>
      ${rows}
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  /* ---------------- friends & parties ---------------- */
  async openFriends() {
    const r = await fetch('/api/friends?token=' + encodeURIComponent(net.token));
    const j = await r.json();
    const rows = (j.friends || []).map(f => `
      <div class="shop-row">
        <span style="width:10px;height:10px;border-radius:50%;background:${f.online ? '#4ade80' : '#475569'};flex:none"></span>
        <div style="flex:1"><b>${f.username}</b>${f.guild ? ` <small>[${f.guild}]</small>` : ''}</div>
        ${f.online ? `<button class="buy-skin inv" data-n="${f.username}">Invite</button>` : '<small style="color:#5c7099">offline</small>'}
        <button class="linkish rm" data-n="${f.username}" style="margin:0">✕</button>
      </div>`).join('') || '<div class="note">No friends yet — add someone below!</div>';
    this.modal(`
      <h2>🤝 Friends</h2>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:10px">
        <input id="fr-add" placeholder="username" style="flex:1;padding:10px;border-radius:9px;border:1px solid #223453;background:#0b1424;color:#e2e8f0">
        <button class="buy-skin" id="fr-go">Add</button>
      </div>
      ${net.partyWith ? `<div class="note">🎉 In party with <b>${net.partyWith}</b> · <button class="linkish" id="fr-leave" style="margin:0">leave party</button></div>` : ''}
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelectorAll('.inv').forEach(b => b.addEventListener('click', () => { net.sendInvite(b.dataset.n); this.closeModal(); UI.toast('Invite sent to ' + b.dataset.n); }));
    this.el('modal').querySelectorAll('.rm').forEach(b => b.addEventListener('click', async () => {
      await fetch('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token, remove: b.dataset.n }) });
      this.openFriends();
    }));
    const go = this.el('fr-go');
    go.addEventListener('click', async () => {
      const name = this.el('fr-add').value.trim();
      if (!name) return;
      const rr = await fetch('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token, add: name }) });
      const jj = await rr.json();
      if (!jj.ok) alert(jj.error); else this.openFriends();
    });
    const lv = this.el('fr-leave');
    if (lv) lv.addEventListener('click', () => { net.leaveParty(); this.closeModal(); });
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  /* ---------------- guilds ---------------- */
  async openGuild() {
    const r = await fetch('/api/guild?token=' + encodeURIComponent(net.token));
    const j = await r.json();
    const mine = j.mine;
    const rows = (j.guilds || []).map(g => `
      <div class="shop-row">
        <b style="color:#fbbf24">[${g.tag}]</b>
        <div style="flex:1">${g.name}<small>${g.members} members</small></div>
        <small>🏅 ${g.power}</small>
        ${(!mine && net.me) ? `<button class="buy-skin gj" data-t="${g.tag}">Join</button>` : ''}
      </div>`).join('') || '<div class="note">No guilds yet.</div>';
    this.modal(`
      <h2>⚜ Guilds</h2>
      ${mine ? `<div class="shop-gems">Your guild: <b style="color:#fbbf24">[${mine.tag}]</b> ${mine.name} · ${mine.members.length} members
        <button class="linkish" id="gl-leave" style="margin:0 0 0 8px">leave</button></div>`
      : `<div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="gl-tag" placeholder="TAG" maxlength="4" style="width:70px;padding:10px;border-radius:9px;border:1px solid #223453;background:#0b1424;color:#e2e8f0;text-transform:uppercase">
          <input id="gl-name" placeholder="Guild name" style="flex:1;padding:10px;border-radius:9px;border:1px solid #223453;background:#0b1424;color:#e2e8f0">
          <button class="buy-skin" id="gl-create">Create 💎500</button>
        </div>`}
      ${rows}
      <button class="modal-close">Close</button>
    `);
    const glc = this.el('gl-create');
    if (glc) glc.addEventListener('click', async () => {
      const rr = await fetch('/api/guild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token, action: 'create', tag: this.el('gl-tag').value.trim(), name: this.el('gl-name').value.trim() }) });
      const jj = await rr.json();
      if (!jj.ok) alert(jj.error); else { await net.refreshMe(); this.openGuild(); }
    });
    this.el('modal').querySelectorAll('.gj').forEach(b => b.addEventListener('click', async () => {
      const rr = await fetch('/api/guild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token, action: 'join', tag: b.dataset.t }) });
      const jj = await rr.json();
      if (!jj.ok) alert(jj.error); else this.openGuild();
    }));
    const gll = this.el('gl-leave');
    if (gll) gll.addEventListener('click', async () => {
      await fetch('/api/guild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token, action: 'leave' }) });
      await net.refreshMe();
      this.openGuild();
    });
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  /* ---------------- battle pass ---------------- */
  async openBP() {
    const r = await fetch('/api/bp?token=' + encodeURIComponent(net.token));
    const j = await r.json();
    const bp = j.bp || { tier: 0, xp: 0, premium: false };
    const tier = bp.tier || 0, xp = bp.xp || 0;
    const cur = tier * 200, next = (tier + 1) * 200;
    const pct = Math.min(100, Math.round((xp - cur) / (next - cur) * 100));
    const tiers = [];
    for (let t = Math.max(0, tier - 1); t < Math.min(30, tier + 5); t++) {
      const free = ((t + 1) % 3 === 0) ? '💎60' : '—';
      const prem = '💎100';
      tiers.push(`<div class="sb-row ${t < tier ? 'done' : ''}"><span class="lb-rank">T${t + 1}</span><span style="flex:1">Reward</span><span>${free}</span><span style="color:#fbbf24">${prem}</span></div>`);
    }
    this.modal(`
      <h2>🎖 Battle Pass <small style="font-size:11px;color:#7c8db0">Season 1</small></h2>
      <div class="shop-gems">Tier <b>${tier}</b>/30 · earn pass XP from every match (win +50, kills +2 each) ${bp.premium ? '· <b style="color:#fbbf24">PREMIUM ✅</b>' : ''}</div>
      <div style="background:#131f33;border-radius:8px;height:14px;overflow:hidden;margin-bottom:6px"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#fbbf24,#f59e0b)"></div></div>
      <div style="font-size:11px;color:#7c8db0;margin-bottom:12px">${xp} / ${next} pass XP to next tier</div>
      <div class="sb-row" style="font-weight:700"><span class="lb-rank">TIER</span><span style="flex:1"></span><span>FREE</span><span style="color:#fbbf24">PREMIUM</span></div>
      ${tiers.join('')}
      ${!bp.premium ? `<button class="buy-skin" id="bp-buy" style="width:100%;margin-top:10px">Upgrade to Premium — 💎800</button>` : ''}
      <button class="modal-close">Close</button>
    `);
    const bb = this.el('bp-buy');
    if (bb) bb.addEventListener('click', async () => {
      const rr = await fetch('/api/bp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: net.token }) });
      const jj = await rr.json();
      if (!jj.ok) alert(jj.error); else { await net.refreshMe(); this.openBP(); }
    });
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  /* ---------------- replays ---------------- */
  async openReplays() {
    const r = await fetch('/api/replays');
    const j = await r.json();
    const rows = (j.replays || []).slice().reverse().map(rp => `
      <div class="shop-row">
        <div style="flex:1">
          <b>${rp.winner === 0 ? '🔵 Blue' : '🔴 Red'} victory</b>
          <small>${new Date(rp.date).toLocaleString()} · ${Math.floor(rp.time / 60)}m${rp.time % 60}s · kills ${rp.kills[0]}–${rp.kills[1]}</small>
        </div>
        <button class="play-replay" data-id="${rp.id}">▶ Watch</button>
      </div>`).join('') || '<div class="note">No replays recorded yet — finish an online match first.</div>';
    this.modal(`
      <h2>📹 Match Replays</h2>
      ${rows}
      <button class="modal-close">Close</button>
    `);
    this.el('modal').querySelectorAll('.play-replay').forEach(b => {
      b.addEventListener('click', () => this.playReplay(b.dataset.id));
    });
    this.el('modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
  },

  async playReplay(id) {
    this.closeModal();
    const r = await fetch('/api/replay?id=' + encodeURIComponent(id));
    if (!r.ok) { alert('Replay not found'); return; }
    const data = await r.json();
    document.getElementById('select-screen').classList.remove('on');
    document.getElementById('end-screen').classList.remove('on');
    document.getElementById('game-screen').classList.add('on');
    document.getElementById('killfeed').innerHTML = '';
    const firstHuman = (data.meta.roster || []).find(x => !x.bot) || (data.meta.roster || [])[0] || { heroId: HEROES[0].id };
    const g = new Game(firstHuman.heroId, false, { mode: 'mirror', myHeroId: firstHuman.heroId, youId: -1 });
    g.replayMode = true;
    g.replaySource = data.snaps;
    g.replayT = 0; g.replayIdx = -1; g.replaySpeed = 1; g.replayPaused = false;
    g.snapInt = 0.2;
    currentGame = g;
    this.showReplayBar(true);
    g.announce('📹 REPLAY', data.meta.winner === 0 ? 'Blue side perspective' : 'Red side perspective', 2.5);
  },

  showReplayBar(on) {
    const bar = this.el('replay-bar');
    if (!bar) return;
    bar.style.display = on ? 'flex' : 'none';
  },
  replayCtl(action) {
    const g = currentGame;
    if (!g || !g.replayMode) return;
    if (action === 'pause') g.replayPaused = !g.replayPaused;
    if (action === 'speed') g.replaySpeed = g.replaySpeed === 1 ? 2 : g.replaySpeed === 2 ? 4 : 1;
    if (action === 'skip') { g.replayT = Math.min(g.replaySource.length - 1.01, g.replayT + 50); }
    if (action === 'exit') {
      g.state = 'end';
      this.showReplayBar(false);
      currentGame = null;
      UI.showSelect(net.online, net.username, net.me && net.me.stats);
      if (net.me) net.refreshMe();
    }
    this.el('rp-pause').textContent = g.replayPaused ? '▶' : '⏸';
    this.el('rp-speed').textContent = g.replaySpeed + '×';
  },

  init() {
    this.el('btn-leaderboard').addEventListener('click', () => this.openLeaderboard());
    this.el('btn-replays').addEventListener('click', () => this.openReplays());
    this.el('btn-gems').addEventListener('click', () => this.openPacks());
    this.el('btn-history').addEventListener('click', () => this.openHistory());
    this.el('btn-friends').addEventListener('click', () => this.openFriends());
    this.el('btn-guild').addEventListener('click', () => this.openGuild());
    this.el('btn-bp').addEventListener('click', () => this.openBP());
    this.el('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.closeModal(); });
    this.el('rp-pause').addEventListener('click', () => this.replayCtl('pause'));
    this.el('rp-speed').addEventListener('click', () => this.replayCtl('speed'));
    this.el('rp-skip').addEventListener('click', () => this.replayCtl('skip'));
    this.el('rp-exit').addEventListener('click', () => this.replayCtl('exit'));
  },
};

function sfxShopDing() {
  if (typeof currentGame !== 'undefined' && currentGame && currentGame.sfx) currentGame.sfx.play('gold');
}

window.Lobby = Lobby;
window.skinOwned = skinOwned;
Lobby.init();
