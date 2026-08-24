/* ============================================================
 * AETHER ARENA — heroes.js
 * Hero roster: 6 heroes, each with unique stats + 3 skills.
 * Skills are declarative; game.js executes them by `kind`.
 *
 * Stat suffix "L" = growth per level (max level 15).
 * ============================================================ */
'use strict';

const HEROES = [
  {
    id: 'kael', name: 'KAEL', title: 'Blade Dancer', role: 'Fighter',
    passive: { name: "Berserker's Grit", icon: "☆", desc: "Below 40% HP: +18% attack speed, +10% move speed." }, emoji: '⚔️', tint: '#f59e0b',
    stats: { hp: 1350, hpL: 152, mana: 420, manaL: 40, atk: 92, atkL: 9, dtype: 'phys',
             aspd: 0.85, aspdL: 0.022, range: 115, ms: 268, def: 42, defL: 6.5, regen: 9 },
    skills: [
      { name: 'Cleave', icon: '🌀', kind: 'nova', cd: 6, mana: 45, unlock: 1, radius: 190, dmg: 110, dmgL: 55, lifesteal: 0.35,
        desc: 'Slash nearby enemies and restore 35% of damage dealt as HP.' },
      { name: 'Dash Strike', icon: '💨', kind: 'dash', cd: 9, mana: 50, unlock: 2, dashDist: 330, dmg: 90, dmgL: 50, slowPct: 0.35, slowDur: 1.6,
        desc: 'Dash forward, damaging and slowing enemies on the path.' },
{ name: 'Flame Wave', icon: '🔥', kind: 'proj', cd: 8, mana: 50, unlock: 3, range: 520, speed: 900, pierce: true, dmg: 100, dmgL: 50, slowPct: 0.25, slowDur: 1,
        desc: 'A rolling wave of embers that pierces and scorches.' },
            { name: 'Bladestorm', icon: '🌪️', kind: 'buff', cd: 42, mana: 100, unlock: 5, dur: 6, aspdAdd: 0.6, msAdd: 0.2, lifestealAdd: 0.3, cleave: true,
        desc: 'ULT · 6s: +60% attack speed, +20% move speed, attacks cleave, 30% lifesteal.' },
    ],
  },
  {
    id: 'vex', name: 'VEX', title: 'Deadeye', role: 'Marksman',
    passive: { name: 'Deadeye', icon: '☆', desc: 'Every 4th basic attack deals +45% damage.' }, emoji: '🏹', tint: '#34d399',
    stats: { hp: 950, hpL: 105, mana: 380, manaL: 32, atk: 106, atkL: 11, dtype: 'phys',
             aspd: 1.05, aspdL: 0.035, range: 430, ms: 258, def: 24, defL: 3.5, regen: 6 },
    skills: [
      { name: 'Piercing Bolt', icon: '🎯', kind: 'proj', cd: 6, mana: 40, unlock: 1, range: 580, speed: 1050, pierce: true, dmg: 120, dmgL: 55,
        desc: 'Fire a bolt that pierces every enemy in a line.' },
      { name: 'Kickback', icon: '🦿', kind: 'dash', cd: 10, mana: 40, unlock: 2, dashDist: 280, away: true, aspdAdd: 0.4, dur: 3,
        desc: 'Dash away from danger and gain +40% attack speed for 3s.' },
{ name: 'Hunter\'s Net', icon: '🕸️', kind: 'proj', cd: 9, mana: 50, unlock: 3, range: 480, speed: 800, dmg: 70, dmgL: 35, slowPct: 0.5, slowDur: 2,
        desc: 'Weighted net that heavily slows the first enemies hit.' },
            { name: 'Overdrive', icon: '⚡', kind: 'buff', cd: 45, mana: 100, unlock: 5, dur: 5, aspdAdd: 0.8, rangeAdd: 90, atkAdd: 30,
        desc: 'ULT · 5s: +80% attack speed, +90 range, +30 damage per shot.' },
    ],
  },
  {
    id: 'nyx', name: 'NYX', title: 'Void Witch', role: 'Mage',
    passive: { name: 'Void Echo', icon: '☆', desc: 'Her skill hits also slow enemies by 20% for 1s.' }, emoji: '🔮', tint: '#a78bfa',
    stats: { hp: 1000, hpL: 100, mana: 560, manaL: 55, atk: 94, atkL: 9, dtype: 'magic',
             aspd: 0.8, aspdL: 0.02, range: 400, ms: 256, def: 26, defL: 4, regen: 7 },
    skills: [
      { name: 'Void Orb', icon: '🟣', kind: 'proj', cd: 5.5, mana: 55, unlock: 1, range: 620, speed: 900, dmg: 130, dmgL: 60, magic: true, stunHero: 1.1,
        desc: 'Hurl an orb that damages and stuns the first enemy hero hit.' },
      { name: 'Nether Nova', icon: '💥', kind: 'nova', cd: 9, mana: 70, unlock: 2, radius: 235, dmg: 150, dmgL: 70, magic: true, slowPct: 0.4, slowDur: 2,
        desc: 'Detonate void energy around you, damaging and slowing.' },
{ name: 'Rift Step', icon: '🌌', kind: 'dash', cd: 8, mana: 45, unlock: 3, dashDist: 300, dmg: 80, dmgL: 40, magic: true,
        desc: 'Blink through the void, damaging everything you pass.' },
            { name: 'Meteor', icon: '☄️', kind: 'meteor', cd: 42, mana: 120, unlock: 5, radius: 280, delay: 0.8, dmg: 380, dmgL: 95, magic: true, slowPct: 0.3, slowDur: 1.5,
        desc: 'ULT · Call a meteor onto enemy heroes: huge area damage.' },
    ],
  },
  {
    id: 'bastion', name: 'BASTION', title: 'Ironwall', role: 'Tank',
    passive: { name: 'Iron Skin', icon: '☆', desc: 'Below 60% HP: +25% defense.' }, emoji: '🛡️', tint: '#60a5fa',
    stats: { hp: 1780, hpL: 210, mana: 320, manaL: 28, atk: 72, atkL: 6, dtype: 'phys',
             aspd: 0.7, aspdL: 0.015, range: 125, ms: 262, def: 72, defL: 9, regen: 12 },
    skills: [
      { name: 'Shield Slam', icon: '🔨', kind: 'nova', cd: 7, mana: 40, unlock: 1, radius: 215, dmg: 110, dmgL: 50, slowPct: 0.4, slowDur: 2,
        desc: 'Slam the ground, damaging and slowing nearby enemies.' },
      { name: 'Bulwark', icon: '🛡️', kind: 'shield', cd: 14, mana: 50, unlock: 2, shield: 320, shieldL: 85, dur: 4, defAdd: 40,
        desc: 'Gain a shield and +40 defense for 4s.' },
{ name: 'Taunt Roar', icon: '📢', kind: 'nova', cd: 10, mana: 45, unlock: 3, radius: 260, dmg: 70, dmgL: 35, slowPct: 0.5, slowDur: 2,
        desc: 'A roar that heavily slows everyone around you.' },
            { name: 'Earthshaker', icon: '🌋', kind: 'nova', cd: 48, mana: 100, unlock: 5, radius: 330, dmg: 240, dmgL: 60, stunDur: 1.2,
        desc: 'ULT · Shatter the earth: damage and STUN everything nearby.' },
    ],
  },
  {
    id: 'syon', name: 'SYON', title: 'Phantom', role: 'Assassin',
    passive: { name: 'Phantom Edge', icon: '☆', desc: '15% +1%/level crit chance dealing 2x damage.' }, emoji: '🗡️', tint: '#f472b6',
    stats: { hp: 1120, hpL: 115, mana: 360, manaL: 30, atk: 102, atkL: 10, dtype: 'phys',
             aspd: 0.95, aspdL: 0.03, range: 135, ms: 290, def: 30, defL: 4, regen: 7, crit: 0.15, critL: 0.01 },
    skills: [
      { name: 'Shadow Step', icon: '🌑', kind: 'dash', cd: 7, mana: 45, unlock: 1, dashDist: 390, dmg: 130, dmgL: 60,
        desc: 'Dash through enemies as a shadow, cutting them down.' },
      { name: 'Mark of Death', icon: '☠️', kind: 'strike', cd: 10, mana: 45, unlock: 2, range: 340, dmg: 170, dmgL: 70, markDur: 4, markAmp: 0.25,
        desc: 'Stike the nearest enemy and mark them: +25% damage taken for 4s.' },
{ name: 'Smoke Veil', icon: '💨', kind: 'buff', cd: 12, mana: 40, unlock: 3, dur: 3, msAdd: 0.3, atkAdd: 20,
        desc: 'Vanish into smoke: +30% speed, +20 attack for 3s.' },
            { name: 'Reaper\'s Embrace', icon: '💀', kind: 'blink', cd: 40, mana: 90, unlock: 5, range: 650, dmg: 300, dmgL: 85, resetSkill: 0,
        desc: 'ULT · Blink to the weakest enemy hero and strike, resetting Shadow Step.' },
    ],
  },
  {
    id: 'seraph', name: 'SERAPH', title: 'Dawnbringer', role: 'Support',
    passive: { name: 'Blessing of Dawn', icon: '☆', desc: 'Regenerates 2% max HP/s after avoiding damage for 5s.' }, emoji: '✨', tint: '#fde68a',
    stats: { hp: 1160, hpL: 120, mana: 520, manaL: 50, atk: 80, atkL: 7, dtype: 'phys',
             aspd: 0.8, aspdL: 0.02, range: 390, ms: 262, def: 36, defL: 5, regen: 8 },
    skills: [
      { name: 'Radiant Lance', icon: '🔆', kind: 'proj', cd: 6, mana: 45, unlock: 1, range: 620, speed: 950, dmg: 150, dmgL: 55, slowPct: 0.3, slowDur: 2,
        desc: 'Piercing lance of light that slows enemies hit.' },
      { name: 'Mend', icon: '💚', kind: 'heal', cd: 12, mana: 70, unlock: 2, heal: 240, healL: 75, radius: 520,
        desc: 'Heal the most wounded nearby ally (or yourself).' },
{ name: 'Purify', icon: '🕊️', kind: 'heal', cd: 9, mana: 55, unlock: 3, heal: 160, healL: 50, radius: 420,
        desc: 'Cleanse and heal yourself or the nearest wounded ally.' },
            { name: 'Sanctuary', icon: '🌟', kind: 'sanctuary', cd: 55, mana: 130, unlock: 5, heal: 300, healL: 80, shield: 260,
        desc: 'ULT · Heal ALL allies globally and grant them a shield.' },
    ],
  },
  {
    id: 'rona', name: 'RONA', title: 'Bloodreaver', role: 'Fighter',
    passive: { name: 'Bloodthirst', icon: '☆', desc: 'Up to +15% lifesteal based on missing HP.' }, emoji: '🪓', tint: '#ef4444',
    stats: { hp: 1420, hpL: 160, mana: 380, manaL: 34, atk: 96, atkL: 9.5, dtype: 'phys',
             aspd: 0.9, aspdL: 0.025, range: 120, ms: 272, def: 44, defL: 6, regen: 10 },
    skills: [
      { name: 'Ravage Leap', icon: '🦘', kind: 'dash', cd: 8, mana: 50, unlock: 1, dashDist: 360, dmg: 100, dmgL: 50,
        desc: 'Leap forward, cleaving everything on the path.' },
      { name: 'Blood Frenzy', icon: '🩸', kind: 'buff', cd: 14, mana: 55, unlock: 2, dur: 4.5, atkAdd: 25, msAdd: 0.15, lsAdd: 0.35,
        desc: '4.5s: +25 attack, +15% speed, 35% lifesteal.' },
{ name: 'Skullcrusher', icon: '🔨', kind: 'strike', cd: 9, mana: 45, unlock: 3, range: 340, dmg: 150, dmgL: 65, slowPct: 0.4, slowDur: 1.5,
        desc: 'A brutal overhead smash that slows the target.' },
            { name: 'Crimson Maelstrom', icon: '🌊', kind: 'nova', cd: 46, mana: 100, unlock: 5, radius: 300, dmg: 260, dmgL: 70, lifesteal: 0.5, slowPct: 0.3, slowDur: 1.2,
        desc: 'ULT · Whirl of axes: heavy AoE damage, 50% back as healing.' },
    ],
  },
  {
    id: 'volt', name: 'VOLT', title: 'Longshot', role: 'Marksman',
    passive: { name: 'Long Barrel', icon: '☆', desc: 'Basic attack range grows +14 per level.' }, emoji: '🎯', tint: '#22d3ee',
    stats: { hp: 980, hpL: 108, mana: 400, manaL: 34, atk: 100, atkL: 10.5, dtype: 'phys',
             aspd: 0.9, aspdL: 0.03, range: 470, ms: 254, def: 25, defL: 3.5, regen: 6 },
    skills: [
      { name: 'Tesla Round', icon: '⚡', kind: 'proj', cd: 7, mana: 45, unlock: 1, range: 780, speed: 1250, pierce: true, dmg: 150, dmgL: 65, slowPct: 0.25, slowDur: 1,
        desc: 'Super long charged shot that pierces and slows.' },
      { name: 'Static Field', icon: '🌐', kind: 'nova', cd: 9, mana: 50, unlock: 2, radius: 220, dmg: 80, dmgL: 40, slowPct: 0.5, slowDur: 2,
        desc: 'Discharge a shock field, heavily slowing nearby enemies.' },
{ name: 'Flash Step', icon: '🏃', kind: 'dash', cd: 9, mana: 40, unlock: 3, dashDist: 340, dmg: 60, dmgL: 30, slowPct: 0.3, slowDur: 1,
        desc: 'Dash with a static trail that slows pursuers.' },
            { name: 'Overcharge', icon: '🔋', kind: 'buff', cd: 44, mana: 100, unlock: 5, dur: 4, atkAdd: 45, rangeAdd: 130, aspdAdd: 0.3,
        desc: 'ULT · 4s: +45 attack, +130 range, +30% attack speed.' },
    ],
  },
  {
    id: 'morrow', name: 'MORROW', title: 'Soulbinder', role: 'Mage',
    passive: { name: 'Soul Harvest', icon: '☆', desc: 'Kills restore 6% of his max HP.' }, emoji: '☠️', tint: '#2dd4bf',
    stats: { hp: 1020, hpL: 102, mana: 580, manaL: 58, atk: 92, atkL: 9, dtype: 'magic',
             aspd: 0.78, aspdL: 0.02, range: 400, ms: 256, def: 26, defL: 4, regen: 7 },
    skills: [
      { name: 'Soul Drain', icon: '🫧', kind: 'proj', cd: 5, mana: 50, unlock: 1, range: 600, speed: 850, dmg: 120, dmgL: 58, magic: true, drain: 0.5,
        desc: 'Bolt of soulfire that heals you for 50% of damage dealt.' },
      { name: 'Grasp of the Dead', icon: '👐', kind: 'nova', cd: 9, mana: 65, unlock: 2, radius: 240, dmg: 130, dmgL: 62, magic: true, slowPct: 0.45, slowDur: 2.2,
        desc: 'Spectral hands damage and heavily slow enemies around you.' },
{ name: 'Wailing Bolt', icon: '😭', kind: 'proj', cd: 7, mana: 50, unlock: 3, range: 560, speed: 820, magic: true, dmg: 110, dmgL: 50, drain: 0.35,
        desc: 'A screaming skull-drain bolt that heals you for 35%.' },
            { name: 'Soul Storm', icon: '🌀', kind: 'meteor', cd: 44, mana: 120, unlock: 5, radius: 300, delay: 0.9, dmg: 360, dmgL: 90, magic: true, slowPct: 0.35, slowDur: 1.5,
        desc: 'ULT · Tear open a soul storm over enemy heroes.' },
    ],
  },
  {
    id: 'tala', name: 'TALA', title: 'Moonwarden', role: 'Support',
    passive: { name: 'Moonlight Aura', icon: '☆', desc: 'Nearby allied heroes gain +50% mana regeneration.' }, emoji: '🌙', tint: '#93c5fd',
    stats: { hp: 1140, hpL: 118, mana: 540, manaL: 52, atk: 78, atkL: 7, dtype: 'phys',
             aspd: 0.8, aspdL: 0.02, range: 380, ms: 262, def: 34, defL: 4.5, regen: 8 },
    skills: [
      { name: 'Lunar Lance', icon: '🌙', kind: 'proj', cd: 6, mana: 45, unlock: 1, range: 620, speed: 950, dmg: 130, dmgL: 50, slowPct: 0.35, slowDur: 2,
        desc: 'Crescent spear that slows enemies hit.' },
      { name: 'Moonwell', icon: '💧', kind: 'heal', cd: 11, mana: 65, unlock: 2, heal: 230, healL: 72, radius: 520,
        desc: 'Spring of moonlight heals the most wounded nearby ally.' },
{ name: 'Starfall', icon: '🌠', kind: 'healnova', cd: 10, mana: 60, unlock: 3, radius: 300, heal: 130, healL: 45,
        desc: 'Gentle starlight heals ALL allies around you.' },
            { name: 'Moonveil', icon: '🌠', kind: 'sanctuary', cd: 52, mana: 125, unlock: 5, heal: 280, healL: 75, shield: 240,
        desc: 'ULT · Veil the whole team: heal, shield and +20% speed.' },
    ],
  },
];

