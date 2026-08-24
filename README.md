# ⚔️ Aether Arena — 5v5 Online MOBA

A Mobile-Legends-style 5v5 MOBA that runs entirely in the browser — no build step,
no client dependencies. The server is dependency-free Node.js; all art and sound are
generated in code.

![type](https://img.shields.io/badge/type-browser_game-blue) ![deps](https://img.shields.io/badge/dependencies-0-green) ![online](https://img.shields.io/badge/online-5v5_with_accounts-38bdf8)

## 🚀 Deploy

See **[DEPLOY.md](DEPLOY.md)** — Railway/Render/Fly/VPS one-config deploys (health check, volume persistence, docker-compose included). GitHub Pages won't work (needs the live server).

## 🎮 Play

**Online 5v5 (with accounts):**
```bash
node server.js          # → http://localhost:8000
```
Register a login, pick a hero, hit **FIND MATCH**. The queue fills empty slots with
bots after ~20s (instant 5v5 vs AI, or wait for up to 10 humans — the matchmaker
alternates humans across both teams). Win/loss/kills are tracked per account.

**Offline practice (no login):** click *Practice vs AI* on the login screen —
runs the whole simulation locally in your browser.

## 🧠 Features

- **5v5 real-time battles** — humans vs humans, bots fill empty slots
- **Accounts** — register/login (scrypt-hashed passwords), per-account W/L/K/D stats
- 💎 **Gems + skin shop** — earn 60–100 gems per match, buy cosmetic skins
  (server-validated ownership); gem-pack checkout stub ready for Lemon Squeezy/Paddle
- 🏅 **Ranked ELO + leaderboard** — K=32 ELO per match, top-20 board
- 📹 **Match replays** — every online match recorded (gzipped snapshots),
  browsable + playable in-game with pause/speed controls
- 🌫️ **Fog of war + bushes** — server-authoritative vision & bush stealth,
  rendered client-side; the AI plays by the same rules (no x-ray bots)
- 🕸️ **A\* pathfinding** — bots path around trees & rock walls on a 40×40 nav grid
- 🎮 **In-match chat + pings** — team chat + attack/retreat pings
- 🧩 **Item build paths + actives** — 6 components → 10 legendaries
  (recipes consume parts) + 3 ACTIVE items (Sprint / Barrier / Blink)
- 🏳️ **Surrender voting** (after 5:00, humans vote, losing bots agree) + **AFK bot takeover**
- 🎖 **Battle Pass** — 30 tiers, pass XP from matches, free + premium tracks (💎800)
- 🤝 **Friends & parties** — friend list with presence, invite → 2-player party
  that queues and stays on the SAME team (party-aware matchmaking)
- ⚜ **Guilds** — create for 💎500, tags shown in matches & leaderboards, guild power board
- 📱 **PWA** — installable on Android/iOS home screens, offline shell
- **Authoritative server** — the server runs the same engine as the offline mode;
  clients send inputs (move/cast/buy/recall/lock) and render interpolated snapshots
- **3 lanes** (Top / Mid / Bot) with **2 towers each + base turret + throne**
- **Solid obstacles** — 150 jungle trees + rock walls with collision: juke paths, block chases
- **Jungle** — lizard & golem camps (golems grant a red damage buff), plus the
  🐢 **Turtle** (team gold) and 👑 **Lord** (team-wide +15% damage buff)
- **10 heroes** with unique skill kits and AI-generated portrait sprites
- **Minion waves** every 30s (melee / ranged / siege), scaling over time
- **Leveling 1–15**, gold, **item shop** (buy at base or while dead)
- **Win by destroying the enemy base**
- Kill streak announcements, kill feed, minimap, synthesized SFX, particles
- Built-in **balance simulator** and **end-to-end net tests**

## 🕹️ Controls

| Action | 📱 Touch | 🖥️ Desktop |
|---|---|---|
| Move | touch & drag anywhere on the left half | WASD / arrows |
| Skills | buttons (bottom-right) | **Q** / **E**, ult **R** |
| Basic attack | automatic (nearest in range) | automatic · **Space** cycles target lock |
| Recall | 🌀 button | **B** |
| Shop | 🛒 button | **T** |

## 🦸 Heroes

| Hero | Role | Ult |
|---|---|---|
| ⚔️ Kael | Fighter | 🌪️ Bladestorm — cleave + lifesteal frenzy |
| 🏹 Vex | Marksman | ⚡ Overdrive — attack speed overdrive |
| 🔮 Nyx | Mage | ☄️ Meteor — huge area nuke |
| 🛡️ Bastion | Tank | 🌋 Earthshaker — AoE stun |
| 🗡️ Syon | Assassin | 💀 Reaper's Embrace — blink execute |
| ✨ Seraph | Support | 🌟 Sanctuary — team heal + shields |
| 🪓 Rona | Fighter | 🌊 Crimson Maelstrom — lifesteal whirlwind |
| 🎯 Volt | Marksman | 🔋 Overcharge — long-range sniper mode |
| ☠️ Morrow | Mage | 🌀 Soul Storm — drain the battlefield |
| 🌙 Tala | Support | 🌠 Moonveil — team heal, shield & speed |

## 🗺️ How it works

- `server.js` — the whole online server: HTTP static + auth API + hand-rolled
  RFC 6455 WebSockets + matchmaking + authoritative match hosting
- `js/game.js` — engine (shared by browser & server): map, units, combat, skills,
  AI brains, waves, rendering, network mirror mode
- `js/heroes.js` — hero roster & skill data (declarative skill definitions)
- `js/net.js` — browser network client: login UI, queue, input sender, snapshot → mirror
- `js/util.js` — math helpers + WebAudio synth for all SFX
- `img/` — AI-generated hero portrait sprites (circle-cropped in-game)
- `data/users.json` — account store (gitignored)

```bash
node test/sim.js kael 15    # headless balance simulation, full AI match
node test/net-test.js       # boots the server, 3 fake players, verifies match flow
```

Matches typically run **9–13 minutes**; the AI-vs-AI win rate is roughly balanced,
so players are the difference-makers. After 20:00 towers start decaying so every
game reaches a conclusion.
