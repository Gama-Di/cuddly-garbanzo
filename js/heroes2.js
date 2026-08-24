/* ============================================================
 * AETHER ARENA — heroes2.js
 * 40 additional original heroes (50 total). Authored kits built
 * on the engine's skill kinds + data-driven passive system.
 * ============================================================ */
'use strict';

/* stat archetypes */
const ARCH = {
  Tank:    { hp: 1800, hpL: 205, mana: 330, manaL: 28, atk: 70, atkL: 6,  dtype: 'phys', aspd: 0.7,  aspdL: 0.015, range: 125, ms: 260, def: 74, defL: 9,   regen: 12 },
  Fighter: { hp: 1400, hpL: 155, mana: 400, manaL: 36, atk: 95, atkL: 9.5, dtype: 'phys', aspd: 0.88, aspdL: 0.024, range: 120, ms: 268, def: 45, defL: 6.5, regen: 9.5 },
  Assassin:{ hp: 1120, hpL: 115, mana: 370, manaL: 32, atk: 103, atkL: 10, dtype: 'phys', aspd: 0.95, aspdL: 0.03,  range: 135, ms: 288, def: 30, defL: 4,   regen: 7 },
  Mage:    { hp: 1020, hpL: 102, mana: 570, manaL: 56, atk: 93, atkL: 9,  dtype: 'magic', aspd: 0.78, aspdL: 0.02,  range: 400, ms: 256, def: 26, defL: 4,   regen: 7 },
  Marksman:{ hp: 960,  hpL: 106, mana: 400, manaL: 34, atk: 104, atkL: 11, dtype: 'phys', aspd: 1.02, aspdL: 0.034, range: 425, ms: 256, def: 24, defL: 3.5, regen: 6 },
  Support: { hp: 1170, hpL: 120, mana: 540, manaL: 52, atk: 78, atkL: 7,  dtype: 'phys', aspd: 0.8,  aspdL: 0.02,  range: 385, ms: 262, def: 36, defL: 5,   regen: 8.5 },
};

/* 40 original champions: (id, name, title, role, emoji, tint, passive, skills)
   skill spec: {k, n, i, cd, m, u, ...params} — normalized below */
