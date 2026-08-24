#!/usr/bin/env node
/* ============================================================
 * AETHER ARENA — game server (zero dependencies)
 *   - HTTP: static files + JSON auth API (register/login)
 *   - WebSocket (RFC 6455, hand-rolled): realtime clients
 *   - Matchmaking queue → 5v5 matches, bots fill empty slots
 *   - Authoritative simulation: reuses js/game.js headless
 *
 * Run:  node server.js   (PORT env optional, default 8000)
 * ============================================================ */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* load the shared game engine (shared context, like the sim harness) */
const vm = require('vm');
for (const f of ['util.js', 'heroes.js', 'heroes2.js', 'game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8'), { filename: f });
}
const { Game, HEROES, ITEMS, heroById, SKINS, SKIN_PRICES } = globalThis;
const zlib = require('zlib');

/* fast-end mode for automated tests */
if (process.env.FAST_END) { globalThis.CFG.OVERTIME = 15; globalThis.CFG.DECAY = 0.05; }

const GEM_PACKS = [
  { id: 'p1', gems: 500, usd: 1.99 },
  { id: 'p2', gems: 1200, usd: 4.49 },
  { id: 'p3', gems: 3000, usd: 9.99 },
];
const DEV_GEMS = process.env.DEV_GEMS === '1';   // checkout stub grants gems (testing only!)
const SEASON = 1;
const SURRENDER_AT = parseInt(process.env.SURRENDER_AT || '300', 10);
function displayName(username) {
  const rec = users[username];
  return rec && rec.guild ? `[${rec.guild}] ${username}` : username;
}
function onlineUsernames() {
  const s = new Set();
  for (const c of conns) if (c.alive && c.user) s.add(c.user.username);
  return s;
}

const PORT = parseInt(process.env.PORT || '8000', 10);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GUILDS_FILE = path.join(DATA_DIR, 'guilds.json');
let guilds = {};
try { guilds = JSON.parse(fs.readFileSync(GUILDS_FILE, 'utf8')); } catch (e) { guilds = {} }
function saveGuilds() { try { fs.writeFileSync(GUILDS_FILE, JSON.stringify(guilds, null, 1)); } catch (e) {} }
const QUEUE_FILL_MS = parseInt(process.env.QF_MS || '20000', 10);   // solo/short-handed queues get bots after this
const TICK_MS = 33;            // ~30 fps sim
const SNAP_EVERY = 3;          // snapshot every 3 ticks (~10 Hz)

/* ================================================================
 * Accounts
 * ================================================================ */
const sessions = new Map();    // token -> username
let users = {};                // username -> {salt, hash, stats}

function loadUsers() {
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch (e) { users = {}; }
  // migrate: ensure economy fields
  for (const name of Object.keys(users)) {
    const u = users[name];
    if (u.gems === undefined) u.gems = 500;
    if (!u.elo) u.elo = 1000;
    if (!u.skins) u.skins = {};          // heroId -> [ownedSkinIdx, ...]
    if (!u.friends) u.friends = [];
    if (!u.bp) u.bp = { season: SEASON, xp: 0, tier: 0, premium: false };
    if (u.guild && !guilds[u.guild]) u.guild = null;
  }
}
function saveUsers() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) { console.error('saveUsers failed:', e.message); }
}
function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function validName(n) {
  return typeof n === 'string' && /^[A-Za-z0-9_\-]{3,16}$/.test(n);
}
function register(username, password) {
  if (!validName(username)) return { ok: false, error: 'Username: 3-16 letters/numbers/_-' };
  if (typeof password !== 'string' || password.length < 4 || password.length > 72) return { ok: false, error: 'Password must be 4-72 characters' };
  if (users[username]) return { ok: false, error: 'Username already taken' };
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = {
    salt, hash: hashPw(password, salt),
    created: Date.now(),
    gems: 500, elo: 1000, skins: {}, friends: [], guild: null,
    bp: { season: SEASON, xp: 0, tier: 0, premium: false },
    stats: { games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, towers: 0 },
  };
  saveUsers();
  return issueToken(username);
}
function login(username, password) {
  const u = users[username];
  if (!u) return { ok: false, error: 'No such user' };
  const h = hashPw(password || '', u.salt);
  const a = Buffer.from(h), b = Buffer.from(u.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'Wrong password' };
  return issueToken(username);
}
function issueToken(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, username);
  return { ok: true, token, username, stats: users[username].stats };
}
function userForToken(token) {
  if (!token) return null;
  const uname = sessions.get(token);
  return uname && users[uname] ? { username: uname, stats: users[uname].stats } : null;
}

/* ================================================================
 * WebSocket (RFC 6455) — minimal server implementation
 * ================================================================ */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.user = null;          // {username, stats}
    this.alive = true;
    this.match = null;
    this.queueEntry = null;
    this.msgCount = 0;
    this.msgBudget = 90;       // per-second message budget (input rate limit)
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => { try { socket.destroy(); } catch (e) {} });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    let frame;
    while ((frame = this.readFrame()) !== null) {
      this.handleFrame(frame);
      if (!this.alive) return;
    }
  }
  readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      len = Number(b.readBigUInt64BE(2)); off = 10;
    }
    if (len > 1 << 20) { this.close(); return null; }   // 1MB cap
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return null;
    let payload = b.subarray(off + maskLen, off + maskLen + len);
    if (masked) {
      const mask = b.subarray(off, off + 4);
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
      payload = out;
    }
    this.buf = b.subarray(off + maskLen + len);
    return { fin, opcode, payload };
  }
  handleFrame(f) {
    if (f.opcode === 0x8) { this.close(); return; }          // close
    if (f.opcode === 0x9) { this.sendRaw(0xA, f.payload); return; } // ping → pong
    if (f.opcode === 0xA) return;                            // pong
    if (f.opcode === 0x1) {                                   // text
      this.msgCount++;
      if (this.msgCount > this.msgBudget) return;             // rate limit
      let msg = null;
      try { msg = JSON.parse(f.payload.toString('utf8')); } catch (e) { return; }
      try { onMessage(this, msg); } catch (e) { console.error('msg handler error:', e.message); }
    }
  }
  sendRaw(opcode, payload) {
    if (!this.alive) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode; header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode; header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) { this.alive = false; }
  }
  send(obj) {
    this.sendRaw(0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
  }
  close() {
    this.alive = false;
    try { this.socket.end(); } catch (e) {}
    try { this.socket.destroy(); } catch (e) {}
  }
  onClose() {
    this.alive = false;
    if (this.draft) { this.draft.onLeave(this); this.draft = null; }
    if (this.party) leaveParty(this);
    if (this.queueEntry) {
      const entry = this.queueEntry;
      const qi = queue.indexOf(entry);
      if (qi >= 0) queue.splice(qi, 1);
      for (const mm of entry.members) { mm.conn.queueEntry = null; if (mm.conn !== this) mm.conn.send({ t: 'unqueued' }); }
    }
    if (this.match) this.match.onLeave(this);
  }
}

