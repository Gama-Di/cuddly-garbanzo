/* ============================================================
 * Headless balance simulation:
 *   node test/sim.js [heroId] [minutes]
 * Runs the real game logic with the player hero AI-controlled
 * and reports events / final result.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, performance: { now: () => Date.now() } });
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
load('util.js');
load('heroes.js');
load('heroes2.js');
load('heroes3.js');
load('game.js');

const heroId = process.argv[2] || 'kael';
const minutes = parseFloat(process.argv[3] || '18');

vm.runInContext(`
  globalThis.__sim = function(heroId, minutes) {
    const g = new Game(heroId, true);
    const dt = 1 / 30;
    const steps = Math.floor(minutes * 60 / dt);
    let lastLog = 0;
    for (let i = 0; i < steps; i++) {
      g.update(dt);
      if (g.state !== 'play') break;
      if (g.time - lastLog >= 120) {
        lastLog = g.time;
        const lv = t => g.heroes[t].map(h => h.level).join(',');
        const gold = t => Math.round(g.heroes[t].reduce((a, h) => a + h.goldEarned, 0) / 5);
        const towers = t => g.towersAll[t].filter(x => x.alive).length;
        console.log(
          '[t=' + Math.round(g.time) + 's] kills ' + g.kills[0] + '-' + g.kills[1] +
          ' towers B' + towers(0) + '/R' + towers(1) +
          ' avgLv B(' + lv(0) + ') R(' + lv(1) + ')' +
          ' gold B' + gold(0) + '/R' + gold(1)
        );
      }
    }
    const towers = t => g.towersAll[t].filter(x => x.alive).length;
    console.log('--- FINAL ---');
    console.log('state=' + g.state + ' winner=' + (g.winner === 0 ? 'BLUE' : g.winner === 1 ? 'RED' : 'none') + ' time=' + Math.round(g.time) + 's');
    console.log('kills ' + g.kills[0] + '-' + g.kills[1] + ' towers B' + towers(0) + '/R' + towers(1));
    for (const t of [0, 1]) {
      for (const h of g.heroes[t]) {
        console.log((t === 0 ? 'BLUE' : 'RED ') + ' ' + h.name.padEnd(6) + ' ' + h.def.id.padEnd(8) +
          ' Lv' + String(h.level).padStart(2) + '  ' + h.kills + '/' + h.deaths + '/' + h.assists +
          ' gold=' + Math.round(h.goldEarned) + ' dmg=' + Math.round(h.dmgDealt) +
          ' items=' + Object.entries(h.items).map(([k, v]) => k + 'x' + v).join(' ') || '-');
      }
    }
    console.log('events (last 30):');
    for (const l of g.log.slice(-30)) console.log('  ' + l);
    return g;
  };
`, ctx);

vm.runInContext(`__sim(${JSON.stringify(heroId)}, ${minutes})`, ctx);
