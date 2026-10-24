# Chotu mini

Hackathon slice: a **kids explainer short-video** maker. Phone/web app talks only to a thin Node server. No API keys in the client.

The **server is an MCP client** (Vercel AI SDK `experimental_createMCPClient` / `@ai-sdk/mcp`, HTTP or SSE). Nodes call discovered MCP tools for visuals and voice; assets are downloaded locally for ffmpeg.

## Pipeline (lite DAG)

Plain-code **Supervisor** (no LLM) routes a fixed chain:

```
Supervisor → Script → Visuals → Voice → Render → Verify
```

| Node | What it does |
|---|---|
| **Supervisor** | Fixed order only. No model call. |
| **Script** | Vercel AI SDK `generateObject` + Zod: 4–5 scenes `{ narration, imagePrompt }`, ~30–45s kids explainer. Language: English / Hindi. |
| **Visuals** | Pluggable provider via `VISUALS_PROVIDER`: `higgsfield` \| `openart` \| `mock`. Higgsfield/OpenArt go through **MCP** (image, then optional image-to-video). |
| **Voice** | ElevenLabs **MCP** TTS (`text_to_speech`); on failure, **REST** `eleven_multilingual_v2`. One MP3 per scene, cache by text hash. |
| **Render** | ffmpeg: stills → Ken Burns; **clips** → trim or loop to audio length; captions as **PNG overlay** (not `drawtext`); concat **9:16 MP4**. |
| **Verify** | Schema valid, every scene has image+audio (and video if `visualKind=video`), output non-empty. **One retry**, then fail cleanly. |

If ffmpeg render fails, the job sets `slideshowFallback: true` and the app plays **images + audio + captions**.

**Mock mode:** `MOCK_MODE=true` (or missing live tokens) skips MCP connects and uses sample stills + tone audio so the UI demos end-to-end.

## MCP architecture

```
Expo app ──HTTP──► Chotu server (MCP client)
                      ├─ Higgsfield MCP  (image + i2v tools)
                      ├─ OpenArt MCP     (image + video tools; no public REST API)
                      └─ ElevenLabs MCP  (TTS; REST fallback)
```

At startup the server:

1. Connects to each configured MCP URL (HTTP streamable preferred, SSE supported).
2. Discovers tools (`client.tools()`).
3. Picks tools by **configured name**, then substring aliases.
4. Exposes `GET /api/mcp` with the discovered tool list.

Async generations: if a tool returns a job/request id instead of a URL, the node polls the status tool until an asset URL appears (timeout + **one retry** of the generate call).

### Endpoints & auth

