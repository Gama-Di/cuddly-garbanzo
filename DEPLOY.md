# 🚀 Deploying Aether Arena

The game is **one zero-dependency Node.js server** (`node server.js`, Node ≥ 20) that serves
the client and hosts matches (HTTP + WebSockets). No build step, no database — accounts and
replays are JSON files under `data/` (mount a volume to persist them).

> ⚠️ GitHub Pages will **not** work — the game needs the live server for accounts,
> matchmaking, drafts, and the authoritative simulation.

---

## Option A — Railway (~5 minutes, recommended)

1. Push this repo to GitHub and merge the PR into `main` (or deploy from any branch).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick `Gama-Di/cuddly-garbanzo`.
3. Railway reads `railway.json` automatically. In **Settings**:
   - **Variables**: add `NODE_ENV=production` (and `DATA_DIR=/data` if you add a volume)
   - **Volumes**: add a volume mounted at `/data`, then set `DATA_DIR=/data`
4. **Networking → Generate Domain** → done. WebSockets work out of the box.
5. Health check: `GET /api/health` → `{"ok":true,...}`

Cost: free trial credit, then usage-based (~$5/mo for an always-on tiny service).

## Option B — Render

1. [render.com](https://render.com) → **New → Web Service** → connect the repo.
2. It reads `render.yaml` (includes a 1 GB disk at `/data`). Confirm the plan (Starter ~$7/mo; free tier sleeps + no disk — accounts would reset on sleep).
3. Set `DATA_DIR=/data` is already in the yaml. Deploy → get `https://your-name.onrender.com`.

## Option C — Fly.io

1. `fly launch` (uses `fly.toml`: health check, volume `aether_data` at `/data`, HTTPS forced).
2. `fly deploy`

## Option D — Your own VPS (any provider: Hetzner/DigitalOcean/Vultr ~$5/mo)

```bash
ssh your-server
git clone https://github.com/Gama-Di/cuddly-garbanzo.git && cd cuddly-garbanzo
docker compose up -d        # serves on :8000, data persisted in ./data
```

Put any reverse proxy with TLS in front (Caddy is one line: `caddy reverse-proxy --from yourdomain.com --to localhost:8000`).

---

## After deploy — checklist

| Check | How |
|---|---|
| Health | `https://YOUR_URL/api/health` returns ok |
| Register + play a ranked match | full flow: splash → menu → draft → match |
| Accounts persist across redeploy | needs the volume (`DATA_DIR`) |
| Gem purchases | `DEV_GEMS=1` makes packs free (testing). For real payments, wire `GEM_PACKS` checkout in `server.js` to Lemon Squeezy / Paddle (mobile-friendly for NP payouts) |
| PWA install | works automatically (manifest + service worker); iOS: Share → Add to Home Screen |

### Production environment variables

| Var | Purpose |
|---|---|
| `PORT` | listen port (defaults 8000; platforms set it) |
| `NODE_ENV=production` | logs |
| `DATA_DIR=/data` | where accounts/guilds/replays/sessions live (mount a volume!) |
| `DEV_GEMS=1` | ⚠️ free gem packs — testing only |
| `QF_MS` | queue bot-fill timeout ms (default 20000) |
