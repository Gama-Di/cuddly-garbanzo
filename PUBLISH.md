# 📦 Publishing Aether Arena

## itch.io ✅ (ready now)

1. Create a free account at [itch.io](https://itch.io) → **Upload new project**
2. **Kind of project**: HTML — upload `dist/itch/aether-arena-itch.zip` (already built; rebuild any time with `python3 tools/build-itch.py`)
3. Tick ✅ **"This file will be played in the browser"**
4. Viewport: **1280 × 720**, tick ✅ mobile friendly, ✅ fullscreen button
5. Recommended page copy:
   - **Title**: Aether Arena — 5v5 MOBA
   - **Short**: A full 5v5 MOBA in your browser: 56 heroes, drafts & bans, ranked, item crafting — no install.
   - **Tags**: `moba`, `multiplayer`, `strategy`, `browser game`
6. Publish 🚀

**About online play on itch:** the zip runs the complete game client. **Practice vs AI is fully playable offline** (the whole simulation runs client-side). For online matches, itch players connect to your hosted server — after deploying (see DEPLOY.md), rebuild the zip with your URL:

```bash
python3 tools/build-itch.py https://yourgame.up.railway.app
```

Re-upload the zip — ranked, drafts, guilds and chat then work inside the itch page (WebSockets + https, no CORS issues since the client uses absolute URLs).

## Steam ⚠️ (possible later, real work)

1. Steamworks partner account — **$100/game** (Steam Direct), banking + tax info, review process
2. Needs a **desktop build**: wrap the client with Electron or Tauri (I can scaffold this when you're ready) and point it at your server for multiplayer, with Practice fully offline
3. Steam overlay, achievements etc. are extra work — budget a week+ for a proper release

## now.gg ⚠️ (not a fit)

now.gg streams **Android APKs** — it's for mobile games. Our game is a web app; once deployed it's already instantly playable via URL (and installable as a PWA), which is what now.gg links would give you anyway. Skip it.

---

### Suggested order
1. Deploy the server (DEPLOY.md, ~5 min)
2. Publish to itch with the online zip (2 min)
3. If the game gets traction → Steam build (Electron + partner account)
