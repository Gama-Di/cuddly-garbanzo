/* ============================================================
 * AETHER ARENA — game.js
 * A 5v5 MOBA in one canvas: 3 lanes, towers, jungle, minions,
 * 6 heroes with skills, leveling 1-15, gold + items, AI brains.
 *
 *   Win: destroy the enemy throne.  Lose: they destroy yours.
 * ============================================================ */
'use strict';

/* ---------------- headless stubs (for balance simulation) ---------------- */
const HEADLESS = (typeof window === 'undefined');
if (HEADLESS) {
  const _els = {};
  const mkEl = () => {
    const el = {
      style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      appendChild(c) { this.children.push(c); return c; },
      removeChild() {}, remove() {}, addEventListener() {}, setAttribute() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
      getContext() { return null; }, width: 0, height: 0,
    };
    return el;
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {}, location: { search: '' } };
  globalThis.document = {
    getElementById(id) { return (_els[id] || (_els[id] = mkEl())); },
    createElement() { return mkEl(); }, body: mkEl(), addEventListener() {}, hidden: false,
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.requestAnimationFrame = () => {};
}

/* ---------------- sprite cache (browser only) ---------------- */
const SPRITES = {};        // hero portrait tokens
const SPRITES_FULL = {};   // hero full-body sprites (animated rig)
const SPRITES_MINION = {}; // type -> [blueCanvas, redCanvas]
const SPRITES_MONSTER = {}; // monKind -> image
const TEX = {};            // map textures: ground, lane, water
const SKIN_CACHE = {};     // heroId -> [hueVariantCanvas0..3]

/* map themes — 'aether' (dark neon) & 'rift' (Summoner's-Rift-style) */
const MAP_THEMES = {
  aether: {
    id: 'aether', name: 'Aether Arena', icon: '🌌',
    base: '#0c1712', overlay: 'rgba(7,12,10,0.42)',
    laneBase: '#1c2a1b', laneEdge: 'rgba(125,211,252,0.10)',
    riverTint: 'rgba(34,211,238,0.07)', riverEdge: 'rgba(34,211,238,0.16)',
    ground: 'tex_ground', lane: 'tex_lane', water: 'tex_water',
    tree1: '#14301f', tree2: '#1e4630', treeShadow: '#0a140d',
    rock: '#3b4557', rockHi: '#4d5a70',
    pits: false,
  },
  rift: {
    id: 'rift', name: "Summoner's Rift", icon: '🌿',
    base: '#16321d', overlay: 'rgba(10,24,12,0.30)',
    laneBase: '#8a734a', laneEdge: 'rgba(255,240,200,0.16)',
    riverTint: 'rgba(80,150,220,0.25)', riverEdge: 'rgba(140,200,255,0.35)',
    ground: 'rift_ground', lane: 'rift_lane', water: 'rift_water',
    tree1: '#2e6b3a', tree2: '#4a9c58', treeShadow: '#122816',
    rock: '#6b6252', rockHi: '#8a8070',
    pits: true,
  },
};
function currentTheme() {
  try {
    const t = localStorage.getItem('aa_maptheme');
    return MAP_THEMES[t] ? MAP_THEMES[t] : MAP_THEMES.aether;
  } catch (e) { return MAP_THEMES.aether; }
}

/* cosmetic skins: hue-shift variants of the hero's art */
const SKINS = [
  { id: 'classic', name: 'Classic', hue: 0, price: 0 },
  { id: 'emerald', name: 'Emerald Ward', hue: 115, price: 300 },
  { id: 'frost', name: 'Frostfall', hue: 195, price: 400 },
  { id: 'inferno', name: 'Inferno', hue: 305, price: 600 },
];
const SKIN_PRICES = SKINS.map(s => s.price);

/* bushes: stealth zones (units inside are hidden unless enemies are close) */
const BUSHES = [
  { x: 1400, y: 2620, r: 85 }, { x: 1000, y: 1900, r: 85 }, { x: 430, y: 1300, r: 85 }, { x: 1900, y: 2420, r: 85 },
  { x: 1800, y: 580, r: 85 }, { x: 2200, y: 1300, r: 85 }, { x: 2770, y: 1900, r: 85 }, { x: 1300, y: 780, r: 85 },
];
function equippedSkin(heroId) {
  if (HEADLESS) return 0;
  try {
    const v = parseInt(localStorage.getItem('aa_skin_' + heroId) || '0', 10);
    return (v >= 0 && v < SKINS.length) ? v : 0;
  } catch (e) { return 0; }
}
function skinHueFilter(heroId) {
  const s = SKINS[equippedSkin(heroId)];
  return s.hue ? `hue-rotate(${s.hue}deg) saturate(1.08)` : '';
}
function makeVariant(img, hue) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  if (hue) x.filter = `hue-rotate(${hue}deg) saturate(1.08)`;
  x.drawImage(img, 0, 0);
  return c;
}
function tintImage(img, color, alpha) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = alpha;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function loadSprites() {
  if (HEADLESS) return;
  const load = (src, cb) => { const im = new Image(); im.onload = () => cb(im); im.onerror = () => {}; im.src = src; };
  for (const h of HEROES) {
    load('img/' + h.id + '.png', (im) => { SPRITES[h.id] = im; });
    load('img/full/' + h.id + '.png', (im) => {
      SPRITES_FULL[h.id] = im;
      SKIN_CACHE[h.id] = SKINS.map(s => makeVariant(im, s.hue));
    });
  }
  for (const ty of ['melee', 'ranged', 'siege']) {
    load(`img/minion_${ty}.png`, (im) => {
      SPRITES_MINION[ty] = [tintImage(im, TEAM_COLORS[0], 0.42), tintImage(im, TEAM_COLORS[1], 0.45)];
    });
  }
  for (const mk of ['lizard', 'golem', 'turtle', 'lord']) {
    load(`img/monster_${mk}.png`, (im) => { SPRITES_MONSTER[mk] = im; });
  }
  for (const tx of ['ground', 'lane', 'water']) {
    load(`img/tex_${tx}.png`, (im) => { TEX[tx] = im; });
    load(`img/rift_${tx}.png`, (im) => { TEX['rift_' + tx] = im; });
  }
}

/* ---------------- config ---------------- */
const CFG = {
  WORLD: 3200,
  VIEW_H: 1250,               // world units visible vertically
  WAVE_INT: 30,
  FIRST_WAVE: 5,
  MAX_MINIONS: 96,
  GOLD_START: 260,
  GOLD_PASSIVE: 2.4,
  XP_NEED: (l) => 60 + 45 * (l - 1),
  RESPAWN: (l) => Math.min(30, 5 + 1.5 * l),
  TURTLE_AT: 120,             // 2:00
  LORD_AT: 300,               // 5:00
  OVERTIME: 1200,             // 20:00 decay starts
  DECAY: 0.008,                // overtime decay rate (env-tunable for tests)
  TOWER: { hp: 4200, atk: 150, range: 440, aspd: 0.9, ramp: 0.35, rampMax: 1.8 },
  BASET: { hp: 5000, atk: 210, range: 460, aspd: 0.9, ramp: 0.35, rampMax: 1.8 },
  THRONE: { hp: 7000 },
};

const TEAM_COLORS = ['#38bdf8', '#fb7185'];
const TEAM_DARK = ['#0c4a6e', '#7f1d1d'];
const AI_NAMES = ['Kai', 'Mira', 'Zed', 'Nova', 'Rex', 'Ivy', 'Ozzy', 'Luna', 'Fang', 'Pixi'];

/* ---------------- map layout ---------------- */
const WORLD = CFG.WORLD;
const THRONE_POS = [{ x: 400, y: 2800 }, { x: 2800, y: 400 }];

const LANES = [
  { name: 'TOP', pts: [[420, 2700], [400, 2200], [400, 520], [520, 400], [2680, 430]] },
  { name: 'MID', pts: [[560, 2640], [1600, 1600], [2680, 520]] },
  { name: 'BOT', pts: [[600, 2770], [2280, 2800], [2770, 2280], [2770, 520]] },
];

/* towers: [laneIdx, tier(1 outer,2 inner), x, y] per team */
const TOWER_SPOTS = [
  [0, 1, 400, 1640], [0, 2, 400, 2180],
  [1, 1, 1180, 2020], [1, 2, 840, 2360],
  [2, 1, 1640, 2800], [2, 2, 1100, 2800],
];
const BASE_TURRET = [{ x: 700, y: 2500 }, { x: 2500, y: 700 }];

/* jungle camps on blue side; red mirrors */
const CAMPS_BLUE = [
  { id: 'b1', x: 750, y: 1300, kind: 'lizard' },
  { id: 'b2', x: 1000, y: 1700, kind: 'golem' },
  { id: 'b3', x: 1900, y: 2400, kind: 'golem' },
  { id: 'b4', x: 2300, y: 2550, kind: 'lizard' },
];
const TURTLE_POS = { x: 900, y: 1080 };
const LORD_POS = { x: 2300, y: 2120 };

/* ================================================================
 * Entities
 * ================================================================ */
let UNIT_ID = 1;

class Unit {
  constructor(g, team, x, y, r) {
    this.g = g; this.id = UNIT_ID++;
    this.kind = 'unit'; this.team = team;
    this.x = x; this.y = y; this.r = r;
    this.alive = true; this.hp = 1;
    this.atkCd = 0; this.facing = 0;
    this.target = null; this.lastAttacker = null; this.lastAttackerT = -99;
    this.damagers = {};          // heroId -> time of last damage
    this.slowT = 0; this.slowPct = 0; this.stunT = 0;
    this.markT = 0; this.markAmp = 0;
    this.shieldVal = 0; this.shieldT = 0;
    this.vx = 0; this.vy = 0;    // for prediction
  }
  get pos() { return this; }
  applySlow(pct, dur) {
    if (pct >= this.slowPct || this.slowT <= 0) { this.slowPct = Math.max(this.slowPct, pct); }
    this.slowT = Math.max(this.slowT, dur);
  }
  applyStun(dur) { this.stunT = Math.max(this.stunT, dur); this.target = null; }
  damageFlash() {}
}

class Hero extends Unit {
  constructor(g, team, def, x, y, name, isPlayer) {
    super(g, team, x, y, 22);
    this.kind = 'hero';
    this.def = def; this.name = name; this.isPlayer = !!isPlayer;
    this.level = 1; this.xp = 0; this.gold = CFG.GOLD_START;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.streak = 0;
    this.dmgDealt = 0; this.goldEarned = CFG.GOLD_START;
    this.items = {};             // itemId -> count
    this.mana = this.maxMana; this.hp = this.maxHp;
    this.cds = [0, 0, 0, 0]; this.respT = 0;
    this.skillLv = [1, 1, 1, 1];      // skill ranks (grow with points)
    this.skillPoints = 0;
    this.recallT = -1;
    this.buffs = [];             // {aspdAdd, msAdd, atkAdd, rangeAdd, lsAdd, cleave, dur, name}
    this.lockTarget = null;      // player focus lock
    this.prefTarget = null;      // AI-chosen attack focus
    this.buffRedT = 0; this.buffBlueT = 0;
    this.lastMoveT = 0; this.lastX = x; this.lastY = y; this.stuckT = 0;
    this.brain = null;
    this.moveDir = null; this.castLock = 0;
  }
  itemStat(key) {
    let v = 0;
    for (const [id, n] of Object.entries(this.items)) {
      const it = itemById(id);
      if (it && it.stats && it.stats[key]) v += it.stats[key] * n;
    }
    return v;
  }
  get maxHp() {
    const s = this.def.stats;
    return s.hp + s.hpL * (this.level - 1) + this.itemStat('hp');
  }
  get maxMana() { const s = this.def.stats; return s.mana + s.manaL * (this.level - 1); }
  get atk() {
    const s = this.def.stats;
    let a = s.atk + s.atkL * (this.level - 1) + this.itemStat('atk');
    for (const b of this.buffs) a += (b.atkAdd || 0);
    return a;
  }
  get aspd() {
    const s = this.def.stats;
    let a = s.aspd + s.aspdL * (this.level - 1) + this.itemStat('aspd');
    for (const b of this.buffs) a += (b.aspdAdd || 0) * s.aspd;
    if (this.def.id === 'kael' && this.hp < this.maxHp * 0.4) a *= 1.18;      // passive: Berserker's Grit
    return Math.min(2.6, a);
  }
  get defn() {
    const s = this.def.stats;
    let d = s.def + s.defL * (this.level - 1) + this.itemStat('def');
    for (const b of this.buffs) d += (b.defAdd || 0);
    if (this.def.id === 'bastion' && this.hp < this.maxHp * 0.6) d *= 1.25;   // passive: Iron Skin
    return d;
  }
  get ms() {
    let m = this.def.stats.ms + this.itemStat('ms');
    for (const b of this.buffs) m += (b.msAdd || 0) * this.def.stats.ms;
    let amp = 1;
    if (this.buffRedT > 0) amp *= 1.05;
    return m * amp;
  }
  get range() {
    let rg = this.def.stats.range;
    for (const b of this.buffs) rg += (b.rangeAdd || 0);
    if (this.def.id === 'volt') rg += 14 * (this.level - 1);                  // passive: Long Barrel
    return rg;
  }
  get cdr() { return Math.min(0.4, this.itemStat('cdr')); }
  get lifesteal() {
    let ls = this.itemStat('ls');
    for (const b of this.buffs) ls += (b.lsAdd || 0);
    if (this.def.id === 'rona') ls += 0.15 * (1 - this.hp / this.maxHp);      // passive: Bloodthirst
    return ls;
  }
  get dmgAmp() {
    let a = 1 + this.itemStat('dmgAmp');
    if (this.buffRedT > 0) a += 0.12;
    if (this.g.teamLord[this.team] > this.g.time) a += 0.15;
    return a;
  }
  get crit() { const s = this.def.stats; return (s.crit || 0) + (s.critL || 0) * (this.level - 1); }
  get cleaving() { return this.buffs.some(b => b.cleave); }

  /* owned active items */
  activeItems() {
    const out = [];
    for (const [id, n] of Object.entries(this.items)) {
      const it = itemById(id);
      if (it && it.active && n > 0) out.push(it);
    }
    return out;
  }

  gainXp(n) {
    if (this.level >= 15) return;
    this.xp += n;
    let leveled = false;
    while (this.level < 15 && this.xp >= CFG.XP_NEED(this.level)) {
      this.xp -= CFG.XP_NEED(this.level);
      this.level++; leveled = true;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12);
      if (this.level >= 2) this.skillPoints++;
    }
    if (this.brain) {
      // bots spend points: ult first, then round-robin basics
      let guard = 0;
      while (this.skillPoints > 0 && guard++ < 20) {
        const order = [3, 0, 1, 2];
        let spent = false;
        for (const i of order) {
          const s = this.def.skills[i];
          const maxLv = i === 3 ? 3 : 6;
          if (this.level >= s.unlock && this.skillLv[i] < maxLv) {
            this.skillLv[i]++; this.skillPoints--; spent = true;
            break;
          }
        }
        if (!spent) break;
      }
    }
    if (leveled) {
      this.g.fx.levelUp(this.x, this.y);
      if (this.isPlayer) this.g.sfx.play('level');
    }
  }
  gainGold(n) {
    this.gold += n; this.goldEarned += n;
    if (this.isPlayer) this.g.sfx.play('gold');
  }
  allocate(i, g) {
    const s = this.def.skills[i];
    if (!s || this.level < s.unlock || this.skillPoints <= 0) return false;
    const maxLv = i === 3 ? 3 : 6;
    if (this.skillLv[i] >= maxLv) return false;
    this.skillLv[i]++; this.skillPoints--;
    this.fx && g && g.fx.text(this.x, this.y - 46, `↑ ${s.name} Lv${this.skillLv[i]}`, '#7ee2a8');
    if (this.isPlayer && g) g.sfx.play('level');
    return true;
  }

  hasComponents(it) {
    if (!it.builds) return true;
    const need = {};
    for (const c of it.builds) need[c] = (need[c] || 0) + 1;
    for (const [id, n] of Object.entries(need)) if ((this.items[id] || 0) < n) return false;
    return true;
  }
  canBuy(it) {
    const owned = this.items[it.id] || 0;
    if (it.builds) {
      if (owned >= 1) return false;
      if (it.active && this.activeItems().length >= 2) return false;
      if (!this.hasComponents(it)) return false;
    } else if (owned >= it.max) return false;
    if (this.gold < it.cost) return false;
    if (this.alive && !this.g.atBase(this)) return false;
    return true;
  }
  buy(it) {
    if (!this.canBuy(it)) return false;
    this.gold -= it.cost;
    if (it.builds) {
      for (const c of it.builds) {
        this.items[c] = (this.items[c] || 0) - 1;
        if (this.items[c] <= 0) delete this.items[c];
      }
    }
    this.items[it.id] = (this.items[it.id] || 0) + 1;
    if (!this.activeCds) this.activeCds = {};
    if (it.active && this.activeCds[it.id] === undefined) this.activeCds[it.id] = 0;
    this.g.fx.text(this.x, this.y - 30, it.icon + ' ' + it.name, '#7ee2a8');
    return true;
  }

  allocate(i, g) {
    const s = this.def.skills[i];
    if (!s || this.level < s.unlock || this.skillPoints <= 0) return false;
    const maxLv = i === 3 ? 3 : 6;
    if (this.skillLv[i] >= maxLv) return false;
    this.skillLv[i]++; this.skillPoints--;
    this.fx && g && g.fx.text(this.x, this.y - 46, `↑ ${s.name} Lv${this.skillLv[i]}`, '#7ee2a8');
    if (this.isPlayer && g) g.sfx.play('level');
    return true;
  }

  canBuy(it) {
    const owned = this.items[it.id] || 0;
    if (owned >= it.max) return false;
    const cost = Math.round(it.cost * (owned === 0 ? 1 : 1.5));
    if (this.gold < cost) return false;
    if (this.alive && !this.g.atBase(this)) return false;
    return true;
  }
  buy(it) {
    if (!this.canBuy(it)) return false;
    const owned = this.items[it.id] || 0;
    const cost = Math.round(it.cost * (owned === 0 ? 1 : 1.5));
    this.gold -= cost;
    this.items[it.id] = owned + 1;
    this.hp = Math.min(this.maxHp, this.hp);
    if (it.id === 'titan') this.hp += 1300 * 0.5;
    this.g.fx.text(this.x, this.y - 30, it.icon + ' ' + it.name, '#7ee2a8');
    return true;
  }
  startRecall() {
    if (!this.alive || this.recallT >= 0) return;
    this.recallT = 0;
    if (this.isPlayer) this.g.sfx.play('recall');
  }
  cancelRecall() { this.recallT = -1; }

  die(killer) {
    this.alive = false; this.deaths++; this.streak = 0;
    this.respT = CFG.RESPAWN(this.level);
    this.recallT = -1; this.buffs = []; this.shieldVal = 0;
    this.stunT = 0; this.slowT = 0; this.markT = 0;
    this.target = null; this.lockTarget = null; this.prefTarget = null;
    this.g.onHeroDeath(this, killer);
  }
  respawn() {
    const t = THRONE_POS[this.team];
    this.x = t.x + (this.team === 0 ? 60 : -60); this.y = t.y + (this.team === 0 ? 60 : -60);
    this.alive = true; this.hp = this.maxHp; this.mana = this.maxMana;
    this.g.fx.levelUp(this.x, this.y);
  }

  update(dt) {
    const g = this.g;
    // timers
    for (let i = 0; i < 4; i++) if (this.cds[i] > 0) this.cds[i] -= dt;
    if (this.wardCdT > 0) this.wardCdT -= dt;
    if (this.activeCds) for (const k of Object.keys(this.activeCds)) if (this.activeCds[k] > 0) this.activeCds[k] -= dt;
    if (this.buffRedT > 0) this.buffRedT -= dt;
    if (this.buffBlueT > 0) this.buffBlueT -= dt;
    if (this.markT > 0) this.markT -= dt;
    if (this.castLock > 0) this.castLock -= dt;
    this.buffs = this.buffs.filter(b => (b.dur -= dt) > 0);
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shieldVal = 0; }
    if (this.slowT > 0) this.slowT -= dt; else this.slowPct = 0;
    if (this.stunT > 0) this.stunT -= dt;

    if (!this.alive) {
      this.respT -= dt;
      if (this.respT <= 0) this.respawn();
      return;
    }

    // regen + fountain
    const s = this.def.stats;
    let hpReg = s.regen + this.maxHp * 0.004;
    let mpReg = 6 + this.maxMana * 0.012;
    const fount = g.atBase(this);
    if (fount) { hpReg += this.maxHp * 0.09; mpReg += this.maxMana * 0.09; }
    if (this.def.id === 'seraph' && g.time - (this.lastDamagedT || -9) > 5) hpReg += this.maxHp * 0.02;   // passive: Blessing of Dawn
    for (const a of g.heroes[this.team]) {
      if (a.def.id === 'tala' && a.alive && a !== this && dist(a.x, a.y, this.x, this.y) < 400) { mpReg *= 1.5; break; }  // passive: Moonlight Aura
    }
    if (g.teamLord[this.team] > g.time) { hpReg += this.maxHp * 0.01; }
    this.hp = Math.min(this.maxHp, this.hp + hpReg * dt);
    this.mana = Math.min(this.maxMana, this.mana + mpReg * dt);
    if (g.time > CFG.GOLD_PASSIVE_AT + 10) this.gold += CFG.GOLD_PASSIVE * dt, this.goldEarned += CFG.GOLD_PASSIVE * dt;

    // recall channel
    if (this.recallT >= 0) {
      this.recallT += dt;
      if (this.recallT >= 3.2) {
        const t = THRONE_POS[this.team];
        this.x = t.x; this.y = t.y - (this.team === 0 ? 60 : -60);
        this.recallT = -1;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3);
        g.fx.burst(this.x, this.y, '#a5f3fc', 14);
      }
    }

    // movement
    let mx = 0, my = 0;
    const canMove = this.stunT <= 0 && this.recallT < 0 && this.castLock <= 0;
    if (canMove) {
      if (this.moveDir) { mx = this.moveDir.x; my = this.moveDir.y; }
      if (this.brain && this.brain.moveVec) { mx = this.brain.moveVec.x; my = this.brain.moveVec.y; }
    }
    const spd = this.ms * (this.slowT > 0 ? (1 - this.slowPct) : 1);
    if (mx || my) {
      const l = Math.hypot(mx, my) || 1;
      const vx = (mx / l) * spd, vy = (my / l) * spd;
      this.x += vx * dt; this.y += vy * dt;
      this.facing = Math.atan2(vy, vx);
      this.vx = vx; this.vy = vy;
      this.lastMoveT = g.time;
      if (this.recallT >= 0) this.cancelRecall();
      if (!g.headless && Math.random() < dt * 5) {
        g.fx.parts.push({ x: this.x + rand(-8, 8), y: this.y + 13, vx: rand(-15, 15), vy: rand(-25, -5), life: rand(0.25, 0.5), color: 'rgba(148,163,184,0.5)', size: rand(2, 3.5) });
      }
    } else { this.vx = 0; this.vy = 0; }
    this.x = clamp(this.x, 60, WORLD - 60); this.y = clamp(this.y, 60, WORLD - 60);

    // basic attack
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.stunT <= 0 && this.recallT < 0) g.tryBasicAttack(this);

    // stuck detection (AI safety)
    if (this.brain) {
      const moved = dist(this.x, this.y, this.lastX, this.lastY);
      if (moved < 2 && (mx || my)) this.stuckT += dt; else this.stuckT = 0;
      this.lastX = this.x; this.lastY = this.y;
      if (this.stuckT > 2.5) { this.stuckT = 0; this.brain.nudge(); }
    }
  }
}