/* ================================================================
 * Matchmaking + matches
 * ================================================================ */
const queue = [];              // {conn, heroId, since}
const matches = new Set();
const activeByUser = new Map();   // username -> Match (for reconnect)
let matchSeq = 1;

function onMessage(conn, m) {
  if (!m || typeof m.t !== 'string') return;
  conn.lastMsgT = Date.now();
  if (conn.match) {
    const h = conn.match.heroByConn.get(conn);
    if (h && h.brain && h.afkByAI) {   // player came back from AFK
      h.brain = null; h.afkByAI = false;
      h.netInput = { move: null }; h.moveDir = null;
    }
  }
  switch (m.t) {
    case 'hello': {
      const u = userForToken(m.token);
      if (!u) { conn.send({ t: 'hello', ok: false }); return; }
      conn.user = u;
      conn.send({ t: 'hello', ok: true, username: u.username, stats: u.stats, queue: queue.length });
      // reconnect to an ongoing match
      const am = activeByUser.get(u.username);
      if (am && !am.done && am.game && am.game.state === 'play') {
        const hero = am.heroByConn && Array.from(am.heroByConn.values()).find(h => h && h.name === u.username);
        if (hero) {
          am.conns.add(conn);
          conn.match = am;
          am.heroByConn.set(conn, hero);
          if (hero.brain) { hero.brain = null; hero.netInput = { move: null }; hero.moveDir = null; }  // take back from AI
          const roster = am.roster || [];
          conn.send({ t: 'start', roster, youName: u.username, youUnitId: hero.id, heroId: hero.def.id, reconnect: true });
          am.flush();
          console.log(`[match ${am.id}] ${u.username} reconnected`);
        }
      }
      break;
    }
    case 'queue': {
      if (!conn.user || conn.match) return;
      const def = HEROES.find(h => h.id === m.heroId);
      if (!def) return;
      conn.chosenHero = def.id;
      conn.queueMode = (m.mode === 'casual') ? 'casual' : 'ranked';
      if (conn.queueEntry) return;
      if (conn.party) {
        const other = Array.from(conns).find(c => c.alive && c.user && c.user.username === conn.party);
        if (!other || other.queueEntry) return;
        const otherDef = (other.chosenHero && HEROES.find(h => h.id === other.chosenHero)) || HEROES[Math.floor(Math.random() * HEROES.length)];
        const entry = { members: [{ conn, heroId: def.id }, { conn: other, heroId: otherDef.id }], since: Date.now(), mode: conn.queueMode };
        conn.queueEntry = entry; other.queueEntry = entry;
        queue.push(entry);
        conn.send({ t: 'queued', pos: queue.length });
        other.send({ t: 'queued', pos: queue.length });
      } else {
        const entry = { members: [{ conn, heroId: def.id }], since: Date.now(), mode: conn.queueMode };
        conn.queueEntry = entry;
        queue.push(entry);
        conn.send({ t: 'queued', pos: queue.length });
      }
      broadcastQueueCount();
      break;
    }
    case 'unqueue': {
      if (conn.queueEntry) {
        const entry = conn.queueEntry;
        const qi = queue.indexOf(entry);
        if (qi >= 0) queue.splice(qi, 1);
        for (const mm of entry.members) { mm.conn.queueEntry = null; mm.conn.send({ t: 'unqueued' }); }
      }
      break;
    }
    case 'i': {   // movement
      if (conn.match) conn.match.onMove(conn, m.m);
      break;
    }
    case 'cast': {
      if (conn.match) conn.match.onCast(conn, m.s, m.aim);
      break;
    }
    case 'recall': {
      if (conn.match) conn.match.onRecall(conn);
      break;
    }
    case 'buy': {
      if (conn.match) conn.match.onBuy(conn, m.id);
      break;
    }
    case 'lock': {
      if (conn.match) conn.match.onLock(conn);
      break;
    }
    case 'chat': {
      if (!conn.match || !conn.user) return;
      const now = Date.now();
      if (now - (conn.lastChat || 0) < 1200) return;   // rate limit
      conn.lastChat = now;
      const txt = String(m.txt || '').replace(/[<>]/g, '').slice(0, 120).trim();
      if (!txt) return;
      const h = conn.match.heroByConn.get(conn);
      const team = h ? h.team : 0;
      conn.match.broadcast({ t: 'chat', from: conn.user.username, team, txt });
      break;
    }
    case 'draftBan':
    case 'draftPick': {
      if (conn.draft) { conn.draft.onMsg(conn, m); return; }
      break;
    }
    case 'skillup': {
      if (conn.match) conn.match.onSkillUp(conn, m.i);
      break;
    }
    case 'ward': {
      if (conn.match) conn.match.onWard(conn);
      break;
    }
    case 'active': {
      if (conn.match) conn.match.onItemActive(conn, m.id, m.aim);
      break;
    }
    case 'surrender': {
      if (conn.match) conn.match.onSurrender(conn);
      break;
    }
    case 'invite': {
      if (!conn.user) return;
      const target = Array.from(conns).find(c => c.alive && c.user && c.user.username === m.to && !c.match && !c.queueEntry && !c.party);
      if (!target) { conn.send({ t: 'err', error: 'Player not available' }); return; }
      if (conn.party) { conn.send({ t: 'err', error: 'Already in a party' }); return; }
      target.send({ t: 'invite', from: conn.user.username });
      break;
    }
    case 'inviteYes': {
      const target = Array.from(conns).find(c => c.alive && c.user && c.user.username === m.to && !c.match && !c.queueEntry && !c.party);
      if (!target || !conn.user) return;
      conn.party = target.user.username;
      target.party = conn.user.username;
      conn.send({ t: 'party', with: target.user.username });
      target.send({ t: 'party', with: conn.user.username });
      break;
    }
    case 'leaveParty': {
      leaveParty(conn);
      break;
    }
    case 'ping': {
      if (!conn.match || !conn.user) return;
      const kinds = ['attack', 'retreat', 'group', 'emote_wave', 'emote_laugh', 'emote_tilt', 'emote_heart'];
      const kind = kinds.includes(m.kind) ? m.kind : 'group';
      const h = conn.match.heroByConn.get(conn);
      const team = h ? h.team : 0;
      conn.match.broadcast({ t: 'ping', from: conn.user.username, team, kind, x: h ? Math.round(h.x) : 0, y: h ? Math.round(h.y) : 0 });
      break;
    }
  }
}

