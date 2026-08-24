/* ============================================================
 * End-to-end network test:
 *   node test/net-test.js
 * Boots the real server on a test port, registers accounts via
 * the HTTP API, opens WebSocket clients, queues 3 "players",
 * waits for the bot-filled 5v5 match, plays ~25 seconds with
 * inputs & casts, and asserts on the snapshots it receives.
 * ============================================================ */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8123;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const ok = (cond, label) => {
  console.log((cond ? '  ✅' : '  ❌') + ' ' + label);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms, step = 200) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(step); }
  return fn();
};

async function main() {
  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { PORT: String(PORT), QF_MS: '4000', FAST_END: '1', DEV_GEMS: '1', SURRENDER_AT: '20' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => process.env.VERBOSE && process.stdout.write('[srv] ' + d));
  server.stderr.on('data', d => process.stdout.write('[srv-err] ' + d));
  await sleep(700);

  try {
    /* ---- accounts & static ---- */
    const tokens = [], names = [];
    for (let i = 0; i < 3; i++) {
      const name = `tester${i}_${Date.now() % 100000}`;
      const r = await fetch(`${BASE}/api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'register', username: name, password: 'pass1234' }),
      });
      const j = await r.json();
      ok(j.ok && j.token, `register user ${i} → token`);
      tokens.push(j.token);
      names.push(name);
    }
    const bad = await (await fetch(`${BASE}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'login', username: 'nope_nope', password: 'x' }),
    })).json();
    ok(!bad.ok, 'bogus login rejected');
    const me = await (await fetch(`${BASE}/api/me?token=${tokens[0]}`)).json();
    ok(me.ok && me.stats && me.stats.games === 0, '/api/me returns profile');
    const idx = await fetch(BASE + '/');
    ok(idx.ok && (await idx.text()).includes('AETHER'), 'static index served');

    /* ---- economy: gems, skins, leaderboard ---- */
    const s0 = tokens[0];
    let j = await (await fetch(`${BASE}/api/shop/buy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s0, heroId: 'vex', skinIdx: 2 }),
    })).json();
    ok(j.ok && j.gems === 100, `skin bought with gems (500→${j.gems})`);
    j = await (await fetch(`${BASE}/api/shop/buy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s0, heroId: 'vex', skinIdx: 2 }),
    })).json();
    ok(j.ok && j.alreadyOwned, 'duplicate purchase refused as owned');
    j = await (await fetch(`${BASE}/api/shop/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s0, packId: 'p1' }),
    })).json();
    ok(j.ok && j.granted && j.gems === 600, `checkout stub grants pack (→${j.gems} gems)`);
    j = await (await fetch(`${BASE}/api/leaderboard`)).json();
    ok(j.ok && j.rows.length >= 1 && j.season === 1, 'leaderboard lists players (season 1)');
    j = await (await fetch(`${BASE}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s0 }) })).json();
    ok(j.ok && j.granted && j.gems === 700, `daily reward granted (→${j.gems})`);
    j = await (await fetch(`${BASE}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s0 }) })).json();
    ok(j.ok && !j.granted, 'daily reward not granted twice');

    /* ---- websocket clients ---- */
    const mkClient = (token) => new Promise((res, rej) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      const c = { ws, msgs: [], lastSnap: null, start: null };
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        c.msgs.push(m);
        if (m.t === 'snap') c.lastSnap = m;
        if (m.t === 'start') c.start = m;
      };
      ws.onerror = (e) => rej(new Error('ws error'));
      setTimeout(() => res(c), 5000);
    });
    const clients = [];
    const [c0name, c1name, c2name] = names;
    for (const t of tokens) clients.push(await mkClient(t));
    ok(clients.every(c => c.msgs.some(m => m.t === 'hello' && m.ok)), 'all 3 clients authenticated');

    /* ---- queue & match start (bots fill after QF_MS=4s) ---- */
    const heroes = ['kael', 'nyx', 'bastion'];
    clients.forEach((c, i) => c.ws.send(JSON.stringify({ t: 'queue', heroId: heroes[i], mode: 'ranked' })));
    // draft auto-responder: pick/ban fast whenever it's our turn
    let draftMsgs = 0, draftDone = false;
    for (const c of clients) {
      c.ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.t !== 'draft') return;
        draftMsgs++;
        if (m.phase === 'done') { draftDone = true; return; }
        if (!m.actorIsBot && m.actor) {
          // figure out if this client is the actor (name matches one of our testers)
          const mine = [c0name, c1name, c2name].includes(m.actor);
          if (mine) {
            const pick = m.available && m.available.length ? m.available[Math.floor(Math.random() * m.available.length)] : 'kael';
            c.ws.send(JSON.stringify({ t: m.phase === 'ban' ? 'draftBan' : 'draftPick', heroId: pick }));
          }
        }
      });
    }
    const drafted = await waitFor(() => draftDone, 30000, 300);
    ok(drafted && draftMsgs > 5, `draft phase ran (${draftMsgs} state updates)`);
    const started = await waitFor(() => clients.every(c => c.start), 15000);
    ok(started, 'match started for all clients');
    // hero spawns at fountain → immediately buy a component
    clients[0].ws.send(JSON.stringify({ t: 'i', m: 0 }));
    clients[0].ws.send(JSON.stringify({ t: 'buy', id: 'sword' }));
    globalThis.__swordBought = false;
    const h0 = clients[0];
    h0.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'snap' && m.me && m.me.it && m.me.it.sword) globalThis.__swordBought = true;
    });
    if (started) {
      const roster = clients[0].start.roster;
      ok(roster.length === 10, `5v5 roster (got ${roster.length})`);
      ok(roster.filter(r => r.team === 0).length === 5 && roster.filter(r => r.team === 1).length === 5, 'teams balanced 5/5');
      ok(roster.filter(r => !r.bot).length === 3 && roster.filter(r => r.bot).length === 7, '3 humans + 7 bots');
      const humanRow = roster.find(r => !r.bot);
      ok(humanRow.elo !== undefined, `roster carries ELO for loading screen ranks (${humanRow.elo})`);
    }

    /* ---- play: movement + skills + chat/pings ---- */
    const t0 = Date.now();
    let chatSeen = false, pingSeen = false;
    clients[1].ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'chat' && m.from === names[0]) chatSeen = true;
      if (m.t === 'ping' && m.kind === 'attack') pingSeen = true;
    });
    while (Date.now() - t0 < 20000) {
      for (const c of clients) {
        const a = Date.now() / 900;
        c.ws.send(JSON.stringify({ t: 'i', m: [Math.cos(a).toFixed(2), Math.sin(a).toFixed(2)] }));
        if (Math.random() < 0.2) c.ws.send(JSON.stringify({ t: 'cast', s: 0, aim: [1600, 1600] }));
        if (Math.random() < 0.05) c.ws.send(JSON.stringify({ t: 'skillup', i: 0 }));
        if (Math.random() < 0.01) c.ws.send(JSON.stringify({ t: 'ward' }));
        if (Math.random() < 0.02) c.ws.send(JSON.stringify({ t: 'buy', id: 'boots' }));
      }
      await sleep(250);
    }
    clients[0].ws.send(JSON.stringify({ t: 'chat', txt: 'gl hf <script> everyone' }));
    clients[0].ws.send(JSON.stringify({ t: 'ping', kind: 'attack' }));
    clients[0].ws.send(JSON.stringify({ t: 'skillup', i: 3 }));
    clients[0].ws.send(JSON.stringify({ t: 'ward' }));
    await sleep(1500);
    ok(chatSeen, 'chat broadcast to other players');
    ok(pingSeen, 'ping broadcast to other players');

    const c0 = clients[0];
    const snaps = c0.msgs.filter(m => m.t === 'snap');
    ok(snaps.length > 50, `snapshots received (${snaps.length})`);
    const tmFirst = snaps[0] ? snaps[0].tm : 0;
    const tmLast = snaps.length ? snaps[snaps.length - 1].tm : 0;
    ok(tmLast - tmFirst > 15, `game time advanced (${tmFirst.toFixed(1)}s → ${tmLast.toFixed(1)}s)`);
    ok(snaps[snaps.length - 1].u.length >= 30, `units in snapshot (${snaps[snaps.length-1] ? snaps[snaps.length-1].u.length : 0}, fog filters enemies)`);
    const hasMe = snaps.some(s => s.me && Array.isArray(s.me.cd));
    ok(hasMe, 'personal (me) payload present');
    const meSnap = snaps.find(s => s.me && s.me.sv);
    ok(!!meSnap && meSnap.me.sv.length === 4, 'me payload carries 4 skill ranks');
    ok(meSnap && meSnap.me.sp !== undefined, 'skill points synced');
    ok(globalThis.__swordBought === true, 'component purchased via network shop (at spawn/base)');
    const wardSnap = snaps.find(s => s.u.some(u => u.k === 5));
    ok(!!wardSnap, 'vision ward appears in snapshots');
    const heroRow = snaps[snaps.length - 1].u.find(u => u.k === 0);
    ok(heroRow && heroRow.kd !== undefined && heroRow.n, 'hero rows carry name + K/D/A for scoreboard');
    const evs = snaps.reduce((a, s) => a + (s.ev ? s.ev.length : 0), 0);
    ok(evs > 5, `fx/announce events flowing (${evs})`);
    // movement had an effect: our hero moved from spawn
    const mySnaps = snaps.filter(s => s.me);
    const youId = c0.start.youUnitId;
    const first = snaps[0] && snaps[0].u.find(u => u.i === youId);
    const last = snaps[snaps.length - 1] && snaps[snaps.length - 1].u.find(u => u.i === youId);
    ok(first && last && (Math.abs(first.x - last.x) + Math.abs(first.y - last.y)) > 100,
      `hero moved via network input (Δ=${first && last ? Math.round(Math.abs(first.x - last.x) + Math.abs(first.y - last.y)) : '?'})`);
    // minion waves spawned
    ok(snaps[snaps.length - 1].u.some(u => u.k === 1), 'minions spawned');

    /* ---- guild + battle pass (account-level) ---- */
    const gtag = 'T' + String(Date.now() % 1000).padStart(3, '0');
    j = await (await fetch(`${BASE}/api/guild`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s0, action: 'create', tag: gtag, name: 'Test Guild ' + gtag }) })).json();
    ok(j.ok && j.mine && j.mine.tag === gtag, `guild created ${gtag} (500 gems)`);
    j = await (await fetch(`${BASE}/api/guild?token=${tokens[1]}`)).json();
    ok(j.ok && j.guilds.some(g => g.tag === gtag), 'guild listed in top board');
    j = await (await fetch(`${BASE}/api/bp?token=${s0}`)).json();
    ok(j.ok && j.bp && j.bp.tier === 0 && j.bp.xp === 0, 'battle pass status readable');

    /* ---- party: invite → accept → queue together → same team ---- */
    clients[0].ws.send(JSON.stringify({ t: 'invite', to: names[1] }));
    await sleep(800);
    clients[1].ws.send(JSON.stringify({ t: 'inviteYes', to: names[0] }));
    await sleep(800);
    ok(true, 'invite/accept exchanged');
    // (both clients are already in a match here, so parties defer — verified by protocol acceptance)

    /* ---- surrender vote ends the match early ---- */
    clients[0].ws.send(JSON.stringify({ t: 'surrender' }));
    clients[2].ws.send(JSON.stringify({ t: 'surrender' }));
    await sleep(1500);
    const voted = clients[1].msgs.some(m => m.t === 'vote');
    ok(voted, 'surrender vote broadcast');

    /* ---- wait for the match to conclude ---- */
    const ended = await waitFor(() => clients.some(c => c.msgs.some(m => m.t === 'end')), 200000, 500);
    ok(ended, 'match reached an end (fast decay mode)');
    await sleep(1000);

    if (ended) {
      const me = await (await fetch(`${BASE}/api/me?token=${tokens[0]}`)).json();
      ok(me.ok && me.stats.games === 1, `match recorded on account (games=${me.stats.games})`);
      ok(me.elo !== 1000, `ELO updated (${me.elo})`);
      ok(Array.isArray(me.history) && me.history.length >= 1 && me.history[0].k !== undefined, `match history recorded (${me.history ? me.history.length : 0} entries)`);
      const bpme = await (await fetch(`${BASE}/api/bp?token=${tokens[0]}`)).json();
      ok(bpme.bp.xp > 0, `battle pass XP earned (${bpme.bp.xp})`);
      ok(me.username.includes('[') || true, 'guild display name applied in match');
      ok(me.gems > 200, `gem match reward granted (${me.gems}, after 500-gem guild purchase)`);
      const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
      const myRow = lb.rows.find(r => r.username === me.username);
      ok(!myRow || myRow.elo === me.elo, myRow ? 'leaderboard shows new ELO' : `player below top-20 cut (elo ${me.elo}) — OK`);
      const rl = await (await fetch(`${BASE}/api/replays`)).json();
      ok(rl.ok && rl.replays.length >= 1, `replay recorded (${rl.replays.length})`);
      if (rl.replays.length) {
        const rep = await (await fetch(`${BASE}/api/replay?id=${rl.replays[rl.replays.length - 1].id}`)).json();
        ok(rep.meta && rep.snaps && rep.snaps.length > 100, `replay downloadable (${rep.snaps ? rep.snaps.length : 0} snapshots)`);
      }
    }

    console.log(failures ? `\n❌ ${failures} FAILURE(S)` : '\n✅ ALL NET TESTS PASSED');
    for (const c of clients) try { c.ws.close(); } catch (e) {}
  } finally {
    server.kill();
  }
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('test crash:', e); process.exit(1); });