class Minion extends Unit {
  constructor(g, team, laneIdx, type, waveN) {
    const p = laneStart(g, team, laneIdx);
    super(g, team, p.x + rand(-24, 24), p.y + rand(-24, 24), type === 'siege' ? 16 : 12);
    this.kind = 'minion';
    this.laneIdx = laneIdx; this.type = type; this.waveN = waveN;
    this.wpi = team === 0 ? 1 : 0;   // next waypoint index (team 0 walks forward)
    this.retargetT = rand(0, 0.3);
    const w = waveN;
    if (type === 'melee')   { this.maxHp = 440 + 26 * w; this.hp = this.maxHp; this.atk = 30 + 2.2 * w; this.range = 95; this.ms = 190; this.aspd = 0.85; this.gold = 24 + 0.6 * w; this.xp = 30; }
    if (type === 'ranged')  { this.maxHp = 330 + 18 * w; this.hp = this.maxHp; this.atk = 44 + 2.6 * w; this.range = 300; this.ms = 190; this.aspd = 0.75; this.gold = 30 + 0.6 * w; this.xp = 34; }
    if (type === 'siege')   { this.maxHp = 980 + 42 * w; this.hp = this.maxHp; this.atk = 68 + 3.2 * w; this.range = 340; this.ms = 165; this.aspd = 0.6; this.gold = 45 + 1 * w; this.xp = 52; }
  }
  update(dt) {
    const g = this.g;
    if (this.slowT > 0) this.slowT -= dt; else this.slowPct = 0;
    if (this.stunT > 0) { this.stunT -= dt; return; }
    if (this.atkCd > 0) this.atkCd -= dt;
    this.retargetT -= dt;

    // acquire target
    if (this.retargetT <= 0 || (this.target && !this.target.alive)) {
      this.retargetT = 0.3;
      this.target = g.pickTargetFor(this, 380, { minions: true });
      if (this.lastAttacker && this.lastAttacker.alive && this.lastAttacker.team !== this.team &&
          dist(this.x, this.y, this.lastAttacker.x, this.lastAttacker.y) < 460) this.target = this.lastAttacker;
      if (this.target && this.target.team !== 2 && !g.unitVisibleTo(this.target, this.team)) this.target = null;
    }
    const t = (this.target && this.target.alive && !this.target.invuln) ? this.target : null;

    if (t) {
      const d = dist(this.x, this.y, t.x, t.y);
      const reach = this.range + t.r + this.r;
      if (d > reach) {
        const inv = d > 0 ? 1 / d : 0;
        const spd = this.ms * (this.slowT > 0 ? (1 - this.slowPct) : 1);
        this.x += (t.x - this.x) * inv * spd * dt;
        this.y += (t.y - this.y) * inv * spd * dt;
        this.facing = Math.atan2(t.y - this.y, t.x - this.x);
      } else if (this.atkCd <= 0) {
        this.atkCd = 1 / this.aspd;
        if (this.range > 150) { this.attackAt = g.time; g.spawnProj({ src: this, tgt: t, dmg: this.atk, speed: 750, dtype: 'phys', small: true }); }
        else { this.attackAt = g.time; g.dealDamage(this, t, this.atk, 'phys', { basic: true }); g.fx.slash(t.x, t.y, this.team); g.sfx.play('hit'); }
      }
      return;
    }

    // walk the lane
    const pts = LANES[this.laneIdx].pts;
    const total = pts.length;
    const idx = this.team === 0 ? this.wpi : (total - 1 - this.wpi);
    let wp = pts[clamp(idx, 0, total - 1)];
    let d = dist(this.x, this.y, wp[0], wp[1]);
    if (d < 70) {
      this.wpi++;
      const idx2 = this.team === 0 ? this.wpi : (total - 1 - this.wpi);
      if (idx2 < 0 || idx2 >= total) { this.target = g.throne[1 - this.team]; return; }
      wp = pts[idx2];
    }
    const dd = Math.max(1, dist(this.x, this.y, wp[0], wp[1]));
    const spd = this.ms * (this.slowT > 0 ? (1 - this.slowPct) : 1);
    this.x += (wp[0] - this.x) / dd * spd * dt;
    this.y += (wp[1] - this.y) / dd * spd * dt;
    this.facing = Math.atan2(wp[1] - this.y, wp[0] - this.x);
    // final: siege the throne
    const throne = g.throne[1 - this.team];
    if (throne.alive && dist(this.x, this.y, throne.x, throne.y) < 400) this.target = throne;
  }
}

class Tower extends Unit {
  constructor(g, team, x, y, opts) {
    super(g, team, x, y, 30);
    this.kind = 'tower';
    this.laneIdx = opts.laneIdx; this.tier = opts.tier; // 1,2, 3=base, 9=throne handled elsewhere
    this.isBase = opts.tier === 3;
    const T = this.isBase ? CFG.BASET : CFG.TOWER;
    this.maxHp = T.hp; this.hp = T.hp; this.atk = T.atk; this.range = T.range;
    this.aspd = T.aspd; this.rampN = 0; this.rampTgt = null;
    this.invuln = true;
  }
  update(dt) {
    const g = this.g;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    // invulnerability chain
    if (this.tier === 1) this.invuln = false;
    else if (this.tier === 2) this.invuln = g.towers[this.team].some(t => t.tier === 1 && t.laneIdx === this.laneIdx && t.alive);
    else if (this.tier === 3) this.invuln = g.towers[this.team].every(t => t.tier === 2 && t.alive);
    if (this.invuln) return;

    // acquire
    if (!this.target || !this.target.alive || dist(this.x, this.y, this.target.x, this.target.y) > this.range + 40) {
      const minions = [], heroes = [];
      for (const u of g.units) {
        if (!u.alive || u.team === this.team || u.team === 2 || u.kind === 'tower' || u.kind === 'throne') continue;
        const d = dist(this.x, this.y, u.x, u.y);
        if (d > this.range) continue;
        (u.kind === 'hero' ? heroes : minions).push(u);
      }
      let best = null;
      if (minions.length) best = minions.reduce((a, b) => dist(a.x, a.y, this.x, this.y) < dist(b.x, b.y, this.x, this.y) ? a : b);
      else if (heroes.length) best = heroes.reduce((a, b) => dist(a.x, a.y, this.x, this.y) < dist(b.x, b.y, this.x, this.y) ? a : b);
      if (best !== this.rampTgt) { this.rampTgt = best; this.rampN = 0; }
      this.target = best;
    }
    if (this.target && this.atkCd <= 0) {
      this.atkCd = 1 / this.aspd;
      const T = this.isBase ? CFG.BASET : CFG.TOWER;
      const dmg = this.atk * (1 + Math.min(T.rampMax, T.ramp * this.rampN));
      this.rampN++;
      g.spawnProj({ src: this, tgt: this.target, dmg, speed: 980, dtype: 'phys', tower: true });
      g.sfx.play('shot');
    }
  }
}

class Throne extends Unit {
  constructor(g, team) {
    const p = THRONE_POS[team];
    super(g, team, p.x, p.y, 80);
    this.kind = 'throne';
    this.maxHp = CFG.THRONE.hp; this.hp = this.maxHp;
    this.invuln = true; this.zapCd = 0;
  }
  update(dt) {
    const g = this.g;
    // the throne is protected while its base turret still stands
    this.invuln = g.towers[this.team].some(t => t.tier === 3 && t.alive);
    // fountain laser: punish divers
    this.zapCd -= dt;
    if (this.zapCd <= 0) {
      for (const u of g.units) {
        if (u.alive && u.kind === 'hero' && u.team !== this.team && dist(u.x, u.y, this.x, this.y) < 380) {
          g.dealDamage(this, u, 320, 'true', {});
          this.zapCd = 0.5;
          g.fx.burst(u.x, u.y, '#f87171', 6);
          break;
        }
      }
    }
  }
}

class Ward extends Unit {
  constructor(g, team, x, y) {
    super(g, team, x, y, 10);
    this.kind = 'ward';
    this.maxHp = 350; this.hp = 350;
    this.wardLife = 60;             // seconds
  }
  update(dt) {
    this.wardLife -= dt;
    if (this.slowT > 0) this.slowT -= dt; else this.slowPct = 0;
    if (this.wardLife <= 0) this.alive = false;   // expires quietly
  }
}

class Monster extends Unit {
  constructor(g, camp, kind) {
    super(g, 2, camp.x + rand(-20, 20), camp.y + rand(-20, 20), kind === 'lord' ? 42 : kind === 'turtle' ? 34 : kind === 'golem' ? 22 : 16);
    this.kind = 'monster'; this.monKind = kind; this.camp = camp;
    this.homeX = camp.x; this.homeY = camp.y;
    const m = Math.max(0, g.time / 60 - 1);
    if (kind === 'lizard') { this.maxHp = 680 + 60 * m; this.atk = 60 + 6 * m; this.gold = 34; this.xp = 42; this.ms = 150; this.range = 100; this.aspd = 0.8; }
    if (kind === 'golem') { this.maxHp = 1500 + 90 * m; this.atk = 95 + 7 * m; this.gold = 95; this.xp = 120; this.ms = 150; this.range = 110; this.aspd = 0.7; }
    if (kind === 'turtle') { this.maxHp = 4400 + 120 * m; this.atk = 170 + 8 * m; this.gold = 0; this.xp = 0; this.ms = 140; this.range = 150; this.aspd = 0.6; this.big = true; }
    if (kind === 'lord') { this.maxHp = 7000 + 160 * m; this.atk = 230 + 10 * m; this.gold = 0; this.xp = 0; this.ms = 150; this.range = 170; this.aspd = 0.6; this.big = true; }
    this.hp = this.maxHp; this.aggroT = 0;
  }
  update(dt) {
    const g = this.g;
    if (this.slowT > 0) this.slowT -= dt; else this.slowPct = 0;
    if (this.stunT > 0) { this.stunT -= dt; return; }
    if (this.atkCd > 0) this.atkCd -= dt;
    const homeD = dist(this.x, this.y, this.homeX, this.homeY);
    if (homeD > 520) { this.target = null; }  // leash

    if (!this.target || !this.target.alive) {
      // retaliate vs attackers
      if (this.lastAttacker && this.lastAttacker.alive && this.lastAttacker.team !== 2 &&
          dist(this.x, this.y, this.lastAttacker.x, this.lastAttacker.y) < 480) this.target = this.lastAttacker;
      else this.target = null;
    }
    const t = this.target;
    if (t) {
      const d = dist(this.x, this.y, t.x, t.y);
      const reach = this.range + t.r + this.r;
      if (d > reach) {
        const inv = 1 / Math.max(1, d);
        this.x += (t.x - this.x) * inv * this.ms * dt;
        this.y += (t.y - this.y) * inv * this.ms * dt;
      } else if (this.atkCd <= 0) {
        this.atkCd = 1 / this.aspd;
        g.dealDamage(this, t, this.atk, 'phys', { basic: true });
        g.fx.slash(t.x, t.y, 2);
      }
    } else if (homeD > 30) {
      const inv = 1 / Math.max(1, homeD);
      this.x += (this.homeX - this.x) * inv * this.ms * 1.3 * dt;
      this.y += (this.homeY - this.y) * inv * this.ms * 1.3 * dt;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.06 * dt);
    }
  }
}

function laneStart(g, team, laneIdx) {
  const pts = LANES[laneIdx].pts;
  const p = team === 0 ? pts[0] : pts[pts.length - 1];
  return { x: p[0], y: p[1] };
}

/* ================================================================
 * AI brain for hero bots
 * ================================================================ */
class Brain {
  constructor(g, hero, role, laneIdx, skill) {
    this.g = g; this.h = hero; this.role = role;       // role: 'lane' | 'jungle'
    this.laneIdx = laneIdx;
    this.skill = skill;                                  // reaction/aggression 0..1
    this.mode = 'lane';
    this.thinkT = rand(0, 0.4);
    this.dest = { x: hero.x, y: hero.y };
    this.moveVec = null;
    this.path = null; this.pathT = 0; this.pathDest = null;
    this.navCell = g.navCell || 80;
    this.recallWish = false;
    this.buyT = rand(2, 6);
    this.defendSpot = null;
  }
  nudge() { this.dest.x = this.h.x + rand(-200, 200); this.dest.y = this.h.y + rand(-200, 200); }

  think() {
    const g = this.g, h = this.h;
    if (!h.alive) { this.moveVec = null; return; }
    const foes = [], allies = [];
    for (const u of g.units) {
      if (u.kind !== 'hero' || !u.alive) continue;
      if (u.team === h.team) allies.push(u);
      else if (g.unitVisibleTo(u, h.team)) foes.push(u);   // no x-ray AI
    }
    const hpP = h.hp / h.maxHp;
    const nearFoes = foes.filter(f => dist(f.x, f.y, h.x, h.y) < 800);
    const nearAllies = allies.filter(a => dist(a.x, a.y, h.x, h.y) < 800 && a !== h);

    // --- retreat logic ---
    if (this.mode !== 'retreat') {
      const threshold = nearFoes.length ? 0.32 : 0.2;
      if (hpP < threshold && h.level >= 2) this.mode = 'retreat';
    }
    if (this.mode === 'retreat') {
      const safe = nearFoes.every(f => dist(f.x, f.y, h.x, h.y) > 1300);
      if (hpP > 0.85 || (safe && hpP > 0.6)) { this.mode = 'lane'; }
      else {
        const t = THRONE_POS[h.team];
        this.dest = { x: t.x, y: t.y };
        // panic skills
        if (nearFoes.length) {
          this.castDefensive(nearFoes);
          const esc = h.def.skills[1];
          if (esc && esc.kind === 'dash' && !esc.away && h.cds[1] <= 0 && Math.random() < 0.5) this.cast(1, nearFoes[0]);
        }
        this.microMove(null);
        return;
      }
    }

    // --- recall for heal / shopping ---
    if (hpP < 0.3 && nearFoes.length === 0 && dist(h.x, h.y, THRONE_POS[h.team].x, THRONE_POS[h.team].y) > 1400 && h.recallT < 0) {
      h.startRecall();
    }

    // --- pick objective ---
    let goal = null;   // {x,y}
    let attackFocus = null;

    // defense: enemy hero threatening our towers/base?
    let defend = null;
    for (const f of foes) {
      const dBase = dist(f.x, f.y, THRONE_POS[h.team].x, THRONE_POS[h.team].y);
      if (dBase < 850) { defend = { x: THRONE_POS[h.team].x, y: THRONE_POS[h.team].y, pri: 3 }; break; }
      for (const t of g.towers[h.team]) {
        if (t.alive && dist(f.x, f.y, t.x, t.y) < 700) {
          const pri = t.tier === 3 ? 3 : t.tier;
          if (!defend || pri > defend.pri) defend = { x: t.x, y: t.y, pri };
        }
      }
    }
    const closestToDefend = defend && this.isAmongClosest(h, allies, defend, 3);
    if (defend && closestToDefend) {
      this.mode = 'defend';
      goal = defend;
    } else {
      this.mode = this.role === 'jungle' && g.time < 260 && h.level < 7 ? 'jungle' : 'lane';
      if (this.mode === 'jungle') {
        const camp = this.pickCamp();
        if (camp && camp.monster) goal = { x: camp.x, y: camp.y };
        else this.mode = 'lane';
      }
    }

    // choose lane to push
    let laneIdx = this.laneIdx;
    if (this.mode === 'lane' && (g.time > 290 || g.towersDown() >= 3)) {
      laneIdx = g.bestLane(h.team);
    }
    if (this.mode === 'lane' || !goal) {
      const front = g.laneFront(laneIdx, h.team);
      goal = goal || front;
    }

    // --- combat micro ---
    const range = h.range;
    // choose a hero to focus
    let heroFocus = null, bestScore = -1e9;
    for (const f of nearFoes) {
      const d = dist(f.x, f.y, h.x, h.y);
      if (d > range + 320) continue;
      const fhp = f.hp / f.maxHp;
      let score = -d - fhp * 400 + (nearAllies.length - nearFoes.length) * 120;
      if (f.kind === 'hero') score += (g.time < 75 ? 60 : 260);   // farm first, fight later
      if (score > bestScore) { bestScore = score; heroFocus = f; }
    }
    const courage = 0.5 + this.skill * 0.5;
    if (heroFocus && (heroFocus.hp / heroFocus.maxHp < 0.75 * courage || nearAllies.length >= nearFoes.length || h.hp / h.maxHp > 0.7)) {
      attackFocus = heroFocus;
      // cast skills at heroes
      this.castOffensive(heroFocus, nearFoes);
    } else {
      // farm minions / monsters / towers
      const m = g.pickTargetFor(h, range + 120, { minions: true });
      if (m) attackFocus = m;
      else {
        const camp = this.pickCamp();
        if (camp && camp.monster && dist(camp.x, camp.y, h.x, h.y) < 700) { goal = { x: camp.x, y: camp.y }; attackFocus = camp.monster; }
      }
      const tower = g.towerToHit(h, laneIdx);
      if (!attackFocus && tower && h.hp / h.maxHp > 0.45) attackFocus = tower;
    }
    h.prefTarget = attackFocus;

    // avoid diving towers without minions
    for (const t of g.towers[1 - h.team]) {
      if (!t.alive || t.invuln) continue;
      const d = dist(t.x, t.y, h.x, h.y);
      if (d < t.range + 30) {
        const minionsNear = g.units.some(u => u.kind === 'minion' && u.alive && u.team === h.team && dist(u.x, u.y, t.x, t.y) < t.range);
        if (!minionsNear) {
          goal = { x: h.x + (h.x - t.x), y: h.y + (h.y - t.y) };
          attackFocus = null; h.prefTarget = null;
        }
      }
    }

    this.dest = goal || { x: h.x, y: h.y };
    this.microMove(attackFocus);
    this.autoBuy();
  }

  isAmongClosest(h, allies, spot, n) {
    const all = [h, ...allies].map(a => ({ a, d: dist(a.x, a.y, spot.x, spot.y) })).sort((p, q) => p.d - q.d);
    return all.slice(0, n).some(e => e.a === h);
  }