function leaveParty(conn) {
  if (!conn.party) return;
  const other = Array.from(conns).find(c => c.alive && c.user && c.user.username === conn.party);
  conn.party = null;
  if (other) { other.party = null; other.send({ t: 'partyEnd' }); }
  conn.send({ t: 'partyEnd' });
  // remove from queue if queued as party
  const qi = queue.findIndex(e => e.members.some(mm => mm.conn === conn || (other && mm.conn === other)));
  if (qi >= 0) {
    const entry = queue.splice(qi, 1)[0];
    for (const mm of entry.members) { mm.conn.queueEntry = null; mm.conn.send({ t: 'unqueued' }); }
  }
}

function leaveQueue(conn) {
  if (conn.queueEntry) {
    const entry = conn.queueEntry;
    const i = queue.indexOf(entry);
    if (i >= 0) queue.splice(i, 1);
    for (const mm of entry.members) { mm.conn.queueEntry = null; mm.conn.send({ t: 'unqueued' }); }
  }
  broadcastQueueCount();
}
function broadcastQueueCount() {
  for (const e of queue) for (const mm of e.members) mm.conn.send({ t: 'qcount', n: queue.length });
}

setInterval(() => {
  // message budgets reset
  for (const c of conns) c.msgCount = 0;
  // matchmaking (party-aware, per-mode: groups are never split)
  const now = Date.now();
  if (!queue.length) return;
  const oldest = Math.min(...queue.map(e => e.since));
  const mode = queue.reduce((a, e) => (e.since < a.since ? e : a), queue[0]).mode || 'ranked';
  const sameMode = queue.filter(e => (e.mode || 'ranked') === mode);
  const totalWaiting = sameMode.reduce((a, e) => a + e.members.length, 0);
  if (totalWaiting >= 10 || now - oldest > QUEUE_FILL_MS) {
    const entries = sameMode;
    for (const e of entries) {
      const qi = queue.indexOf(e);
      if (qi >= 0) queue.splice(qi, 1);
    }
    const teams = [[], []];
    entries.sort((a, b) => b.members.length - a.members.length);
    const chosen = [];
    for (const e of entries) {
      let ti = teams[0].length <= teams[1].length ? 0 : 1;
      if (teams[ti].length + e.members.length > 5) ti = 1 - ti;
      if (teams[ti].length + e.members.length > 5) continue;
      for (const mm of e.members) {
        mm.conn.queueEntry = null;
        teams[ti].push({ conn: mm.conn, username: mm.conn.user.username, heroId: mm.heroId, team: ti });
      }
      chosen.push(e);
    }
    for (const e of entries) if (!chosen.includes(e)) queue.push(e);
    const players = teams[0].concat(teams[1]);
    if (players.length) startDraft(players, mode);   // draft → match (bots drafted in)
  }
}, 1000);

function startMatch(players, mode) {
  const m = new Match(players, mode);
  matches.add(m);
  broadcastQueueCount();
}

/* ================================================================
 * Draft phase — bans + snake picks, server-authoritative
 * ================================================================ */
class Draft {
  constructor(players, mode, done) {
    this.players = players;         // [{conn, username, team}]
    this.mode = mode;               // 'ranked' | 'casual'
    this.doneCb = done;
    this.teams = [[], []];          // slots: {name, conn|null(bot), bot, heroId}
    const usedNames = new Set();
    const botNames = AI_NAMES.slice().sort(() => Math.random() - 0.5);
    for (const p of players) {
      this.teams[p.team].push({ name: p.username, conn: p.conn, bot: false, heroId: null });
      usedNames.add(p.username);
    }
    for (let t = 0; t < 2; t++) {
      while (this.teams[t].length < 5) {
        let n = botNames.pop() || ('Bot' + Math.floor(Math.random() * 999));
        this.teams[t].push({ name: n, conn: null, bot: true, heroId: null });
      }
    }
    // sequence: bans (ranked only) then snake picks
    this.seq = [];
    if (mode === 'ranked') {
      this.seq.push({ type: 'ban', team: 0 }, { type: 'ban', team: 1 });
    }
    const snake = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
    for (const t of snake) this.seq.push({ type: 'pick', team: t });
    this.step = 0;
    this.bans = [[], []];
    this.banIdx = [0, 0];
    this.pickIdx = [0, 0];
    this.timer = setInterval(() => this.tick(), 200);
    this.turnAt = Date.now();
    this.broadcast();
    this.maybeBotAct();
  }

