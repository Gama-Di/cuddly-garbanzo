/* ============================================================
 * AETHER ARENA — net.js (browser)
 * Online client: auth UI glue, WebSocket, input sending, and
 * feeding server snapshots into a mirror-mode Game for rendering.
 * ============================================================ */
'use strict';

class Net {
  constructor() {
    this.token = localStorage.getItem('aa_token') || null;
    this.username = null;
    this.online = false;      // authenticated & socket open
    this.ws = null;
    this.game = null;         // mirror game
    this.inQueue = false;
    this.queueTimer = null;
    this.lastSend = 0;
    this.lastMoveSent = null;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    this.ws = ws;
    ws.onopen = () => {
      if (!this.token) { this.onAuthFail(); return; }
      ws.send(JSON.stringify({ t: 'hello', token: this.token }));
    };
    ws.onmessage = (ev) => {
      let m = null;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      this.onMsg(m);
    };
    ws.onclose = () => { this.onDisconnect(); };
    ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  async refreshMe() {
    if (!this.token) return;
    try {
      const r = await fetch('/api/me?token=' + encodeURIComponent(this.token));
      const j = await r.json();
      if (j.ok) {
        this.me = { gems: j.gems, elo: j.elo, skins: j.skins || {}, stats: j.stats, history: j.history || [] };
        this.username = j.username;
        if (this.online && typeof UI !== 'undefined') UI.updateBanner();
        // daily login reward
        if (this.online) {
          try {
            const d = await fetch('/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.token }) });
            const dj = await d.json();
            if (dj.ok && dj.granted) {
              this.me.gems = dj.gems;
              UI.toast('🎁 Daily reward: +100 gems!');
              UI.updateBanner();
            }
          } catch (e) {}
        }
      }
    } catch (e) { /* offline */ }
  }

  onMsg(m) {
    switch (m.t) {
      case 'hello':
        if (m.ok) {
          this.online = true;
          this.username = m.username;
          document.body.classList.add('online');
          if (typeof Flow !== 'undefined' && Flow.el('splash-screen').classList.contains('on')) {
            // still on splash — menu appears after TAP TO START
          } else {
            Flow.showMenu();
          }
          this.refreshMe();
        } else this.onAuthFail();
        break;
      case 'draft':
        if (typeof Flow !== 'undefined') {
          if (Flow.draftScreen !== true) { Flow.draftScreen = true; Flow.showDraft(m); }
          else Flow.renderDraft(m);
          if (m.phase === 'done') Flow.draftScreen = false;
        }
        break;
      case 'chat':
        if (typeof currentGame !== 'undefined' && currentGame && currentGame.onChat) currentGame.onChat(m.from, m.team, m.txt);
        break;
      case 'ping':
        if (typeof currentGame !== 'undefined' && currentGame && currentGame.onPing) currentGame.onPing(m.from, m.team, m.kind, m.x, m.y);
        break;
      case 'queued':
        this.inQueue = true;
        UI.setQueueStatus(true, m.pos);
        break;
      case 'qcount':
        UI.setQueueStatus(true, m.n);
        break;
      case 'start':
        this.inQueue = false;
        UI.setQueueStatus(false);
        UI.enterOnlineGame(m);
        break;
      case 'snap':
        if (this.game && this.game.mode === 'mirror') this.game.applySnapshot(m);
        break;
      case 'end':
        this.lastEnd = m;
        this.inQueue = false;
        if (m.gems !== undefined) {
          this.me = this.me || {};
          this.me.gems = m.gems;
          if (m.elo !== undefined) this.me.elo = m.elo;
        }
        break;
      case 'err':
        UI.toast(m.error || 'error');
        break;
      case 'vote':
        UI.toast(`🏳️ Surrender vote ${m.yes}/${m.need} — tap 🏳️ to vote`);
        break;
      case 'invite':
        if (confirm(`${m.from} invited you to a party. Accept?`)) this.acceptInvite(m.from);
        break;
      case 'party':
        this.partyWith = m.with;
        UI.toast('🎉 Party with ' + m.with + ' — queue together!');
        UI.updateBanner();
        break;
      case 'partyEnd':
        this.partyWith = null;
        UI.toast('Party ended');
        UI.updateBanner();
        break;
      case 'unqueued':
        this.inQueue = false;
        UI.setQueueStatus(false);
        break;
    }
  }

  onAuthFail() {
    this.online = false;
    this.helloFailed = true;
    if (typeof Flow === 'undefined') UI.showAuth();
  }
  onDisconnect() {
    document.body.classList.remove('online');
    if (this.online && this.game) {
      this.online = false;
      UI.toast('⚠️ Connection lost');
      UI.showSelect(false);
      if (this.game && this.game.state === 'play') {
        // keep watching the (now frozen) game briefly, then bounce to menu
      }
    }
    this.online = false;
    this.inQueue = false;
  }

  queue(heroId, mode) { this.send({ t: 'queue', heroId, mode: mode || 'ranked' }); }
  unqueue() { this.inQueue = false; this.send({ t: 'unqueue' }); UI.setQueueStatus(false); }

  /* called by mirror game every frame */
  tick() {
    const now = performance.now();
    if (now - this.lastSend < 100) return;
    this.lastSend = now;
    const g = this.game;
    if (!g || !g.player) return;
    const mv = g.player.moveDir;
    const key = mv ? mv.x.toFixed(2) + ',' + mv.y.toFixed(2) : '0';
    if (key !== this.lastMoveSent) {
      this.lastMoveSent = key;
      this.send({ t: 'i', m: mv ? [+mv.x.toFixed(2), +mv.y.toFixed(2)] : 0 });
    }
  }
  sendCast(i, aim) {
    if (aim) this.send({ t: 'cast', s: i, aim: [Math.round(aim.x), Math.round(aim.y)] });
    else this.send({ t: 'cast', s: i });
  }
  sendBuy(id) { this.send({ t: 'buy', id }); }
  sendSkillUp(i) { this.send({ t: 'skillup', i }); }
  sendWard() { this.send({ t: 'ward' }); }
  sendEmote(kind) { this.send({ t: 'ping', kind: 'emote_' + kind }); }
  sendActive(id, aim) { this.send({ t: 'active', id, aim: aim ? [Math.round(aim.x), Math.round(aim.y)] : undefined }); }
  sendSurrender() { this.send({ t: 'surrender' }); }
  sendInvite(name) { this.send({ t: 'invite', to: name }); }
  acceptInvite(name) { this.send({ t: 'inviteYes', to: name }); }
  leaveParty() { this.send({ t: 'leaveParty' }); }
  sendRecall() { this.send({ t: 'recall' }); }
  sendLock() { this.send({ t: 'lock' }); }
}

/* ================================================================
 * UI glue: auth screen, lobby banner, mode switching
 * ================================================================ */
const net = new Net();
window.net = net;

const UI = {
  el(id) { return document.getElementById(id); },
  screen(id) {
    for (const s of ['auth-screen', 'select-screen', 'game-screen', 'end-screen']) {
      this.el(s).classList.toggle('on', s === id || (id === 'select' && s === 'select-screen') || (id === 'auth' && s === 'auth-screen'));
    }
  },

  /* ---------- auth ---------- */
  authMode: 'login',
  initAuth() {
    const tabL = this.el('tab-login'), tabR = this.el('tab-register');
    const setMode = (mode) => {
      this.authMode = mode;
      tabL.classList.toggle('on', mode === 'login');
      tabR.classList.toggle('on', mode === 'register');
      this.el('auth-go').textContent = mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT';
      this.el('auth-status').textContent = '';
    };
    tabL.addEventListener('click', () => setMode('login'));
    tabR.addEventListener('click', () => setMode('register'));
    this.el('auth-go').addEventListener('click', () => this.submitAuth());
    this.el('auth-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitAuth(); });
    this.el('auth-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.el('auth-pass').focus(); });
    this.el('auth-practice').addEventListener('click', () => {
      this.offline = true;
      this.showSelect(false);
    });
    // online-only: chat & pings
    const chatBar = this.el('chatbar');
    const chatInput = this.el('chat-input');
    const toggleChat = () => {
      chatBar.classList.toggle('on');
      if (chatBar.classList.contains('on')) chatInput.focus();
    };
    this.el('btn-chat').addEventListener('click', toggleChat);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const txt = chatInput.value.trim();
        if (txt) net.send({ t: 'chat', txt });
        chatInput.value = '';
        chatBar.classList.remove('on');
      }
      if (e.key === 'Escape') chatBar.classList.remove('on');
      e.stopPropagation();
    });
    this.el('btn-ping-atk').addEventListener('click', () => net.send({ t: 'ping', kind: 'attack' }));
    this.el('btn-ping-rt').addEventListener('click', () => net.send({ t: 'ping', kind: 'retreat' }));
  },
  async submitAuth() {
    const username = this.el('auth-user').value.trim();
    const password = this.el('auth-pass').value;
    const status = this.el('auth-status');
    status.textContent = '…';
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: this.authMode, username, password }),
      });
      const j = await r.json();
      if (!j.ok) { status.textContent = '❌ ' + j.error; return; }
      net.token = j.token;
      net.username = j.username;
      localStorage.setItem('aa_token', j.token);
      status.textContent = '✅ Welcome, ' + j.username + '!';
      net.online = true;
      document.body.classList.add('online');
      net.connect();
      if (typeof Flow !== 'undefined') Flow.showMenu();
    } catch (e) {
      status.textContent = '❌ Server unreachable';
    }
  },

  updateBanner() {
    const banner = this.el('online-banner');
    if (!banner) return;
    if (net.online) {
      const me = net.me || {};
      const st = me.stats || {};
      const elo = me.elo !== undefined ? me.elo : 1000;
      const gems = me.gems !== undefined ? me.gems : 0;
      banner.innerHTML = `🟢 <b>${net.username}</b> · 🏅 ${elo} · ${st.wins || 0}W ${st.losses || 0}L · 💎 ${gems} <a href="#" id="logout-link">log out</a>`;
      const lo = this.el('logout-link');
      if (lo) lo.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('aa_token');
        location.reload();
      });
    } else {
      banner.innerHTML = '🎮 Offline practice vs AI — all skins unlocked';
    }
  },

  /* ---------- select screen / lobby ---------- */
  showSelect(online, username, stats) {
    this.screen('select');
    this.offline = !online;
    this.el('online-banner').style.display = 'block';
    this.updateBanner();
    this.el('start-btn').textContent = online ? 'FIND MATCH · 5v5' : 'START PRACTICE';
    buildSelectScreen();
    this.setQueueStatus(false);
  },
  showAuth() {
    this.screen('auth');
  },
  setQueueStatus(inQ, n) {
    const qs = this.el('queue-status');
    const cancel = this.el('cancel-queue');
    if (inQ) {
      qs.textContent = `🔎 In queue (${n || 1} waiting) — bots fill empty slots, match starts soon…`;
      qs.style.display = 'block';
      cancel.style.display = 'inline-block';
    } else {
      qs.style.display = 'none';
      cancel.style.display = 'none';
    }
  },
  toast(msg) {
    const qs = this.el('queue-status');
    qs.textContent = msg;
    qs.style.display = 'block';
    setTimeout(() => { if (!net.inQueue) qs.style.display = 'none'; }, 4000);
  },

  /* ---------- match ---------- */
  enterOnlineGame(m) {
    document.getElementById('select-screen').classList.remove('on');
    document.getElementById('end-screen').classList.remove('on');
    document.getElementById('game-screen').classList.add('on');
    document.getElementById('killfeed').innerHTML = '';
    const g = new Game(m.heroId, false, { mode: 'mirror', myHeroId: m.heroId, youId: m.youUnitId });
    g.net = net;
    net.game = g;
    net.lastMoveSent = null;
    currentGame = g;
    g.sfx.resume();
    // roster toast
    const names = m.roster.filter(r => r.team === 0).map(r => r.name).join(', ');
    setTimeout(() => g.announce('⚔️ MATCH FOUND', `Your team: ${names}`, 3), 200);
  },
};

/* hook the start button — select screen is practice-only now */
window.startBattle = function () {
  startGame(selectedHero);
};
window.playAgain = function () {
  if (net.online) Flow.showMenu();
  else startGame(selectedHero);
};

/* boot */
UI.initAuth();
if (net.token) {
  net.connect();
  // splash handles the transition once hello resolves
  const waitHello = setInterval(() => {
    if (net.online || net.helloFailed) {
      clearInterval(waitHello);
      if (net.online) Flow.showMenu();
      else if (!net.token) Flow.screen('auth');
      else if (net.helloFailed) Flow.screen('auth');
    }
  }, 300);
}