  pickCamp() {
    const g = this.g, h = this.h;
    let best = null, bd = 1e9;
    for (const c of g.camps) {
      if (!c.monster || !c.monster.alive) continue;
      const own = h.team === 0 ? c.y > c.x : c.y < c.x;   // camps on own half
      if (!own && dist(c.x, c.y, h.x, h.y) > 900) continue;
      const contested = g.units.some(u => u.kind === 'hero' && u.alive && u.team !== h.team && dist(u.x, u.y, c.x, c.y) < 500);
      if (contested && !own) continue;
      const d = dist(c.x, c.y, h.x, h.y) + (c.kind === 'golem' ? 100 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  castOffensive(focus, nearFoes) {
    const h = this.h, sk = h.def.skills;
    for (let i = 0; i < 4; i++) {
      const s = sk[i];
      if (h.level < s.unlock || h.cds[i] > 0 || h.mana < s.mana) continue;
      if (Math.random() > this.skill) continue;
      const isUlt = i === 3;
      const d = dist(focus.x, focus.y, h.x, h.y);
      const skillRange = (s.range || s.radius || 260) + (s.dashDist ? 0 : 120);
      if (s.kind === 'heal' || s.kind === 'shield' || s.kind === 'sanctuary') continue;
      if (d > skillRange + 100) continue;
      if (isUlt && !(focus.hp / focus.maxHp < 0.55 || nearFoes.length >= 2)) continue;
      this.cast(i, focus);
      return;
    }
    // heal ally if someone low
    const sk1 = sk[1];
    if (sk1 && sk1.kind === 'heal' && h.cds[1] <= 0 && h.mana >= sk1.mana) {
      const ally = this.lowestAlly();
      if (ally && ally.hp / ally.maxHp < 0.55) this.cast(1, ally);
    }
  }
  castDefensive(foes) {
    const h = this.h, sk = h.def.skills;
    // item actives first
    for (const it of (h.activeItems ? h.activeItems() : [])) {
      const cd = (h.activeCds && h.activeCds[it.id]) || 0;
      if (cd > 0) continue;
      const low = h.hp / h.maxHp < 0.5;
      if ((it.active.kind === 'sprint' && low) || (it.active.kind === 'shield' && low)) {
        this.g.useItemActive(h, it.id, null);
        break;
      }
    }
    for (let i = 0; i < 4; i++) {
      const s = sk[i];
      if (h.level < s.unlock || h.cds[i] > 0 || h.mana < s.mana) continue;
      if ((s.kind === 'shield' || s.kind === 'sanctuary' || s.kind === 'buff') && h.hp / h.maxHp < 0.6) { this.cast(i, foes[0]); return; }
      if ((s.kind === 'heal' || s.kind === 'healnova') && h.hp / h.maxHp < 0.65) { this.cast(i, h); return; }
    }
  }
  lowestAlly() {
    const g = this.g, h = this.h;
    let best = null, bp = 2;
    for (const u of g.units) {
      if (u.kind !== 'hero' || !u.alive || u.team !== h.team) continue;
      if (dist(u.x, u.y, h.x, h.y) > 600) continue;
      const p = u.hp / u.maxHp;
      if (p < bp) { bp = p; best = u; }
    }
    return best;
  }
  cast(i, tgt) { this.g.aiCast(this.h, i, tgt); }

  autoBuy() {
    const h = this.h, g = this.g;
    this.buyT -= 0.4;
    if (this.buyT > 0) return;
    this.buyT = 4;
    if (!(g.atBase(h) || !h.alive)) return;
    const prefs = {
      Fighter: ['vorpal', 'titan', 'boots', 'aegis', 'vamp'],
      Marksman: ['vorpal', 'wind', 'boots', 'vamp', 'fury'],
      Mage: ['orb', 'vorpal', 'titan', 'boots', 'fury'],
      Tank: ['aegis', 'titan', 'boots', 'bulwark', 'vorpal'],
      Assassin: ['vorpal', 'boots', 'fury', 'vamp', 'wind'],
      Support: ['titan', 'orb', 'aegis', 'boots', 'vorpal'],
    }[h.def.role] || ['vorpal', 'boots'];
    for (const id of prefs) {
      const it = itemById(id);
      if (!it) continue;
      if ((h.items[id] || 0) > 0) continue;             // already built
      if (h.canBuy(it)) { h.buy(it); return; }
      // buy missing components, cheapest first
      if (it.builds) {
        const comps = it.builds.map(itemById).filter(c => (h.items[c.id] || 0) < 1 || true);
        const missing = it.builds.map(itemById)
          .filter(c => (h.items[c.id] || 0) < (it.builds.filter(x => x === c.id).length))
          .sort((a, b) => a.cost - b.cost);
        for (const c of missing) {
          if (h.canBuy(c)) { h.buy(c); return; }
        }
      }
    }
  }

  microMove(focus) {
    const g = this.g, h = this.h;
    let mx = 0, my = 0;
    const dGoal = dist(h.x, h.y, this.dest.x, this.dest.y);
    // A* pathing when the direct route is blocked
    if (dGoal > 160 && !g.navLOS(h.x, h.y, this.dest.x, this.dest.y)) {
      if (!this.path || this.pathT <= 0 || !this.pathDest || dist(this.pathDest.x, this.pathDest.y, this.dest.x, this.dest.y) > 200) {
        this.path = g.findPath(h.x, h.y, this.dest.x, this.dest.y);
        this.pathDest = { x: this.dest.x, y: this.dest.y };
        this.pathT = 2;
      }
    } else this.path = null;
    if (this.path && this.path.length && !focus) {
      while (this.path.length && dist(h.x, h.y, this.path[0].x, this.path[0].y) < this.navCell * 0.8) this.path.shift();
      const wp = this.path[0];
      if (wp) { mx = wp.x - h.x; my = wp.y - h.y; this.moveVec = (mx || my) ? { x: mx / (Math.hypot(mx, my) || 1), y: my / (Math.hypot(mx, my) || 1) } : null; return; }
    }
    if (focus && focus.alive && !focus.invuln) {
      const d = dist(h.x, h.y, focus.x, focus.y);
      const reach = h.range + focus.r + h.r;
      const ranged = h.range > 220;
      if (d > reach * 0.92) { mx = focus.x - h.x; my = focus.y - h.y; }
      else if (d < reach * 0.55 && ranged) { mx = h.x - focus.x; my = h.y - focus.y; }
      else if (Math.random() < 0.02) { mx = rand(-1, 1); my = rand(-1, 1); } // idle jiggle
    } else if (dGoal > 40) {
      mx = this.dest.x - h.x; my = this.dest.y - h.y;
      // small lane offset so bots don't stack
      const ox = Math.sin(this.h.id * 2.4) * 46, oy = Math.cos(this.h.id * 1.7) * 46;
      mx += ox * 0.02; my += oy * 0.02;
    }
    if (mx || my) { const l = Math.hypot(mx, my) || 1; this.moveVec = { x: mx / l, y: my / l }; }
    else this.moveVec = null;
  }

  update(dt) {
    this.thinkT -= dt;
    this.pathT = (this.pathT || 0) - dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.4 + rand(0, 0.1);
      this.think();
    }
  }
}

/* ================================================================
 * Game
 * ================================================================ */
class Game {
  constructor(playerHeroId, headless, opts) {
    this.headless = !!headless;
    this.opts = opts || {};
    this.mode = this.opts.mode || (this.headless ? 'server' : 'solo'); // solo | server | mirror
    this.units = []; this.projectiles = []; this.delayed = [];
    this.time = 0; this.state = 'play'; this.winner = -1;
    this.kills = [0, 0]; this.towersDownN = [0, 0];
    this.waveN = 0; this.waveT = CFG.FIRST_WAVE;
    this.teamLord = [-999, -999];
    this.turtleDone = false; this.lordDone = false;
    this.log = [];
    this.firstBlood = false;
    this.sfx = new SFX();
    this.cam = { x: 700, y: 2400, shake: 0 };
    this.annT = 0;
    this.humans = [];            // server: heroes controlled over the network

    this.theme = (this.headless ? MAP_THEMES.aether : currentTheme());
    this.fx = new FX(this);
    this.buildMap();
    if (this.mode !== 'mirror') this.spawnTeams(playerHeroId, this.opts.humans, this.opts.bots);
    else { this.units = []; this.heroes = [[], []]; this.player = null; }
    if (this.mode === 'solo') {
      if (!this.headless) {
        this.setupCanvas();
        this.buildHud(playerHeroId);
        this.input = new Input(this);
      }
    } else if (this.mode === 'mirror') {
      this.setupCanvas();
      this.buildHud(this.opts.myHeroId);
      this.input = new Input(this);
      this.mirrorCur = null; this.mirrorPrev = null; this.mirrorT = 0;
      this.mirrorMap = {};       // unit id -> mirror object
      this.mirrorTowerMap = {};  // snapshot tower id -> towersAll entry
      this.youId = this.opts.youId || 0;
      this.net = null;           // set by net.js
    }
  }

  /* ---------------- map ---------------- */
  buildMap() {
    // thrones
    this.throne = [new Throne(this, 0), new Throne(this, 1)];
    this.units.push(this.throne[0], this.throne[1]);
    // towers
    this.towers = [[], []];
    this.towersAll = [[], []];
    for (let team = 0; team < 2; team++) {
      for (const [laneIdx, tier, x, y] of TOWER_SPOTS) {
        const p = team === 0 ? [x, y] : [WORLD - x, WORLD - y];
        const t = new Tower(this, team, p[0], p[1], { laneIdx, tier });
        this.towers[team].push(t); this.towersAll[team].push(t); this.units.push(t);
      }
      const bp = BASE_TURRET[team];
      const bt = new Tower(this, team, bp.x, bp.y, { laneIdx: 1, tier: 3 });
      this.towers[team].push(bt); this.towersAll[team].push(bt); this.units.push(bt);
    }
    // camps
    this.camps = [];
    for (const c of CAMPS_BLUE) {
      this.camps.push({ ...c, monster: null, respT: 3, teamSide: 0 });
      const m = { ...c, x: WORLD - c.x, y: WORLD - c.y };
      this.camps.push({ ...m, monster: null, respT: 3 + rand(0, 3), teamSide: 1 });
    }
    this.camps.push({ id: 'turtle', x: TURTLE_POS.x, y: TURTLE_POS.y, kind: 'turtle', monster: null, respT: CFG.TURTLE_AT, teamSide: 2 });
    this.camps.push({ id: 'lord', x: LORD_POS.x, y: LORD_POS.y, kind: 'lord', monster: null, respT: CFG.LORD_AT, teamSide: 2 });
    // trees are solid obstacles (baked into ground)
    this.trees = [];
    const rng = mulberry32(1337);
    let guard = 0;
    while (this.trees.length < 150 && guard++ < 4000) {
      const x = 140 + rng() * (WORLD - 280), y = 140 + rng() * (WORLD - 280);
      // keep off lanes
      let ok = true;
      for (const lane of LANES) {
        for (let i = 0; i < lane.pts.length - 1 && ok; i++) {
          if (distToSeg(x, y, lane.pts[i], lane.pts[i + 1]) < 240) ok = false;
        }
      }
      if (!ok) continue;
      // keep off river band
      if (Math.abs(x - y) < 300) continue;
      // keep off bases/camps/towers
      if (dist(x, y, 400, 2800) < 520 || dist(x, y, 2800, 400) < 520) continue;
      for (const c of this.camps) if (dist(x, y, c.x, c.y) < 220) { ok = false; break; }
      if (!ok) continue;
      for (const t of this.units) if (t.kind === 'tower' && dist(x, y, t.x, t.y) < 220) { ok = false; break; }
      if (!ok) continue;
      this.trees.push({ x, y, r: 14 + rng() * 16 });
    }
    // rock walls — juke spots near mid entrances, river crossings & jungle
    this.rocks = [
      { x: 620, y: 2250, r: 34 }, { x: 670, y: 2330, r: 30 }, { x: 560, y: 2170, r: 28 },
      { x: 2580, y: 950, r: 34 }, { x: 2530, y: 870, r: 30 }, { x: 2640, y: 1030, r: 28 },
      { x: 1050, y: 1230, r: 30 }, { x: 1120, y: 1300, r: 26 },
      { x: 2150, y: 1970, r: 30 }, { x: 2080, y: 1900, r: 26 },
      { x: 1520, y: 2480, r: 32 }, { x: 1680, y: 720, r: 32 },
    ];
    this.obstacles = this.trees.map(t => ({ x: t.x, y: t.y, r: t.r * 0.72 }))
      .concat(this.rocks.map(rk => ({ x: rk.x, y: rk.y, r: rk.r * 0.85 })));
    this.bushes = BUSHES;

    /* --- navigation grid + vision grid (shared by AI, fog & server) --- */
    const N = 40;
    this.navN = N; this.navCell = WORLD / N;
    this.navBlocked = new Uint8Array(N * N);
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        const wx = (cx + 0.5) * this.navCell, wy = (cy + 0.5) * this.navCell;
        if (wx < 200 || wy < 200 || wx > WORLD - 200 || wy > WORLD - 200) { this.navBlocked[cy * N + cx] = 1; continue; }
        for (const o of this.obstacles) {
          if (dist(wx, wy, o.x, o.y) < o.r + this.navCell * 0.45) { this.navBlocked[cy * N + cx] = 1; break; }
        }
      }
    }
    // thrones block nav too
    for (const t of THRONE_POS) {
      const cx = Math.floor(t.x / this.navCell), cy = Math.floor(t.y / this.navCell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < N && y < N) this.navBlocked[y * N + x] = 1;
      }
    }
    this.vis = [new Uint8Array(N * N), new Uint8Array(N * N)];
    this.visT = 0;
  }

  /* ---------------- vision (fog of war) ---------------- */
  stampVis(team, x, y, r) {
    const N = this.navN, C = this.navCell, g = this.vis[team];
    const x0 = Math.max(0, Math.floor((x - r) / C)), x1 = Math.min(N - 1, Math.floor((x + r) / C));
    const y0 = Math.max(0, Math.floor((y - r) / C)), y1 = Math.min(N - 1, Math.floor((y + r) / C));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const wx = (cx + 0.5) * C, wy = (cy + 0.5) * C;
        if (dist2(wx, wy, x, y) <= r2) g[cy * N + cx] = 1;
      }
    }
  }
  maybeUpdateVision() {
    if (this.time - this.visT < 0.25) return;
    this.visT = this.time;
    this.vis[0].fill(0); this.vis[1].fill(0);
    for (const u of this.units) {
      if (!u.alive || u.team > 1) continue;
      const r = u.kind === 'hero' ? 640 : u.kind === 'minion' ? 360 : u.kind === 'tower' ? 520 : u.kind === 'ward' ? 450 : 720;
      this.stampVis(u.team, u.x, u.y, r);
    }
  }
  cellVisible(team, x, y) {
    const N = this.navN;
    const cx = Math.floor(x / this.navCell), cy = Math.floor(y / this.navCell);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
    return this.vis[team][cy * N + cx] === 1;
  }
  inBushAt(x, y) {
    for (const b of this.bushes) if (dist2(x, y, b.x, b.y) < b.r * b.r) return b;
    return null;
  }
  unitVisibleTo(u, team) {
    if (u.team === team) return true;
    if (!this.cellVisible(team, u.x, u.y)) return false;
    const b = this.inBushAt(u.x, u.y);
    if (!b) return true;
    // bush stealth: revealed only by very close enemies or shared bush
    for (const w of this.units) {
      if (!w.alive || w.team !== team) continue;
      if (dist2(w.x, w.y, u.x, u.y) < 240 * 240) return true;
      if (this.inBushAt(w.x, w.y) === b) return true;
    }
    return false;
  }

  /* ---------------- A* pathfinding ---------------- */
  navCellBlocked(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.navN || cy >= this.navN) return true;
    return this.navBlocked[cy * this.navN + cx] === 1;
  }
  navLOS(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1);
    const steps = Math.max(1, Math.ceil(d / (this.navCell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
      if (this.navCellBlocked(Math.floor(x / this.navCell), Math.floor(y / this.navCell))) return false;
    }
    return true;
  }
  findPath(x0, y0, x1, y1) {
    const N = this.navN;
    const sx = clamp(Math.floor(x0 / this.navCell), 0, N - 1), sy = clamp(Math.floor(y0 / this.navCell), 0, N - 1);
    let gx = clamp(Math.floor(x1 / this.navCell), 0, N - 1), gy = clamp(Math.floor(y1 / this.navCell), 0, N - 1);
    if (this.navCellBlocked(gx, gy)) {
      // nudge goal to nearest free cell
      let found = false;
      for (let r = 1; r < 5 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (!this.navCellBlocked(nx, ny)) { gx = nx; gy = ny; found = true; }
        }
      }
      if (!found) return [{ x: x1, y: y1 }];
    }
    const key = (x, y) => y * N + x;
    const open = [{ x: sx, y: sy, g: 0, f: 0 }];
    const came = new Map(), gsc = new Map();
    gsc.set(key(sx, sy), 0);
    const H = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 1.001;
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === gx && cur.y === gy) {
        // reconstruct + smooth
        const pts = [];
        let k = key(cur.x, cur.y);
        while (k !== undefined && came.has(k)) {
          pts.push({ x: ((k % N) + 0.5) * this.navCell, y: (Math.floor(k / N) + 0.5) * this.navCell });
          k = came.get(k);
        }
        pts.reverse();
        pts.push({ x: x1, y: y1 });
        // LOS smoothing
        const out = [];
        let i0 = 0;
        while (i0 < pts.length - 1) {
          let j = pts.length - 1;
          for (; j > i0 + 1; j--) if (this.navLOS(pts[i0].x, pts[i0].y, pts[j].x, pts[j].y)) break;
          out.push(pts[j]);
          i0 = j;
        }
        return out.length ? out : [{ x: x1, y: y1 }];
      }
      const dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.41],[1,-1,1.41],[-1,1,1.41],[-1,-1,1.41]];
      for (const [dx, dy, cost] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (this.navCellBlocked(nx, ny)) continue;
        if (dx && dy && (this.navCellBlocked(cur.x + dx, cur.y) || this.navCellBlocked(cur.x, cur.y + dy))) continue; // no corner cutting
        const nk = key(nx, ny);
        const ng = (gsc.get(key(cur.x, cur.y)) || 0) + cost;
        if (ng < (gsc.get(nk) === undefined ? Infinity : gsc.get(nk))) {
          gsc.set(nk, ng);
          came.set(nk, key(cur.x, cur.y));
          open.push({ x: nx, y: ny, g: ng, f: ng + H(nx, ny) });
        }
      }
    }
    return [{ x: x1, y: y1 }];
  }

  spawnTeams(playerHeroId, humans, botsRoster) {
    this.heroes = [[], []];
    if (humans) return this.spawnTeamsServer(humans, botsRoster);
    // player team
    const pool = HEROES.filter(h => h.id !== playerHeroId);
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    const playerDef = heroById(playerHeroId);
    const t0 = THRONE_POS[0];
    const names = AI_NAMES.slice().sort(() => Math.random() - 0.5);
    const roles = ['lane', 'lane', 'lane', 'jungle'];
    const lanes = [1, 0, 2, 2, 1];
    const p = new Hero(this, 0, playerDef, t0.x + 60, t0.y - 60, 'You', true);
    p.brain = this.headless ? new Brain(this, p, 'lane', 1, 0.6) : null;
    this.heroes[0].push(p); this.units.push(p);
    for (let i = 0; i < 4; i++) {
      const def = shuffled[i % shuffled.length];
      const a = new Hero(this, 0, def, t0.x + rand(-80, 120), t0.y - 60 + rand(-70, 70), names[i], false);
      a.brain = new Brain(this, a, roles[i], lanes[i + 1], 0.6);
      this.heroes[0].push(a); this.units.push(a);
    }
    const enemyDefs = HEROES.slice().sort(() => Math.random() - 0.5);
    const t1 = THRONE_POS[1];
    const eLanes = [0, 2, 1, 2, 1], eRoles = ['lane', 'lane', 'lane', 'jungle', 'lane'];
    for (let i = 0; i < 5; i++) {
      const e = new Hero(this, 1, enemyDefs[i], t1.x - 60, t1.y + 60, names[5 + i], false);
      e.brain = new Brain(this, e, eRoles[i], eLanes[i], 0.6);
      this.heroes[1].push(e); this.units.push(e);
    }
    this.player = p;
  }

  enemyOf(u) { return u.team === 1; }

  /* ---- server mode: humans + bots fill both teams ---- */
  spawnTeamsServer(humans, botsRoster) {
    const lanesByTeam = [[1, 0, 2, 2, 1], [0, 2, 1, 2, 1]];
    const usedHeroes = new Set(humans.map(h => h.heroId));
    const botDefs = HEROES.filter(h => !usedHeroes.has(h.id)).sort(() => Math.random() - 0.5);
    const names = AI_NAMES.slice().sort(() => Math.random() - 0.5);
    let botI = 0, nameI = 0;
    const botsByTeam = [[], []];
    for (const b of (botsRoster || [])) botsByTeam[b.team].push(b);
    for (let team = 0; team < 2; team++) {
      const t = THRONE_POS[team];
      const teamHumans = humans.filter(h => h.team === team);
      const teamBots = botsByTeam[team];
      for (let slot = 0; slot < 5; slot++) {
        const laneIdx = lanesByTeam[team][slot];
        const hm = teamHumans[slot];
        if (hm) {
          const h = new Hero(this, team, heroById(hm.heroId), t.x + rand(-60, 100), t.y - 60 + rand(-60, 60), hm.name, false);
          h.netInput = { move: null };
          h.humanLaneIdx = laneIdx;
          this.humans.push(h);
          this.heroes[team].push(h); this.units.push(h);
        } else {
          const drafted = teamBots.length ? teamBots.shift() : null;
          const def = drafted ? heroById(drafted.heroId) : botDefs[botI++ % botDefs.length];
          const nm = drafted ? drafted.name : names[nameI++ % names.length];
          const b = new Hero(this, team, def, t.x + rand(-60, 100), t.y - 60 + rand(-60, 60), nm, false);
          b.brain = new Brain(this, b, 'lane', laneIdx, 0.6);
          this.heroes[team].push(b); this.units.push(b);
        }
      }
    }
    this.player = this.humans[0] || null;
  }

  /* ---- network-controlled casting / locking ---- */
  castFromNet(h, i, aim) {
    if (!h || !h.alive || h.stunT > 0 || h.recallT >= 0) return;
    if (![0, 1, 2, 3].includes(i)) return;
    const s = h.def.skills[i];
    if (!s || h.level < s.unlock || h.cds[i] > 0 || h.mana < s.mana) return;
    const a = aim ? { x: clamp(aim[0], 0, WORLD), y: clamp(aim[1], 0, WORLD) } : null;
    this.executeSkill(h, i, a);
  }
  cycleLockFor(h) {
    if (!h) return;
    let foes = this.units.filter(u => u.kind === 'hero' && u.alive && u.team !== h.team && dist(u.x, u.y, h.x, h.y) < 1000);
    if (!foes.length) {
      foes = this.units.filter(u => u.alive && (u.team === 2 || (u.team !== h.team && (u.kind === 'tower' || u.kind === 'throne') && !u.invuln)) &&
        dist(u.x, u.y, h.x, h.y) < 700);
    }
    if (!foes.length) { h.lockTarget = null; return; }
    foes.sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y));
    const i = foes.indexOf(h.lockTarget);
    h.lockTarget = foes[(i + 1) % foes.length];
  }

  towersDown() { return this.towersDownN[0] + this.towersDownN[1]; }

  atBase(h) { const t = THRONE_POS[h.team]; return dist(h.x, h.y, t.x, t.y) < 430; }

  /* lane helpers */
  lanePoints(laneIdx) { return LANES[laneIdx].pts; }
  laneFront(laneIdx, team) {
    // furthest friendly minion along lane; fall back to own outer tower
    const pts = LANES[laneIdx].pts;
    let best = null, bestProg = -1;
    for (const u of this.units) {
      if (u.kind !== 'minion' || !u.alive || u.team !== team || u.laneIdx !== laneIdx) continue;
      const prog = u.team === 0 ? u.wpi * 1000 - dist(u.x, u.y, ...pts[Math.min(u.wpi, pts.length - 1)]) * 0.5
                                : (pts.length - 1 - u.wpi) * 1000 - dist(u.x, u.y, ...pts[Math.max(0, pts.length - 1 - u.wpi)]) * 0.5;
      if (prog > bestProg) { bestProg = prog; best = u; }
    }
    if (best) {
      const enemyT = this.laneEnemyTurret(laneIdx, team);
      let tx = best.x, ty = best.y;
      if (enemyT) {
        const d = dist(best.x, best.y, enemyT.x, enemyT.y);
        if (d < 340) { const f = (d - 240) / Math.max(1, d); tx = best.x + (enemyT.x - best.x) * f; ty = best.y + (enemyT.y - best.y) * f; }
      }
      return { x: tx, y: ty };
    }
    // hold near own most-advanced alive tower on that lane
    const own = this.towers[team].filter(t => t.alive && t.laneIdx === laneIdx && t.tier < 3)
      .sort((a, b) => dist(a.x, a.y, ...pts[0]) - dist(b.x, b.y, ...pts[0]))[0];
    const dir = team === 0 ? pts[1] : pts[pts.length - 2];
    if (own) {
      const d = Math.max(1, dist(own.x, own.y, dir[0], dir[1]));
      return { x: own.x + (dir[0] - own.x) / d * 220, y: own.y + (dir[1] - own.y) / d * 220 };
    }
    const t = THRONE_POS[team];
    return { x: t.x + (team === 0 ? 260 : -260), y: t.y + (team === 0 ? -260 : 260) };
  }
  laneEnemyTurret(laneIdx, team) {
    const list = this.towers[1 - team].filter(t => t.alive && t.laneIdx === laneIdx && t.tier < 3)
      .sort((a, b) => a.tier - b.tier);
    return list[0] || this.towers[1 - team].find(t => t.alive && t.tier === 3);
  }
  towerToHit(h, laneIdx) {
    const t = this.laneEnemyTurret(laneIdx, h.team);
    if (!t || t.invuln) return null;
    if (dist(h.x, h.y, t.x, t.y) > h.range + t.r + 60) return null;
    const minionsNear = this.units.some(u => u.kind === 'minion' && u.alive && u.team === h.team && dist(u.x, u.y, t.x, t.y) < 420);
    return minionsNear ? t : null;
  }
  bestLane(team) {
    let best = 1, bestScore = -1e9;
    for (let l = 0; l < 3; l++) {
      const enemyTs = this.towers[1 - team].filter(t => t.alive && t.laneIdx === l).length;
      const ownMinions = this.units.filter(u => u.kind === 'minion' && u.alive && u.team === team && u.laneIdx === l).length;
      const score = -enemyTs * 100 + ownMinions;
      if (score > bestScore) { bestScore = score; best = l; }
    }
    return best;
  }

  /* ---------------- targeting ---------------- */
  pickTargetFor(u, range, opts) {
    let best = null, bestScore = 1e9;
    const preferHero = u.kind === 'hero' && !!opts.heroPriority;
    for (const e of this.units) {
      if (!e.alive || e.team === u.team || e.team === 2 || e === u) continue;
      if (e.kind === 'hero' && u.kind === 'minion' && opts && opts.noHeroes) continue;
      if ((e.kind === 'tower' || e.kind === 'throne') && e.invuln) continue;
      if (u.team !== 2 && e.team === 2 && !u.isPlayer) continue; // only the player auto-attacks monsters
      if (u.team !== 2 && e.team !== 2 && !this.unitVisibleTo(e, u.team)) continue; // fog of war
      const d = dist(u.x, u.y, e.x, e.y);
      const reach = range + e.r;
      if (d > reach) continue;
      let score = d;
      if (e.kind === 'hero') score -= preferHero ? 400 : 130;
      if (e.kind === 'tower' || e.kind === 'throne') score += 260;
      if (e.team === 2) score += 120;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /* ---------------- combat ---------------- */
  dealDamage(src, tgt, amount, dtype, opts) {
    if (this.state !== 'play') return 0;
    if (!tgt || !tgt.alive) return 0;
    if ((tgt.kind === 'tower' || tgt.kind === 'throne') && tgt.invuln) {
      if (opts.basic && src.isPlayer) this.fx.text(tgt.x, tgt.y - tgt.r - 14, 'IMMUNE', '#94a3b8');
      return 0;
    }
    let amt = amount;
    if (src.dmgAmp) amt *= src.dmgAmp;
    if (tgt.markT > 0) amt *= 1 + tgt.markAmp;
    if (tgt.kind === 'hero') tgt.lastDamagedT = this.time;
    // nexus / base under attack warning (throttled 25s, defenders only)
    if ((tgt.kind === 'throne' || (tgt.kind === 'tower' && tgt.tier === 3)) && src.team !== tgt.team && src.team !== 2) {
      const t = tgt.team;
      if (!this.nexusWarnT) this.nexusWarnT = [-99, -99];
      if (this.time - this.nexusWarnT[t] > 25) {
        this.nexusWarnT[t] = this.time;
        const side = t === 0 ? 'BLUE' : 'RED';
        this.announce('⚠️ YOUR NEXUS IS UNDER ATTACK!', side + ' base is being sieged!', 2.2, t);
      }
    }
    if (src.kind === 'hero' && src.def.id === 'nyx' && !opts.basic && tgt.kind !== 'tower' && tgt.kind !== 'throne') {
      tgt.applySlow(0.2, 1);                                                  // passive: Void Echo
    }
    if (dtype === 'phys') amt *= 100 / (100 + (tgt.defn !== undefined ? tgt.defn : 0));
    else if (dtype === 'magic') amt *= 100 / (100 + (tgt.defn !== undefined ? tgt.defn * 0.6 : 0));
    // shields
    if (tgt.shieldVal > 0) {
      const absorbed = Math.min(tgt.shieldVal, amt);
      tgt.shieldVal -= absorbed; amt -= absorbed;
    }
    tgt.hp -= amt;
    tgt.lastAttacker = src; tgt.lastAttackerT = this.time;
    if (src.kind === 'hero') {
      src.dmgDealt += amt;
      tgt.damagers[src.id] = this.time;
    }
    if (tgt.kind === 'hero' && tgt.recallT >= 0) tgt.cancelRecall();
    // visuals
    const crit = opts && opts.crit;
    this.fx.dmgText(tgt.x + rand(-12, 12), tgt.y - tgt.r - 8, Math.round(amt), dtype, crit);
    if (opts && opts.basic && src.lifesteal) {
      src.hp = Math.min(src.maxHp, src.hp + amt * src.lifesteal);
    }
    if (tgt.hp <= 0) this.kill(tgt, src);
    return amt;
  }

  kill(tgt, src) {
    if (!tgt.alive) return;
    const heroSrc = src && src.kind === 'hero' ? src : null;
    if (heroSrc && heroSrc.def.id === 'morrow' && heroSrc.alive) {           // passive: Soul Harvest
      heroSrc.hp = Math.min(heroSrc.maxHp, heroSrc.hp + heroSrc.maxHp * 0.06);
    }
    if (tgt.kind === 'minion') {
      tgt.alive = false;
      this.fx.burst(tgt.x, tgt.y, TEAM_COLORS[tgt.team], 6);
      // gold: last-hit by hero or nearest allied hero
      let earner = heroSrc && heroSrc.team !== tgt.team ? heroSrc : null;
      if (!earner) {
        let bd = 900;
        for (const h of this.heroes[1 - tgt.team]) {
          if (!h.alive) continue;
          const d = dist(h.x, h.y, tgt.x, tgt.y);
          if (d < bd) { bd = d; earner = h; }
        }
      }
      if (earner) earner.gainGold(tgt.gold);
      this.shareXp(tgt.xp, 1 - tgt.team, tgt.x, tgt.y, 1200);
      this.units = this.units.filter(u => u !== tgt);
    } else if (tgt.kind === 'ward') {
      tgt.alive = false;
      this.fx.burst(tgt.x, tgt.y, '#67e8f9', 10);
      this.units = this.units.filter(u => u !== tgt);
    } else if (tgt.kind === 'monster') {
      tgt.alive = false;
      this.fx.burst(tgt.x, tgt.y, '#a78bfa', 14);
      const team = heroSrc ? heroSrc.team : (tgt.lastAttacker && tgt.lastAttacker.kind === 'hero' ? tgt.lastAttacker.team : 0);
      if (tgt.monKind === 'lizard' || tgt.monKind === 'golem') {
        this.shareXp(tgt.xp, team, tgt.x, tgt.y, 1100);
        for (const h of this.heroes[team]) if (dist(h.x, h.y, tgt.x, tgt.y) < 1100) h.gainGold(tgt.gold);
        if (tgt.monKind === 'golem') {
          for (const h of this.heroes[team]) if (dist(h.x, h.y, tgt.x, tgt.y) < 1100) h.buffRedT = 60;
          this.announce('RED BUFF', TEAM_COLORS[team] === TEAM_COLORS[0] ? 'Blue team gains +12% damage' : 'Red team gains +12% damage', 1.4);
        }
        tgt.camp.monster = null;
        tgt.camp.respT = tgt.monKind === 'golem' ? 110 : 55;
      } else if (tgt.monKind === 'turtle') {
        for (const h of this.heroes[team]) { h.gainGold(150); h.gainXp(160); }
        this.announce('🐢 TURTLE SLAIN', 'Team gold +150 each', 2);
        tgt.camp.monster = null; tgt.camp.respT = 150;
      } else if (tgt.monKind === 'lord') {
        this.teamLord[team] = this.time + 75;
        for (const h of this.heroes[team]) h.gainGold(120);
        this.announce('👑 LORD SLAIN', (team === 0 ? 'BLUE' : 'RED') + ' team: +15% damage for 75s', 2.4);
        this.sfx.play('tower');
        tgt.camp.monster = null; tgt.camp.respT = 210;
      }
      this.units = this.units.filter(u => u !== tgt);
    } else if (tgt.kind === 'tower') {
      tgt.alive = false;
      this.towersDownN[1 - tgt.team]++;
      this.fx.burst(tgt.x, tgt.y, '#fbbf24', 26);
      this.cam.shake = Math.max(this.cam.shake, this.player && dist(tgt.x, tgt.y, this.player.x, this.player.y) < 900 ? 12 : 4);
      this.sfx.play('tower');
      for (const h of this.heroes[1 - tgt.team]) h.gainGold(tgt.tier === 3 ? 220 : 120);
      this.announce('🏰 TOWER DESTROYED', (tgt.team === 0 ? 'BLUE' : 'RED') + ' loses a ' + (tgt.tier === 3 ? 'BASE TURRET' : 'tower'), 2);
      this.killfeed((1 - tgt.team), '🏰', tgt.team, 'tower');
      this.units = this.units.filter(u => u !== tgt);
    } else if (tgt.kind === 'throne') {
      tgt.alive = false;
      this.fx.burst(tgt.x, tgt.y, '#fbbf24', 60);
      this.endGame(1 - tgt.team);
    } else if (tgt.kind === 'hero') {
      tgt.die(heroSrc || src);
    }
  }

  shareXp(xp, team, x, y, radius) {
    const near = this.heroes[team].filter(h => h.alive && dist(h.x, h.y, x, y) < radius);
    if (!near.length) return;
    const each = Math.max(1, xp / near.length) * (near.length > 1 ? 1.25 : 1); // slight shared bonus
    for (const h of near) h.gainXp(each);
  }

  onHeroDeath(h, killer) {
    const g = this;
    g.fx.burst(h.x, h.y, TEAM_COLORS[h.team], 18);
    g.fx.heroDeath(h);
    g.sfx.play('death');
    // rewards
    const killerHero = killer && killer.kind === 'hero' && killer.team !== h.team ? killer : null;
    let creditTeam = killerHero ? killerHero.team : (killer && killer.team !== h.team && killer.team !== 2 ? killer.team : 1 - h.team);
    g.kills[creditTeam]++;
    if (killerHero) {
      killerHero.kills++; killerHero.streak++;
      let gold = 120 + 16 * h.level + Math.max(0, h.streak) * 25;
      killerHero.gainGold(gold);
      // shutdown announce
      const streakNames = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'MANIAC', 5: 'SAVAGE' };
      if (killerHero.streak >= 2) {
        const nm = streakNames[Math.min(5, killerHero.streak)];
        g.announce((killerHero.isPlayer ? 'YOU ARE ON FIRE — ' : '') + nm, killerHero.name + ' · ' + killerHero.def.emoji + ' ' + killerHero.def.name, 1.8);
      }
    }
    // xp share
    g.shareXp(90 + 18 * h.level, creditTeam, h.x, h.y, 1400);
    // assists
    for (const a of g.heroes[creditTeam]) {
      if (a === killerHero || !a.alive) continue;
      if (h.damagers[a.id] !== undefined && g.time - h.damagers[a.id] < 8) { a.assists++; a.gainGold(40); }
    }
    // first blood
    if (!g.firstBlood) {
      g.firstBlood = true;
      g.announce('🩸 FIRST BLOOD', (killerHero ? killerHero.name : 'BLUE/RED') + ' draws first blood', 2);
    }
    g.killfeed(creditTeam, killerHero ? killerHero.def.emoji : '💀', h.team, h.name);
    if (h.isPlayer || (killerHero && killerHero.isPlayer)) g.cam.shake = Math.max(g.cam.shake, 10);
    g.sfx.play('kill');
    if (h.isPlayer && !g.headless) g.openShopOnDeath();
  }

  endGame(winner) {
    if (this.state === 'end') return;
    this.state = 'end'; this.winner = winner;
    this.sfx.play(winner === 0 ? 'victory' : 'defeat');
    this.sfx.stopMusic();
    if (!this.headless && this.player) playVoice(winner === this.player.team ? 'victory' : 'defeat');
    this.log.push(`END winner=${winner === 0 ? 'BLUE' : 'RED'} time=${Math.round(this.time)}s kills=${this.kills[0]}-${this.kills[1]}`);
    if (!this.headless) showEndScreen(this);
  }

  /* ---------------- item actives ---------------- */
  useItemActive(h, itemId, aim) {
    if (!h || !h.alive || this.state !== 'play') return;
    const it = itemById(itemId);
    if (!it || !it.active || !(h.items[itemId] > 0)) return;
    if ((h.activeCds && h.activeCds[itemId]) > 0) return;
    h.activeCds = h.activeCds || {};
    h.activeCds[itemId] = it.active.cd;
    const a = aim || { x: h.x + Math.cos(h.facing) * 300, y: h.y + Math.sin(h.facing) * 300 };
    switch (it.active.kind) {
      case 'sprint':
        h.buffs.push({ name: it.active.name, msAdd: 0.35, dur: 3 });
        this.fx.ring(h.x, h.y, 70, '#7ee2a8');
        break;
      case 'shield':
        h.shieldVal += 350; h.shieldT = 4;
        this.fx.shieldFx(h);
        break;
      case 'blink': {
        let dx = a.x - h.x, dy = a.y - h.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        this.fx.dash(h.x, h.y, h.x + dx * 320, h.y + dy * 320, '#c084fc');
        h.x = clamp(h.x + dx * 320, 60, WORLD - 60);
        h.y = clamp(h.y + dy * 320, 60, WORLD - 60);
        if (h.recallT >= 0) h.cancelRecall();
        break;
      }
    }
    this.sfx.play('skill');
  }

  /* ---------------- vision wards ---------------- */
  placeWard(h) {
    if (!h || !h.alive || this.state !== 'play') return;
    if ((h.wardCdT || 0) > 0) return;
    const active = this.units.filter(u => u.kind === 'ward' && u.alive && u.team === h.team).length;
    if (active >= 2) {
      if (h.isPlayer) this.fx.text(h.x, h.y - 40, 'Max wards (2)', '#94a3b8');
      return;
    }
    h.wardCdT = 60;
    const w = new Ward(this, h.team, h.x, h.y);
    this.units.push(w);
    this.fx.burst(h.x, h.y, '#a5f3fc', 10);
    this.fx.ring(h.x, h.y, 120, '#67e8f9');
    this.sfx.play('recall');
  }

  /* ---------------- basic attacks ---------------- */
  tryBasicAttack(h) {
    if (h.atkCd > 0 || !h.alive) return;
    // player lock target
    let tgt = null;
    if (h.lockTarget && h.lockTarget.alive && !h.lockTarget.invuln &&
        dist(h.x, h.y, h.lockTarget.x, h.lockTarget.y) <= h.range + h.lockTarget.r + h.r) tgt = h.lockTarget;
    if (!tgt && h.prefTarget && h.prefTarget.alive && !h.prefTarget.invuln &&
        dist(h.x, h.y, h.prefTarget.x, h.prefTarget.y) <= h.range + h.prefTarget.r + h.r) tgt = h.prefTarget;
    if (!tgt) tgt = this.pickTargetFor(h, h.range, { heroPriority: false });
    if (!tgt) return;
    h.atkCd = 1 / h.aspd;
    h.attackAt = this.time;
    h.facing = Math.atan2(tgt.y - h.y, tgt.x - h.x);
    let dmg = h.atk;
    let crit = false;
    if (h.crit && Math.random() < h.crit) { dmg *= 2; crit = true; }
    h.attackCount = (h.attackCount || 0) + 1;
    if (h.def.id === 'vex' && h.attackCount % 4 === 0) { dmg *= 1.45; crit = true; }  // passive: Deadeye
    const dtype = h.def.stats.dtype;
    if (h.range > 200) {
      this.spawnProj({ src: h, tgt, dmg, speed: 950, dtype, crit, heroShot: true });
      this.sfx.play('shot');
    } else {
      this.dealDamage(h, tgt, dmg, dtype, { basic: true, crit });
      this.fx.slash(tgt.x, tgt.y, h.team);
      this.sfx.play('hit');
      if (h.cleaving) {
        for (const e of this.units) {
          if (e === tgt || !e.alive || e.team === h.team || e.team === 2 || (e.kind === 'tower' && e.invuln)) continue;
          if (dist(e.x, e.y, tgt.x, tgt.y) < 175) this.dealDamage(h, e, dmg * 0.7, dtype, { basic: true });
        }
        this.fx.ring(tgt.x, tgt.y, 175, h.def.tint);
      }
    }
  }

  /* ---------------- projectiles ---------------- */
  spawnProj(o) {
    this.projectiles.push({
      x: o.src.x, y: o.src.y - 14, tgt: o.tgt, src: o.src, team: o.src.team,
      dmg: o.dmg, speed: o.speed || 900, dtype: o.dtype || 'phys',
      homing: true, r: o.tower ? 10 : o.heroShot ? 7 : 5,
      color: o.tower ? '#fde68a' : TEAM_COLORS[o.src.team],
      crit: o.crit, basic: true, life: 3,
    });
  }
  spawnLinearProj(src, dx, dy, o) {
    this.projectiles.push({
      x: src.x, y: src.y - 10, dx, dy, team: src.team, src,
      dmg: o.dmg, speed: o.speed, dtype: o.magic ? 'magic' : 'phys',
      pierce: !!o.pierce, stunHero: o.stunHero || 0, slowPct: o.stunHero ? 0.3 : (o.slowPct || 0),
      slowDur: o.slowDur || 0, r: 14, color: o.magic ? '#c084fc' : TEAM_COLORS[src.team],
      homing: false, traveled: 0, maxDist: o.range, life: 3, hitSet: new Set(),
      drain: o.drain || 0,
    });
  }
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.homing) {
        const t = p.tgt;
        if (!t || !t.alive) { p.life = -1; continue; }
        const d = dist(p.x, p.y, t.x, t.y);
        if (d < t.r + p.r + 8) {
          this.dealDamage(p.src, t, p.dmg, p.dtype, { basic: p.basic, crit: p.crit });
          this.fx.burst(p.x, p.y, p.color, 3);
          p.life = -1;
          continue;
        }
        p.x += (t.x - p.x) / d * p.speed * dt;
        p.y += (t.y - 10 - p.y) / d * p.speed * dt;
      } else {
        p.x += p.dx * p.speed * dt; p.y += p.dy * p.speed * dt;
        p.traveled += p.speed * dt;
        if (p.traveled > p.maxDist || p.x < 0 || p.y < 0 || p.x > WORLD || p.y > WORLD) { p.life = -1; continue; }
        for (const e of this.units) {
          if (!e.alive || e.team === p.team || e.team === 2 || p.hitSet.has(e.id)) continue;
          if ((e.kind === 'tower' || e.kind === 'throne') && e.invuln) continue;
          if (dist(p.x, p.y, e.x, e.y) > e.r + p.r) continue;
          p.hitSet.add(e.id);
          const dealt = this.dealDamage(p.src, e, p.dmg, p.dtype, { basic: false });
          if (p.stunHero && e.kind === 'hero') e.applyStun(p.stunHero);
          if (p.slowPct) e.applySlow(p.slowPct, p.slowDur);
          if (p.drain && dealt && p.src.alive) {
            p.src.hp = Math.min(p.src.maxHp, p.src.hp + dealt * p.drain);
            this.fx.heal(p.src, dealt * p.drain);
          }
          this.fx.burst(p.x, p.y, p.color, 5);
          if (!p.pierce) { p.life = -1; break; }
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  /* ---------------- skills ---------------- */
  skillAim(h, i) {
    // returns a point to aim at
    if (h.isPlayer && !this.headless && this.input && this.input.aimPt) return this.input.aimPt(h);
    // AI: predict target motion
    const s = h.def.skills[i];
    let tgt = null;
    if (s.kind === 'heal' || s.kind === 'sanctuary' || s.kind === 'shield' || s.kind === 'buff') tgt = h;
    else {
      let bd = (s.range || s.dashDist || 500) + 150;
      for (const e of this.units) {
        if (!e.alive || e.team === h.team || e.team === 2) continue;
        if (e.kind !== 'hero' && (s.kind === 'blink' || s.kind === 'strike')) continue;
        const d = dist(e.x, e.y, h.x, h.y);
        const w = e.kind === 'hero' ? -200 : 0;
        if (d + w < bd) { bd = d + w; tgt = e; }
      }
    }
    if (tgt) return { x: tgt.x + tgt.vx * 0.35, y: tgt.y + tgt.vy * 0.35 };
    return { x: h.x + Math.cos(h.facing) * 400, y: h.y + Math.sin(h.facing) * 400 };
  }

  aiCast(h, i, tgt) {
    const s = h.def.skills[i];
    if (h.level < s.unlock || h.cds[i] > 0 || h.mana < s.mana || h.stunT > 0 || !h.alive) return false;
    // pass tgt through as aim by temporarily storing
    h._aiAim = tgt ? { x: tgt.x + (tgt.vx || 0) * 0.35, y: tgt.y + (tgt.vy || 0) * 0.35 } : null;
    return this.executeSkill(h, i, h._aiAim);
  }

  playerItemActive() {
    const p = this.player;
    if (!p || !p.alive) return;
    const act = this.activeItemsOf(p)[0];
    if (!act) return;
    if (this.mode === 'mirror') {
      const aim = this.input && this.input.aimPt ? this.input.aimPt(p) : null;
      if (this.net && this.net.sendActive) this.net.sendActive(act.id, aim);
      return;
    }
    const aim = this.input && this.input.aimPt ? this.input.aimPt(p) : null;
    this.useItemActive(p, act.id, aim);
  }

  playerSkillUp(i) {
    const h = this.player;
    if (!h || this.state !== 'play') return;
    if (this.mode === 'mirror') {
      if (this.net && this.net.sendSkillUp) this.net.sendSkillUp(i);
      return;
    }
    h.allocate(i, this);
  }

  playerCast(i) {
    const h = this.player;
    if (!h || !h.alive || this.state !== 'play') return;
    const s = h.def.skills[i];
    if (!s) return;
    if (this.mode === 'mirror') {
      if (this.net && this.net.sendCast) this.net.sendCast(i, this.skillAim(h, i));
      return;
    }
    if (h.level < s.unlock) { this.fx.text(h.x, h.y - 40, 'Unlocks at Lv ' + s.unlock, '#fca5a5'); return; }
    if (h.cds[i] > 0) return;
    if (h.mana < s.mana) { this.fx.text(h.x, h.y - 40, 'Not enough mana', '#67e8f9'); return; }
    if (h.stunT > 0 || h.recallT >= 0) return;
    this.executeSkill(h, i, null);
  }

  executeSkill(h, i, aimOverride) {
    const s = h.def.skills[i];
    if (h.cds[i] > 0 || h.mana < s.mana) return false;
    const aim = aimOverride || this.skillAim(h, i);
    const slv = (h.skillLv && h.skillLv[i]) || 1;
    const lvl = (slv - 1) * (i === 3 ? 7 : 2.8);   // rank scaling: max rank ≈ old lv15 power
    const dmg = (s.dmg || 0) + (s.dmgL || 0) * lvl;
    const dtype = s.magic ? 'magic' : 'phys';
    let dx = aim.x - h.x, dy = aim.y - h.y;
    let dl = Math.hypot(dx, dy);
    if (dl < 1) { dx = Math.cos(h.facing); dy = Math.sin(h.facing); dl = 1; }
    dx /= dl; dy /= dl;

    const hurt = (e, amount, opts) => this.dealDamage(h, e, amount, dtype, opts || {});

    switch (s.kind) {
      case 'nova': {
        this.fx.ring(h.x, h.y, s.radius, h.def.tint);
        this.fx.slash(h.x, h.y, h.team, s.radius);
        for (const e of this.units) {
          if (!e.alive || e.team === h.team || e.team === 2 || (e.kind === 'tower' && e.invuln)) continue;
          if (dist(e.x, e.y, h.x, h.y) > s.radius + e.r) continue;
          const dealt = hurt(e, dmg);
          if (s.stunDur && e.kind === 'hero') { e.applyStun(s.stunDur); this.fx.stun(e); }
          if (s.stunDur && e.kind !== 'hero') e.applySlow(0.5, s.stunDur);
          if (s.slowPct) e.applySlow(s.slowPct, s.slowDur);
          if (s.lifesteal && dealt) h.hp = Math.min(h.maxHp, h.hp + dealt * s.lifesteal);
        }
        break;
      }
      case 'dash': {
        let ddx = dx, ddy = dy;
        if (s.away) {
          let nearest = null, nd = 600;
          for (const e of this.units) {
            if (!e.alive || e.team === h.team || e.team === 2) continue;
            const d = dist(e.x, e.y, h.x, h.y);
            if (d < nd) { nd = d; nearest = e; }
          }
          if (nearest) { ddx = (h.x - nearest.x); ddy = (h.y - nearest.y); const l = Math.hypot(ddx, ddy) || 1; ddx /= l; ddy /= l; }
        }
        const x0 = h.x, y0 = h.y;
        h.x = clamp(h.x + ddx * s.dashDist, 60, WORLD - 60);
        h.y = clamp(h.y + ddy * s.dashDist, 60, WORLD - 60);
        h.facing = Math.atan2(ddy, ddx);
        this.fx.dash(x0, y0, h.x, h.y, h.def.tint);
        for (const e of this.units) {
          if (!e.alive || e.team === h.team || e.team === 2 || (e.kind === 'tower' && e.invuln)) continue;
          if (distToSeg(e.x, e.y, [x0, y0], [h.x, h.y]) < 95 + e.r) {
            hurt(e, dmg);
            if (s.slowPct) e.applySlow(s.slowPct, s.slowDur);
          }
        }
        if (s.aspdAdd) h.buffs.push({ name: s.name, aspdAdd: s.aspdAdd, dur: s.dur || 3 });
        if (s.atkAdd) h.buffs.push({ name: s.name, atkAdd: s.atkAdd, dur: s.dur || 3 });
        break;
      }
      case 'proj': {
        this.spawnLinearProj(h, dx, dy, { ...s, dmg });
        break;
      }
      case 'buff': {
        const b = { name: s.name, dur: s.dur };
        if (s.aspdAdd) b.aspdAdd = s.aspdAdd;
        if (s.msAdd) b.msAdd = s.msAdd;
        if (s.atkAdd) b.atkAdd = s.atkAdd;
        if (s.rangeAdd) b.rangeAdd = s.rangeAdd;
        if (s.lifestealAdd) b.lsAdd = s.lifestealAdd;
        if (s.cleave) b.cleave = true;
        h.buffs.push(b);
        this.fx.ring(h.x, h.y, 90, h.def.tint);
        break;
      }
      case 'shield': {
        h.shieldVal += s.shield + (s.shieldL || 0) * lvl;
        h.shieldT = s.dur || 4;
        h.buffs.push({ name: s.name, defAdd: s.defAdd || 0, dur: s.dur || 4 });
        this.fx.shieldFx(h);
        this.sfx.play('heal');
        break;
      }
      case 'heal': {
        let tgt = h, lowP = h.hp / h.maxHp;
        for (const a of this.units) {
          if (!a.alive || a.kind !== 'hero' || a.team !== h.team) continue;
          if (dist(a.x, a.y, h.x, h.y) > s.radius) continue;
          const p = a.hp / a.maxHp;
          if (p < lowP) { lowP = p; tgt = a; }
        }
        const amt = s.heal + (s.healL || 0) * lvl;
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
        tgt.slowT = 0;
        this.fx.heal(tgt, amt);
        this.sfx.play('heal');
        break;
      }
      case 'strike': {
        let tgt = null, bd = s.range;
        for (const e of this.units) {
          if (!e.alive || e.team === h.team || e.team === 2) continue;
          if (e.kind !== 'hero' && bd < 200) continue;
          const d = dist(e.x, e.y, h.x, h.y);
          if (d < bd) { bd = d; tgt = e; }
        }
        if (tgt) {
          h.facing = Math.atan2(tgt.y - h.y, tgt.x - h.x);
          hurt(tgt, dmg);
          tgt.markT = s.markDur; tgt.markAmp = s.markAmp || 0.25;
          this.fx.text(tgt.x, tgt.y - tgt.r - 18, '☠ MARKED', '#f472b6');
          this.fx.slash(tgt.x, tgt.y, h.team);
        }
        break;
      }
      case 'blink': {
        let tgt = null, lowP = 2;
        for (const e of this.units) {
          if (!e.alive || e.kind !== 'hero' || e.team === h.team) continue;
          if (dist(e.x, e.y, h.x, h.y) > s.range) continue;
          const p = e.hp / e.maxHp;
          if (p < lowP) { lowP = p; tgt = e; }
        }
        if (!tgt) {
          // fallback: nearest enemy hero on map within 1.3x range else abort refund
          let bd = s.range * 1.4;
          for (const e of this.units) {
            if (!e.alive || e.kind !== 'hero' || e.team === h.team) continue;
            const d = dist(e.x, e.y, h.x, h.y);
            if (d < bd) { bd = d; tgt = e; }
          }
        }
        if (!tgt) { this.fx.text(h.x, h.y - 40, 'No target', '#94a3b8'); return false; }
        this.fx.dash(h.x, h.y, tgt.x, tgt.y, h.def.tint);
        const d0 = Math.max(1, dist(h.x, h.y, tgt.x, tgt.y));
        h.x = clamp(tgt.x + (h.x - tgt.x) / d0 * 70, 60, WORLD - 60);
        h.y = clamp(tgt.y + (h.y - tgt.y) / d0 * 70, 60, WORLD - 60);
        h.facing = Math.atan2(tgt.y - h.y, tgt.x - h.x);
        hurt(tgt, dmg);
        this.fx.slash(tgt.x, tgt.y, h.team);
        if (s.resetSkill !== undefined) h.cds[s.resetSkill] = 0;
        break;
      }
      case 'meteor': {
        let tx = aim.x, ty = aim.y;
        const dAim = dist(tx, ty, h.x, h.y);
        if (dAim > 780) { const f = 780 / dAim; tx = h.x + (tx - h.x) * f; ty = h.y + (ty - h.y) * f; }
        const R = s.radius, delay = s.delay;
        this.fx.telegraph(tx, ty, R, delay);
        this.delayed.push({
          t: this.time + delay,
          fn: () => {
            this.fx.meteor(tx, ty, R);
            this.cam.shake = Math.max(this.cam.shake, 8);
            for (const e of this.units) {
              if (!e.alive || e.team === h.team || e.team === 2 || (e.kind === 'tower' && e.invuln)) continue;
              if (dist(e.x, e.y, tx, ty) > R + e.r) continue;
              hurt(e, dmg);
              if (s.slowPct) e.applySlow(s.slowPct, s.slowDur);
            }
          },
        });
        break;
      }
      case 'healnova': {
        const amt = s.heal + (s.healL || 0) * lvl;
        for (const a of this.units) {
          if (!a.alive || a.kind !== 'hero' || a.team !== h.team) continue;
          if (dist(a.x, a.y, h.x, h.y) > s.radius) continue;
          a.hp = Math.min(a.maxHp, a.hp + amt);
          a.slowT = 0;
          this.fx.heal(a, amt);
        }
        this.fx.ring(h.x, h.y, s.radius, h.def.tint);
        this.sfx.play('heal');
        break;
      }
      case 'sanctuary': {
        for (const a of this.heroes[h.team]) {
          if (!a.alive) continue;
          a.hp = Math.min(a.maxHp, a.hp + s.heal + (s.healL || 0) * lvl);
          a.shieldVal += s.shield; a.shieldT = 5;
          a.slowT = 0;
          a.buffs.push({ name: s.name, msAdd: 0.2, dur: 4 });
          this.fx.heal(a, s.heal);
          this.fx.shieldFx(a);
        }
        this.announce('🌟 SANCTUARY', h.name + ' shields the team', 1.6);
        this.sfx.play('heal');
        break;
      }
    }

    h.cds[i] = s.cd * (1 - h.cdr);
    h.mana -= s.mana;
    h.castAt = this.time;
    h.recallT = -1;
    this.sfx.play(i === 2 ? 'ult' : 'skill');
    if (h.isPlayer) this.cam.shake = Math.max(this.cam.shake, i === 2 ? 7 : 2);
    return true;
  }

  /* ---------------- waves & camps ---------------- */
  spawnWave() {
    this.waveN++;
    const alive = this.units.filter(u => u.kind === 'minion' && u.alive).length;
    if (alive > CFG.MAX_MINIONS - 15) return;
    for (let team = 0; team < 2; team++) {
      for (let l = 0; l < 3; l++) {
        const types = ['melee', 'melee', 'ranged', 'melee', 'ranged'];
        if (this.waveN % 3 === 0) types.push('siege');
        for (const t of types) {
          const m = new Minion(this, team, l, t, this.waveN);
          this.units.push(m);
        }
      }
    }
  }
  updateCamps(dt) {
    for (const c of this.camps) {
      if (c.monster && c.monster.alive) continue;
      c.respT -= dt;
      if (c.respT <= 0) {
        const m = new Monster(this, c, c.kind);
        c.monster = m; this.units.push(m);
      }
    }
  }

  /* ---------------- separation ---------------- */
  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive || a.kind === 'tower' || a.kind === 'throne') continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || b.kind === 'tower' || b.kind === 'throne') continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / d * 0.5;
        const px = dx * push, py = dy * push;
        const aw = a.kind === 'hero' ? 1 : 0.5, bw = b.kind === 'hero' ? 1 : 0.5;
        a.x -= px * bw * (aw + bw > 0 ? 1 : 1); a.y -= py * bw;
        b.x += px * aw; b.y += py * aw;
      }
    }
    // keep units out of towers/thrones and solid obstacles (trees, rocks)
    for (const u of us) {
      if (!u.alive) continue;
      for (const t of us) {
        if (t.kind !== 'tower' && t.kind !== 'throne') continue;
        if (!t.alive) continue;
        const dx = u.x - t.x, dy = u.y - t.y;
        const rr = u.r + t.r * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 === 0 || u === t) continue;
        const d = Math.sqrt(d2);
        u.x = t.x + dx / d * rr; u.y = t.y + dy / d * rr;
      }
      for (const o of this.obstacles) {
        const dx = u.x - o.x, dy = u.y - o.y;
        const rr = u.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        u.x = o.x + dx / d * rr; u.y = o.y + dy / d * rr;
      }
      u.x = clamp(u.x, 40, WORLD - 40); u.y = clamp(u.y, 40, WORLD - 40);
    }
  }

  /* ---------------- main update ---------------- */
  update(dt) {
    if (this.mode === 'mirror' && !this.musicStarted) {
      this.musicStarted = true; this.musicOn = true; this.sfx.startMusic();
    } else if (this.mode !== 'mirror' && !this.musicStarted) {
      this.musicStarted = true; this.musicOn = true; this.sfx.startMusic();
    }
    if (this.mode === 'mirror') return this.updateMirror(dt);
    if (this.state !== 'play') return;
    this.time += dt;

    // sync network hero movement
    if (this.humans.length) {
      for (const h of this.humans) {
        h.moveDir = (h.netInput && h.netInput.move) ? { x: h.netInput.move[0], y: h.netInput.move[1] } : null;
      }
    }

    // waves
    this.waveT -= dt;
    if (this.waveT <= 0) { this.waveT = CFG.WAVE_INT; this.spawnWave(); }
    if (!this.waveAnnounced && this.waveN >= 1) {
      this.waveAnnounced = true;
      this.announce('⚔️ BATTLE HAS BEGUN', 'Farm minions & jungle — destroy the enemy base!', 2.6);
    }
    this.updateCamps(dt);

    // units
    for (const u of this.units) {
      if (u.brain && u.alive) u.brain.update(dt);
      u.update(dt);
    }
    this.maybeUpdateVision();
    this.separate();
    // expired wards cleanup
    if (this.units.some(u => u.kind === 'ward' && !u.alive)) {
      this.units = this.units.filter(u => !(u.kind === 'ward' && !u.alive));
    }
    this.updateProjectiles(dt);
    this.fx.update(dt);

    // delayed actions
    if (this.delayed.length) {
      const due = this.delayed.filter(d => d.t <= this.time);
      if (due.length) {
        this.delayed = this.delayed.filter(d => d.t > this.time);
        for (const d of due) { try { d.fn(); } catch (e) { if (this.headless) console.error(e); } }
      }
    }

    // overtime decay to guarantee the game ends
    if (this.time > CFG.OVERTIME) {
      for (const t of this.units) {
        if ((t.kind === 'tower' || t.kind === 'throne') && !t.invuln) {
          t.hp -= t.maxHp * (CFG.DECAY || 0.008) * dt;
          if (t.hp <= 0) this.kill(t, this.throne[1 - t.team]);
        }
      }
    }

    // player input → move vector
    if (!this.headless && this.input) this.input.apply(this.player);

    // camera
    const p = this.player;
    if (p && p.alive) {
      this.cam.x = lerp(this.cam.x, p.x, Math.min(1, dt * 6));
      this.cam.y = lerp(this.cam.y, p.y, Math.min(1, dt * 6));
    }
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 30);

    if (!this.headless) { this.updateHud(); this.drawMinimap(); this.renderBoard(); }
  }

  announce(main, sub, dur, team) {
    this.log.push(`${Math.round(this.time)}s ${main} ${sub || ''}`);
    if (this.onEvent) this.onEvent({ type: 'ann', main, sub, dur: dur || 2, team });
    if (this.headless) return;
    if (team !== undefined && (!this.player || this.player.team !== team)) return;   // defenders-only
    announceDOM(main, sub, dur || 2);
    const key = voiceKeyFor(main);
    if (key) playVoice(key);
  }
  killfeed(team, icon, victimTeam, victimName) {
    if (this.onEvent) this.onEvent({ type: 'kf', team, icon, victimTeam, victimName });
    if (this.headless) return;
    killfeedDOM(team, icon, victimTeam, victimName);
  }

  /* ============ chat & pings (online) ============ */
  renderBoard() {
    const host = document.getElementById('scoreboard');
    if (!host) return;
    if (!this.boardOpen) { host.classList.remove('on'); host.innerHTML = ''; return; }
    host.classList.add('on');
    const mk = (t) => this.heroes[t].slice().sort((a, b) => (b.kills || 0) - (a.kills || 0)).map(h => `
      <div class="sb-row">
        <span class="sb-hero">${h.def ? h.def.emoji : '❔'}</span>
        <span class="sb-name ${h.isPlayer ? 'me' : ''}">${h.name || '?'}</span>
        <span class="sb-lv">Lv${h.level || 1}</span>
        <span class="sb-kda">${h.kills || 0}/${h.deaths || 0}/${h.assists || 0}</span>
        <span class="sb-gold">💰${Math.floor(h.goldEarned || 0)}</span>
      </div>`).join('');
    const tw = (t) => this.towersAll[t] ? this.towersAll[t].filter(x => x.alive).length : '?';
    host.innerHTML = `
      <div class="sb-box">
        <div class="sb-title">🔵 BLUE ${this.kills[0]} — ${this.kills[1]} RED 🔴 <span style="opacity:.6">· 🏰${tw(0)}/${tw(1)}</span></div>
        <div class="sb-cols"><div class="sb-team">${mk(0)}</div><div class="sb-team">${mk(1)}</div></div>
        <div class="sb-hint">hold TAB</div>
      </div>`;
  }

  onChat(from, team, txt) {
    const host = document.getElementById('chatlog');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'chatline';
    el.innerHTML = `<b style="color:${TEAM_COLORS[team] === TEAM_COLORS[team] && team >= 0 && team < 2 ? TEAM_COLORS[team] : '#a78bfa'}">${from}</b>: ${txt}`;
    host.appendChild(el);
    while (host.children.length > 6) host.children[0].remove();
    setTimeout(() => { if (el.parentNode) el.remove(); }, 7000);
  }
  onPing(from, team, kind, x, y) {
    const labels = { attack: '⚔️ ATTACK!', retreat: '🛡️ RETREAT!', group: '➡️ GROUP UP!',
      emote_wave: '👋', emote_laugh: '😂', emote_tilt: '🤔', emote_heart: '❤️' };
    this.fx.ring(x, y, 90, TEAM_COLORS[team] || '#fbbf24');
    this.fx.text(x, y - 50, labels[kind] || 'PING', '#fbbf24');
    this.announce((labels[kind] || 'PING') + ' — ' + from, '', 1.4);
  }

  /* ============ MIRROR MODE: renders server snapshots ============ */
  applySnapshot(snap) {
    this.mirrorPrev = this.mirrorCur;
    this.mirrorCur = snap;
    this.mirrorT = 0;
    if (snap.vis) {
      const g = new Uint8Array(1600);
      for (let r = 0; r < 40; r++) {
        const row = snap.vis[r] || 0;
        for (let c = 0; c < 40; c++) g[r * 40 + c] = (row >> c) & 1;
      }
      this.mirrorVis = g;
      this.mirrorVisStamp = (this.mirrorVisStamp || 0) + 1;
    }
    // towers/minimap mapping + throne state
    for (const u of snap.u) {
      if (u.k !== 2 && u.k !== 3) continue;
      let m = this.mirrorTowerMap[u.i];
      if (!m) {
        let best = null, bd = 1e9;
        for (const t of this.towersAll[u.tm]) {
          const d = dist(t.x, t.y, u.x, u.y);
          if (d < bd) { bd = d; best = t; }
        }
        m = best; this.mirrorTowerMap[u.i] = best;
      }
      if (m) { m.alive = !!u.a; m.invuln = !!u.iv; }
    }
    // announcements & killfeed
    if (snap.ev) {
      for (const e of snap.ev) {
        if (e.type === 'ann') {
          if (e.team !== undefined && (!this.player || this.player.team !== e.team)) continue;
          announceDOM(e.main, e.sub, e.dur);
          const vkey = voiceKeyFor(e.main);
          if (vkey) playVoice(vkey);
        }
        else if (e.type === 'kf') killfeedDOM(e.team, e.icon, e.victimTeam, e.victimName);
        else if (e.type === 'ring') this.fx.ring(e.x, e.y, e.r, e.c);
        else if (e.type === 'slash') {
          this.fx.slash(e.x, e.y, e.c || '#fff', e.r);
          // trigger attack animation on the hero that swung (melee visual)
          let best = null, bd = 110;
          for (const h of this.units) {
            if (h.kind !== 'hero' || !h.alive) continue;
            const d = dist(h.x, h.y, e.x, e.y);
            if (d < bd) { bd = d; best = h; }
          }
          if (best) best.attackAt = this.time;
        }
        else if (e.type === 'dash') this.fx.dash(e.x0, e.y0, e.x1, e.y1, e.c);
        else if (e.type === 'text') this.fx.text(e.x, e.y, e.txt, e.c);
        else if (e.type === 'telegraph') this.fx.telegraph(e.x, e.y, e.r, e.d || 0.8);
        else if (e.type === 'death') {
          this.fx.list.push({ t: 0, dur: 1.3, type: 'death', x: e.x, y: e.y, hid: e.hid, tm: e.tm });
        }
        else if (e.type === 'burst') {
          const n = Math.min(e.n || 6, 20);
          for (let i = 0; i < n; i++) {
            const a = rand(0, TAU), sp = rand(60, 240);
            this.fx.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.3, 0.7), color: e.c, size: rand(2, 5) });
          }
        }
      }
    }
    if (this.cam.shake === undefined) this.cam.shake = 0;
  }

  interpolateMirror() {
    const cur = this.mirrorCur;
    if (!cur) return;
    const prev = this.mirrorPrev || cur;
    const alpha = clamp(this.mirrorT / (this.snapInt || 0.1), 0, 1);
    const prevMap = {};
    for (const u of prev.u) prevMap[u.i] = u;
    const units = [], heroes = [[], []];
    let you = null;
    for (const u of cur.u) {
      let m = this.mirrorMap[u.i];
      if (!m) {
        m = { id: u.i, vx: 0, vy: 0, damagers: {}, shieldVal: 0, stunT: 0, slowT: 0, markT: 0, recallT: -1, buffRedT: 0, lockTarget: null, respT: 0, items: {}, atkCd: 0 };
        this.mirrorMap[u.i] = m;
      }
      const pu = prevMap[u.i] || u;
      m.kind = u.k === 0 ? 'hero' : u.k === 1 ? 'minion' : u.k === 2 ? 'tower' : u.k === 3 ? 'throne' : 'monster';
      m.team = u.tm; m.r = u.r;
      m.x = lerp(pu.x, u.x, alpha); m.y = lerp(pu.y, u.y, alpha);
      m.vx = (u.x - pu.x) / 0.1; m.vy = (u.y - pu.y) / 0.1;
      m.hp = u.h; m.maxHp = u.m; m.alive = !!u.a;
      if (u.k === 0) {
        m.def = heroById(u.d); m.name = u.n; m.level = u.l; m.facing = (u.f || 0) / 100;
        m.kills = u.kd || 0; m.deaths = u.dd || 0; m.assists = u.ad || 0; m.goldEarned = u.ge || 0;
        m.shieldVal = u.sh || 0; m.stunT = u.st || 0; m.slowT = u.sl || 0; m.buffRedT = u.rb || 0;
        m.respT = u.rs || 0; m.isPlayer = (u.i === this.youId);
        m.mana = 1; m.maxMana = 1;
        heroes[u.tm].push(m);
        if (m.isPlayer) you = m;
        else if (!you && this.replayMode && u.tm === 0) you = m;   // replay: camera follows first blue hero
      } else if (u.k === 1) {
        m.type = u.ty === 0 ? 'melee' : u.ty === 1 ? 'ranged' : 'siege';
      } else if (u.k === 2) {
        m.invuln = !!u.iv; m.tier = u.ti || 1; m.laneIdx = 0;
      } else if (u.k === 4) {
        m.monKind = u.mk;
      } else if (u.k === 5) {
        m.kind = 'ward';
      }
      units.push(m);
    }
    this.units = units;
    this.heroes = heroes;
    if (you) {
      this.player = you;
      if (you.isPlayer) {
        const me = cur.me || {};
        you.cds = (me.cd || [0, 0, 0, 0]).map(x => +x);
        you.skillPoints = me.sp || 0;
        you.skillLv = (me.sv && me.sv.length === 4) ? me.sv.slice() : [1, 1, 1, 1];
        you.wardCdT = me.wc || 0;
        you.activeCds = me.ac || {};
        you.mana = me.mn || 0; you.maxMana = me.mm || 1;
        you.gold = me.g || 0; you.goldEarned = me.ge || 0; you.dmgDealt = me.dm || 0;
        you.kills = me.k || 0; you.deaths = me.d || 0; you.assists = me.as || 0;
        you.items = me.it || {};
        you.lockTarget = me.lk ? (this.mirrorMap[me.lk] || null) : null;
        you.recallT = me.rc !== undefined ? me.rc : -1;
      } else {
        you.cds = [0, 0, 0]; you.mana = 1; you.maxMana = 1; you.gold = 0;
        you.goldEarned = 0; you.dmgDealt = 0; you.kills = 0; you.deaths = 0; you.assists = 0;
        you.items = {}; you.lockTarget = null; you.recallT = -1;
      }
    }
    this.projectiles = (cur.p || []).map(p => ({
      x: p.x, y: p.y, r: p.r || 5, color: p.c,
      homing: !!p.tx, dx: 0, dy: 0, tgt: p.tx ? { x: p.tx, y: p.ty, r: 10 } : null, life: 1,
    }));
    this.time = cur.tm;
    this.kills = cur.k || [0, 0];
    if (cur.st === 'end' && this.state !== 'end') {
      this.state = 'end'; this.winner = cur.w;
      if (this.replayMode) {
        this.replayPaused = true;
        this.announce('📹 REPLAY ENDED', (cur.w === 0 ? 'BLUE' : 'RED') + ' wins', 4);
      } else if (!this.headless) showEndScreen(this);
    } else {
      this.state = cur.st || 'play';
    }
  }

  updateMirror(dt) {
    if (this.replaySource && this.replaySource.length) {
      if (!this.replayPaused) this.replayT += dt * 5 * (this.replaySpeed || 1);
      const target = Math.min(this.replaySource.length - 1, Math.floor(this.replayT));
      while (this.replayIdx < target) {
        this.replayIdx++;
        this.applySnapshot(this.replaySource[this.replayIdx]);
      }
    }
    this.mirrorT += dt;
    this.interpolateMirror();
    this.fx.update(dt);
    if (this.player && this.player.alive) {
      this.cam.x = lerp(this.cam.x, this.player.x, Math.min(1, dt * 6));
      this.cam.y = lerp(this.cam.y, this.player.y, Math.min(1, dt * 6));
    }
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
    if (this.input) this.input.apply(this.player);
    if (this.net && this.net.tick) this.net.tick(dt);
    if (this.player) { this.updateHud(); this.drawMinimap(); this.renderBoard(); }
  }

  /* ============ BROWSER-ONLY: canvas / hud / render ============ */
  setupCanvas() {
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
    this.mmCv = document.getElementById('mm');
    this.mmCtx = this.mmCv.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.floor(window.innerWidth * dpr);
    this.cv.height = Math.floor(window.innerHeight * dpr);
    this.dpr = dpr;
    this.bakeGround();
  }
  bakeGround() {
    const S = 0.5; // half resolution
    const c = document.createElement('canvas');
    c.width = WORLD * S; c.height = WORLD * S;
    const x = c.getContext('2d');
    x.scale(S, S);
    const T = this.theme;
    // base
    if (TEX[T.ground]) {
      const pat = x.createPattern(TEX[T.ground], 'repeat');
      if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(2.2));
      x.fillStyle = pat;
      x.fillRect(0, 0, WORLD, WORLD);
      x.fillStyle = T.overlay;
      x.fillRect(0, 0, WORLD, WORLD);
    } else {
      x.fillStyle = T.base;
      x.fillRect(0, 0, WORLD, WORLD);
    }
    // team side tint
    let gr = x.createLinearGradient(0, WORLD, WORLD, 0);
    gr.addColorStop(0, 'rgba(56,189,248,0.05)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(251,113,133,0.05)');
    x.fillStyle = gr; x.fillRect(0, 0, WORLD, WORLD);
    // noise dots
    const rng = mulberry32(42);
    x.fillStyle = 'rgba(255,255,255,0.022)';
    for (let i = 0; i < 2600; i++) { x.fillRect(rng() * WORLD, rng() * WORLD, 3, 3); }
    // river (diagonal band y≈x)
    x.save();
    x.translate(WORLD / 2, WORLD / 2); x.rotate(Math.PI / 4);
    if (TEX[T.water]) {
      const wpat = x.createPattern(TEX[T.water], 'repeat');
      if (wpat.setTransform) wpat.setTransform(new DOMMatrix().scale(1.9));
      x.fillStyle = wpat;
      x.fillRect(-WORLD, -130, WORLD * 2, 260);
    } else {
      x.fillStyle = T.riverTint;
      x.fillRect(-WORLD, -130, WORLD * 2, 260);
    }
    x.strokeStyle = T.riverEdge; x.lineWidth = 5;
    x.beginPath(); x.moveTo(-WORLD, 0); x.lineTo(WORLD, 0); x.stroke();
    x.restore();
    // lanes
    for (const lane of LANES) {
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath();
      lane.pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]));
      x.strokeStyle = T.laneBase; x.lineWidth = 250;
      x.stroke();
      if (TEX[T.lane]) {
        const lpat = x.createPattern(TEX[T.lane], 'repeat');
        if (lpat.setTransform) lpat.setTransform(new DOMMatrix().scale(1.5));
        x.strokeStyle = lpat; x.lineWidth = 208;
        x.stroke();
        x.save();
        x.globalAlpha = 0.15; x.strokeStyle = '#000'; x.lineWidth = 208;
        x.stroke();
        x.restore();
      } else {
        x.strokeStyle = T.id === 'rift' ? '#c9a86a' : '#2a3d26'; x.lineWidth = 210;
        x.stroke();
      }
      x.strokeStyle = T.laneEdge; x.lineWidth = 8;
      x.setLineDash([40, 60]);
      x.stroke();
      x.setLineDash([]);
    }
    // camp rings
    for (const c of this.camps) {
      x.strokeStyle = 'rgba(167,139,250,0.3)'; x.lineWidth = 4;
      x.setLineDash([12, 10]);
      x.beginPath(); x.arc(c.x, c.y, c.kind === 'lord' || c.kind === 'turtle' ? 90 : 62, 0, TAU); x.stroke();
      x.setLineDash([]);
    }
    // base platforms
    for (let t = 0; t < 2; t++) {
      const p = THRONE_POS[t];
      x.fillStyle = 'rgba(56,189,248,0.05)';
      if (t === 1) x.fillStyle = 'rgba(251,113,133,0.05)';
      x.beginPath(); x.arc(p.x, p.y, 380, 0, TAU); x.fill();
      x.strokeStyle = TEAM_COLORS[t] + '55'; x.lineWidth = 6;
      x.beginPath(); x.arc(p.x, p.y, 380, 0, TAU); x.stroke();
    }
    // trees
    for (const t of this.trees) {
      x.fillStyle = T.treeShadow;
      x.beginPath(); x.arc(t.x + 6, t.y + 8, t.r, 0, TAU); x.fill();
      x.fillStyle = T.tree1;
      x.beginPath(); x.arc(t.x, t.y, t.r, 0, TAU); x.fill();
      x.strokeStyle = T.tree2; x.lineWidth = 3;
      x.stroke();
    }
    // rocks
    for (const rk of this.rocks) {
      x.fillStyle = T.treeShadow;
      x.beginPath(); x.arc(rk.x + 5, rk.y + 7, rk.r, 0, TAU); x.fill();
      x.fillStyle = T.rock;
      x.beginPath(); x.arc(rk.x, rk.y, rk.r, 0, TAU); x.fill();
      x.fillStyle = T.rockHi;
      x.beginPath(); x.arc(rk.x - rk.r * 0.25, rk.y - rk.r * 0.3, rk.r * 0.55, 0, TAU); x.fill();
      x.strokeStyle = T.id === 'rift' ? '#4a4234' : '#252d3b'; x.lineWidth = 4;
      x.beginPath(); x.arc(rk.x, rk.y, rk.r, 0, TAU); x.stroke();
    }
    // rift theme: Dragon & Baron pits + nexus crystals
    if (T.pits) {
      const pit = (c, main, glow, label, icon) => {
        x.fillStyle = 'rgba(20,14,8,0.55)';
        x.beginPath(); x.arc(c.x, c.y, 110, 0, TAU); x.fill();
        x.strokeStyle = main; x.lineWidth = 7;
        x.beginPath(); x.arc(c.x, c.y, 110, 0, TAU); x.stroke();
        x.strokeStyle = glow; x.lineWidth = 2.5;
        x.beginPath(); x.arc(c.x, c.y, 122, 0, TAU); x.stroke();
        x.font = '46px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = '#fff';
        x.fillText(icon, c.x, c.y - 12);
        x.font = 'bold 17px sans-serif';
        x.fillStyle = main;
        x.fillText(label, c.x, c.y + 38);
      };
      pit(TURTLE_POS, '#f59e0b', 'rgba(245,158,11,0.4)', 'DRAGON PIT', '🐉');
      pit(LORD_POS, '#a78bfa', 'rgba(167,139,250,0.4)', 'BARON PIT', '💀');
      // nexus crystals
      const nexus = (p, team) => {
        x.save();
        x.translate(p.x, p.y);
        x.rotate(this.time || 0);
        x.fillStyle = TEAM_COLORS[team];
        x.globalAlpha = 0.5;
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          const r = 130 + (i % 2) * 14;
          i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        x.closePath(); x.fill();
        x.restore();
      };
      nexus(THRONE_POS[0], 0);
      nexus(THRONE_POS[1], 1);
    }
    // bushes (stealth grass)
    for (const b of this.bushes) {
      x.fillStyle = 'rgba(46,94,56,0.85)';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const bx = b.x + Math.cos(a) * b.r * 0.45, by = b.y + Math.sin(a) * b.r * 0.35;
        x.beginPath(); x.ellipse(bx, by, b.r * 0.55, b.r * 0.42, a, 0, TAU); x.fill();
      }
      x.fillStyle = 'rgba(74,138,88,0.8)';
      x.beginPath(); x.ellipse(b.x, b.y, b.r * 0.6, b.r * 0.48, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(116,185,130,0.5)';
      x.beginPath(); x.ellipse(b.x - b.r * 0.15, b.y - b.r * 0.15, b.r * 0.3, b.r * 0.22, 0, 0, TAU); x.fill();
    }
    // border
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 26;
    x.strokeRect(13, 13, WORLD - 26, WORLD - 26);
    this.groundCanvas = c;
  }

  buildHud(heroId) {
    const h = heroById(heroId);
    const face = document.getElementById('ph-face');
    face.innerHTML = `<img src="img/${heroId}.png" alt="" style="width:100%;height:100%;border-radius:9px;object-fit:cover;display:none"><span>${h.emoji}</span>`;
    const fimg = face.querySelector('img');
    fimg.onload = () => {
      fimg.style.display = 'block';
      fimg.style.filter = skinHueFilter(heroId);
      face.querySelector('span').style.display = 'none';
    };
    if (fimg.complete && fimg.naturalWidth > 0) fimg.onload();
    document.getElementById('ph-name').textContent = h.name + ' · ' + h.role;
    const bar = document.getElementById('skillbar');
    bar.innerHTML = '';
    this.skillBtns = [];
    const keys = ['Q', 'W', 'E', 'R'];
    h.skills.forEach((s, i) => {
      const b = document.createElement('div');
      b.className = 'skbtn tap' + (i === 3 ? ' ult' : '');
      b.innerHTML = `<span>${s.icon}</span><span class="key">${keys[i]}</span><div class="cdmask" style="display:none"></div>` +
        `<span class="pips"></span>` +
        (s.unlock > 1 ? `<span class="lock">Lv${s.unlock}</span>` : '') +
        `<span class="skplus">＋</span>`;
      b.title = `${s.name} — ${s.desc}`;
      const fire = (ev) => {
        if (ev) ev.preventDefault();
        if (ev && ev.target && ev.target.classList && ev.target.classList.contains('skplus')) return;
        this.playerCast(i);
      };
      const up = (ev) => {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        this.playerSkillUp(i);
      };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('mousedown', fire);
      const plus = b.querySelector('.skplus');
      plus.addEventListener('touchstart', up, { passive: false });
      plus.addEventListener('mousedown', up);
      bar.appendChild(b);
      this.skillBtns.push(b);
    });
    // recall
    const rb = document.getElementById('btn-recall');
    const rfire = (ev) => {
      if (ev) ev.preventDefault();
      if (this.mode === 'mirror') { if (this.net && this.net.sendRecall) this.net.sendRecall(); return; }
      if (this.player.alive) this.player.startRecall();
    };
    rb.addEventListener('touchstart', rfire, { passive: false });
    rb.addEventListener('mousedown', rfire);
    // shop
    document.getElementById('btn-shop').addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleShop(); }, { passive: false });
    document.getElementById('btn-shop').addEventListener('mousedown', (e) => { e.preventDefault(); this.toggleShop(); });
    document.getElementById('shop-close').addEventListener('click', () => this.closeShop());
    document.getElementById('shop-close').addEventListener('touchstart', (e) => { e.preventDefault(); this.closeShop(); }, { passive: false });
    this.buildShop();
    this.deadOverlay = document.getElementById('dead-overlay');
    this.deadT = document.getElementById('dead-t');
    // item active + surrender buttons
    const ib = document.getElementById('btn-item');
    if (ib) {
      const ifire = (ev) => {
        if (ev) ev.preventDefault();
        this.playerItemActive();
      };
      ib.addEventListener('touchstart', ifire, { passive: false });
      ib.addEventListener('mousedown', ifire);
    }
    const sb2 = document.getElementById('btn-surrender');
    if (sb2) {
      const sfire = (ev) => {
        if (ev) ev.preventDefault();
        if (!this.player || !this.player.alive) return;
        if (this.mode === 'mirror') { if (this.net && this.net.sendSurrender) this.net.sendSurrender(); return; }
        if (this.time > 300) {
          this.announce('🏳️ SURRENDER', 'You have surrendered', 3);
          this.endGame(1 - this.player.team);
        }
      };
      sb2.addEventListener('touchstart', sfire, { passive: false });
      sb2.addEventListener('mousedown', sfire);
    }

    // ward + emote + music buttons
    const wb = document.getElementById('btn-ward');
    if (wb) {
      const wfire = (ev) => {
        if (ev) ev.preventDefault();
        if (this.mode === 'mirror') { if (this.net && this.net.sendWard) this.net.sendWard(); return; }
        this.placeWard(this.player);
      };
      wb.addEventListener('touchstart', wfire, { passive: false });
      wb.addEventListener('mousedown', wfire);
    }
    const eb = document.getElementById('btn-emote');
    if (eb) {
      const EMOTES = ['wave', 'laugh', 'tilt', 'heart'];
      const EMO = { wave: '👋', laugh: '😂', tilt: '🤔', heart: '❤️' };
      let ei = 0;
      const efire = (ev) => {
        if (ev) ev.preventDefault();
        const kind = EMOTES[ei++ % EMOTES.length];
        if (this.mode === 'mirror') { if (this.net && this.net.sendEmote) this.net.sendEmote(kind); return; }
        if (this.player) this.onPing('You', this.player.team, 'emote_' + kind, this.player.x, this.player.y);
      };
      eb.addEventListener('touchstart', efire, { passive: false });
      eb.addEventListener('mousedown', efire);
    }
    const mb = document.getElementById('btn-music');
    if (mb) mb.addEventListener('click', () => { this.musicOn = !this.musicOn; if (this.musicOn) this.sfx.startMusic(); else this.sfx.stopMusic(); });

    // scoreboard
    this.boardOpen = false;
    const sbBtn = document.getElementById('btn-board');
    if (sbBtn) sbBtn.addEventListener('click', () => { this.boardOpen = !this.boardOpen; this.renderBoard(); });
  }

  buildShop() {
    const grid = document.getElementById('item-grid');
    grid.innerHTML = '';
    this.itemEls = [];
    const sections = [
      { title: '🧩 Components', list: ITEMS.filter(i => i.comp) },
      { title: '⭐ Legendaries', list: ITEMS.filter(i => i.builds && !i.active) },
      { title: '⚡ Actives', list: ITEMS.filter(i => i.active) },
    ];
    for (const sec of sections) {
      const h = document.createElement('div');
      h.style.cssText = 'grid-column:1/-1;font-size:11px;letter-spacing:2px;color:#7c8db0;margin-top:6px';
      h.textContent = sec.title;
      grid.appendChild(h);
      for (const it of sec.list) {
        const el = document.createElement('div');
        el.className = 'item';
        let recipe = '';
        if (it.builds) {
          recipe = '<div class="recipe">' + it.builds.map(cid => {
            const c = itemById(cid);
            return `<span class="rcomp" data-c="${cid}">${c.icon}</span>`;
          }).join('<span style="opacity:.5">+</span>') + `<span style="opacity:.6">💰${it.cost}</span></div>`;
        }
        el.innerHTML = `<div>${it.icon} <b>${it.name}</b><span class="own"></span></div>${recipe}<small>${it.desc}</small><div class="cost">💰 ${it.cost}</div>`;
        el.addEventListener('click', () => this.tryBuy(it));
        grid.appendChild(el);
        this.itemEls.push(el);
      }
    }
  }
  canBuyMirror(p, it) {
    // shared affordability check that works on mirror heroes too
    const owned = p.items[it.id] || 0;
    if (it.builds) {
      if (owned >= 1) return false;
      if (it.active && this.activeItemsOf(p).length >= 2) return false;
      if (!it.hasComp) return false;
    } else if (owned >= it.max) return false;
    if (p.gold < it.cost) return false;
    if (p.alive && !this.atBase(p)) return false;
    return true;
  }
  activeItemsOf(p) {
    const out = [];
    for (const [id, n] of Object.entries(p.items || {})) {
      const it = itemById(id);
      if (it && it.active && n > 0) out.push(it);
    }
    return out;
  }
  toggleShop() {
    const el = document.getElementById('shop');
    el.classList.toggle('on');
    this.refreshShop();
  }
  openShop() { document.getElementById('shop').classList.add('on'); this.refreshShop(); }
  closeShop() { document.getElementById('shop').classList.remove('on'); }
  openShopOnDeath() { this.openShop(); }

  canBuyMirror(p, it) {
    const owned = p.items[it.id] || 0;
    if (owned >= it.max) return false;
    const cost = Math.round(it.cost * (owned === 0 ? 1 : 1.5));
    if (p.gold < cost) return false;
    if (p.alive && !this.atBase(p)) return false;
    return true;
  }
  refreshShop() {
    const p = this.player;
    if (!p) return;
    document.getElementById('shop-note').textContent =
      `💰 ${Math.floor(p.gold)} gold · ${this.atBase(p) || !p.alive ? '✅ You can buy right now' : '❌ Must be at base (or dead) to buy'}`;
    let idx = 0;
    for (const sec of [ITEMS.filter(i => i.comp), ITEMS.filter(i => i.builds && !i.active), ITEMS.filter(i => i.active)]) {
      for (const it of sec) {
        const el = this.itemEls[idx++];
        if (!el) continue;
        const owned = p.items[it.id] || 0;
        // recipe state
        let hasComp = true;
        if (it.builds) {
          const need = {};
          for (const c of it.builds) need[c] = (need[c] || 0) + 1;
          hasComp = Object.entries(need).every(([cid, n]) => (p.items[cid] || 0) >= n);
          it.hasComp = hasComp;
          el.querySelectorAll('.rcomp').forEach(sp => {
            const cid = sp.dataset.c;
            sp.classList.toggle('have', (p.items[cid] || 0) > 0);
          });
        }
        el.querySelector('.own').textContent = owned ? (it.comp ? `x${owned}` : '✓') : '';
        el.querySelector('.cost').textContent = `💰 ${it.cost}`;
        el.classList.toggle('noaff', !this.canBuyMirror(p, it));
      }
    }
    document.getElementById('shop-stats').innerHTML = statLineFor(p);
  }
  updateHud() {
    const p = this.player;
    if (!p) return;
    document.getElementById('gtime').textContent = fmtTime(this.time);
    document.getElementById('score-b').textContent = this.kills[0];
    document.getElementById('score-r').textContent = this.kills[1];
    const tw = (t) => this.towersAll[t].filter(x => x.alive).length;
    document.getElementById('towers-b').textContent = '🏰' + tw(0);
    document.getElementById('towers-r').textContent = '🏰' + tw(1);
    document.getElementById('ph-lvl').textContent = p.level;
    document.getElementById('ph-lvl').style.color = (p.skillPoints > 0) ? '#7ee2a8' : '#fbbf24';
    document.getElementById('ph-kda').textContent = `${p.kills} / ${p.deaths} / ${p.assists}`;
    document.getElementById('ph-gold').textContent = '💰 ' + Math.floor(p.gold);
    document.querySelector('#ph-hp i').style.width = (p.hp / p.maxHp * 100) + '%';
    document.querySelector('#ph-mp i').style.width = (p.mana / p.maxMana * 100) + '%';
    // skills
    const pts = p.skillPoints || 0;
    document.getElementById('ph-lvl').nextElementSibling;
    p.def.skills.forEach((s, i) => {
      const b = this.skillBtns[i];
      if (!b) return;
      const mask = b.querySelector('.cdmask');
      const cd = p.cds ? p.cds[i] : 0;
      if (p.level < s.unlock) {
        mask.style.display = 'flex'; mask.textContent = '🔒';
      } else if (cd > 0) {
        const max = s.cd * (1 - p.cdr);
        const pct = cd / max;
        mask.style.display = 'flex';
        mask.textContent = cd > 1 ? Math.ceil(cd) : '';
        mask.style.background = `conic-gradient(rgba(4,8,16,.82) ${pct * 360}deg, rgba(4,8,16,.25) 0deg)`;
      } else {
        mask.style.display = 'none';
      }
      b.classList.toggle('nomp', p.mana < s.mana && cd <= 0 && p.level >= s.unlock);
      // rank pips
      const pips = b.querySelector('.pips');
      if (pips) {
        const slv = (p.skillLv && p.skillLv[i]) || 1;
        const maxLv = i === 3 ? 3 : 6;
        if (pips.dataset.slv !== String(slv)) {
          pips.dataset.slv = String(slv);
          pips.innerHTML = '';
          for (let k = 0; k < maxLv; k++) {
            const d = document.createElement('i');
            if (k < slv) d.className = 'on';
            pips.appendChild(d);
          }
        }
      }
      // upgrade chip
      const plus = b.querySelector('.skplus');
      if (plus) {
        const slv = (p.skillLv && p.skillLv[i]) || 1;
        const maxLv = i === 3 ? 3 : 6;
        const can = pts > 0 && p.level >= s.unlock && slv < maxLv;
        plus.style.display = can ? 'flex' : 'none';
      }
    });
    // item active button
    const ibtn = document.getElementById('btn-item');
    if (ibtn) {
      const acts = this.activeItemsOf(p);
      const act = acts[0];
      const imask = ibtn.querySelector('.cdmask');
      const ispan = ibtn.querySelector('.iicon');
      if (act) {
        ibtn.style.display = 'flex';
        if (ispan) ispan.textContent = act.icon;
        const cd = p.activeCds ? (p.activeCds[act.id] || 0) : 0;
        if (cd > 0) { imask.style.display = 'flex'; imask.textContent = Math.ceil(cd); }
        else imask.style.display = 'none';
      } else {
        ibtn.style.display = 'none';
      }
    }
    // surrender button after 5:00
    const sbtn = document.getElementById('btn-surrender');
    if (sbtn) sbtn.style.display = (this.time > 300 && this.state === 'play') ? 'flex' : 'none';

    // ward mask
    const wbtn = document.getElementById('btn-ward');
    if (wbtn) {
      const wmask = wbtn.querySelector('.cdmask');
      const wcd = p.wardCdT || 0;
      if (wcd > 0) { wmask.style.display = 'flex'; wmask.textContent = Math.ceil(wcd); }
      else wmask.style.display = 'none';
    }
    // recall mask
    const rb = document.getElementById('btn-recall');
    const rmask = rb.querySelector('.cdmask');
    if (p.recallT >= 0) { rmask.style.display = 'flex'; rmask.textContent = p.recallT.toFixed(1); }
    else rmask.style.display = 'none';
    // dead overlay
    if (!p.alive) {
      this.deadOverlay.classList.add('on');
      this.deadT.textContent = Math.ceil(p.respT);
    } else {
      this.deadOverlay.classList.remove('on');
      this.closeShopOnRespawn();
    }
    if (this.shopOpenTick === undefined) this.shopOpenTick = 0;
    this.shopOpenTick -= 1 / 60;
    if (this.shopOpenTick <= 0) {
      this.shopOpenTick = 0.5;
      if (document.getElementById('shop').classList.contains('on')) this.refreshShop();
    }
  }
  closeShopOnRespawn() { this.closeShop(); }

  /* ---------------- minimap ---------------- */
  drawMinimap() {
    const x = this.mmCtx, S = 176 / WORLD;
    x.clearRect(0, 0, 176, 176);
    x.fillStyle = 'rgba(8,14,24,0.9)';
    x.fillRect(0, 0, 176, 176);
    x.strokeStyle = '#223140'; x.lineWidth = 3;
    for (const lane of LANES) {
      x.beginPath();
      lane.pts.forEach((p, i) => i ? x.lineTo(p[0] * S, p[1] * S) : x.moveTo(p[0] * S, p[1] * S));
      x.stroke();
    }
    for (const c of this.camps) {
      if (c.monster && c.monster.alive) {
        x.fillStyle = '#a78bfa';
        x.beginPath(); x.arc(c.x * S, c.y * S, c.kind === 'lord' || c.kind === 'turtle' ? 4 : 2.4, 0, TAU); x.fill();
      }
    }
    for (let t = 0; t < 2; t++) {
      for (const tw of this.towersAll[t]) {
        if (!tw.alive) continue;
        x.fillStyle = TEAM_COLORS[t];
        x.fillRect(tw.x * S - 3, tw.y * S - 3, 6, 6);
        if (tw.invuln) { x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1; x.strokeRect(tw.x * S - 4.5, tw.y * S - 4.5, 9, 9); }
      }
      const th = this.throne[t];
      x.fillStyle = TEAM_COLORS[t];
      x.beginPath();
      x.arc(th.x * S, th.y * S, 5, 0, TAU); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 1.4; x.stroke();
    }
    const visT = this.mode === 'mirror' ? -1 : (this.player ? this.player.team : 0);
    for (const b of this.bushes) {
      x.fillStyle = 'rgba(74,138,88,0.55)';
      x.beginPath(); x.arc(b.x * S, b.y * S, 2.4, 0, TAU); x.fill();
    }
    for (const u of this.units) {
      if (u.kind === 'ward' && u.alive && (visT >= 0 ? u.team === visT : true)) {
        x.fillStyle = '#67e8f9';
        x.fillRect(u.x * S - 1.5, u.y * S - 1.5, 3, 3);
      }
    }
    for (const u of this.units) {
      if (u.kind === 'minion' && u.alive) {
        if (visT >= 0 && u.team !== visT && !this.unitVisibleTo(u, visT)) continue;
        x.fillStyle = TEAM_COLORS[u.team] + '99';
        x.fillRect(u.x * S - 1, u.y * S - 1, 2, 2);
      }
    }
    for (let t = 0; t < 2; t++) {
      for (const h of this.heroes[t]) {
        if (!h.alive) continue;
        if (visT >= 0 && t !== visT && !this.unitVisibleTo(h, visT)) continue;
        x.fillStyle = TEAM_COLORS[t];
        x.beginPath(); x.arc(h.x * S, h.y * S, 3.4, 0, TAU); x.fill();
        if (h.isPlayer) {
          x.strokeStyle = '#fbbf24'; x.lineWidth = 1.8;
          x.beginPath(); x.arc(h.x * S, h.y * S, 5, 0, TAU); x.stroke();
        }
      }
    }
    // camera rect
    const vw = window.innerWidth / this.zoomVal(), vh = window.innerHeight / this.zoomVal();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1;
    x.strokeRect((this.cam.x - vw / 2) * S, (this.cam.y - vh / 2) * S, vw * S, vh * S);
  }
  zoomVal() { return (this.cv ? this.cv.height / (CFG.VIEW_H * this.dpr) : 0.6); }

  /* ---------------- render ---------------- */
  draw() {
    if (this.headless || !this.ctx) return;
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    const z = H / CFG.VIEW_H;
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);
    let cx = clamp(this.cam.x, 0, WORLD), cy = clamp(this.cam.y, 0, WORLD);
    const shx = this.cam.shake ? rand(-this.cam.shake, this.cam.shake) : 0;
    const shy = this.cam.shake ? rand(-this.cam.shake, this.cam.shake) : 0;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-cx + shx, -cy + shy);

    // ground
    if (this.groundCanvas) ctx.drawImage(this.groundCanvas, 0, 0, 1600, 1600, 0, 0, WORLD, WORLD);

    // enemy tower danger rings
    const myTeam = this.player ? this.player.team : 0;
    for (const t of this.towers[1 - myTeam]) {
      if (!t.alive || t.invuln) continue;
      ctx.strokeStyle = 'rgba(248,113,113,0.10)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, TAU); ctx.stroke();
    }

    // units (sorted by y) — hide enemies our team can't see (solo/local sim)
    const visTeam = this.player ? this.player.team : 0;
    const sorted = this.units.filter(u => u.alive && (this.mode === 'mirror' || u.team === visTeam || u.team === 2 || this.unitVisibleTo(u, visTeam))).sort((a, b) => a.y - b.y);
    for (const u of sorted) this.drawUnit(ctx, u);

    // projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (!p.homing) {
        ctx.strokeStyle = p.color + '66'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p.x - p.dx * 30, p.y - p.dy * 30); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    }

    this.fx.draw(ctx);

    // health bars & labels
    for (const u of sorted) this.drawBars(ctx, u);

    // recall channel
    const p = this.player;
    if (p.alive && p.recallT >= 0) {
      const hue = SKINS[equippedSkin(p.def.id)].hue;
      ctx.strokeStyle = hue ? `hsl(${hue}, 85%, 70%)` : '#67e8f9'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.recallT / 3.2));
      ctx.stroke();
    }
    // fog of war overlay (soft, from 40x40 vision grid)
    const fog = this.getFogCanvas(myTeam);
    if (fog) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
      ctx.drawImage(fog, 0, 0, 40, 40, 0, 0, WORLD, WORLD);
    }

    // player lock target ring
    if (p.lockTarget && p.lockTarget.alive) {
      const t = p.lockTarget;
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 12, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  getFogCanvas(team) {
    let grid = null, stamp = 0;
    if (this.mode === 'mirror') { grid = this.mirrorVis || null; stamp = this.mirrorVisStamp || 0; }
    else if (this.vis) { grid = this.vis[team]; stamp = this.visT; }
    if (!grid) return null;
    if (this.fogStamp !== stamp || !this.fogCv) {
      this.fogStamp = stamp;
      if (!this.fogCv) { this.fogCv = document.createElement('canvas'); this.fogCv.width = 40; this.fogCv.height = 40; }
      const fc = this.fogCv.getContext('2d');
      fc.clearRect(0, 0, 40, 40);
      fc.fillStyle = 'rgba(3,7,14,0.55)';
      for (let cy = 0; cy < 40; cy++) for (let cx = 0; cx < 40; cx++) {
        if (!grid[cy * 40 + cx]) fc.fillRect(cx, cy, 1, 1);
      }
    }
    return this.fogCv;
  }
  skinSprite(u) {
    if (u.isPlayer && SKIN_CACHE[u.def.id]) {
      return SKIN_CACHE[u.def.id][equippedSkin(u.def.id)] || SPRITES_FULL[u.def.id];
    }
    return SPRITES_FULL[u.def.id];
  }
  drawUnit(ctx, u) {
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 0.55, u.r * 1.05, u.r * 0.45, 0, 0, TAU); ctx.fill();

    if (u.kind === 'hero') {
      const col = TEAM_COLORS[u.team];
      const full = this.skinSprite(u);
      if (full) {
        /* ---- animated full-body rig ---- */
        const t = this.time;
        const spd = Math.hypot(u.vx || 0, u.vy || 0);
        const moving = spd > 20 && u.alive;
        const phase = t * 11 + u.id * 1.7;
        const walk = moving ? Math.sin(phase) : 0;
        const bobY = moving ? -Math.abs(walk) * 3.4 : Math.sin(t * 2.1 + u.id) * 1.6;
        const rot = moving ? walk * 0.055 : 0;
        let lunge = 0, squash = 1;
        const atkAge = t - (u.attackAt !== undefined ? u.attackAt : -9);
        if (atkAge >= 0 && atkAge < 0.22) { const k = Math.sin((atkAge / 0.22) * Math.PI); lunge = k * 11; squash = 1 + k * 0.05; }
        const castAge = t - (u.castAt !== undefined ? u.castAt : -9);
        if (castAge >= 0 && castAge < 0.3) { squash *= 1 - 0.05 * Math.sin((castAge / 0.3) * Math.PI); }
        const faceLeft = Math.cos(u.facing || 0) < 0;
        const stunShake = u.stunT > 0 ? Math.sin(t * 42) * 2.5 : 0;
        const H = 62 * (u.def.role === 'Tank' ? 1.14 : u.def.role === 'Marksman' ? 0.96 : 1);
        const W = full.width * (H / full.height);
        ctx.save();
        ctx.translate(u.x + (faceLeft ? -lunge : lunge) + stunShake, u.y + 12 + bobY);
        ctx.rotate(rot);
        ctx.scale(faceLeft ? -1 : 1, squash);
        ctx.drawImage(full, -W / 2, -H, W, H);
        ctx.restore();
        // team ring + player ring at the feet
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 13, 17, 7.5, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        if (u.isPlayer) {
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.ellipse(u.x, u.y + 13, 23, 10, 0, 0, TAU); ctx.stroke();
        }
        if (u.shieldVal > 0) {
          ctx.strokeStyle = 'rgba(165,243,252,0.8)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(u.x, u.y - 14, 30, 0, TAU); ctx.stroke();
        }
        if (u.buffRedT > 0) {
          ctx.strokeStyle = 'rgba(248,113,113,0.9)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(u.x, u.y - 14, 35, 0, TAU); ctx.stroke();
        }
        if (u.stunT > 0) {
          ctx.fillStyle = '#fde047'; ctx.font = '13px serif'; ctx.textAlign = 'center';
          for (let i = 0; i < 3; i++) {
            const a = t * 4 + i * TAU / 3;
            ctx.fillText('✦', u.x + Math.cos(a) * 26, u.y - 62 + Math.sin(a) * 7);
          }
        }
      } else {
        /* ---- fallback: portrait token ---- */
        const spr = SPRITES[u.def.id];
        if (spr) {
          ctx.save();
          ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 5, 0, TAU); ctx.clip();
          ctx.drawImage(spr, u.x - u.r - 6, u.y - u.r - 6, (u.r + 6) * 2, (u.r + 6) * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = '#0b1424';
          ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 5, 0, TAU); ctx.fill();
          ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(u.def.emoji, u.x, u.y + 1);
        }
        ctx.strokeStyle = col; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 5, 0, TAU); ctx.stroke();
        if (u.isPlayer) {
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 11, 0, TAU); ctx.stroke();
        }
        if (u.shieldVal > 0) {
          ctx.strokeStyle = 'rgba(165,243,252,0.8)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 15, 0, TAU); ctx.stroke();
        }
        if (u.stunT > 0) {
          ctx.fillStyle = '#fde047'; ctx.font = '13px serif'; ctx.textAlign = 'center';
          for (let i = 0; i < 3; i++) {
            const a = this.time * 4 + i * TAU / 3;
            ctx.fillText('✦', u.x + Math.cos(a) * 24, u.y - 30 + Math.sin(a) * 7);
          }
        }
      }
    } else if (u.kind === 'minion') {
      const spr = SPRITES_MINION[u.type] && SPRITES_MINION[u.type][u.team];
      if (spr) {
        const t = this.time;
        const bob = Math.sin(t * 9 + u.id) * 1.8;
        const faceLeft = Math.cos(u.facing || 0) < 0;
        const scale = u.type === 'siege' ? 1.45 : 1;
        const H = 30 * scale, W = spr.width * (H / spr.height);
        const atkAge = t - (u.attackAt !== undefined ? u.attackAt : -9);
        let lunge = 0;
        if (atkAge >= 0 && atkAge < 0.2) lunge = Math.sin((atkAge / 0.2) * Math.PI) * 6;
        ctx.save();
        ctx.translate(u.x + (faceLeft ? -lunge : lunge), u.y + 6 + bob);
        ctx.scale(faceLeft ? -1 : 1, 1);
        ctx.drawImage(spr, -W / 2, -H, W, H);
        ctx.restore();
      } else {
        ctx.fillStyle = TEAM_DARK[u.team];
        ctx.strokeStyle = TEAM_COLORS[u.team]; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = TEAM_COLORS[u.team];
        if (u.type === 'ranged') { ctx.beginPath(); ctx.arc(u.x, u.y, 4, 0, TAU); ctx.fill(); }
        else if (u.type === 'siege') { ctx.fillRect(u.x - 6, u.y - 6, 12, 12); }
        else ctx.fillRect(u.x - 4, u.y - 8, 8, 8);
      }
    } else if (u.kind === 'tower') {
      const col = TEAM_COLORS[u.team];
      ctx.fillStyle = TEAM_DARK[u.team];
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU - Math.PI / 2;
        const px = u.x + Math.cos(a) * (u.r + 8), py = u.y + Math.sin(a) * (u.r + 8);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = u.invuln ? '#475569' : col;
      ctx.beginPath(); ctx.arc(u.x, u.y, 10, 0, TAU); ctx.fill();
      if (u.invuln) {
        ctx.strokeStyle = 'rgba(226,232,240,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 18, 0, TAU); ctx.stroke();
      }
    } else if (u.kind === 'throne') {
      const col = TEAM_COLORS[u.team];
      ctx.fillStyle = TEAM_DARK[u.team];
      ctx.strokeStyle = col; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const px = u.x + Math.cos(a) * (u.r + 6), py = u.y + Math.sin(a) * (u.r + 6);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '52px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🏰', u.x, u.y + 2);
      if (u.invuln) {
        ctx.strokeStyle = 'rgba(226,232,240,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 26, 0, TAU); ctx.stroke();
      }
    } else if (u.kind === 'ward') {
      const col = TEAM_COLORS[u.team];
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(u.x, u.y + 8); ctx.lineTo(u.x, u.y - 14); ctx.stroke();
      ctx.fillStyle = '#0b1424';
      ctx.beginPath(); ctx.arc(u.x, u.y - 16, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(u.x, u.y - 16, 3.4, 0, TAU); ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
      ctx.globalAlpha = 0.25 + pulse * 0.3;
      ctx.beginPath(); ctx.arc(u.x, u.y - 16, 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (u.kind === 'monster') {
      const spr = SPRITES_MONSTER[u.monKind];
      if (spr) {
        const t = this.time;
        const bob = Math.sin(t * 3 + u.id) * 2;
        const scale = u.monKind === 'lord' ? 1.35 : u.monKind === 'turtle' ? 1.15 : 1;
        const H = (u.monKind === 'lizard' ? 34 : u.monKind === 'golem' ? 46 : 58) * scale;
        const W = spr.width * (H / spr.height);
        ctx.save();
        ctx.translate(u.x, u.y + 8 + bob);
        ctx.drawImage(spr, -W / 2, -H, W, H);
        ctx.restore();
        ctx.strokeStyle = 'rgba(167,139,250,0.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 9, W * 0.32, W * 0.14, 0, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = '#2e1065';
        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.font = (u.big ? 34 : 20) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(u.monKind === 'lord' ? '👑' : u.monKind === 'turtle' ? '🐢' : u.monKind === 'golem' ? '🗿' : '🦎', u.x, u.y + 1);
      }
    }
  }

  drawBars(ctx, u) {
    if (u.kind === 'tower' || u.kind === 'throne') {
      const w = u.kind === 'throne' ? 110 : 50;
      const y = u.y - u.r - 26;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(u.x - w / 2 - 1, y - 1, w + 2, 8);
      ctx.fillStyle = TEAM_COLORS[u.team];
      ctx.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 6);
      return;
    }
    if (u.kind === 'minion') {
      const w = 28, y = u.y - u.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(u.x - w / 2, y, w, 4);
      ctx.fillStyle = TEAM_COLORS[u.team];
      ctx.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 4);
      return;
    }
    if (u.kind === 'hero') {
      const w = 48, y = u.y - 60;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(u.x - w / 2 - 1, y - 1, w + 2, 7);
      ctx.fillStyle = u.team === this.player.team ? '#4ade80' : '#f87171';
      ctx.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 5);
      if (u.shieldVal > 0) {
        ctx.fillStyle = 'rgba(165,243,252,0.9)';
        ctx.fillRect(u.x - w / 2 + w * clamp(u.hp / u.maxHp, 0, 1), y, w * clamp(u.shieldVal / u.maxHp, 0, 1), 5);
      }
      // mana
      if (u.isPlayer || u.team === this.player.team) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(u.x - w / 2, y + 6, w, 3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(u.x - w / 2, y + 6, w * clamp(u.mana / u.maxMana, 0, 1), 3);
      }
      // name + level
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = u.isPlayer ? '#fbbf24' : TEAM_COLORS[u.team];
      ctx.fillText((u.isPlayer ? '★ ' : '') + u.name, u.x, y - 6);
      ctx.fillStyle = '#0b1424';
      ctx.beginPath(); ctx.arc(u.x + w / 2 + 8, y + 6, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText(u.level, u.x + w / 2 + 8, y + 7);
      if (!u.alive) {
        ctx.fillStyle = 'rgba(248,113,113,0.9)'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText('DEAD ' + Math.ceil(u.respT) + 's', u.x, u.y);
      }
    }
  }
}