  /* ML-style: bans are global; a hero can't be picked twice by the SAME team,
   * but mirror matchups across teams are allowed (pool math works with 10 heroes) */
  available(team) {
    const used = new Set(this.bans[0].concat(this.bans[1]));
    if (team !== undefined) {
      for (const s of this.teams[team]) if (s.heroId) used.add(s.heroId);
    } else {
      for (const t of [0, 1]) for (const s of this.teams[t]) if (s.heroId) used.add(s.heroId);
    }
    return HEROES.filter(h => !used.has(h.id)).map(h => h.id);
  }
  currentTurn() {
    if (this.step >= this.seq.length) return null;
    const s = this.seq[this.step];
    const idx = s.type === 'ban' ? this.banIdx[s.team] : this.pickIdx[s.team];
    // actor for bans: first human on team (or bot slot); picks: slot idx
    let actor;
    if (s.type === 'ban') {
      actor = this.teams[s.team].find(x => !x.bot) || this.teams[s.team][0];
    } else {
      actor = this.teams[s.team][idx] || this.teams[s.team][0];
    }
    return { ...s, idx, actor };
  }
  stateFor() {
    const turn = this.currentTurn();
    return {
      t: 'draft', mode: this.mode, step: this.step, total: this.seq.length,
      phase: turn ? turn.type : 'done',
      turnTeam: turn ? turn.team : -1,
      actor: turn ? turn.actor.name : null,
      actorIsBot: turn ? turn.actor.bot : true,
      timerEnds: this.turnAt + (this.mode === 'ranked' ? (this.step < 2 ? 14000 : 20000) : 16000),
      bans: this.bans,
      picks: [this.teams[0].map(s => ({ name: s.name, heroId: s.heroId, bot: s.bot })),
              this.teams[1].map(s => ({ name: s.name, heroId: s.heroId, bot: s.bot }))],
      available: this.available(turn ? turn.team : 0),
    };
  }
  broadcast() {
    const st = this.stateFor();
    for (const p of this.players) {
      if (p.conn && p.conn.alive) p.conn.send(Object.assign({}, st, { youName: p.username }));
    }
  }
  botChoose(type, team) {
    const pool = this.available(team);
    if (!pool.length) return HEROES[0].id;
    // role balance for picks
    if (type === 'pick') {
      const turn = this.currentTurn();
      const teamIdx = turn ? turn.team : team;
      const teamHeroes = this.teams[teamIdx].filter(s => s.heroId).map(id => heroById(id));
      const have = new Set(teamHeroes.map(h => h.role));
      const missing = ['Tank', 'Support', 'Marksman', 'Mage', 'Fighter'].filter(r => !have.has(r));
      const pref = pool.map(heroById).filter(h => missing.includes(h.role));
      const from = (pref.length && Math.random() < 0.75) ? pref : pool.map(heroById);
      return from[Math.floor(Math.random() * from.length)].id;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  apply(type, heroId, byName) {
    const turn = this.currentTurn();
    if (!turn) return false;
    if (byName !== undefined && turn.actor.name !== byName) return false;
    if (!this.available(turn.team).includes(heroId)) return false;
    if (type === 'ban') {
      this.bans[turn.team].push(heroId);
      this.banIdx[turn.team]++;
    } else {
      turn.actor.heroId = heroId;
      this.pickIdx[turn.team]++;
    }
    this.step++;
    this.turnAt = Date.now();
    this.broadcast();
    if (this.step >= this.seq.length) this.complete();
    else this.maybeBotAct();
    return true;
  }
  maybeBotAct() {
    const turn = this.currentTurn();
    if (!turn || !turn.actor.bot) return;
    clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => {
      const t2 = this.currentTurn();
      if (t2 && t2.actor.bot) this.apply(t2.type, this.botChoose(t2.type, t2.team));
    }, 800 + Math.random() * 1400);
  }
  tick() {
    const turn = this.currentTurn();
    if (!turn) return;
    const limit = this.mode === 'ranked' ? (this.step < 2 ? 14000 : 20000) : 16000;
    if (Date.now() - this.turnAt > limit) {
      // timeout: auto action for whoever's turn
      this.apply(turn.type, this.botChoose(turn.type, turn.team));
    }
  }
  complete() {
    clearInterval(this.timer);
    clearTimeout(this.botTimer);
    // fill any heroless slot (safety)
    for (const t of [0, 1]) for (const s of this.teams[t]) {
      if (!s.heroId) s.heroId = this.botChoose('pick', t);
    }
    const st = this.stateFor();
    for (const p of this.players) if (p.conn && p.conn.alive) p.conn.send(st);
    const players = this.players.map(p => {
      const slot = this.teams[p.team].find(s => s.name === p.username);
      return { conn: p.conn, username: p.username, team: p.team, heroId: slot ? slot.heroId : p.heroId };
    });
    const bots = [];
    for (const t of [0, 1]) for (const s of this.teams[t]) if (s.bot) bots.push({ name: s.name, heroId: s.heroId, team: t });
    setTimeout(() => this.doneCb(players, bots), 1200);   // beat for "DRAFT COMPLETE"
  }
  onMsg(conn, m) {
    if (m.t === 'draftBan' || m.t === 'draftPick') {
      if (!conn.user) return;
      const heroId = String(m.heroId || '');
      this.apply(m.t === 'draftBan' ? 'ban' : 'pick', heroId, conn.user.username);
    }
  }
  onLeave(conn) {
    // slot becomes a bot
    for (const t of [0, 1]) for (const s of this.teams[t]) {
      if (s.conn === conn) { s.bot = true; s.conn = null; }
    }
    this.players = this.players.filter(p => p.conn !== conn);
    this.maybeBotAct();
  }
}

const drafts = new Set();
function startDraft(players, mode) {
  const d = new Draft(players, mode, (ps, bots) => {
    drafts.delete(d);
    for (const p of players) if (p.conn) p.conn.draft = null;
    startMatch(ps, mode, bots);
  });
  drafts.add(d);
  for (const p of players) if (p.conn) p.conn.draft = d;
}

class Match {
  constructor(players, mode, botRoster) {
    this.mode = mode || 'ranked';
    this.id = matchSeq++;
    this.startedAt = Date.now();
    this.events = [];          // announce/killfeed events to flush
    this.lastFxT = 0;
    this.conns = new Set();
    this.heroByConn = new Map();
    this.done = false;

    const humans = players.map((p, i) => ({ name: displayName(p.username), heroId: p.heroId, team: p.team !== undefined ? p.team : i % 2, username: p.username }));
    const botDefs = (botRoster || []).map(b => ({ name: b.name, heroId: b.heroId, team: b.team }));
    this.game = new Game(null, true, { humans, bots: botDefs });
    this.game.onEvent = (e) => { if (this.events.length < 40) this.events.push(e); };
    for (const p of players) {
      p.conn.match = this;
      this.conns.add(p.conn);
      const hmInfo = humans.find(z => z.username === p.username);
      const hero = this.game.humans.find(h => h.name === hmInfo.name && h.team === hmInfo.team);
      this.heroByConn.set(p.conn, hero || null);
    }
    for (const p of players) activeByUser.set(p.username, this);
    // tell everyone
    const roster = [];
    for (let t = 0; t < 2; t++) {
      for (const h of this.game.heroes[t]) {
        const isBot = h.brain ? 1 : 0;
        const who = humans.find(z => z.name === h.name);
        const uRec = who && users[who.username];
        roster.push({
          name: h.name, heroId: h.def.id, team: t, bot: isBot,
          elo: isBot ? undefined : (uRec ? uRec.elo : 1000),
          guild: uRec && uRec.guild ? uRec.guild : undefined,
        });
      }
    }
    this.roster = roster;
    for (const p of players) {
      const myHero = this.heroByConn.get(p.conn);
      p.conn.send({ t: 'start', roster, youName: p.username, youUnitId: myHero ? myHero.id : 0, heroId: p.heroId });
    }
    this.tickN = 0;
    this.recSnaps = [];
    this.humanNames = new Set(humans.map(h => h.name));
    for (const p of players) p.conn.lastMsgT = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log(`[match ${this.id}] started: ${humans.map(h => `${h.name}(${h.heroId})`).join(', ')}`);
  }

  broadcast(obj) {
    for (const c of this.conns) c.send(obj);
  }