| Server | Default URL | Auth env | Notes |
|---|---|---|---|
| **Higgsfield** | `https://mcp.higgsfield.ai/mcp` | `HIGGSFIELD_MCP_TOKEN` → `Authorization: Bearer …` | Product MCP is often OAuth in chat apps; for this server paste a Bearer/access token (or full `Authorization` header value). Transport: `HIGGSFIELD_MCP_TRANSPORT=http\|sse`. |
| **OpenArt** | `https://mcp.openart.ai/mcp` | `OPENART_MCP_TOKEN` | **No public REST API** ([OpenArt help](https://openart.ai/help)). MCP is the supported programmatic path. Without a token/connection, the OpenArt adapter errors with setup guidance. |
| **ElevenLabs** | `https://api.elevenlabs.io/v1/mcp` | `ELEVENLABS_API_KEY` (also used as MCP Bearer) | Hosted MCP is OAuth-oriented in assistants; for Replit we send the API key as Bearer. If MCP TTS fails, Voice node falls back to ElevenLabs **REST** TTS. |

Tool name overrides (matched after discovery):

| Env | Default | Role |
|---|---|---|
| `HIGGSFIELD_IMAGE_TOOL` | `generate_image` | Text → image |
| `HIGGSFIELD_VIDEO_TOOL` | `image_to_video` | Image → short clip |
| `HIGGSFIELD_STATUS_TOOL` | `get_generation` | Poll async job |
| `OPENART_IMAGE_TOOL` / `OPENART_VIDEO_TOOL` / `OPENART_STATUS_TOOL` | `generate_image` / `generate_video` / `get_generation` | Same roles |
| `ELEVENLABS_TTS_TOOL` | `text_to_speech` | TTS |

If your account’s MCP tool names differ, set these env vars to the exact names shown in `GET /api/mcp`.

### Getting tokens (booth)

- **Higgsfield / OpenArt:** complete OAuth once in Cursor/Claude against their MCP URL, then copy a usable access token into Replit secrets as `*_MCP_TOKEN`, **or** use whatever Bearer token their console issues for agent access. Without a token, keep `MOCK_MODE=true` / `VISUALS_PROVIDER=mock`.
- **ElevenLabs:** create an API key; set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`. MCP is attempted first; REST always remains the safety net.

## Job API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | `{ ok, mockMode, visualsProvider }` |
| `GET` | `/api/mcp` | Discovered MCP tool names per server |
| `POST` | `/api/jobs` | body `{ topic, language: "en"\|"hi", style }` |
| `GET` | `/api/jobs/:id` | poll stages, `videoUrl`, scene URLs |
| static | `/assets/...` | generated files under `server/data/` |

## Env (summary)

See [`.env.example`](../.env.example) and [`server/.env.example`](../server/.env.example).

| Var | Role |
|---|---|
| `MOCK_MODE` | Force mock pipeline (no MCP) |
| `VISUALS_PROVIDER` | `mock` \| `higgsfield` \| `openart` |
| `OPENAI_API_KEY` | Script node |
| `HIGGSFIELD_MCP_URL` / `HIGGSFIELD_MCP_TOKEN` | Higgsfield MCP |
| `OPENART_MCP_URL` / `OPENART_MCP_TOKEN` | OpenArt MCP |
| `ELEVENLABS_MCP_URL` / `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Voice MCP + REST |
| `PUBLIC_BASE_URL` | Absolute asset URLs on Replit |
| `EXPO_PUBLIC_API_URL` | App → server |

## Run locally

```bash
# 1) Server
cd server
cp .env.example .env   # MOCK_MODE=true is fine for booth rehearsal
npm install
npm run start          # http://localhost:8787 — MCP discovery logged at boot

# 2) Smoke (mock)
npm run test:mock      # playable MP4 under data/jobs/...

# 3) Expo web
cd ../app
npm install
EXPO_PUBLIC_API_URL=http://localhost:8787 npm run web
```

Root helpers: `npm run install:all`, `npm run typecheck`, `npm run test:mock`.

## Run on Replit

1. Import this repo. Use a **Node** Replit with `ffmpeg` + `ffprobe`.
2. Secrets: paste from `.env.example`. Live booth: `MOCK_MODE=false`, `VISUALS_PROVIDER=higgsfield` (or `openart`), MCP tokens, ElevenLabs key + voice id, `PUBLIC_BASE_URL=https://YOUR-REPLIT-HOST`.
3. `npm run install:all`
4. API: `cd server && npm run start`
5. Check `GET /api/mcp` — confirm image/video/TTS tools were discovered (adjust `*_TOOL` env names if needed).
6. Expo web: `cd app && EXPO_PUBLIC_API_URL=https://YOUR-REPLIT-HOST npm run web`

## Open in Expo Go

1. Server must be reachable from the phone (Replit HTTPS).
2. Set `EXPO_PUBLIC_API_URL` to that URL.
3. `cd app && npx expo start` → scan QR with Expo Go.

## Demo script (booth)

1. Topic “Why bees make honey”, English, watercolor.
2. Watch stages: Script → Visuals → Voice → Render → Verify.
3. Play MP4 (or slideshow). Share copies the asset URL.
4. Optional: Hindi second run.

## Layout

```
app/                 Expo (web + Expo Go)
server/
  src/mcp/           AI SDK MCP client, discovery, poll, download
  src/visuals/       mock | higgsfield | openart adapters
  src/pipeline/      script → visuals → voice → render → verify
docs/11-chotu-mini.md
.env.example
```