const heroById = (id) => HEROES.find(h => h.id === id) || HEROES[0];

/* ---------------- Shop items ----------------
 * Components are cheap bases; LEGENDARIES consume their recipe
 * components on purchase. ACTIVES grant a usable item ability. */
const ITEMS = [
  // components
  { id: 'sword', icon: '🗡️', name: 'Long Sword', cost: 250, max: 4, stats: { atk: 12 }, desc: '+12 attack', comp: true },
  { id: 'vest', icon: '🧵', name: 'Cloth Vest', cost: 220, max: 4, stats: { def: 14 }, desc: '+14 defense', comp: true },
  { id: 'feather', icon: '🪶', name: 'Swift Feather', cost: 240, max: 4, stats: { ms: 22 }, desc: '+22 move speed', comp: true },
  { id: 'crystal', icon: '💠', name: 'Vital Crystal', cost: 300, max: 4, stats: { hp: 260 }, desc: '+260 max HP', comp: true },
  { id: 'tome', icon: '📘', name: 'Arcane Tome', cost: 280, max: 4, stats: { cdr: 0.07 }, desc: '+7% cooldown reduction', comp: true },
  { id: 'ring', icon: '💍', name: 'Vampiric Ring', cost: 280, max: 4, stats: { ls: 0.07 }, desc: '+7% lifesteal', comp: true },
  // legendaries (consume recipe)
  { id: 'vorpal', icon: '⚔️', name: 'Vorpal Edge', cost: 400, builds: ['sword', 'sword'], stats: { atk: 55 }, desc: '+55 attack' },
  { id: 'aegis', icon: '🛡️', name: 'Aegis Plate', cost: 350, builds: ['vest', 'crystal'], stats: { def: 55, hp: 450 }, desc: '+55 defense, +450 HP' },
  { id: 'titan', icon: '❤️', name: 'Titan Heart', cost: 450, builds: ['crystal', 'crystal'], stats: { hp: 1300 }, desc: '+1300 max HP' },
  { id: 'wind', icon: '🌪️', name: 'Windrunner', cost: 400, builds: ['feather', 'feather'], stats: { aspd: 0.35, ms: 30 }, desc: '+35% attack speed, +30 MS' },
  { id: 'orb', icon: '🔵', name: 'Arcane Orb', cost: 400, builds: ['tome', 'tome'], stats: { cdr: 0.18 }, desc: '18% cooldown reduction' },
  { id: 'vamp', icon: '🩸', name: 'Bloodstone', cost: 400, builds: ['sword', 'ring'], stats: { ls: 0.2, atk: 15 }, desc: '20% lifesteal, +15 attack' },
  { id: 'fury', icon: '💥', name: 'Doomfist', cost: 550, builds: ['sword', 'tome'], stats: { dmgAmp: 0.12 }, desc: '+12% ALL damage' },
  // active items
  { id: 'boots', icon: '👟', name: 'Sprint Boots', cost: 300, builds: ['feather', 'feather'], stats: { ms: 55 }, active: { name: 'Sprint', cd: 60, kind: 'sprint' }, desc: '+55 MS · ACTIVE: +35% speed 3s' },
  { id: 'bulwark', icon: '🧱', name: 'Bulwark Charm', cost: 400, builds: ['vest', 'vest'], stats: { def: 40 }, active: { name: 'Barrier', cd: 90, kind: 'shield' }, desc: '+40 DEF · ACTIVE: 350 shield' },
  { id: 'blinkring', icon: '💫', name: 'Blink Ring', cost: 500, builds: ['tome', 'feather'], stats: { cdr: 0.08 }, active: { name: 'Blink', cd: 75, kind: 'blink' }, desc: '+8% CDR · ACTIVE: blink 320' },
];
const itemById = (id) => ITEMS.find(x => x.id === id);