/* ================================================================
 * Visual effects
 * ================================================================ */
class FX {
  constructor(g) { this.g = g; this.list = []; this.parts = []; }
  ring(x, y, r, color) { this.list.push({ t: 0, dur: 0.4, type: 'ring', x, y, r, color }); }
  slash(x, y, team, r) {
    const color = typeof team === 'string' ? team : (TEAM_COLORS[team] || '#fff');
    this.list.push({ t: 0, dur: 0.22, type: 'slash', x, y, r: r || 40, color });
  }
  dash(x0, y0, x1, y1, color) { this.list.push({ t: 0, dur: 0.3, type: 'dash', x0, y0, x1, y1, color }); }
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 240);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.3, 0.7), color, size: rand(2, 5) });
    }
    // network-visible marker (draw() ignores 'burst'; server snapshots pick it up)
    this.list.push({ t: 0, dur: 0.02, type: 'burst', x, y, n, color });
  }
  dmgText(x, y, n, dtype, crit) {
    if (this.list.length > 80) return;
    const color = crit ? '#fde047' : dtype === 'magic' ? '#c084fc' : dtype === 'true' ? '#fff' : '#f8fafc';
    this.list.push({ t: 0, dur: 0.8, type: 'text', x, y, txt: (crit ? '' : '') + n, color, size: crit ? 20 : 13 });
  }
  text(x, y, txt, color) { this.list.push({ t: 0, dur: 1.1, type: 'text', x, y, txt, color, size: 14 }); }
  heal(u, amt) {
    this.text(u.x, u.y - u.r - 20, '+' + Math.round(amt), '#4ade80');
    this.burst(u.x, u.y, '#4ade80', 6);
  }
  shieldFx(u) { this.ring(u.x, u.y, u.r + 14, '#a5f3fc'); }
  stun(u) { this.text(u.x, u.y - u.r - 26, '💥 STUN', '#fde047'); }
  heroDeath(u) { this.list.push({ t: 0, dur: 1.3, type: 'death', x: u.x, y: u.y, hid: u.def.id, tm: u.team }); }
  levelUp(x, y) { this.list.push({ t: 0, dur: 0.8, type: 'ring', x, y, r: 60, color: '#fbbf24' }); this.burst(x, y, '#fbbf24', 8); }
  telegraph(x, y, r, delay) { this.list.push({ t: 0, dur: delay, type: 'telegraph', x, y, r, color: '#f87171' }); }
  meteor(x, y, r) {
    this.list.push({ t: 0, dur: 0.5, type: 'ring', x, y, r, color: '#fb923c' });
    this.burst(x, y, '#fb923c', 30);
    this.burst(x, y, '#fbbf24', 20);
  }
  update(dt) {
    for (const e of this.list) e.t += dt;
    this.list = this.list.filter(e => e.t < e.dur);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const e of this.list) {
      const k = e.t / e.dur;
      ctx.globalAlpha = 1 - k;
      if (e.type === 'ring') {
        ctx.strokeStyle = e.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + k * 0.8), 0, TAU); ctx.stroke();
      } else if (e.type === 'slash') {
        ctx.strokeStyle = e.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, -0.6, 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
      } else if (e.type === 'dash') {
        ctx.strokeStyle = e.color; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
      } else if (e.type === 'text') {
        ctx.font = `bold ${e.size}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = e.color;
        ctx.fillText(e.txt, e.x, e.y - k * 34);
      } else if (e.type === 'death') {
        ctx.globalAlpha = (1 - k) * 0.9;
        const spr = SPRITES_FULL[e.hid];
        if (spr) {
          const H = 46, W = spr.width * (H / spr.height);
          ctx.save();
          ctx.translate(e.x, e.y + k * 12);
          ctx.rotate(1.4);
          ctx.drawImage(spr, -W / 2, -H / 2, W, H);
          ctx.restore();
        } else {
          ctx.strokeStyle = '#f87171'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(e.x, e.y, 32 * (1 - k * 0.5), 0, TAU); ctx.stroke();
        }
      } else if (e.type === 'telegraph') {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = e.color; ctx.lineWidth = 4;
        ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(248,113,113,0.12)';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ================================================================
 * Input (browser)
 * ================================================================ */
class Input {
  constructor(game) {
    this.g = game;
    this.keys = {};
    this.joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
    this.mouse = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.key.toLowerCase()] = true;
      const k = e.key.toLowerCase();
      if (k === 'q') game.playerCast(0);
      if (k === 'w') game.playerCast(1);
      if (k === 'e') game.playerCast(2);
      if (k === 'r') game.playerCast(3);
      if (k === '1') game.playerSkillUp(0);
      if (k === '2') game.playerSkillUp(1);
      if (k === '3') game.playerSkillUp(2);
      if (k === '4') game.playerSkillUp(3);
      if (k === 'b') { if (game.player.alive) game.player.startRecall(); }
      if (k === 'f') game.playerItemActive();
      if (k === 't') game.toggleShop();
      if (k === ' ') { e.preventDefault(); this.cycleLock(); }
      if (k === 'tab') { e.preventDefault(); this.g.boardOpen = true; this.g.renderBoard(); }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === 'tab') { this.g.boardOpen = false; this.g.renderBoard(); }
    });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; });
    // floating joystick: touch anywhere on the left 45% of the screen
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const setKnob = (dx, dy) => { knob.style.transform = `translate(calc(-50% + ${dx * 38}px), calc(-50% + ${dy * 38}px))`; };
    this.stick = stick;
    this.setKnob = setKnob;
    const gs = document.getElementById('game-screen');
    gs.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX > window.innerWidth * 0.45) continue;
        if (e.target.closest && e.target.closest('.tap,.skbtn,#shop')) continue;
        this.joy.active = true; this.joy.id = t.identifier;
        this.joy.cx = t.clientX; this.joy.cy = t.clientY;
        stick.style.left = (t.clientX - 66) + 'px';
        stick.style.top = (t.clientY - 66) + 'px';
        stick.style.bottom = 'auto';
        this.trackJoy(t);
        e.preventDefault();
        break;
      }
    }, { passive: false });
    gs.addEventListener('touchmove', (e) => {
      if (!this.joy.active) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joy.id) { this.trackJoy(t); e.preventDefault(); break; }
      }
    }, { passive: false });
    const joyEnd = (e) => {
      if (!this.joy.active) return;
      for (const t of Array.from(e.changedTouches ? e.changedTouches : [e])) {
        if ((t.identifier !== undefined ? t.identifier : 'mouse') === this.joy.id) {
          this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0;
          setKnob(0, 0);
          stick.style.left = ''; stick.style.top = ''; stick.style.bottom = '';
        }
      }
    };
    gs.addEventListener('touchend', joyEnd);
    gs.addEventListener('touchcancel', joyEnd);
  }
  trackJoy(t) {
    let dx = (t.clientX - this.joy.cx), dy = (t.clientY - this.joy.cy);
    const l = Math.hypot(dx, dy);
    const max = 48;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    this.joy.dx = dx / max; this.joy.dy = dy / max;
    this.setKnob(this.joy.dx, this.joy.dy);
  }
  cycleLock() {
    const p = this.g.player;
    if (!p) return;
    if (this.g.mode === 'mirror') { if (this.g.net && this.g.net.sendLock) this.g.net.sendLock(); return; }
    let foes = this.g.units.filter(u => u.kind === 'hero' && u.alive && u.team !== p.team && dist(u.x, u.y, p.x, p.y) < 1000);
    if (!foes.length) {
      // second priority: big monsters / enemy towers in range
      foes = this.g.units.filter(u => u.alive && (u.team === 2 || (u.team !== p.team && (u.kind === 'tower' || u.kind === 'throne') && !u.invuln)) &&
        dist(u.x, u.y, p.x, p.y) < 700);
    }
    if (!foes.length) { p.lockTarget = null; return; }
    foes.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
    const i = foes.indexOf(p.lockTarget);
    p.lockTarget = foes[(i + 1) % foes.length];
  }
  aimPt(h) {
    // mouse aim on desktop; otherwise nearest foe or facing
    if (this.mouse.active && !this.joy.active) {
      const z = this.g.zoomVal();
      const rect = { w: window.innerWidth, h: window.innerHeight };
      const wx = this.g.cam.x + (this.mouse.x - rect.w / 2) / z;
      const wy = this.g.cam.y + (this.mouse.y - rect.h / 2) / z;
      return { x: wx, y: wy };
    }
    if (this.joy.active) return { x: h.x + this.joy.dx * 400, y: h.y + this.joy.dy * 400 };
    return null; // let skillAim auto-aim
  }
  apply(h) {
    if (!h || !h.alive) return;
    let mx = 0, my = 0;
    const k = this.keys;
    if (k['w'] || k['arrowup']) my -= 1;
    if (k['s'] || k['arrowdown']) my += 1;
    if (k['a'] || k['arrowleft']) mx -= 1;
    if (k['d'] || k['arrowright']) mx += 1;
    if (this.joy.active && (Math.abs(this.joy.dx) > 0.18 || Math.abs(this.joy.dy) > 0.18)) { mx = this.joy.dx; my = this.joy.dy; }
    h.moveDir = (mx || my) ? { x: mx, y: my } : null;
    // lock target cleanup
    if (h.lockTarget && (!h.lockTarget.alive || dist(h.lockTarget.x, h.lockTarget.y, h.x, h.y) > 1200)) h.lockTarget = null;
  }
}

/* ================================================================
 * DOM helpers: announcer, killfeed, screens
 * ================================================================ */
function announceDOM(main, sub, dur) {
  main = riftifyText(main);
  const host = document.getElementById('announce');
  const el = document.createElement('div');
  el.className = 'ann-main';
  el.textContent = main;
  el.style.color = main.includes('BLUE') || main.includes('Dawn') ? '#38bdf8' : main.includes('RED') || main.includes('Fire') || main.includes('FIRE') ? '#fb7185' : '#fbbf24';
  const s = document.createElement('div');
  s.className = 'ann-sub'; s.textContent = sub || '';
  host.innerHTML = '';
  host.appendChild(el); host.appendChild(s);
  setTimeout(() => { if (host.contains(el)) host.innerHTML = ''; }, dur * 1000);
}
function killfeedDOM(team, icon, victimTeam, victimName) {
  const host = document.getElementById('killfeed');
  const el = document.createElement('div');
  el.className = 'kf';
  el.innerHTML = `<span style="color:${TEAM_COLORS[team]}">${icon} ${team === 0 ? 'Blue' : 'Red'}</span> ⚔ <span style="color:${TEAM_COLORS[victimTeam]}">${victimName}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 5200);
  while (host.children.length > 5) host.children[0].remove();
}

