/* ============================================================
 * Balance audit: runs N full AI games and reports per-hero
 * performance outliers (kills, deaths, damage, presence).
 *   node test/balance.js [games] [minutesEach]
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, performance: { now: () => Date.now() } });
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
load('util.js'); load('heroes.js'); load('heroes2.js'); load('game.js');

const games = parseInt(process.argv[2] || '4', 10);
const minutes = parseFloat(process.argv[3] || '14');

vm.runInContext(`
  globalThis.__balance = function (games, minutes) {
    const agg = {};   // heroId -> {games,k,d,dmg,gold}
    for (let g = 0; g < games; g++) {
      const hero = HEROES[(g * 7) % HEROES.length].id;
      const game = new Game(hero, true);
      const dt = 1 / 30;
      const steps = Math.floor(minutes * 60 / dt);
      for (let i = 0; i < steps; i++) {
        game.update(dt);
        if (game.state !== 'play') break;
      }
      for (const t of [0, 1]) {
        for (const h of game.heroes[t]) {
          const a = agg[h.def.id] = agg[h.def.id] || { games: 0, k: 0, d: 0, dmg: 0, wins: 0 };
          a.games++; a.k += h.kills; a.d += h.deaths; a.dmg += h.dmgDealt;
          if (game.winner === t) a.wins++;
        }
      }
    }
    const rows = Object.entries(agg).map(([id, a]) => ({
      id,
      kd: +(a.k / Math.max(1, a.d)).toFixed(2),
      kpg: +(a.k / a.games).toFixed(1),
      dmg: Math.round(a.dmg / a.games / 1000),
      wr: Math.round(100 * a.wins / a.games),
      n: a.games,
    })).filter(r => r.n >= 2);
    rows.sort((x, y) => y.kd - x.kd);
    console.log('\\n=== TOP 8 (by K/D across ' + games + ' games) ===');
    for (const r of rows.slice(0, 8)) console.log(r.id.padEnd(8), 'K/D', String(r.kd).padStart(5), 'kills/g', r.kpg, 'dmg/g', r.dmg + 'k', 'wr', r.wr + '%');
    console.log('=== BOTTOM 8 ===');
    for (const r of rows.slice(-8)) console.log(r.id.padEnd(8), 'K/D', String(r.kd).padStart(5), 'kills/g', r.kpg, 'dmg/g', r.dmg + 'k', 'wr', r.wr + '%');
    return rows;
  };
`, ctx);

vm.runInContext(`__balance(${games}, ${minutes})`, ctx);