const EXTRA = [
  // ============ TANKS (7) ============
  { id: 'grumm', name: 'GRUMM', title: 'Stoneblood', role: 'Tank', emoji: '🪨', tint: '#94a3b8',
    pass: { k: 'ironskin', hpPct: 0.55, mul: 1.2, n: 'Living Rock', d: 'Below 55% HP: +20% defense.' },
    sk: [
      { k: 'nova', n: 'Boulder Slam', i: '🪨', cd: 7, m: 40, u: 1, radius: 230, dmg: 100, dl: 45, slow: [0.4, 2] },
      { k: 'dash', n: 'Rolling Stone', i: '🛞', cd: 11, m: 45, u: 2, dist: 300, dmg: 70, dl: 35, slow: [0.3, 1] },
      { k: 'shield', n: 'Bedrock Shell', i: '🐚', cd: 13, m: 55, u: 3, shield: 300, sl: 80, dur: 4, defAdd: 35 },
      { k: 'nova', n: 'Seismic Rupture', i: '🌋', cd: 46, m: 100, u: 5, radius: 330, dmg: 240, dl: 60, stun: 1.2 },
    ] },
  { id: 'valka', name: 'VALKA', title: 'Bearheart', role: 'Tank', emoji: '🐻', tint: '#b45309',
    pass: { k: 'bulwark2', per: 28, cap: 84, n: 'Pack Guard', d: '+28 defense per nearby enemy hero (max 84).' },
    sk: [
      { k: 'nova', n: 'Mauling Roar', i: '📢', cd: 8, m: 40, u: 1, radius: 210, dmg: 105, dl: 48, slow: [0.35, 1.5] },
      { k: 'dash', n: 'Charge of the Wild', i: '💨', cd: 10, m: 45, u: 2, dist: 340, dmg: 90, dl: 42 },
      { k: 'buff', n: 'Rugged Hide', i: '🧶', cd: 14, m: 50, u: 3, dur: 5, atkAdd: 20, lsAdd: 0.15 },
      { k: 'healnova', n: 'Den Mother', i: '💚', cd: 50, m: 110, u: 5, radius: 340, heal: 320, hl: 85 },
    ] },
  { id: 'ordo', name: 'ORDO', title: 'Lawkeeper', role: 'Tank', emoji: '🏛️', tint: '#fbbf24',
    pass: { k: 'tenacity', n: 'Iron Code', d: 'Crowd-control effects on him last 30% shorter.' },
    sk: [
      { k: 'strike', n: 'Gavel Strike', i: '🔨', cd: 7, m: 40, u: 1, range: 320, dmg: 120, dl: 52, slow: [0.4, 1.5] },
      { k: 'nova', n: 'Zone of Order', i: '⭕', cd: 10, m: 55, u: 2, radius: 250, dmg: 90, dl: 40, slow: [0.5, 2] },
      { k: 'shield', n: 'Writ of Shielding', i: '📜', cd: 13, m: 50, u: 3, shield: 330, sl: 88, dur: 4, defAdd: 30 },
      { k: 'nova', n: 'Final Verdict', i: '⚖️', cd: 48, m: 105, u: 5, radius: 320, dmg: 250, dl: 62, stun: 1.1 },
    ] },
  { id: 'braska', name: 'BRASKA', title: 'Bullguard', role: 'Tank', emoji: '🐂', tint: '#ef4444',
    pass: { k: 'second_wind', hpPct: 0.25, healPct: 0.12, cd: 45, n: 'Stampede Heart', d: 'Dropping below 25% HP heals 12% (once per 45s).' },
    sk: [
      { k: 'dash', n: 'Bull Rush', i: '🏃', cd: 9, m: 45, u: 1, dist: 360, dmg: 110, dl: 48, slow: [0.3, 1] },
      { k: 'nova', n: 'Horn Split', i: '🐂', cd: 8, m: 40, u: 2, radius: 200, dmg: 115, dl: 50, ls: 0.25 },
      { k: 'buff', n: 'Raging Hide', i: '🔥', cd: 15, m: 50, u: 3, dur: 4, msAdd: 0.15, atkAdd: 25 },
      { k: 'dash', n: 'Gatebreaker', i: '💥', cd: 44, m: 100, u: 5, dist: 520, dmg: 260, dl: 70, slow: [0.5, 2] },
    ] },
  { id: 'dorum', name: 'DORUM', title: 'Runewall', role: 'Tank', emoji: '🗿', tint: '#64748b',
    pass: { k: 'shield_battery', shield: 60, every: 15, after: 8, n: 'Rune Plating', d: 'Gains a 60 shield every 15s while out of combat.' },
    sk: [
      { k: 'proj', n: 'Rune Shard', i: '🔹', cd: 6, m: 40, u: 1, range: 540, speed: 900, dmg: 110, dl: 48, slow: [0.3, 1.5] },
      { k: 'nova', n: 'Glyph Pulse', i: '🌀', cd: 9, m: 50, u: 2, radius: 240, dmg: 100, dl: 44, slow: [0.45, 2] },
      { k: 'shield', n: 'Wall of Words', i: '🛡', cd: 12, m: 50, u: 3, shield: 320, sl: 85, dur: 4, defAdd: 40 },
      { k: 'sanctuary', n: 'The Last Rune', i: '🌟', cd: 52, m: 120, u: 5, heal: 260, hl: 75, shield: 240 },
    ] },
  { id: 'helga', name: 'HELGA', title: 'Frostmaiden', role: 'Tank', emoji: '🧊', tint: '#7dd3fc',
    pass: { k: 'ironskin', hpPct: 0.6, mul: 1.22, n: 'Rime Armor', d: 'Below 60% HP: +22% defense.' },
    sk: [
      { k: 'nova', n: 'Frost Nova', i: '❄️', cd: 8, m: 45, u: 1, radius: 240, dmg: 95, dl: 44, slow: [0.5, 2.2], magic: true },
      { k: 'proj', n: 'Ice Lance', i: '🥶', cd: 7, m: 45, u: 2, range: 560, speed: 950, dmg: 130, dl: 55, slow: [0.4, 1.8], magic: true },
      { k: 'shield', n: 'Glacial Wall', i: '🧱', cd: 13, m: 50, u: 3, shield: 310, sl: 82, dur: 4, defAdd: 32 },
      { k: 'nova', n: 'Absolute Zero', i: '🥀', cd: 50, m: 110, u: 5, radius: 340, dmg: 220, dl: 58, stun: 1.3, magic: true },
    ] },
  { id: 'torden', name: 'TORDEN', title: 'Stormanvil', role: 'Tank', emoji: '🌩️', tint: '#a5b4fc',
    pass: { k: 'barrier_on_kill', shield: 130, dur: 3, n: 'Stormforged', d: 'Kills grant a 130 shield for 3s.' },
    sk: [
      { k: 'nova', n: 'Thunderclap', i: ' clap', cd: 7, m: 40, u: 1, radius: 220, dmg: 110, dl: 48, magic: true },
      { k: 'dash', n: 'Anvil Drop', i: '⬇️', cd: 10, m: 45, u: 2, dist: 320, dmg: 100, dl: 45, slow: [0.4, 1.5] },
      { k: 'buff', n: 'Static Field', i: '⚡', cd: 14, m: 50, u: 3, dur: 4, atkAdd: 18, msAdd: 0.1 },
      { k: 'nova', n: 'Mjolnir Fall', i: '🔨', cd: 47, m: 105, u: 5, radius: 340, dmg: 260, dl: 65, stun: 1.2, magic: true },
    ] },

  // ============ FIGHTERS (7) ============
  { id: 'ashen', name: 'ASHEN', title: 'Emberborn', role: 'Fighter', emoji: '🔥', tint: '#f97316',
    pass: { k: 'rage', hpPct: 0.45, aspdMul: 1.2, msMul: 0.08, n: 'Kindled Fury', d: 'Below 45% HP: +20% attack speed, +8% move speed.' },
    sk: [
      { k: 'nova', n: 'Cinder Burst', i: '✨', cd: 6, m: 45, u: 1, radius: 200, dmg: 105, dl: 50, ls: 0.3 },
      { k: 'dash', n: 'Flame Leap', i: '💨', cd: 9, m: 50, u: 2, dist: 350, dmg: 100, dl: 48, slow: [0.3, 1.2] },
      { k: 'buff', n: 'Stoke the Fire', i: '📈', cd: 13, m: 50, u: 3, dur: 4, aspdAdd: 0.35, lsAdd: 0.15 },
      { k: 'buff', n: 'Phoenix Rising', i: '🕊️', cd: 46, m: 100, u: 5, dur: 6, aspdAdd: 0.5, msAdd: 0.15, atkAdd: 35, lsAdd: 0.25 },
    ] },
  { id: 'kavra', name: 'KAVRA', title: 'Bladewhirl', role: 'Fighter', emoji: '🌀', tint: '#22d3ee',
    pass: { k: 'momentum', per: 9, n: 'Whirling Pace', d: 'Basic attacks stack +9 move speed (max 5), decays out of combat.' },
    sk: [
      { k: 'dash', n: 'Whirl Entry', i: '💫', cd: 8, m: 45, u: 1, dist: 340, dmg: 105, dl: 48 },
      { k: 'nova', n: 'Blade Cyclone', i: '🌪️', cd: 7, m: 45, u: 2, radius: 195, dmg: 110, dl: 52, ls: 0.3 },
      { k: 'strike', n: 'Twin Cut', i: '⚔️', cd: 10, m: 45, u: 3, range: 330, dmg: 160, dl: 68, mark: [4, 0.25] },
      { k: 'nova', n: 'Death Waltz', i: '🩰', cd: 45, m: 100, u: 5, radius: 290, dmg: 240, dl: 62, ls: 0.45, slow: [0.3, 1.5] },
    ] },
  { id: 'toruuk', name: 'TORUUK', title: 'Tidebreaker', role: 'Fighter', emoji: '🌊', tint: '#38bdf8',
    pass: { k: 'hunter', mul: 1.15, n: 'Deep Hunter', d: 'Deals +15% damage to jungle monsters.' },
    sk: [
      { k: 'proj', n: 'Water Whip', i: '〰️', cd: 6, m: 45, u: 1, range: 520, speed: 950, dmg: 115, dl: 52, slow: [0.35, 1.5] },
      { k: 'dash', n: 'Wave Rider', i: '🏄', cd: 9, m: 50, u: 2, dist: 380, dmg: 110, dl: 50 },
      { k: 'nova', n: 'Undertow', i: '🌊', cd: 9, m: 55, u: 3, radius: 225, dmg: 130, dl: 55, slow: [0.45, 2] },
      { k: 'meteor', n: 'Rogue Wave', i: '💧', cd: 44, m: 110, u: 5, radius: 300, delay: 0.8, dmg: 350, dl: 90, slow: [0.35, 1.5] },
    ] },
  { id: 'mala', name: 'MALA', title: 'Sunfist', role: 'Fighter', emoji: '☀️', tint: '#fbbf24',
    pass: { k: 'first_strike', mul: 1.28, n: 'Dawn Blow', d: '+28% damage to enemies above 97% HP.' },
    sk: [
      { k: 'strike', n: 'Solar Punch', i: '👊', cd: 7, m: 40, u: 1, range: 330, dmg: 155, dl: 65 },
      { k: 'dash', n: 'Sun Dash', i: '💨', cd: 9, m: 45, u: 2, dist: 330, dmg: 95, dl: 44 },
      { k: 'buff', n: 'Zenith', i: '🔆', cd: 14, m: 50, u: 3, dur: 4, atkAdd: 30, msAdd: 0.12 },
      { k: 'nova', n: 'Solar Flare', i: '🌞', cd: 46, m: 105, u: 5, radius: 310, dmg: 250, dl: 62, slow: [0.4, 2] },
    ] },
  { id: 'rukh', name: 'RUKH', title: 'Skyborne', role: 'Fighter', emoji: '🦅', tint: '#93c5fd', st: { atk: 100 },
    pass: { k: 'chase', msAdd: 55, hpPct: 0.5, n: 'Bird of Prey', d: '+55 move speed toward enemies below 50% HP.' },
    sk: [
      { k: 'dash', n: 'Dive Bomb', i: '🪃', cd: 8, m: 45, u: 1, dist: 400, dmg: 120, dl: 55 },
      { k: 'nova', n: 'Wing Buffet', i: '🪽', cd: 8, m: 45, u: 2, radius: 210, dmg: 105, dl: 48, slow: [0.35, 1.5] },
      { k: 'proj', n: 'Feather Fan', i: '🪶', cd: 7, m: 45, u: 3, range: 500, speed: 1000, pierce: true, dmg: 110, dl: 50 },
      { k: 'buff', n: 'Raptor Form', i: '🦅', cd: 45, m: 100, u: 5, dur: 6, msAdd: 0.25, aspdAdd: 0.45, atkAdd: 30 },
    ] },
  { id: 'sengo', name: 'SENGO', title: 'Steelblossom', role: 'Fighter', emoji: '🌸', tint: '#f472b6',
    pass: { k: 'vamp_spell', pct: 0.2, n: 'Petal Drain', d: 'Skills heal her for 20% of damage dealt.' },
    sk: [
      { k: 'nova', n: 'Petal Storm', i: '🌸', cd: 6, m: 45, u: 1, radius: 195, dmg: 115, dl: 52, magic: true },
      { k: 'dash', n: 'Willow Step', i: '🍃', cd: 9, m: 45, u: 2, dist: 330, dmg: 95, dl: 44, slow: [0.3, 1.2] },
      { k: 'strike', n: 'Thorn Mark', i: '🥀', cd: 10, m: 45, u: 3, range: 340, dmg: 150, dl: 62, mark: [4, 0.25] },
      { k: 'nova', n: 'Full Bloom', i: '🌺', cd: 45, m: 105, u: 5, radius: 300, dmg: 240, dl: 62, ls: 0.4, magic: true },
    ] },
  { id: 'brawn', name: 'BRAWN', title: 'Ironjaw', role: 'Fighter', emoji: '🦷', tint: '#a3a3a3',
    pass: { k: 'execute', hpPct: 0.22, mul: 1.25, n: 'Crushing Bite', d: '+25% damage to enemies below 22% HP.' },
    sk: [
      { k: 'strike', n: 'Jawbreaker', i: '💥', cd: 7, m: 40, u: 1, range: 330, dmg: 165, dl: 68 },
      { k: 'nova', n: 'Ground Snap', i: '🫨', cd: 8, m: 45, u: 2, radius: 205, dmg: 105, dl: 48, slow: [0.4, 1.5] },
      { k: 'buff', n: 'Adrenaline', i: '💪', cd: 14, m: 50, u: 3, dur: 4, atkAdd: 28, lsAdd: 0.15 },
      { k: 'strike', n: 'Devour', i: '🍖', cd: 44, m: 100, u: 5, range: 400, dmg: 300, dl: 80, mark: [4, 0.3] },
    ] },

  // ============ ASSASSINS (7) ============
  { id: 'shira', name: 'SHIRA', title: 'Nightsilk', role: 'Assassin', emoji: '🕸️', tint: '#c084fc',
    pass: { k: 'crit', base: 0.18, per: 0.012, n: 'Silk Edge', d: '18% +1.2%/level crit chance (2x damage).' },
    sk: [
      { k: 'proj', n: 'Silk Dagger', i: '🧵', cd: 5, m: 40, u: 1, range: 520, speed: 1050, dmg: 125, dl: 58 },
      { k: 'dash', n: 'Thread the Needle', i: '🪡', cd: 8, m: 45, u: 2, dist: 380, dmg: 115, dl: 55 },
      { k: 'buff', n: 'Nightveil', i: '🌑', cd: 13, m: 45, u: 3, dur: 3, msAdd: 0.25, atkAdd: 25 },
      { k: 'blink', n: 'Widow\'s Kiss', i: '💋', cd: 40, m: 90, u: 5, range: 650, dmg: 290, dl: 80, reset: 0 },
    ] },
  { id: 'korv', name: 'KORV', title: 'Grayfang', role: 'Assassin', emoji: '🐺', tint: '#9ca3af', st: { hp: 1180 },
    pass: { k: 'momentum', per: 10, n: 'Pack Sprint', d: 'Basic attacks stack +10 move speed (max 5), decays out of combat.' },
    sk: [
      { k: 'dash', n: 'Lunge', i: '🦵', cd: 7, m: 45, u: 1, dist: 360, dmg: 120, dl: 56 },
      { k: 'strike', n: 'Fang Rip', i: '🩸', cd: 9, m: 45, u: 2, range: 340, dmg: 165, dl: 68, mark: [4, 0.25] },
      { k: 'nova', n: 'Howl', i: '🌙', cd: 12, m: 45, u: 3, radius: 180, dmg: 90, dl: 40, slow: [0.4, 1.5] },
      { k: 'buff', n: 'Beast Within', i: '🐺', cd: 44, m: 95, u: 5, dur: 5, aspdAdd: 0.55, msAdd: 0.2, atkAdd: 35 },
    ] },
  { id: 'zeph', name: 'ZEPH', title: 'Windcutter', role: 'Assassin', emoji: '🌪️', tint: '#67e8f9',
    pass: { k: 'chase', msAdd: 60, hpPct: 0.45, n: 'Tailwind', d: '+60 move speed toward enemies below 45% HP.' },
    sk: [
      { k: 'dash', n: 'Slipstream', i: '💨', cd: 6, m: 40, u: 1, dist: 400, dmg: 110, dl: 52 },
      { k: 'proj', n: 'Air Blade', i: '🍃', cd: 6, m: 40, u: 2, range: 520, speed: 1100, pierce: true, dmg: 120, dl: 55 },
      { k: 'nova', n: 'Cyclone Guard', i: '🌀', cd: 11, m: 45, u: 3, radius: 190, dmg: 100, dl: 45, slow: [0.4, 1.5] },
      { k: 'blink', n: 'Eye of the Storm', i: '👁️', cd: 42, m: 95, u: 5, range: 700, dmg: 280, dl: 78, reset: 0 },
    ] },
  { id: 'morde', name: 'MORDE', title: 'Scrimshaw', role: 'Assassin', emoji: '🦈', tint: '#38bdf8',
    pass: { k: 'execute', hpPct: 0.25, mul: 1.28, n: 'Blood Scent', d: '+28% damage to enemies below 25% HP.' },
    sk: [
      { k: 'dash', n: 'Frenzy Rush', i: '🐟', cd: 7, m: 45, u: 1, dist: 370, dmg: 125, dl: 58 },
      { k: 'strike', n: 'Bone Bite', i: '🦴', cd: 9, m: 45, u: 2, range: 340, dmg: 170, dl: 70 },
      { k: 'buff', n: 'Feeding Time', i: '🍽️', cd: 13, m: 45, u: 3, dur: 4, lsAdd: 0.3, msAdd: 0.15 },
      { k: 'blink', n: 'Abyssal Ambush', i: '🌊', cd: 42, m: 95, u: 5, range: 680, dmg: 300, dl: 82, reset: 0 },
    ] },
  { id: 'lian', name: 'LIAN', title: 'Whisperstep', role: 'Assassin', emoji: '🍃', tint: '#86efac',
    pass: { k: 'spell_echo', slowPct: 0.25, dur: 1.2, n: 'Silent Echo', d: 'Skills slow enemies by 25% for 1.2s.' },
    sk: [
      { k: 'proj', n: 'Whisper Shuriken', i: '✴️', cd: 5, m: 40, u: 1, range: 540, speed: 1050, dmg: 130, dl: 60 },
      { k: 'dash', n: 'Leaf on Wind', i: '🍂', cd: 8, m: 45, u: 2, dist: 390, dmg: 115, dl: 54 },
      { k: 'nova', n: 'Hush', i: '🤫', cd: 12, m: 45, u: 3, radius: 185, dmg: 95, dl: 42, slow: [0.5, 1.5] },
      { k: 'blink', n: 'Vanishing Strike', i: '👤', cd: 41, m: 95, u: 5, range: 650, dmg: 295, dl: 80, reset: 0 },
    ] },
  { id: 'ash', name: 'ASH', title: 'Twinfang', role: 'Assassin', emoji: '🔪', tint: '#fda4af',
    pass: { k: 'first_strike', mul: 1.3, n: 'Ambusher', d: '+30% damage to enemies above 97% HP.' },
    sk: [
      { k: 'strike', n: 'Twin Fangs', i: '🐍', cd: 6, m: 40, u: 1, range: 340, dmg: 160, dl: 66 },
      { k: 'dash', n: 'Shadowstep', i: '👣', cd: 8, m: 45, u: 2, dist: 380, dmg: 110, dl: 52 },
      { k: 'buff', n: 'Killer Instinct', i: '🧠', cd: 13, m: 45, u: 3, dur: 3, atkAdd: 30, msAdd: 0.2 },
      { k: 'buff', n: 'Executioner\'s Dance', i: '💃', cd: 43, m: 95, u: 5, dur: 5, aspdAdd: 0.6, atkAdd: 40, lsAdd: 0.2 },
    ] },
  { id: 'riom', name: 'RIOM', title: 'Nightmarket', role: 'Assassin', emoji: '🕶️', tint: '#a78bfa',
    pass: { k: 'fortune', mul: 1.2, n: 'Cutpurse', d: 'Earns +20% gold from all sources.' },
    sk: [
      { k: 'proj', n: 'Poison Coin', i: '🪙', cd: 5, m: 40, u: 1, range: 520, speed: 1000, dmg: 120, dl: 55, slow: [0.3, 1.5] },
      { k: 'dash', n: 'Rooftop Leap', i: '🏠', cd: 8, m: 45, u: 2, dist: 400, dmg: 115, dl: 54 },
      { k: 'strike', n: 'Backstab Deal', i: '🤝', cd: 9, m: 45, u: 3, range: 330, dmg: 170, dl: 70, mark: [4, 0.25] },
      { k: 'blink', n: 'Market Crash', i: '📉', cd: 41, m: 95, u: 5, range: 660, dmg: 290, dl: 80, reset: 0 },
    ] },

  // ============ MARKSMEN (6) ============
  { id: 'falyn', name: 'FALYN', title: 'Hawkshot', role: 'Marksman', emoji: '🦅', tint: '#fcd34d',
    pass: { k: 'nth_shot', n: 5, mul: 1.5, n2: 'Raptor Eye', d: 'Every 5th basic attack deals +50% damage.' },
    sk: [
      { k: 'proj', n: 'Homing Arrow', i: '🏹', cd: 6, m: 40, u: 1, range: 600, speed: 1100, dmg: 130, dl: 58, slow: [0.25, 1] },
      { k: 'dash', n: 'Wing Back', i: '🔙', cd: 10, m: 40, u: 2, dist: 280, away: true, aspd: [0.35, 3] },
      { k: 'nova', n: 'Screech', i: '📢', cd: 10, m: 50, u: 3, radius: 220, dmg: 85, dl: 38, slow: [0.5, 2] },
      { k: 'buff', n: 'Hawkeye Focus', i: '🎯', cd: 45, m: 100, u: 5, dur: 5, aspdAdd: 0.7, rangeAdd: 100, atkAdd: 35 },
    ] },
  { id: 'bric', name: 'BRIC', title: 'Cogshot', role: 'Marksman', emoji: '⚙️', tint: '#facc15',
    pass: { k: 'momentum', per: 7, n: 'Clockwork Legs', d: 'Basic attacks stack +7 move speed (max 5).' },
    sk: [
      { k: 'proj', n: 'Bolt Shot', i: '🔩', cd: 6, m: 40, u: 1, range: 570, speed: 1150, pierce: true, dmg: 115, dl: 52 },
      { k: 'nova', n: 'Steam Vent', i: '♨️', cd: 10, m: 50, u: 2, radius: 210, dmg: 90, dl: 40, slow: [0.45, 1.8] },
      { k: 'dash', n: 'Spring Boots', i: '🦿', cd: 10, m: 40, u: 3, dist: 300, away: true, aspd: [0.4, 3] },
      { k: 'buff', n: 'Overclock', i: '🔌', cd: 46, m: 100, u: 5, dur: 5, aspdAdd: 0.85, atkAdd: 30 },
    ] },
  { id: 'lyra', name: 'LYRA', title: 'Starcaller', role: 'Marksman', emoji: '🌟', tint: '#e0aaff',
    pass: { k: 'vamp_spell', pct: 0.15, n: 'Starlight Feed', d: 'Skills heal her for 15% of damage dealt.' },
    sk: [
      { k: 'proj', n: 'Star Bolt', i: '✨', cd: 5, m: 45, u: 1, range: 590, speed: 1000, dmg: 135, dl: 60, magic: true },
      { k: 'nova', n: 'Constellation', i: '🌠', cd: 9, m: 55, u: 2, radius: 230, dmg: 140, dl: 62, magic: true, slow: [0.35, 1.5] },
      { k: 'dash', n: 'Comet Trail', i: '☄️', cd: 10, m: 45, u: 3, dist: 300, dmg: 90, dl: 40, away: true, aspd: [0.35, 3] },
      { k: 'meteor', n: 'Starfall Barrage', i: '💫', cd: 45, m: 115, u: 5, radius: 290, delay: 0.7, dmg: 360, dl: 92, magic: true },
    ] },
  { id: 'ren', name: 'REN', title: 'Quickdraw', role: 'Marksman', emoji: '🤠', tint: '#f59e0b',
    pass: { k: 'execute', hpPct: 0.2, mul: 1.22, n: 'Deadeye Deal', d: '+22% damage to enemies below 20% HP.' },
    sk: [
      { k: 'proj', n: 'Trick Shot', i: '🔫', cd: 6, m: 40, u: 1, range: 560, speed: 1200, pierce: true, dmg: 125, dl: 56 },
      { k: 'nova', n: 'Smoke Pot', i: '💨', cd: 10, m: 45, u: 2, radius: 220, dmg: 80, dl: 36, slow: [0.5, 2] },
      { k: 'dash', n: 'Combat Roll', i: '🤸', cd: 10, m: 40, u: 3, dist: 300, away: true, aspd: [0.45, 3] },
      { k: 'buff', n: 'High Noon', i: '🕛', cd: 45, m: 100, u: 5, dur: 5, aspdAdd: 0.75, rangeAdd: 110, atkAdd: 30 },
    ] },
  { id: 'kessa', name: 'KESSA', title: 'Piercer', role: 'Marksman', emoji: '🎯', tint: '#fb923c',
    pass: { k: 'range_per_level', per: 16, n: 'Longsight', d: 'Basic attack range grows +16 per level.' },
    sk: [
      { k: 'proj', n: 'Piercing Lance', i: '🥢', cd: 6, m: 40, u: 1, range: 600, speed: 1100, pierce: true, dmg: 120, dl: 55, slow: [0.25, 1] },
      { k: 'proj', n: 'Net Snare', i: '🕸️', cd: 9, m: 50, u: 2, range: 480, speed: 850, dmg: 80, dl: 36, slow: [0.55, 2] },
      { k: 'dash', n: 'Skirt Away', i: '💃', cd: 10, m: 40, u: 3, dist: 280, away: true, aspd: [0.4, 3] },
      { k: 'buff', n: 'Ballista Mode', i: '🏹', cd: 46, m: 100, u: 5, dur: 5, rangeAdd: 160, atkAdd: 45, aspdAdd: 0.3 },
    ] },
  { id: 'tova', name: 'TOVA', title: 'Frostsnipe', role: 'Marksman', emoji: '❄️', tint: '#bae6fd',
    pass: { k: 'spell_echo', slowPct: 0.22, dur: 1.2, n: 'Cold Rounds', d: 'Skill hits slow enemies by 22% for 1.2s.' },
    sk: [
      { k: 'proj', n: 'Frozen Bullet', i: '🧊', cd: 5, m: 45, u: 1, range: 620, speed: 1150, dmg: 130, dl: 58, magic: true },
      { k: 'proj', n: 'Glacier Shot', i: '🧊', cd: 8, m: 55, u: 2, range: 560, speed: 900, dmg: 150, dl: 65, stun: 1, magic: true },
      { k: 'dash', n: 'Ice Skate', i: '⛸️', cd: 10, m: 40, u: 3, dist: 300, away: true, aspd: [0.4, 3] },
      { k: 'buff', n: 'Permafrost Focus', i: '🥶', cd: 45, m: 100, u: 5, dur: 5, aspdAdd: 0.8, rangeAdd: 90, atkAdd: 30 },
    ] },

  // ============ MAGES (7) ============
  { id: 'ashka', name: 'ASHKA', title: 'Flamecaller', role: 'Mage', emoji: '🌋', tint: '#f87171',
    pass: { k: 'vamp_spell', pct: 0.2, n: 'Fire Eater', d: 'Skills heal her for 20% of damage dealt.' },
    sk: [
      { k: 'proj', n: 'Fireball', i: '🔥', cd: 5, m: 50, u: 1, range: 600, speed: 900, dmg: 145, dl: 62, magic: true },
      { k: 'nova', n: 'Flame Ring', i: '◍', cd: 9, m: 65, u: 2, radius: 235, dmg: 145, dl: 65, magic: true, slow: [0.35, 1.5] },
      { k: 'dash', n: 'Flashover', i: '⚡', cd: 10, m: 45, u: 3, dist: 300, dmg: 85, dl: 38, magic: true },
      { k: 'meteor', n: 'Cataclysm', i: '☄️', cd: 44, m: 120, u: 5, radius: 300, delay: 0.85, dmg: 370, dl: 95, magic: true, slow: [0.3, 1.5] },
    ] },
  { id: 'zira', name: 'ZIRA', title: 'Stormsinger', role: 'Mage', emoji: '⚡', tint: '#93c5fd',
    pass: { k: 'arcane_flood', manaPct: 0.4, mul: 2, n: 'Static Charge', d: 'Mana regeneration doubles below 40% mana.' },
    sk: [
      { k: 'proj', n: 'Arc Bolt', i: '🔵', cd: 5, m: 50, u: 1, range: 620, speed: 1050, dmg: 130, dl: 60, magic: true, stun: 0.8 },
      { k: 'nova', n: 'Thunder Ring', i: '🌩️', cd: 9, m: 65, u: 2, radius: 230, dmg: 150, dl: 66, magic: true },
      { k: 'buff', n: 'Tempo', i: '🎵', cd: 14, m: 55, u: 3, dur: 4, aspdAdd: 0.3, msAdd: 0.15 },
      { k: 'nova', n: 'Crescendo', i: '🎶', cd: 47, m: 115, u: 5, radius: 330, dmg: 245, dl: 62, stun: 1.2, magic: true },
    ] },
  { id: 'oziel', name: 'OZIEL', title: 'Gravecaller', role: 'Mage', emoji: '⚰️', tint: '#a3e635',
    pass: { k: 'xp_hunter', mul: 1.15, n: 'Dark Study', d: 'Gains +15% experience.' },
    sk: [
      { k: 'proj', n: 'Soul Bolt', i: '🟢', cd: 5, m: 50, u: 1, range: 580, speed: 880, dmg: 125, dl: 58, magic: true, drain: 0.32 },
      { k: 'nova', n: 'Grave Chill', i: '🪦', cd: 9, m: 60, u: 2, radius: 240, dmg: 130, dl: 58, magic: true, slow: [0.45, 2] },
      { k: 'heal', n: 'Dark Pact', i: '🖤', cd: 12, m: 60, u: 3, heal: 210, hl: 66, radius: 500 },
      { k: 'meteor', n: 'Plague of Souls', i: '🦠', cd: 45, m: 118, u: 5, radius: 310, delay: 0.9, dmg: 330, dl: 88, magic: true, slow: [0.4, 2] },
    ] },
  { id: 'lunara', name: 'LUNARA', title: 'Moonweaver', role: 'Mage', emoji: '🌙', tint: '#c4b5fd',
    pass: { k: 'spell_echo', slowPct: 0.25, dur: 1.3, n: 'Moonlag', d: 'Skills slow enemies by 25% for 1.3s.' },
    sk: [
      { k: 'proj', n: 'Moonbeam', i: '🌟', cd: 5, m: 50, u: 1, range: 610, speed: 980, dmg: 132, dl: 60, magic: true },
      { k: 'nova', n: 'Tidal Pull', i: '🌀', cd: 9, m: 65, u: 2, radius: 245, dmg: 148, dl: 66, magic: true, slow: [0.4, 1.8] },
      { k: 'shield', n: 'Moonveil', i: ' Shib', cd: 13, m: 55, u: 3, shield: 280, sl: 75, dur: 4, defAdd: 25 },
      { k: 'meteor', n: 'Eclipse', i: '🌑', cd: 45, m: 120, u: 5, radius: 300, delay: 0.8, dmg: 365, dl: 92, magic: true, slow: [0.35, 1.5] },
    ] },
  { id: 'vexen', name: 'VEXEN', title: 'Hexsmith', role: 'Mage', emoji: '🔮', tint: '#f0abfc',
    pass: { k: 'kill_heal', pct: 0.08, n: 'Cursed Vitality', d: 'Kills restore 8% of max HP.' },
    sk: [
      { k: 'proj', n: 'Hex Bolt', i: '🟣', cd: 5, m: 50, u: 1, range: 590, speed: 920, dmg: 128, dl: 59, magic: true, slow: [0.3, 1.2] },
      { k: 'strike', n: 'Cursed Brand', i: '☠️', cd: 10, m: 55, u: 2, range: 400, dmg: 155, dl: 65, mark: [4, 0.25] },
      { k: 'nova', n: 'Hex Field', i: '⭕', cd: 9, m: 62, u: 3, radius: 240, dmg: 138, dl: 60, magic: true, slow: [0.45, 2] },
      { k: 'nova', n: 'Grand Hex', i: '🌀', cd: 48, m: 118, u: 5, radius: 340, dmg: 255, dl: 64, stun: 1.2, magic: true },
    ] },
  { id: 'pyra', name: 'PYRA', title: 'Cinderwitch', role: 'Mage', emoji: '🕯️', tint: '#fb7185',
    pass: { k: 'thirst', max: 0.1, n: 'Cinder Sip', d: 'Up to +10% lifesteal based on missing HP.' },
    sk: [
      { k: 'proj', n: 'Wick Flame', i: '🔥', cd: 5, m: 48, u: 1, range: 570, speed: 940, dmg: 126, dl: 58, magic: true },
      { k: 'nova', n: 'Ash Circle', i: '🌫️', cd: 9, m: 62, u: 2, radius: 235, dmg: 146, dl: 64, magic: true, slow: [0.4, 1.8] },
      { k: 'dash', n: 'Flame Step', i: '💨', cd: 10, m: 45, u: 3, dist: 320, dmg: 90, dl: 40, magic: true },
      { k: 'meteor', n: 'Witch Pyre', i: '🪵', cd: 44, m: 118, u: 5, radius: 290, delay: 0.75, dmg: 355, dl: 92, magic: true },
    ] },
  { id: 'umbra', name: 'UMBRA', title: 'Shadecaller', role: 'Mage', emoji: '🌑', tint: '#818cf8',
    pass: { k: 'first_strike', mul: 1.25, n: 'Terror Strike', d: '+25% damage to enemies above 97% HP.' },
    sk: [
      { k: 'proj', n: 'Shade Bolt', i: '⚫', cd: 5, m: 50, u: 1, range: 600, speed: 960, dmg: 134, dl: 61, magic: true },
      { k: 'nova', n: 'Umbral Burst', i: '💠', cd: 9, m: 65, u: 2, radius: 240, dmg: 152, dl: 68, magic: true, slow: [0.35, 1.6] },
      { k: 'buff', n: 'Shadowform', i: '👤', cd: 14, m: 55, u: 3, dur: 4, msAdd: 0.2, atkAdd: 25 },
      { k: 'nova', n: 'Total Eclipse', i: '🌘', cd: 48, m: 120, u: 5, radius: 335, dmg: 260, dl: 66, stun: 1.1, magic: true },
    ] },

  // ============ SUPPORTS (6) ============
  { id: 'fern', name: 'FERN', title: 'Grovekeeper', role: 'Support', emoji: '🌲', tint: '#4ade80',
    pass: { k: 'ooc_regen', after: 4, pct: 0.025, n: 'Photosynthesis', d: 'Regenerates 2.5% HP/s after 4s out of combat.' },
    sk: [
      { k: 'proj', n: 'Thornseed', i: '🌱', cd: 6, m: 45, u: 1, range: 600, speed: 950, dmg: 135, dl: 55, slow: [0.35, 1.8] },
      { k: 'heal', n: 'Spring Bloom', i: '🌷', cd: 11, m: 65, u: 2, heal: 235, hl: 72, radius: 520 },
      { k: 'healnova', n: 'Grove Light', i: '🌳', cd: 12, m: 70, u: 3, radius: 320, heal: 150, hl: 48 },
      { k: 'sanctuary', n: 'World Tree', i: '🌳', cd: 54, m: 130, u: 5, heal: 300, hl: 80, shield: 250 },
    ] },
  { id: 'nima', name: 'NIMA', title: 'Lightweaver', role: 'Support', emoji: '💡', tint: '#fde68a',
    pass: { k: 'fortune', mul: 1.15, n: 'Lucky Thread', d: 'Earns +15% gold from all sources.' },
    sk: [
      { k: 'proj', n: 'Light Lance', i: '🔆', cd: 6, m: 45, u: 1, range: 610, speed: 980, dmg: 145, dl: 55, slow: [0.3, 2] },
      { k: 'shield', n: 'Woven Aegis', i: '🧵', cd: 12, m: 55, u: 2, shield: 300, sl: 82, dur: 4, defAdd: 30 },
      { k: 'heal', n: 'Golden Thread', i: '✨', cd: 11, m: 65, u: 3, heal: 225, hl: 70, radius: 520 },
      { k: 'sanctuary', n: 'Tapestry of Dawn', i: '🌅', cd: 53, m: 128, u: 5, heal: 290, hl: 78, shield: 245 },
    ] },
  { id: 'cora', name: 'CORA', title: 'Tidewarden', role: 'Support', emoji: '🐚', tint: '#67e8f9',
    pass: { k: 'shield_battery', shield: 75, every: 10, after: 7, n: 'Pearl Luster', d: 'Gains a 75 shield every 10s while out of combat.' },
    sk: [
      { k: 'proj', n: 'Tide Bolt', i: '🌊', cd: 6, m: 45, u: 1, range: 600, speed: 950, dmg: 138, dl: 54, slow: [0.35, 1.8] },
      { k: 'nova', n: 'Riptide', i: '🌀', cd: 10, m: 60, u: 2, radius: 240, dmg: 105, dl: 45, slow: [0.5, 2] },
      { k: 'heal', n: 'Ocean Blessing', i: '💧', cd: 11, m: 65, u: 3, heal: 230, hl: 71, radius: 520 },
      { k: 'sanctuary', n: 'The Great Tide', i: '🐚', cd: 54, m: 130, u: 5, heal: 295, hl: 78, shield: 250 },
    ] },
  { id: 'moss', name: 'MOSS', title: 'Bogwarden', role: 'Support', emoji: '🪵', tint: '#65a30d',
    pass: { k: 'bulwark2', per: 20, cap: 60, n: 'Bog Body', d: '+20 defense per nearby enemy hero (max 60).' },
    sk: [
      { k: 'proj', n: 'Bog Bolt', i: '🫧', cd: 6, m: 45, u: 1, range: 580, speed: 900, dmg: 132, dl: 52, slow: [0.4, 2] },
      { k: 'nova', n: 'Mirefield', i: '🌿', cd: 10, m: 60, u: 2, radius: 250, dmg: 100, dl: 44, slow: [0.55, 2.2] },
      { k: 'healnova', n: 'Bog Salve', i: '💚', cd: 12, m: 70, u: 3, radius: 330, heal: 145, hl: 46 },
      { k: 'nova', n: 'Swallowing Bog', i: '🕳️', cd: 50, m: 120, u: 5, radius: 330, dmg: 210, dl: 55, stun: 1.2 },
    ] },
  { id: 'sable', name: 'SABLE', title: 'Duskguard', role: 'Support', emoji: '🕯️', tint: '#a5f3fc',
    pass: { k: 'mana_aura', radius: 420, mul: 1.6, n: 'Lantern of Dusk', d: 'Nearby allies gain +60% mana regeneration.' },
    sk: [
      { k: 'proj', n: 'Dusk Ray', i: '🌆', cd: 6, m: 45, u: 1, range: 590, speed: 950, dmg: 140, dl: 55, slow: [0.3, 2] },
      { k: 'shield', n: 'Gloomshield', i: '🛡', cd: 12, m: 55, u: 2, shield: 310, sl: 84, dur: 4, defAdd: 28 },
      { k: 'heal', n: 'Evening Calm', i: '🌙', cd: 11, m: 65, u: 3, heal: 228, hl: 70, radius: 520 },
      { k: 'sanctuary', n: 'Nightwatch', i: '🌃', cd: 54, m: 130, u: 5, heal: 292, hl: 78, shield: 248 },
    ] },
  { id: 'wyn', name: 'WYN', title: 'Songwarden', role: 'Support', emoji: '🎶', tint: '#f9a8d4',
    pass: { k: 'xp_hunter', mul: 1.12, n: 'Learning Songs', d: 'Gains +12% experience.' },
    sk: [
      { k: 'proj', n: 'Note Bolt', i: '🎵', cd: 6, m: 45, u: 1, range: 590, speed: 960, dmg: 136, dl: 54, slow: [0.35, 1.8] },
      { k: 'nova', n: 'Lullaby', i: '😴', cd: 10, m: 60, u: 2, radius: 235, dmg: 95, dl: 42, slow: [0.5, 2.2] },
      { k: 'buff', n: 'Battle Anthem', i: '🎺', cd: 14, m: 55, u: 3, dur: 5, aspdAdd: 0.4, msAdd: 0.15 },
      { k: 'healnova', n: 'Grand Chorus', i: '🎼', cd: 48, m: 125, u: 5, radius: 400, heal: 290, hl: 76 },
    ] },
];