/* voice announcer clips (sfx/ann_*.mp3 — generated separately) */
const VOICE_CACHE = {};
function playVoice(key) {
  // Rift theme swaps the boss callouts
  if (typeof currentTheme === 'function' && currentTheme().id === 'rift') {
    if (key === 'lord') key = 'baron';
    if (key === 'turtle') key = 'dragon';
  }
  try {
    let a = VOICE_CACHE[key];
    if (!a) { a = new Audio('sfx/ann_' + key + '.mp3'); a.volume = 0.85; VOICE_CACHE[key] = a; }
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch (e) {}
}
function voiceKeyFor(main) {
  let key = null;
  const M = (main || '').toUpperCase();
  if (M.includes('FIRST BLOOD')) key = 'firstblood';
  else if (M.includes('DOUBLE KILL')) key = 'doublekill';
  else if (M.includes('TRIPLE KILL')) key = 'triplekill';
  else if (M.includes('MANIAC')) key = 'maniac';
  else if (M.includes('SAVAGE')) key = 'savage';
  else if (M.includes('TOWER')) key = 'tower';
  else if (M.includes('LORD')) key = 'lord';
  else if (M.includes('TURTLE')) key = 'turtle';
  else if (M.includes('NEXUS')) key = 'nexus';
  else if (M.includes('BATTLE HAS BEGUN')) key = 'begin';
  return key;
}
function riftifyText(main) {
  if (typeof currentTheme !== 'function' || currentTheme().id !== 'rift') return main;
  return String(main)
    .replace('👑 LORD SLAIN', '💀 BARON SLAIN')
    .replace('🐢 TURTLE SLAIN', '🐉 DRAGON SLAIN')
    .replace('LORD', 'BARON').replace('Lord', 'Baron')
    .replace('TURTLE', 'DRAGON').replace('Turtle', 'Dragon');
}

/* stats summary that works for real heroes AND mirror (network) hero objects */
function statLineFor(p) {
  const s = p.def.stats, lvl = (p.level || 1) - 1, it = p.items || {};
  const is = (key) => {
    let v = 0;
    for (const [id, n] of Object.entries(it)) {
      const item = itemById(id);
      if (item && item.stats && item.stats[key]) v += item.stats[key] * n;
    }
    return v;
  };
  const hp = s.hp + s.hpL * lvl + is('hp');
  const atk = s.atk + s.atkL * lvl + is('atk');
  const aspd = s.aspd + s.aspdL * lvl + is('aspd');
  const dfn = s.def + s.defL * lvl + is('def');
  const ms = s.ms + is('ms');
  const cdr = Math.min(0.4, is('cdr'));
  const ls = is('ls');
  return `⚔️ ATK <b>${Math.round(atk)}</b> · ⚡ ASPD <b>${aspd.toFixed(2)}</b> · 🛡 DEF <b>${Math.round(dfn)}</b> · 👟 MS <b>${Math.round(ms)}</b> · 📏 RANGE <b>${Math.round(s.range)}</b> · 🔵 CDR <b>${Math.round(cdr * 100)}%</b>` +
    `<br>❤️ HP <b>${Math.round(p.hp)}/${Math.round(p.maxHp || hp)}</b> · 🩸 LIFESTEAL <b>${Math.round(ls * 100)}%</b>`;
}

/* ---------------- loading screen ---------------- */
const LS_TIPS = [
  '💡 Vision wins games — place 🔮 wards before objective fights',
  '🌿 Bushes hide you from enemies… until they step in too',
  '👑 Slaying the Lord grants your whole team +15% damage for 75s',
  '🧩 Build components early, complete legendaries when you recall',
  '💫 Blink Ring can dodge ultimates — save it for the big moment',
  '☆ Every hero has a passive — read it on the hero card!',
  '🩸 Rona heals more the lower her HP — finish her fast or not at all',
  '🏹 Vex crits every 4th basic attack — count her shots',
  '🐉 Turtle gives team gold; Lord gives team power. Choose your timing',
  '🛡️ Towers ramp damage the longer they hit you — don\'t tank them',
  '⚔️ Press TAB to check the scoreboard — gold leads tell stories',
  '🌀 Upgrade skills with the green ＋ chips — a point every level',
];
function rankFor(elo) {
  const e = elo || 1000;
  if (e >= 1900) return ['MYTHIC', '#f472b6'];
  if (e >= 1750) return ['LEGEND', '#fbbf24'];
  if (e >= 1600) return ['EPIC', '#a78bfa'];
  if (e >= 1450) return ['DIAMOND', '#7dd3fc'];
  if (e >= 1300) return ['PLATINUM', '#34d399'];
  if (e >= 1150) return ['GOLD', '#fbbf24'];
  if (e >= 1000) return ['SILVER', '#94a3b8'];
  return ['BRONZE', '#b45309'];
}
function botElo(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return 950 + (h % 520);
}
function showLoadingScreen(roster, youName, opts, done) {
  const scr = document.getElementById('loading-screen');
  const blue = document.getElementById('ls-blue');
  const red = document.getElementById('ls-red');
  blue.innerHTML = ''; red.innerHTML = '';
  document.getElementById('ls-mode').textContent = (opts && opts.mode) || 'RANKED · SEASON 1';
  for (const r of roster) {
    const h = heroById(r.heroId);
    const isYou = r.name === youName;
    const elo = r.elo !== undefined ? r.elo : (r.bot ? botElo(r.name) : 1000);
    const [rn, rc] = rankFor(elo);
    const card = document.createElement('div');
    card.className = 'ls-card' + (r.team === 1 ? ' red' : '');
    card.innerHTML = `
      <img class="ls-face" src="img/${h.id}.png" onerror="this.outerHTML='<div class=\'ls-face\' style=\'display:flex;align-items:center;justify-content:center;font-size:22px\'>${h.emoji}</div>'">
      <div class="ls-mid">
        <div class="ls-name">${isYou ? '<span class="you">★ YOU</span> · ' : ''}${r.name}${r.bot && !isYou ? ' <small style="color:#5c7099">BOT</small>' : ''}</div>
        <div class="ls-hero">${h.emoji} ${h.name} · ${h.role}</div>
      </div>
      <span class="ls-rank" style="color:${rc};background:${rc}1a;border:1px solid ${rc}44">${rn} ${elo}</span>`;
    (r.team === 0 ? blue : red).appendChild(card);
  }
  scr.classList.add('on');
  const bar = document.getElementById('ls-bar');
  const tip = document.getElementById('ls-tip');
  const status = document.getElementById('ls-status');
  const statuses = ['Summoning heroes…', 'Sharpening blades…', 'Growing the jungle…', 'Charging the towers…', 'Entering the Aether…'];
  let tipI = Math.floor(Math.random() * LS_TIPS.length);
  tip.textContent = LS_TIPS[tipI];
  let stI = 0;
  status.textContent = statuses[0];
  bar.style.width = '4%';
  const t0 = performance.now();
  const DUR = 2800;
  const timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / DUR);
    // ease with little hiccups like a real loader
    const w = 4 + k * 96 - (k > 0.55 && k < 0.62 ? 8 : 0);
    bar.style.width = w + '%';
    const st = Math.min(statuses.length - 1, Math.floor(k * statuses.length));
    if (st !== stI) { stI = st; status.textContent = statuses[st]; }
    tipI++;
    tip.style.opacity = 0;
    setTimeout(() => { tip.textContent = LS_TIPS[tipI % LS_TIPS.length]; tip.style.opacity = 1; }, 200);
  }, 900);
  setTimeout(() => {
    clearInterval(timer);
    bar.style.width = '100%';
    status.textContent = 'Battle ready!';
    setTimeout(() => { scr.classList.remove('on'); done(); }, 350);
  }, DUR);
}

