/* ============================================================
 * AETHER ARENA — flow.js
 * The full game-flow layer stack:
 *   splash → main menu → mode select → matchmaking →
 *   draft/ban phase → loading screen → match
 * ============================================================ */
'use strict';

const SPRITE_LOAD = { total: 0, done: 0 };
const _origLoadSprites = loadSprites;
loadSprites = function () {
  if (HEADLESS) return;
  const urls = [];
  for (const h of HEROES) { urls.push('img/' + h.id + '.png'); urls.push('img/full/' + h.id + '.png'); }
  for (const ty of ['melee', 'ranged', 'siege']) urls.push(`img/minion_${ty}.png`);
  for (const mk of ['lizard', 'golem', 'turtle', 'lord']) urls.push(`img/monster_${mk}.png`);
  for (const tx of ['tex_ground', 'tex_lane', 'tex_water']) urls.push(`img/${tx}.png`);
  SPRITE_LOAD.total = urls.length;
  let pending = urls.length;
  for (const u of urls) {
    const im = new Image();
    im.onload = im.onerror = () => { SPRITE_LOAD.done++; };
    im.src = u;
  }
  _origLoadSprites();
};

const Flow = {
  el(id) { return document.getElementById(id); },
  screen(name) {
    const map = {
      splash: 'splash-screen', menu: 'menu-screen', mode: 'mode-screen',
      mm: 'mm-screen', draft: 'draft-screen', select: 'select-screen',
      game: 'game-screen', end: 'end-screen', auth: 'auth-screen',
    };
    for (const k of Object.values(map)) this.el(k).classList.remove('on');
    if (map[name]) this.el(map[name]).classList.add('on');
  },

  /* ---------------- 1. SPLASH ---------------- */
  startSplash() {
    this.screen('splash');
    const bar = this.el('sp-bar');
    const pct = this.el('sp-pct');
    const tap = this.el('sp-tap');
    const t0 = performance.now();
    const iv = setInterval(() => {
      const fake = Math.min(1, (performance.now() - t0) / 1400);
      const real = SPRITE_LOAD.total ? SPRITE_LOAD.done / SPRITE_LOAD.total : 1;
      const k = Math.min(fake, real) * 0.92 + (real >= 1 ? 0.08 : 0);
      bar.style.width = (k * 100) + '%';
      pct.textContent = Math.round(k * 100) + '%';
      if (k >= 0.995) {
        clearInterval(iv);
        bar.style.width = '100%'; pct.textContent = '100%';
        tap.style.display = 'block';
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          menuSfx.resume(); menuSfx.play('announce');
          if (net.online || (typeof window !== 'undefined' && window.OFFLINE_DEMO)) Flow.showMenu();
          else Flow.screen('auth');
        };
        const go = () => {
          if (!net.token || net.online) { finish(); return; }
          const w = setInterval(() => {
            if (net.online || net.helloFailed) { clearInterval(w); finish(); }
          }, 200);
          setTimeout(() => { clearInterval(w); finish(); }, 6000);   // NEVER hang on the splash
        };
        tap.addEventListener('click', go, { once: true });
        tap.addEventListener('touchstart', (e) => { e.preventDefault(); go(); }, { once: true });
      }
    }, 120);
  },

  /* ---------------- 2. MAIN MENU ---------------- */
  showMenu() {
    this.screen('menu');
    const prof = this.el('menu-profile');
    if (net.online && net.username) {
      const me = net.me || {};
      const elo = me.elo !== undefined ? me.elo : 1000;
      const [rn, rc] = rankFor(elo);
      prof.innerHTML = `<div class="mp-face">🛡️</div>
        <div><b>${net.username}</b>
        <div style="font-size:11px"><span style="color:${rc};font-weight:800">${rn} ${elo}</span> · 💎${me.gems || 0}${net.partyWith ? ' · 🎉 ' + net.partyWith : ''}</div></div>`;
      this.el('menu-play').textContent = 'PLAY';
    } else {
      prof.innerHTML = '<div class="mp-face">🎮</div><div><b>Guest</b><div style="font-size:11px;color:#7c8db0">offline practice mode</div></div>';
      this.el('menu-play').textContent = 'PLAY';
    }
    if (window.Lobby) Lobby.syncMenuButtons ? Lobby.syncMenuButtons() : null;
  },

  /* ---------------- 3. MODE SELECT ---------------- */
  showModes() {
    if (!net.online) { this.showSelect(); return; }
    this.screen('mode');
  },
  pickMode(mode) {
    this.mode = mode;
    if (mode === 'practice') { this.showSelect(); return; }
    this.showMM(mode);
  },

  /* ---------------- 4. MATCHMAKING ---------------- */
  showMM(mode) {
    this.screen('mm');
    const label = mode === 'ranked' ? 'RANKED 5v5' : 'CASUAL 5v5';
    this.el('mm-label').textContent = '🔍 SEARCHING — ' + label;
    this.el('mm-note').textContent = 'Draft phase follows · bots fill empty slots';
    this.mmT0 = Date.now();
    clearInterval(this.mmIv);
    this.mmIv = setInterval(() => {
      const s = Math.floor((Date.now() - this.mmT0) / 1000);
      this.el('mm-timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    net.queue(selectedHero, mode);
  },
  cancelMM() {
    clearInterval(this.mmIv);
    net.unqueue();
    this.showMenu();
  },

  /* ---------------- 5. DRAFT PHASE ---------------- */
  showDraft(st) {
    clearInterval(this.mmIv);
    this.screen('draft');
    this.draft = st;
    this.draftSel = null;
    this.renderDraft(st);
  },
  renderDraft(st) {
    const blue = this.el('dr-blue'), red = this.el('dr-red');
    const slotHTML = (p, team) => {
      const h = p.heroId ? heroById(p.heroId) : null;
      const isYou = p.name === st.youName;
      const skf = p.sk ? (window.skinFilter ? skinFilter(p.sk) : '') : '';
      return `<div class="dr-slot ${p.heroId ? 'filled' : ''} ${team === 1 ? 'red' : ''}">
        ${h ? `<img src="img/${h.id}.png" data-emoji="${h.emoji}" style="filter:${skf}">` : '<span class="dr-emoji">❔</span>'}
        <div class="dr-name">${isYou ? '<b style="color:#fbbf24">★ YOU</b>' : p.name}${p.bot ? ' <small style="color:#5c7099">BOT</small>' : ''}</div>
        <div class="dr-hero">${h ? h.name : '…'}</div>
      </div>`;
    };
    blue.innerHTML = st.picks[0].map(p => slotHTML(p, 0)).join('');
    red.innerHTML = st.picks[1].map(p => slotHTML(p, 1)).join('');
    const wireImgs = (host) => {
      host.querySelectorAll('img[data-emoji]').forEach(im => {
        im.onerror = function () {
          const s = document.createElement('span');
          s.className = 'dr-emoji';
          s.textContent = this.dataset.emoji;
          this.replaceWith(s);
        };
      });
    };
    wireImgs(blue); wireImgs(red);

    // bans row
    const banHTML = (t) => (st.bans[t] || []).map(id => {
      const h = heroById(id);
      return `<div class="dr-ban" title="Banned: ${h.name}">${h.emoji}</div>`;
    }).join('');
    this.el('dr-bans-blue').innerHTML = banHTML(0);
    this.el('dr-bans-red').innerHTML = banHTML(1);

    // phase banner + timer
    const youTeam = st.picks.flat().find(p => p.name === st.youName);
    const myTeam = youTeam ? st.picks.indexOf(st.picks.find(team => team.some(p => p.name === st.youName))) : 0;
    const banner = this.el('dr-banner');
    const timer = this.el('dr-timer');
    clearInterval(this.draftIv);
    if (st.phase === 'done') {
      banner.textContent = '✅ DRAFT COMPLETE — entering the arena…';
      banner.className = 'dr-banner done';
      timer.textContent = '';
      this.el('dr-grid').classList.add('off');
      this.el('dr-lock').style.display = 'none';
      return;
    }
    const myTurn = !st.actorIsBot && st.actor === st.youName;
    banner.textContent = myTurn
      ? (st.phase === 'ban' ? '🚫 YOUR BAN — choose a hero to ban!' : '⭐ YOUR PICK — choose your hero!')
      : (st.phase === 'ban' ? `🚫 ${st.actor} is banning…` : `⏳ ${st.actor} is picking…`);
    banner.className = 'dr-banner ' + (myTurn ? 'mine' : '');
    banner.style.borderColor = myTurn ? '#4ade80' : '#223453';
    const ends = st.timerEnds;
    this.draftIv = setInterval(() => {
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      timer.textContent = left + 's';
      timer.style.color = left <= 5 ? '#f87171' : '#e2e8f0';
    }, 200);

    // hero grid
    const grid = this.el('dr-grid');
    grid.classList.toggle('off', !myTurn);
    grid.innerHTML = HEROES.map(h => {
      const avail = st.available.includes(h.id);
      return `<div class="dr-hero-card ${avail ? '' : 'taken'} ${this.draftSel === h.id ? 'sel' : ''}" data-h="${h.id}">
        <img src="img/${h.id}.png" data-emoji="${h.emoji}">
        <span>${h.name}</span><small>${h.role}</small>
        <div class="hc-info">📖</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('img[data-emoji]').forEach(im => {
      im.onerror = function () {
        const d = document.createElement('div');
        d.className = 'drh-emoji';
        d.textContent = this.dataset.emoji;
        this.replaceWith(d);
      };
    });
    grid.querySelectorAll('.dr-hero-card .hc-info').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); openHeroInfo(b.parentElement.dataset.h); });
    });
    grid.querySelectorAll('.dr-hero-card').forEach(c => {
      c.addEventListener('click', () => {
        if (!myTurn || c.classList.contains('taken')) return;
        this.draftSel = c.dataset.h;
        this.draftSkin = 0;
        grid.querySelectorAll('.dr-hero-card').forEach(x => x.classList.remove('sel'));
        c.classList.add('sel');
        const h = heroById(this.draftSel);
        this.el('dr-lock').style.display = 'block';
        this.el('dr-lock').innerHTML = `${h.emoji} <b>LOCK IN ${h.name}</b>`;
        this.renderDraftSkins(h, myTurn, grid);
      });
    });
    st_phaseIsBan = st.phase === 'ban';
    if (st.phase === 'ban' || !myTurn) {
      const host = this.el('dr-skins');
      if (host) host.innerHTML = '';
    }
    const lock = this.el('dr-lock');
    lock.style.display = myTurn && this.draftSel ? 'block' : 'none';
    lock.onclick = () => {
      if (!this.draftSel || !myTurn) return;
      net.send({ t: st.phase === 'ban' ? 'draftBan' : 'draftPick', heroId: this.draftSel, skinIdx: this.draftSkin || 0 });
      this.draftSel = null;
      this.draftSkin = 0;
      menuSfx.play('level');
    };
  },

  renderDraftSkins(h, myTurn, grid) {
    const host = this.el('dr-skins');
    if (!host) return;
    if (!myTurn || st_phaseIsBan) { host.innerHTML = ''; return; }
    const ownedFor = (hid) => {
      if (typeof net !== 'undefined' && net.online && net.me) {
        const o = (net.me.skins && net.me.skins[hid]) || [];
        return SKINS.map((s, i) => i === 0 || o.includes(i));
      }
      return SKINS.map(() => true);   // offline practice: everything unlocked
    };
    const owned = ownedFor(h.id);
    const pref = (typeof equippedSkin === 'function' ? equippedSkin(h.id) : 0);
    if (this.draftSkin === 0 && owned[pref]) this.draftSkin = pref;
    if (!owned[this.draftSkin]) this.draftSkin = 0;
    host.innerHTML = SKINS.map((s, i) => owned[i]
      ? `<button class="dr-skin ${this.draftSkin === i ? 'on' : ''}" data-i="${i}" style="filter:${skinFilter(i)}">
           <img src="img/${h.id}.png" data-emoji="${h.emoji}"></button>`
      : `<button class="dr-skin locked" data-i="${i}"><img src="img/${h.id}.png" style="filter:${skinFilter(i)}" data-emoji="${h.emoji}"><span>🔒${s.price}</span></button>`
    ).join('') + `<div class="dr-skinname">${SKINS[this.draftSkin].name}</div>`;
    host.querySelectorAll('img[data-emoji]').forEach(im => {
      im.onerror = function () {
        const d = document.createElement('div');
        d.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px';
        d.textContent = this.dataset.emoji;
        this.replaceWith(d);
      };
    });
    host.querySelectorAll('.dr-skin:not(.locked)').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.draftSkin = parseInt(b.dataset.i, 10) || 0;
        this.renderDraftSkins(h, myTurn, grid);
        const sel = grid.querySelector('.dr-hero-card.sel img');
        if (sel) sel.style.filter = skinFilter(this.draftSkin);
        menuSfx.play('click');
      });
    });
    const sel = grid.querySelector('.dr-hero-card.sel img');
    if (sel) sel.style.filter = skinFilter(this.draftSkin);
  },

  showSelect() {
    this.screen('select');
    const banner = document.getElementById('online-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.innerHTML = net.online ? `🎮 Practice vs AI — logged in as <b>${net.username}</b>` : '🎮 Offline practice vs AI — all skins unlocked';
    }
    const sb = document.getElementById('start-btn');
    if (sb) sb.textContent = 'START PRACTICE';
    buildSelectScreen();
  },
};

let st_phaseIsBan = false;
const menuSfx = new SFX();
window.Flow = Flow;

/* boot bindings */
(function () {
  // the splash is the entry screen — ALWAYS start its loader (this was
  // never called on real page loads; only in tests → stuck splash bug)
  try { Flow.startSplash(); } catch (e) { console.error('splash failed', e); }
  document.getElementById('menu-play').addEventListener('click', () => Flow.showModes());
  document.getElementById('menu-practice').addEventListener('click', () => Flow.showSelect());
  document.getElementById('menu-logout').addEventListener('click', () => { localStorage.removeItem('aa_token'); location.reload(); });
  document.getElementById('mode-back').addEventListener('click', () => Flow.showMenu());
  document.querySelectorAll('.mode-card').forEach(c => {
    c.addEventListener('click', () => {
      const mode = c.dataset.mode;
      if (mode !== 'practice' && !net.online) { alert('Log in to play online modes 🙂 (Practice works instantly)'); return; }
      Flow.pickMode(mode);
    });
  });
  document.getElementById('mm-cancel').addEventListener('click', () => Flow.cancelMM());
})();