/* ---- normalize into HEROES ---- */
(function () {
  const KINDMAP = {
    nova: (s) => ({ kind: 'nova', cd: s.cd, mana: s.m, unlock: s.u, radius: s.radius, dmg: s.dmg, dmgL: s.dl,
      slowPct: s.slow ? s.slow[0] : 0, slowDur: s.slow ? s.slow[1] : 0, stunDur: s.stun || 0,
      magic: !!s.magic, lifesteal: s.ls || 0, name: s.n, icon: s.i, desc: s.d || '' }),
    dash: (s) => ({ kind: 'dash', cd: s.cd, mana: s.m, unlock: s.u, dashDist: s.dist, dmg: s.dmg, dmgL: s.dl,
      slowPct: s.slow ? s.slow[0] : 0, slowDur: s.slow ? s.slow[1] : 0, away: !!s.away, magic: !!s.magic,
      aspdAdd: s.aspd ? s.aspd[0] : 0, dur: s.aspd ? s.aspd[1] : 0, name: s.n, icon: s.i, desc: s.d || '' }),
    proj: (s) => ({ kind: 'proj', cd: s.cd, mana: s.m, unlock: s.u, range: s.range, speed: s.speed, pierce: !!s.pierce,
      dmg: s.dmg, dmgL: s.dl, slowPct: s.slow ? s.slow[0] : 0, slowDur: s.slow ? s.slow[1] : 0,
      stunHero: s.stun || 0, magic: !!s.magic, drain: s.drain || 0, name: s.n, icon: s.i, desc: s.d || '' }),
    buff: (s) => ({ kind: 'buff', cd: s.cd, mana: s.m, unlock: s.u, dur: s.dur, aspdAdd: s.aspdAdd || 0,
      msAdd: s.msAdd || 0, atkAdd: s.atkAdd || 0, lsAdd: s.lsAdd || 0, name: s.n, icon: s.i, desc: s.d || '' }),
    shield: (s) => ({ kind: 'shield', cd: s.cd, mana: s.m, unlock: s.u, shield: s.shield, shieldL: s.sl, dur: s.dur,
      defAdd: s.defAdd || 0, name: s.n, icon: s.i, desc: s.d || '' }),
    heal: (s) => ({ kind: 'heal', cd: s.cd, mana: s.m, unlock: s.u, heal: s.heal, healL: s.hl, radius: s.radius,
      name: s.n, icon: s.i, desc: s.d || '' }),
    healnova: (s) => ({ kind: 'healnova', cd: s.cd, mana: s.m, unlock: s.u, radius: s.radius, heal: s.heal, healL: s.hl,
      name: s.n, icon: s.i, desc: s.d || '' }),
    strike: (s) => ({ kind: 'strike', cd: s.cd, mana: s.m, unlock: s.u, range: s.range, dmg: s.dmg, dmgL: s.dl,
      markDur: s.mark ? s.mark[0] : 0, markAmp: s.mark ? s.mark[1] : 0.25,
      slowPct: s.slow ? s.slow[0] : 0, slowDur: s.slow ? s.slow[1] : 0, name: s.n, icon: s.i, desc: s.d || '' }),
    blink: (s) => ({ kind: 'blink', cd: s.cd, mana: s.m, unlock: s.u, range: s.range, dmg: s.dmg, dmgL: s.dl,
      resetSkill: s.reset !== undefined ? s.reset : 0, name: s.n, icon: s.i, desc: s.d || '' }),
    meteor: (s) => ({ kind: 'meteor', cd: s.cd, mana: s.m, unlock: s.u, radius: s.radius, delay: s.delay,
      dmg: s.dmg, dmgL: s.dl, magic: true, slowPct: s.slow ? s.slow[0] : 0, slowDur: s.slow ? s.slow[1] : 0,
      name: s.n, icon: s.i, desc: s.d || '' }),
    sanctuary: (s) => ({ kind: 'sanctuary', cd: s.cd, mana: s.m, unlock: s.u, heal: s.heal, healL: s.hl, shield: s.shield,
      name: s.n, icon: s.i, desc: s.d || '' }),
  };
  for (const e of EXTRA) {
    const a = ARCH[e.role];
    const h = {
      id: e.id, name: e.name, title: e.title, role: e.role, emoji: e.emoji, tint: e.tint,
      stats: Object.assign({}, a, e.st || {}),
      passive: Object.assign({ name: e.pass.n, icon: '☆', desc: e.pass.d, kind: e.pass.k }, e.pass),
      skills: e.sk.map((s) => {
        const out = KINDMAP[s.k](s);
        // auto-descriptions when not provided
        if (!out.desc) {
          const dmgTxt = `${out.dmg || 0}+${out.dmgL || 0}/rank`;
          const bits = [];
          if (out.dmg || out.dmgL) bits.push(dmgTxt + ' damage');
          if (out.stunDur || out.stunHero) bits.push('stuns');
          if (out.slowPct) bits.push(`slows ${Math.round(out.slowPct * 100)}%`);
          if (out.markDur) bits.push('marks');
          if (out.heal) bits.push(`heals ${out.heal}+${out.healL || 0}/rank`);
          if (out.shield) bits.push(`shields ${out.shield}`);
          if (out.aspdAdd) bits.push('+attack speed');
          if (out.msAdd) bits.push('+speed');
          if (out.atkAdd) bits.push('+attack');
          if (out.lsAdd || out.lifesteal) bits.push('lifesteal');
          if (out.pierce) bits.push('pierces');
          if (out.drain) bits.push(`drains ${Math.round(out.drain * 100)}%`);
          out.desc = bits.join(' · ') || 'Empowers you in battle.';
        }
        out.desc = (s.u === 5 ? 'ULT · ' : '') + out.desc;
        return out;
      }),
    };
    // passive spread already includes kind (from e.pass.k) — nothing to fix
    HEROES.push(h);
  }
})();