/* ---------------- hero select & end screens ---------------- */
let selectedHero = HEROES[0].id;
let currentGame = null;

function buildSelectScreen() {
  const grid = document.getElementById('hero-grid');
  grid.innerHTML = '';
  HEROES.forEach(h => {
    const c = document.createElement('div');
    c.className = 'hero-card' + (h.id === selectedHero ? ' sel' : '');
    const bars = [
      ['ATK', (h.stats.atk - 60) / 60, '#f87171'],
      ['HP', (h.stats.hp - 800) / 1200, '#4ade80'],
      ['DEF', (h.stats.def - 20) / 70, '#60a5fa'],
      ['SPD', (h.stats.ms - 240) / 60, '#fbbf24'],
    ];
    c.innerHTML = `
      <div class="hc-top">
        <div class="hc-face" style="background:${h.tint}22;border:1px solid ${h.tint}55"><img src="img/${h.id}.png" alt="" style="display:none"><span class="hc-emoji">${h.emoji}</span></div>
        <div><div class="hc-name">${h.name}</div><div class="hc-role">${h.role} · ${h.title}</div></div>
      </div>
      <div class="hc-bars">${bars.map(b => `<div>${b[0]}<div class="hc-bar"><i style="width:${clamp(b[1], 0.08, 1) * 100}%;background:${b[2]}"></i></div></div>`).join('')}</div>
      <div class="hc-skills">${h.passive ? `<div class="hc-skill hc-passive"><b>${h.passive.icon} ${h.passive.name} · PASSIVE</b>${h.passive.desc}</div>` : ''}${h.skills.map(s => `<div class="hc-skill"><b>${s.icon} ${s.name}</b>${s.desc}</div>`).join('')}</div>`;
    const img = c.querySelector('.hc-face img');
    if (img && !HEADLESS) {
      img.onload = () => { img.style.display = 'block'; c.querySelector('.hc-emoji').style.display = 'none'; img.style.filter = skinHueFilter(h.id); };
      if (img.complete && img.naturalWidth > 0) img.onload();
    }
    // skin selector dots (cosmetic variants)
    if (!HEADLESS) {
      const dots = document.createElement('div');
      dots.className = 'hc-skins';
      const swatch = { classic: h.tint, emerald: '#34d399', frost: '#7dd3fc', inferno: '#f87171' };
      SKINS.forEach((sk, si) => {
        const ownedF = (typeof skinOwned === 'function') ? skinOwned(h.id, si) : true;
        const d = document.createElement('span');
        d.className = 'hc-skin' + (si === equippedSkin(h.id) ? ' on' : '') + (ownedF ? '' : ' locked');
        d.style.background = swatch[sk.id] || '#888';
        d.title = ownedF ? 'Skin: ' + sk.name : `${sk.name} — 💎${sk.price} (locked)`;
        d.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!ownedF) {
            if (window.Lobby) window.Lobby.openSkinShop(h.id);
            return;
          }
          try { localStorage.setItem('aa_skin_' + h.id, String(si)); } catch (err) {}
          dots.querySelectorAll('.hc-skin').forEach(x => x.classList.remove('on'));
          d.classList.add('on');
          if (img && img.style.display !== 'none') img.style.filter = skinHueFilter(h.id);
        });
        dots.appendChild(d);
      });
      c.appendChild(dots);
    }
    c.addEventListener('click', () => {
      selectedHero = h.id;
      grid.querySelectorAll('.hero-card').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      buildTeamPreview();
    });
    grid.appendChild(c);
  });
  buildTeamPreview();
}

