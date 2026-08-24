/* ============================================================
 * AETHER ARENA — heroes3.js
 * Six NON-HUMAN champions: constructs, beasts, and things that
 * should not be playable. Original designs, all kinds engine-native.
 * ============================================================ */
'use strict';

HEROES.push(
  {
    id: 'glyx', name: 'GLYX', title: 'Crystal Golem', role: 'Tank', emoji: '💎', tint: '#7dd3fc',
    stats: { hp: 1850, hpL: 210, mana: 340, manaL: 30, atk: 72, atkL: 6, dtype: 'phys',
             aspd: 0.68, aspdL: 0.014, range: 125, ms: 258, def: 78, defL: 9.5, regen: 12 },
    passive: { name: 'Faceted Guard', icon: '☆', desc: '+30 defense per nearby enemy hero (max 90).', kind: 'bulwark2', per: 30, cap: 90 },
    skills: [
      { name: 'Prism Burst', icon: '💠', kind: 'nova', cd: 7, mana: 40, unlock: 1, radius: 220, dmg: 100, dmgL: 44, slowPct: 0.35, slowDur: 1.5,
        desc: 'Refracted light scalds and slows everything nearby.' },
      { name: 'Crystallize', icon: '🧊', kind: 'shield', cd: 13, mana: 50, unlock: 2, shield: 310, shieldL: 82, dur: 4, defAdd: 36,
        desc: 'Grows a gemshell: big shield +36 defense for 4s.' },
      { name: 'Rolling Quartz', icon: '🛞', kind: 'dash', cd: 11, mana: 45, unlock: 3, dashDist: 300, dmg: 80, dmgL: 38, slowPct: 0.3, slowDur: 1.2,
        desc: 'Bowls forward, crushing and slowing the line.' },
      { name: 'Refraction', icon: '✨', kind: 'nova', cd: 48, mana: 100, unlock: 5, radius: 320, dmg: 240, dmgL: 60, stunDur: 1.2,
        desc: 'ULT · Shatters its own facets: AoE damage + STUN.' },
    ],
  },
  {
    id: 'myrr', name: 'MYRR', title: 'Elder Treant', role: 'Support', emoji: '🌳', tint: '#4ade80',
    stats: { hp: 1300, hpL: 135, mana: 560, manaL: 54, atk: 76, atkL: 7, dtype: 'phys',
             aspd: 0.78, aspdL: 0.02, range: 375, ms: 254, def: 40, defL: 5.5, regen: 10 },
    passive: { name: 'Deep Roots', icon: '☆', desc: 'Regenerates 3% HP/s after 4s out of combat.', kind: 'ooc_regen', after: 4, pct: 0.03 },
    skills: [
      { name: 'Sap Bolt', icon: '🌿', kind: 'proj', cd: 6, mana: 45, unlock: 1, range: 590, speed: 900, dmg: 130, dmgL: 52, slowPct: 0.35, slowDur: 1.8,
        desc: 'Sticky sap glob that roots at the ankles (slow).' },
      { name: 'Spring Sap', icon: '💚', kind: 'heal', cd: 11, mana: 65, unlock: 2, heal: 235, healL: 72, radius: 520,
        desc: 'Blessed sap heals the most wounded nearby ally.' },
      { name: 'Grove Light', icon: '🌤️', kind: 'healnova', cd: 12, mana: 70, unlock: 3, radius: 330, heal: 150, healL: 48,
        desc: 'Sunlight through leaves heals ALL allies around you.' },
      { name: 'World Root', icon: '🌍', kind: 'sanctuary', cd: 54, mana: 130, unlock: 5, heal: 300, healL: 80, shield: 250,
        desc: 'ULT · The ancient root network shields the whole team.' },
    ],
  },
  {
    id: 'skarn', name: 'SKARN', title: 'Sand Wyrm', role: 'Assassin', emoji: '🐍', tint: '#facc15',
    stats: { hp: 1150, hpL: 118, mana: 360, manaL: 30, atk: 104, atkL: 10, dtype: 'phys',
             aspd: 0.95, aspdL: 0.03, range: 130, ms: 290, def: 28, defL: 4, regen: 7 },
    passive: { name: 'Apex Predator', icon: '☆', desc: 'Deals +15% damage to jungle monsters.', kind: 'hunter', mul: 1.15 },
    skills: [
      { name: 'Burrow', icon: '⏳', kind: 'dash', cd: 7, mana: 45, unlock: 1, dashDist: 390, dmg: 120, dmgL: 56,
        desc: 'Dives underground and erupts at the end of the line.' },
      { name: 'Devouring Maw', icon: '👄', kind: 'strike', cd: 9, mana: 45, unlock: 2, range: 340, dmg: 165, dmgL: 68,
        desc: 'Two-part jaw strike on the nearest prey.' },
      { name: 'Sand Blast', icon: '🏜️', kind: 'nova', cd: 12, mana: 45, unlock: 3, radius: 190, dmg: 90, dmgL: 40, slowPct: 0.45, slowDur: 1.5,
        desc: 'Spits a stinging grit cloud.' },
      { name: 'Emerge', icon: '💥', kind: 'blink', cd: 41, mana: 95, unlock: 5, range: 650, dmg: 295, dmgL: 80, resetSkill: 0,
        desc: 'ULT · Burrows to the weakest enemy hero and erupts. Resets Burrow.' },
    ],
  },
  {
    id: 'velk', name: 'VELK', title: 'Deep Kraken', role: 'Mage', emoji: '🐙', tint: '#22d3ee',
    stats: { hp: 1040, hpL: 104, mana: 580, manaL: 56, atk: 92, atkL: 9, dtype: 'magic',
             aspd: 0.78, aspdL: 0.02, range: 405, ms: 256, def: 26, defL: 4, regen: 7 },
    passive: { name: 'Ink Residue', icon: '☆', desc: 'Skill hits slow enemies by 22% for 1.1s.', kind: 'spell_echo', slowPct: 0.22, dur: 1.1 },
    skills: [
      { name: 'Ink Bolt', icon: '⚫', kind: 'proj', cd: 5, mana: 50, unlock: 1, range: 600, speed: 900, dmg: 130, dmgL: 60, magic: true, slowPct: 0.3, slowDur: 1.5,
        desc: 'A glob of living ink.' },
      { name: 'Ink Cloud', icon: '☁️', kind: 'nova', cd: 9, mana: 65, unlock: 2, radius: 245, dmg: 148, dmgL: 66, magic: true, slowPct: 0.45, slowDur: 2,
        desc: 'Blinds and slows everything in the murk.' },
      { name: 'Mist Form', icon: '🌫️', kind: 'buff', cd: 14, mana: 55, unlock: 3, dur: 3, msAdd: 0.25,
        desc: 'Dissolves into sea mist: +25% move speed for 3s.' },
      { name: 'Abyssal Surge', icon: '🌊', kind: 'meteor', cd: 45, mana: 120, unlock: 5, radius: 300, delay: 0.85, dmg: 360, dmgL: 92, magic: true, slowPct: 0.35, slowDur: 1.5,
        desc: 'ULT · Calls the trench itself to swallow the enemy backline.' },
    ],
  },
  {
    id: 'pyrrh', name: 'PYRRH', title: 'Magma Drake', role: 'Fighter', emoji: '🐲', tint: '#f97316',
    stats: { hp: 1450, hpL: 160, mana: 380, manaL: 34, atk: 96, atkL: 9.5, dtype: 'phys',
             aspd: 0.88, aspdL: 0.024, range: 120, ms: 268, def: 46, defL: 6.5, regen: 10 },
    passive: { name: 'Molten Heart', icon: '☆', desc: 'Below 45% HP: +20% attack speed, +8% move speed.', kind: 'rage', hpPct: 0.45, aspdMul: 1.2, msMul: 0.08 },
    skills: [
      { name: 'Cinder Claw', icon: '🔥', kind: 'nova', cd: 6, mana: 45, unlock: 1, radius: 195, dmg: 112, dmgL: 52, lifesteal: 0.25,
        desc: 'Raking claws of magma; heals 25% of damage.' },
      { name: 'Drake Charge', icon: '💨', kind: 'dash', cd: 9, mana: 50, unlock: 2, dashDist: 350, dmg: 105, dmgL: 48,
        desc: 'A head-down charge that tramples the path.' },
      { name: 'Heated Scales', icon: '🌡️', kind: 'buff', cd: 14, mana: 50, unlock: 3, dur: 4, atkAdd: 26, lsAdd: 0.15,
        desc: 'Scales run white-hot: +26 attack, 15% lifesteal.' },
      { name: 'Eruption', icon: '🌋', kind: 'nova', cd: 46, mana: 100, unlock: 5, radius: 300, dmg: 250, dmgL: 64, lifesteal: 0.4, slowPct: 0.3, slowDur: 1.5,
        desc: 'ULT · Detonates its core: heavy AoE, 40% lifesteal back.' },
    ],
  },
  {
    id: 'silth', name: 'SILTH', title: 'Venom Weaver', role: 'Marksman', emoji: '🕷️', tint: '#a3e635',
    stats: { hp: 970, hpL: 108, mana: 410, manaL: 34, atk: 102, atkL: 10.5, dtype: 'phys',
             aspd: 1.0, aspdL: 0.033, range: 440, ms: 258, def: 24, defL: 3.5, regen: 6 },
    passive: { name: 'Toxin Finish', icon: '☆', desc: '+20% damage to enemies below 20% HP.', kind: 'execute', hpPct: 0.2, mul: 1.2 },
    skills: [
      { name: 'Web Shot', icon: '🕸️', kind: 'proj', cd: 6, mana: 40, unlock: 1, range: 540, speed: 950, dmg: 118, dmgL: 54, slowPct: 0.4, slowDur: 2,
        desc: 'Sticky webbing that cripples movement.' },
      { name: 'Snare Web', icon: '⛔', kind: 'nova', cd: 10, mana: 50, unlock: 2, radius: 220, dmg: 85, dmgL: 38, slowPct: 0.55, slowDur: 2.2,
        desc: 'Spins a web around itself — heavy slow.' },
      { name: 'Silk Swing', icon: '🪢', kind: 'dash', cd: 10, mana: 40, unlock: 3, dashDist: 300, away: true, aspdAdd: 0.4, dur: 3,
        desc: 'Swings away on a silk line, +40% attack speed.' },
      { name: "Predator's Focus", icon: '👁️', kind: 'buff', cd: 46, mana: 100, unlock: 5, dur: 5, aspdAdd: 0.8, rangeAdd: 100, atkAdd: 30,
        desc: 'ULT · Eight eyes open: +80% AS, +100 range, +30 ATK.' },
    ],
  }
);