  heroFor(conn) {
    let h = this.heroByConn.get(conn);
    if (h && h.brain) h = null;   // disconnected hero taken over by AI
    return h;
  }
  onMove(conn, mv) {
    const h = this.heroFor(conn);
    if (!h || !h.netInput) return;
    if (Array.isArray(mv) && mv.length === 2) {
      const x = clamp(+mv[0] || 0, -1, 1), y = clamp(+mv[1] || 0, -1, 1);
      h.netInput.move = (Math.abs(x) + Math.abs(y)) > 0.01 ? [x, y] : null;
    } else h.netInput.move = null;
  }
  onCast(conn, s, aim) {
    const h = this.heroFor(conn);
    if (!h) return;
    const i = [0, 1, 2].includes(s) ? s : -1;
    if (i < 0) return;
    const a = Array.isArray(aim) && aim.length === 2 ? aim : null;
    this.game.castFromNet(h, i, a);
  }
  onRecall(conn) {
    const h = this.heroFor(conn);
    if (h && h.alive) h.startRecall();
  }
  onBuy(conn, id) {
    const h = this.heroFor(conn);
    const it = ITEMS.find(x => x.id === id);
    if (h && it) h.buy(it);
  }
  onLock(conn) {
    const h = this.heroFor(conn);
    if (h) this.game.cycleLockFor(h);
  }
  onSkillUp(conn, i) {
    const h = this.heroFor(conn);
    if (h && [0, 1, 2, 3].includes(i)) h.allocate(i, this.game);
  }
  onWard(conn) {
    const h = this.heroFor(conn);
    if (h) this.game.placeWard(h);
  }
  onItemActive(conn, id, aim) {
    const h = this.heroFor(conn);
    if (h && typeof id === 'string') this.game.useItemActive(h, id, Array.isArray(aim) ? { x: aim[0], y: aim[1] } : null);
  }
  onSurrender(conn) {
    const g = this.game;
    if (!conn.user || g.state !== 'play' || g.time < SURRENDER_AT) return;
    const h = this.heroByConn.get(conn);
    if (!h) return;
    const team = h.team;
    if (this.surrenderDone) return;
    this.surrender = this.surrender || {};
    this.surrender[team] = this.surrender[team] || { votes: new Set(), expires: Date.now() + 30000 };
    const S = this.surrender[team];
    S.votes.add(conn.user.username);
    // humans on this team still connected
    const teamHumans = [];
    for (const c of this.conns) {
      const hh = this.heroByConn.get(c);
      if (hh && hh.team === team && c.user) teamHumans.push({ conn: c, hero: hh, name: c.user.username });
    }
    // bots vote yes when clearly losing
    let botYes = 0, botNo = 0;
    for (const b of this.game.heroes[team]) {
      if (b.brain && b.netInput === null && !this.humanNames.has(b.name)) {
        const losing = (g.kills[team] - g.kills[1 - team]) <= -6 || (g.towersDownN[team] - g.towersDownN[1 - team]) >= 3;
        if (losing) botYes++; else botNo++;
      }
    }
    const need = Math.max(1, Math.ceil((teamHumans.length + botYes + botNo) * 0.6));
    const yes = S.votes.size + botYes;
    this.broadcast({ t: 'vote', team, from: conn.user.username, yes, need });
    if (yes >= need) {
      this.surrenderDone = true;
      g.announce('🏳️ SURRENDER', (team === 0 ? 'BLUE' : 'RED') + ' team has surrendered', 3);
      g.endGame(1 - team);
    }
  }
  checkAFK() {
    const now = Date.now();
    for (const conn of this.conns) {
      const h = this.heroByConn.get(conn);
      if (!h || !h.alive) continue;
      if (now - (conn.lastMsgT || now) > 75000 && !h.brain) {
        h.afkByAI = true;
        h.brain = new globalThis.Brain(this.game, h, 'lane', h.humanLaneIdx !== undefined ? h.humanLaneIdx : 1, 0.6);
        h.netInput = null; h.moveDir = null;
        this.game.announce('⏳ AFK', (h.name) + ' is idle — bot took over', 2.5);
      }
    }
  }
  onLeave(conn) {
    this.conns.delete(conn);
    conn.match = null;
    const h = this.heroByConn.get(conn);
    if (h && !h.brain) {
      // AI takes over the leaver's hero
      h.brain = new globalThis.Brain(this.game, h, 'lane', h.humanLaneIdx !== undefined ? h.humanLaneIdx : 1, 0.6);
      h.netInput = null;
      h.moveDir = null;
    }
    if (this.conns.size === 0 && !this.done) {
      // everyone left — discard quietly
      this.finish(false);
    }
  }

  tick() {
    if (this.tickN % 150 === 0) this.checkAFK();
    try {
      this.game.update(TICK_MS / 1000);
    } catch (e) {
      console.error(`[match ${this.id}] sim error:`, e);
      this.finish(false);
      return;
    }
    this.tickN++;
    if (this.tickN % SNAP_EVERY === 0 || this.game.state === 'end') this.flush();
    if (this.game.state === 'end' && !this.done) this.finish(true);
  }

  flush() {
    const g = this.game;
    const snap = this.buildSnapshot();
    // record replay (shared snapshot, no personal data)
    this.recSnaps.push(snap);
    if (this.recSnaps.length > 12000) this.recSnaps.shift();
    // per-team visibility rows (40 ints of 40 bits)
    const visRows = [0, 1].map(t => {
      const rows = new Array(40).fill(0);
      const gr = g.vis[t];
      for (let r = 0; r < 40; r++) {
        let v = 0;
        for (let c = 0; c < 40; c++) if (gr[r * 40 + c]) v |= (1 << c);
        rows[r] = v;
      }
      return rows;
    });
    // per-team visible unit id sets (fog of war filtering)
    const visIds = [new Set(), new Set()];
    for (const u of g.units) {
      for (const t of [0, 1]) {
        if (u.team === t) continue;
        if (g.unitVisibleTo(u, t)) visIds[t].add(u.id);
      }
    }
    for (const conn of this.conns) {
      const h = this.heroByConn.get(conn);
      if (!h) { conn.send(snap); continue; }
      const team = h.team;
      const ev = snap.ev.filter(e => {
        if (e.type === 'ann' || e.type === 'kf') return true;
        return g.cellVisible(team, e.x || 0, e.y || 0);
      });
      conn.send(Object.assign({}, snap, {
        u: snap.u.filter(row => {
          const un = g.units.find(z => z.id === row.i);
          if (!un) return true;
          if (un.team === team) return true;
          if (un.team === 2) return g.cellVisible(team, un.x, un.y);
          return visIds[team].has(row.i);
        }),
        p: snap.p.filter(pr => g.cellVisible(team, pr.x, pr.y)),
        ev,
        vis: visRows[team],
        me: {
          cd: h.cds.map(c => +c.toFixed(1)),
          sp: h.skillPoints, sv: h.skillLv, wc: +Math.max(0, h.wardCdT || 0).toFixed(1),
          mn: Math.round(h.mana), mm: Math.round(h.maxMana),
          g: Math.floor(h.gold), ge: Math.floor(h.goldEarned), dm: Math.round(h.dmgDealt),
          k: h.kills, d: h.deaths, as: h.assists,
          it: h.items, lk: h.lockTarget ? h.lockTarget.id : 0,
          rc: +h.recallT.toFixed(1),
          ac: h.activeCds || {},
        },
      }));
    }
    this.events.length = 0;
    this.lastFxT = g.time;
  }