function buildTeamPreview() {
  const tp = document.getElementById('team-preview');
  const others = HEROES.filter(h => h.id !== selectedHero).sort(() => Math.random() - 0.5).slice(0, 4);
  tp.innerHTML = `<span class="tp-chip" style="border-color:#fbbf24">YOU: ${heroById(selectedHero).emoji} ${heroById(selectedHero).name}</span>` +
    others.map(h => `<span class="tp-chip">${h.emoji} ${h.name} (Ally)</span>`).join('') +
    `<span class="tp-chip">Enemies: ❓❓❓❓❓</span>`;
}

function startGame(heroId) {
  const g = new Game(heroId, false);
  g.sfx.resume();
  const roster = [];
  for (let t = 0; t < 2; t++) {
    for (const h of g.heroes[t]) roster.push({ name: h.name, heroId: h.def.id, team: t, bot: h.brain ? 1 : 0 });
  }
  showLoadingScreen(roster, 'You', { mode: 'PRACTICE · VS AI' }, () => {
    document.getElementById('select-screen').classList.remove('on');
    document.getElementById('end-screen').classList.remove('on');
    document.getElementById('game-screen').classList.add('on');
    document.getElementById('killfeed').innerHTML = '';
    currentGame = g;
  });
}

function showEndScreen(g) {
  setTimeout(() => {
    const win = g.winner === 0;
    document.getElementById('end-title').textContent = win ? 'VICTORY' : 'DEFEAT';
    document.getElementById('end-title').style.color = win ? '#4ade80' : '#f87171';
    const p = g.player;
    document.getElementById('end-sub').textContent = `${fmtTime(g.time)} · Blue ${g.kills[0]} — ${g.kills[1]} Red`;
    document.getElementById('end-stats').innerHTML = [
      [`${p.kills} / ${p.deaths} / ${p.assists}`, 'K / D / A'],
      [Math.floor(p.goldEarned), 'GOLD EARNED'],
      [Math.floor(p.dmgDealt), 'DAMAGE DEALT'],
      ['Lv ' + p.level, 'FINAL LEVEL'],
    ].map(s => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
    document.getElementById('game-screen').classList.remove('on');
    document.getElementById('end-screen').classList.add('on');
  }, 1400);
}

/* ---------------- boot ---------------- */
function distToSeg(px, py, a, b) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1];
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

