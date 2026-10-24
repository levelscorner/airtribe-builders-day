# Chotu Studio

Hackathon product for **Track 04 — AI for Creators**: an AI production team for Indian creators (Hindi/Hinglish first). Phone/web app talks only to a thin Node server. No API keys in the client.

Formerly referred to as “Chotu mini” in early scaffolding; product name for pitch and UI is **Chotu Studio**.

Pitch one-pager: [docs/12-pitch.md](12-pitch.md).

## Must-haves (Track 04)

| Requirement | How we ship it |
|---|---|
| **HITL approval** | After Script, status `awaiting_script_approval` until `POST /api/jobs/:id/approve-script`. After Verify, `awaiting_final_approval` until `approve-final` → `published` + download unlocked. Each approval is logged. |
| **Pine Labs packs** | `POST /api/packs/checkout` → payment URL (Pine Labs link from env, or **mock** pay page). Credits gate `POST /api/jobs`. |
| **Traction proof** | Signup (`name` + email/phone). Timestamped events: `signup`, `job_created`, `approval`, `payment`, `render_done`, … Admin: `/admin` HTML + CSV. |
| **Agent activity log** | Per-job `activity[]`: node, MCP tool/provider, status, message — visible in the app for the demo video. |

## Pipeline (lite DAG)

Plain-code **Supervisor** (no LLM) routes:

```
Supervisor → Script → [creator approves] → Visuals → Voice → Render → Verify → [creator approves] → Publish
```

| Node | What it does |
|---|---|
| **Supervisor** | Fixed order; records activity. |
| **Script** | AI SDK `generateObject` + Zod: 4–5 scenes, ~30–45s. Hindi or English. |
| **Visuals** | `VISUALS_PROVIDER`: `higgsfield` \| `openart` \| `mock` via **MCP**. |
| **Voice** | ElevenLabs **MCP** TTS; **REST** fallback. Cache by text hash. |
| **Render** | ffmpeg: Ken Burns stills or trim/loop clips; PNG captions; 9:16 MP4. |
| **Verify** | Schema + assets; one retry then fail cleanly. |

Slideshow fallback if ffmpeg fails. **Mock mode** skips MCP and still demos end-to-end (auto-approvable in `npm run test:mock`).

## MCP architecture

Server is an MCP client (`experimental_createMCPClient` / `@ai-sdk/mcp`, HTTP or SSE).

| Server | Default URL | Auth |
|---|---|---|
| Higgsfield | `https://mcp.higgsfield.ai/mcp` | `HIGGSFIELD_MCP_TOKEN` |
| OpenArt | `https://mcp.openart.ai/mcp` | `OPENART_MCP_TOKEN` (no public REST API) |
| ElevenLabs | `https://api.elevenlabs.io/v1/mcp` | `ELEVENLABS_API_KEY` (+ REST fallback) |

Tool names are env-configurable; discover at `GET /api/mcp`. Async jobs: poll status tool until asset URL; timeout + one retry.

## Credits & Pine Labs

| Env | Role |
|---|---|
| `STARTER_CREDITS` | Credits on signup (default `1`) |
| `VIDEO_PACK_CREDITS` | Pack size (default `5`) |
| `VIDEO_PACK_PRICE_INR` | Pack price (default `99`) |
| `PINE_LABS_MOCK` | `true` → mock checkout URL (default in dev) |
| `PINE_LABS_PAYMENT_LINK_BASE` | Live payment-link base when mock is off |
| `PINE_LABS_MERCHANT_ID` | Optional merchant id for ops notes |

Flow: signup → (optional buy pack) → create job spends 1 credit → produce → approvals.

## Traction / admin

- `POST /api/signup` — name + contact  
- `GET /admin` — screenshot-friendly event table  
- `GET /api/admin/events` · `GET /api/admin/events.csv`

Event types include: `signup`, `job_created`, `approval`, `payment`, `render_done`, `credit_spent`, `credit_granted`.

## Job API (high level)

| Method | Path |
|---|---|
| `POST` | `/api/signup` |
| `POST` | `/api/jobs` `{ userId, topic, language, style }` |
| `POST` | `/api/jobs/:id/approve-script` `{ userId }` |
| `POST` | `/api/jobs/:id/approve-final` `{ userId }` |
| `GET` | `/api/jobs/:id` — stages, script, activity, publishUnlocked |
| `GET` | `/api/packs` · `POST /api/packs/checkout` |
| `GET` | `/admin` |

## Run locally

```bash
cd server && cp .env.example .env && npm install && npm run start
npm run test:mock   # auto-approves HITL gates

cd ../app && npm install
EXPO_PUBLIC_API_URL=http://localhost:8787 npm run web
```

Open `/admin` for the traction screenshot. Expo Go: set `EXPO_PUBLIC_API_URL` to a public HTTPS API.

## Run on Replit

1. Node Replit with ffmpeg.  
2. Secrets from `.env.example`. Live: `MOCK_MODE=false`, MCP tokens, ElevenLabs, `PINE_LABS_MOCK=false` + `PINE_LABS_PAYMENT_LINK_BASE`, `PUBLIC_BASE_URL`.  
3. `npm run install:all` → start server + Expo web.  
4. Verify `GET /api/mcp` and `/admin`.

## Layout

```
app/                 Expo — signup, topic, approvals, packs, admin, activity
server/
  src/mcp/           MCP client
  src/visuals/       higgsfield | openart | mock
  src/payments/      Pine Labs / mock packs
  src/users/ events/ traction
  src/pipeline/      script → visuals → voice → render → verify (+ gates)
docs/11-chotu-mini.md
docs/12-pitch.md
```