  buildSnapshot() {
    const g = this.game;
    const u = [];
    for (const un of g.units) {
      const base = { i: un.id, k: kindCode(un), tm: un.team, x: Math.round(un.x), y: Math.round(un.y), r: Math.round(un.r), h: Math.max(0, Math.round(un.hp)), m: Math.round(un.maxHp), a: un.alive ? 1 : 0 };
      if (un.kind === 'hero') {
        base.d = un.def.id; base.n = un.name; base.l = un.level; base.f = Math.round(un.facing * 100);
        base.kd = un.kills; base.dd = un.deaths; base.ad = un.assists; base.ge = Math.floor(un.goldEarned);
        if (un.shieldVal > 1) base.sh = Math.round(un.shieldVal);
        if (un.stunT > 0) base.st = 1;
        if (un.slowT > 0) base.sl = 1;
        if (un.buffRedT > 0) base.rb = 1;
        if (!un.alive) base.rs = Math.max(0, Math.round(un.respT));
      } else if (un.kind === 'minion') {
        base.ty = un.type === 'melee' ? 0 : un.type === 'ranged' ? 1 : 2;
      } else if (un.kind === 'tower') {
        base.iv = un.invuln ? 1 : 0; base.ti = un.tier;
      } else if (un.kind === 'monster') {
        base.mk = un.monKind;
      }
      u.push(base);
    }
    const p = g.projectiles.map(pr => {
      const o = { x: Math.round(pr.x), y: Math.round(pr.y), c: pr.color, r: pr.r };
      if (pr.homing && pr.tgt) { o.tx = Math.round(pr.tgt.x); o.ty = Math.round(pr.tgt.y - 10); }
      else { o.dx = +(pr.dx || 0).toFixed(2); o.dy = +(pr.dy || 0).toFixed(2); }
      return o;
    });
    // fx events born since last flush
    let fxEv = [];
    let textCount = 0;
    for (const e of g.fx.list) {
      const birth = g.time - e.t;
      if (birth < this.lastFxT - 0.02) continue;
      let ev = null;
      if (e.type === 'ring') ev = { type: 'ring', x: Math.round(e.x), y: Math.round(e.y), r: Math.round(e.r), c: e.color };
      else if (e.type === 'slash') ev = { type: 'slash', x: Math.round(e.x), y: Math.round(e.y), r: Math.round(e.r), c: e.color, tm: 0 };
      else if (e.type === 'dash') ev = { type: 'dash', x0: Math.round(e.x0), y0: Math.round(e.y0), x1: Math.round(e.x1), y1: Math.round(e.y1), c: e.color };
      else if (e.type === 'text' && textCount < 25) { ev = { type: 'text', x: Math.round(e.x), y: Math.round(e.y), txt: String(e.txt).slice(0, 24), c: e.color }; textCount++; }
      else if (e.type === 'telegraph') ev = { type: 'telegraph', x: Math.round(e.x), y: Math.round(e.y), r: Math.round(e.r), d: +e.dur.toFixed(2) };
      else if (e.type === 'burst') ev = { type: 'burst', x: Math.round(e.x), y: Math.round(e.y), n: Math.min(e.n || 6, 16), c: e.color };
      else if (e.type === 'death') ev = { type: 'death', x: Math.round(e.x), y: Math.round(e.y), hid: e.hid, tm: e.tm };
      if (ev) fxEv.push(ev);
      if (fxEv.length >= 70) break;
    }
    const tw = t => g.towersAll[t].filter(x => x.alive).length;
    return {
      t: 'snap', tm: +g.time.toFixed(2),
      k: g.kills, tw: [tw(0), tw(1)],
      st: g.state, w: g.winner,
      u, p, ev: this.events.concat(fxEv),
    };
  }