if (!HEADLESS) {
  loadSprites();
  buildSelectScreen();
  document.getElementById('cancel-queue').addEventListener('click', () => { if (window.net) window.net.unqueue(); });
  // map theme selector
  const syncThemeBtns = () => {
    const cur = currentTheme().id;
    const a = document.getElementById('theme-aether'), r = document.getElementById('theme-rift');
    if (!a || !r) return;
    a.classList.toggle('on', cur === 'aether');
    r.classList.toggle('on', cur === 'rift');
  };
  const setTheme = (id) => {
    try { localStorage.setItem('aa_maptheme', id); } catch (e) {}
    syncThemeBtns();
  };
  document.getElementById('theme-aether').addEventListener('click', () => setTheme('aether'));
  document.getElementById('theme-rift').addEventListener('click', () => setTheme('rift'));
  syncThemeBtns();
  document.getElementById('start-btn').addEventListener('click', () => {
    if (typeof window.startBattle === 'function') return window.startBattle();
    startGame(selectedHero);
  });
  document.getElementById('again-btn').addEventListener('click', () => {
    if (typeof window.playAgain === 'function') return window.playAgain();
    startGame(selectedHero);
  });
  document.getElementById('reselect-btn').addEventListener('click', () => {
    document.getElementById('end-screen').classList.remove('on');
    document.getElementById('game-screen').classList.remove('on');
    document.getElementById('select-screen').classList.add('on');
    buildSelectScreen();
  });
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (currentGame && currentGame.state === 'play') {
      currentGame.update(dt);
      currentGame.draw();
    } else if (currentGame) {
      currentGame.draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* export for simulation harness & game server */
if (HEADLESS) {
  globalThis.Game = Game;
  globalThis.FX = FX;
  globalThis.Brain = Brain;
  globalThis.HEROES = HEROES;
  globalThis.ITEMS = ITEMS;
  globalThis.CFG = CFG;
  globalThis.HEADLESS = HEADLESS;
  globalThis.heroById = heroById;
  globalThis.SKINS = SKINS;
  globalThis.SKIN_PRICES = SKIN_PRICES;
  globalThis.BUSHES = BUSHES;
  globalThis.dist = dist;
  globalThis.clamp = clamp;
  globalThis.lerp = lerp;
  globalThis.rand = rand;
}