  finish(countStats) {
    if (this.done) return;
    this.done = true;
    clearInterval(this.timer);
    matches.delete(this);
    for (const [name, m] of Array.from(activeByUser.entries())) if (m === this) activeByUser.delete(name);
    const g = this.game;
    // persist replay
    if (this.recSnaps && this.recSnaps.length > 20) {
      try {
        const rid = `${this.id}-${Date.now()}`;
        const payload = JSON.stringify({
          meta: { id: rid, date: Date.now(), time: Math.round(g.time), winner: g.winner, kills: g.kills, roster: this.roster || [] },
          snaps: this.recSnaps,
        });
        fs.writeFileSync(path.join(REPLAY_DIR, `r_${rid}.json.gz`), zlib.gzipSync(payload));
        const idx = replayIndex();
        idx.push({ id: rid, date: Date.now(), time: Math.round(g.time), winner: g.winner, kills: g.kills });
        while (idx.length > 8) {
          const old = idx.shift();
          try { fs.unlinkSync(path.join(REPLAY_DIR, `r_${old.id}.json.gz`)); } catch (e) {}
        }
        saveReplayIndex(idx);
        console.log(`[match ${this.id}] replay saved: ${rid} (${this.recSnaps.length} snaps)`);
      } catch (e) { console.error('replay save failed:', e.message); }
    }
    if (countStats) {
      // ELO: each human vs average elo of enemy-team humans (bots = 1000)
      const humans = [];
      for (const conn of this.conns) {
        const h = this.heroByConn.get(conn);
        if (h && conn.user) humans.push({ conn, h, rec: users[conn.user.username] });
      }
      for (const p of humans) {
        const won = (g.winner === p.h.team) ? 1 : 0;
        if (this.mode === 'ranked') {
          const enemyElos = humans.filter(q => q.h.team !== p.h.team).map(q => q.rec.elo || 1000);
          if (!enemyElos.length) enemyElos.push(1000);
          const avg = enemyElos.reduce((a, b) => a + b, 0) / enemyElos.length;
          const expected = 1 / (1 + Math.pow(10, (avg - (p.rec.elo || 1000)) / 400));
          p.eloDelta = Math.round(32 * (won - expected));
          p.rec.elo = Math.max(100, (p.rec.elo || 1000) + p.eloDelta);
        }
        p.gemReward = won ? 100 : 60;
        p.rec.gems += p.gemReward;
      }
      for (const p of humans) {
        const st = p.rec.stats;
        st.games++;
        if (g.winner === p.h.team) st.wins++; else st.losses++;
        st.kills += p.h.kills; st.deaths += p.h.deaths;
        if (!p.rec.history) p.rec.history = [];
        p.rec.history.unshift({ d: Date.now(), win: g.winner === p.h.team ? 1 : 0, k: p.h.kills, dt: p.h.deaths, a: p.h.assists, dur: Math.round(g.time), hero: p.h.def.id });
        if (p.rec.history.length > 12) p.rec.history.length = 12;
        // battle pass progression
        const wonBP = (g.winner === p.h.team) ? 1 : 0;
        const bpGain = 50 + p.h.kills * 2 + wonBP * 50 + Math.min(50, Math.round(p.h.dmgDealt / 2000));
        const bp = p.rec.bp = p.rec.bp || { season: SEASON, xp: 0, tier: 0, premium: false };
        bp.xp += bpGain;
        let bpReward = 0;
        while (bp.tier < 30 && bp.xp >= (bp.tier + 1) * 200) {
          bp.tier++;
          if (bp.tier % 3 === 0) { p.rec.gems += 60; bpReward += 60; }          // free track
          if (bp.premium) { p.rec.gems += 100; bpReward += 100; }               // premium track
        }
        p.bpGain = bpGain; p.bpReward = bpReward;
        p.conn.send({ t: 'end', w: g.winner, me: { k: p.h.kills, d: p.h.deaths, as: p.h.assists, g: Math.floor(p.h.goldEarned), dm: Math.round(p.h.dmgDealt), lv: p.h.level }, stats: st, elo: p.rec.elo, eloDelta: p.eloDelta || 0, gems: p.rec.gems, gemReward: p.gemReward, bp: p.rec.bp, bpGain: p.bpGain, bpReward: p.bpReward });
      }
      saveUsers();
      console.log(`[match ${this.id}] ended: winner=${g.winner === 0 ? 'BLUE' : 'RED'} time=${Math.round(g.time)}s`);
    }
    for (const conn of Array.from(this.conns)) {
      conn.match = null;
    }
  }
}

function kindCode(u) {
  switch (u.kind) {
    case 'hero': return 0;
    case 'minion': return 1;
    case 'tower': return 2;
    case 'throne': return 3;
    case 'ward': return 5;
    default: return 4;
  }
}

/* ================================================================
 * HTTP: static + API
 * ================================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

const conns = new Set();
const REPLAY_DIR = path.join(DATA_DIR, 'replays');
try { fs.mkdirSync(REPLAY_DIR, { recursive: true }); } catch (e) {}
function replayIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, 'index.json'), 'utf8')); }
  catch (e) { return []; }
}
function saveReplayIndex(list) {
  try { fs.writeFileSync(path.join(REPLAY_DIR, 'index.json'), JSON.stringify(list.slice(-40), null, 1)); } catch (e) {}
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  serveStatic(url.pathname, res);
});

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  if (req._bodyCache) return Promise.resolve(req._bodyCache);
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 4096) req.destroy(); });
    req.on('end', () => {
      let out = {};
      try { out = JSON.parse(b || '{}'); } catch (e) { out = {}; }
      req._bodyCache = out;
      resolve(out);
    });
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/auth' && req.method === 'POST') {
    const b = await readBody(req);
    const out = b.mode === 'register' ? register(b.username, b.password) : login(b.username, b.password);
    if (out.ok) console.log(`[auth] ${b.mode} ${b.username}`);
    return json(res, out.ok ? 200 : 400, out);
  }
  if (url.pathname === '/api/me') {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
    const u = userForToken(token);
    if (!u) return json(res, 401, { ok: false });
    const rec = users[u.username];
    return json(res, 200, { ok: true, username: u.username, stats: u.stats, gems: rec.gems, elo: rec.elo, skins: rec.skins, history: rec.history || [] });
  }
  if (url.pathname === '/api/shop/buy' && req.method === 'POST') {
    const b = await readBody(req);
    const auth = req.headers.authorization || '';
    const u = userForToken(auth.replace(/^Bearer\s+/i, '') || b.token);
    if (!u) return json(res, 401, { ok: false, error: 'not logged in' });
    const rec = users[u.username];
    const hero = HEROES.find(h => h.id === b.heroId);
    const idx = [0, 1, 2, 3].includes(b.skinIdx) ? b.skinIdx : -1;
    if (!hero || idx < 0) return json(res, 400, { ok: false, error: 'bad request' });
    const owned = rec.skins[hero.id] || [];
    if (idx === 0 || owned.includes(idx)) return json(res, 200, { ok: true, alreadyOwned: true, gems: rec.gems, skins: rec.skins });
    const price = SKIN_PRICES[idx];
    if (rec.gems < price) return json(res, 400, { ok: false, error: 'Not enough gems', gems: rec.gems });
    rec.gems -= price;
    owned.push(idx);
    rec.skins[hero.id] = owned;
    saveUsers();
    console.log(`[shop] ${u.username} bought ${hero.id} skin#${idx} for ${price} gems (${rec.gems} left)`);
    return json(res, 200, { ok: true, gems: rec.gems, skins: rec.skins });
  }
  if (url.pathname === '/api/shop/checkout' && req.method === 'POST') {
    const b = await readBody(req);
    const auth = req.headers.authorization || '';
    const u = userForToken(auth.replace(/^Bearer\s+/i, '') || b.token);
    const pack = GEM_PACKS.find(p => p.id === b.packId);
    if (!u || !pack) return json(res, 400, { ok: false, error: 'bad request' });
    // CHECKOUT STUB: wire Lemon Squeezy / Paddle / Stripe here in production.
    if (DEV_GEMS) {
      const rec = users[u.username];
      rec.gems += pack.gems;
      saveUsers();
      console.log(`[shop] ${u.username} bought ${pack.gems} gems (dev grant)`);
      return json(res, 200, { ok: true, granted: true, gems: rec.gems, note: 'DEV_GEMS mode — real payments go through Lemon Squeezy/Paddle here' });
    }
    return json(res, 200, {
      ok: false, pending: true,
      note: `Payment provider not configured yet. In production this creates a $${pack.usd} checkout for ${pack.gems} gems.`,
    });
  }
  if (url.pathname === '/api/leaderboard') {
    const rows = Object.entries(users)
      .map(([name, u]) => ({ username: name, elo: u.elo || 1000, wins: (u.stats && u.stats.wins) || 0, losses: (u.stats && u.stats.losses) || 0, kills: (u.stats && u.stats.kills) || 0 }))
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 20);
    return json(res, 200, { ok: true, season: SEASON, rows });
  }
  if (url.pathname === '/api/daily' && req.method === 'POST') {
    const b = await readBody(req);
    const u = userForToken(b.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!u) return json(res, 401, { ok: false });
    const rec = users[u.username];
    const today = new Date().toDateString();
    if (rec.lastDaily === today) return json(res, 200, { ok: true, granted: false, gems: rec.gems });
    rec.lastDaily = today;
    rec.gems += 100;
    saveUsers();
    console.log(`[daily] ${u.username} +100 gems`);
    return json(res, 200, { ok: true, granted: true, gems: rec.gems });
  }
  if (url.pathname === '/api/friends') {
    const auth = req.headers.authorization || '';
    const u = userForToken(auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token'));
    if (!u) return json(res, 401, { ok: false });
    const rec = users[u.username];
    const online = onlineUsernames();
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.add) {
        const name = String(b.add).trim();
        if (!users[name] || name === u.username) return json(res, 400, { ok: false, error: 'No such player' });
        if (!rec.friends.includes(name)) rec.friends.push(name);
        saveUsers();
      } else if (b.remove) {
        rec.friends = rec.friends.filter(f => f !== b.remove);
        saveUsers();
      }
    }
    const list = (rec.friends || []).map(f => ({ username: f, online: online.has(f), guild: users[f] && users[f].guild }));
    return json(res, 200, { ok: true, friends: list });
  }
  if (url.pathname === '/api/guild') {
    const auth = req.headers.authorization || '';
    let u = userForToken(auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token'));
    const rec0 = u ? users[u.username] : null;
    if (!u && req.method === 'POST') {
      const pre = await readBody(req);
      u = userForToken(pre.token);
    }
    if (!u) return json(res, 401, { ok: false });
    const rec = users[u.username];
    if (req.method === 'POST') {
      const b = req._bodyCache || await readBody(req);
      if (b.action === 'create') {
        const tag = String(b.tag || '').toUpperCase();
        if (!/^[A-Z0-9]{2,4}$/.test(tag)) return json(res, 400, { ok: false, error: 'Tag must be 2-4 letters/numbers' });
        if (guilds[tag]) return json(res, 400, { ok: false, error: 'Tag taken' });
        if (rec.guild) return json(res, 400, { ok: false, error: 'Leave your guild first' });
        if (rec.gems < 500) return json(res, 400, { ok: false, error: 'Creating a guild costs 500 gems' });
        rec.gems -= 500;
        rec.guild = tag;
        guilds[tag] = { tag, name: String(b.name || tag).slice(0, 24), owner: u.username, members: [u.username], created: Date.now() };
        saveGuilds(); saveUsers();
        console.log(`[guild] ${tag} created by ${u.username}`);
      } else if (b.action === 'join') {
        const g = guilds[String(b.tag || '').toUpperCase()];
        if (!g) return json(res, 400, { ok: false, error: 'No such guild' });
        if (rec.guild) return json(res, 400, { ok: false, error: 'Leave your guild first' });
        if (g.members.length >= 30) return json(res, 400, { ok: false, error: 'Guild full' });
        rec.guild = g.tag;
        if (!g.members.includes(u.username)) g.members.push(u.username);
        saveGuilds(); saveUsers();
      } else if (b.action === 'leave') {
        const g = rec.guild && guilds[rec.guild];
        if (g) {
          g.members = g.members.filter(m => m !== u.username);
          if (!g.members.length) delete guilds[g.tag];
          else if (g.owner === u.username) g.owner = g.members[0];
        }
        rec.guild = null;
        saveGuilds(); saveUsers();
      }
    }
    const mine = rec.guild && guilds[rec.guild] ? guilds[rec.guild] : null;
    const list = Object.values(guilds)
      .map(g => ({ tag: g.tag, name: g.name, members: g.members.length, power: Math.round(g.members.reduce((a, m) => a + ((users[m] && users[m].elo) || 1000), 0) / g.members.length) }))
      .sort((a, b) => b.power - a.power).slice(0, 10);
    return json(res, 200, { ok: true, mine, guilds: list });
  }
  if (url.pathname === '/api/bp') {
    const auth = req.headers.authorization || '';
    let u = userForToken(auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token'));
    if (!u && req.method === 'POST') {
      const pre = await readBody(req);
      u = userForToken(pre.token);
    }
    if (!u) return json(res, 401, { ok: false });
    const rec = users[u.username];
    if (!rec.bp) rec.bp = { season: SEASON, xp: 0, tier: 0, premium: false };
    if (req.method === 'POST') {
      const b = req._bodyCache || await readBody(req);
      if (rec.bp.premium) return json(res, 200, { ok: true, already: true, bp: rec.bp });
      if (rec.gems < 800) return json(res, 400, { ok: false, error: 'Battle Pass costs 800 gems' });
      rec.gems -= 800; rec.bp.premium = true;
      saveUsers();
      console.log(`[bp] ${u.username} bought the premium pass`);
    }
    return json(res, 200, { ok: true, bp: rec.bp, gems: rec.gems });
  }
  if (url.pathname === '/api/replays') {
    return json(res, 200, { ok: true, replays: replayIndex() });
  }
  if (url.pathname === '/api/replay') {
    const id = String(url.searchParams.get('id') || '');
    if (!/^[a-zA-Z0-9_\-]+$/.test(id)) return json(res, 400, { ok: false });
    const file = path.join(REPLAY_DIR, `r_${id}.json.gz`);
    if (!file.startsWith(REPLAY_DIR)) return json(res, 403, { ok: false });
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(file));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(raw);
    } catch (e) { return json(res, 404, { ok: false, error: 'replay not found' }); }
  }
  json(res, 404, { ok: false, error: 'not found' });
}

function serveStatic(pathname, res) {
  let p = pathname === '/' ? '/index.html' : pathname;
  p = path.normalize(p).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

/* WebSocket upgrade */
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { try { socket.destroy(); } catch (e) {} return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  const conn = new WSConn(socket);
  conns.add(conn);
  socket.on('close', () => conns.delete(conn));
});

/* heartbeat pings */
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { conns.delete(c); continue; }
    c.sendRaw(0x9, Buffer.from('hb'));
  }
}, 30000);

loadUsers();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚔️  Aether Arena server → http://0.0.0.0:${PORT}`);
  console.log(`   accounts: ${Object.keys(users).length} registered · engine heroes: ${HEROES.length}`);
});
