# Airtribe AI Builders Day — product portfolio

Documentation for the ideas Abhinav is keeping in play for **Airtribe AI Builders Day** (Saturday 24 October 2026, Bengaluru) and for the weeks after. The repo now also holds the Track 04 **Chotu Studio** app (`apps/mobile` + `server`).

## Chotu Studio (supported client)

**Supported UI:** [`apps/mobile`](apps/mobile) (Expo web + Expo Go). It talks to Saturn `/v1` (REST + SSE).

```bash
npm run install:all
npm run mobile:export          # Expo web → apps/mobile/dist
MOCK=1 npm start               # /v1 API + static Expo web (default PORT 8787)
```

Legacy Chotu mini (`app/` → `/api/jobs`) is still available via a separate process:

```bash
npm run start:legacy           # old Express /api/jobs server (server/src/index.ts)
npm run app                    # Expo app against that API
```

See [`docs/14-architecture.md`](docs/14-architecture.md) and [`docs/16-checklist.md`](docs/16-checklist.md).

Four ideas stay first-class in the portfolio. A short backlog records earlier demo shapes that are still available if a booth challenge or the team’s skills pull that way.

## Chotu Studio media ports

Adapters live in `server/src/media`. `createMediaPorts(env)` returns `ImageGen`, `ClipGen`, and `VoiceGen`. `MOCK=1` (or a missing key) returns placeholder files under `server/public/mock/` and does not call a provider.

Live images default to `gpt-image-2` (`POST /v1/images/generations`, body `model`, `prompt`, `size: 1024x1536`, `n: 1`, `Authorization: Bearer OPENAI_API_KEY`). A blank `IMAGE_PROVIDER` selects that path. The response is `data[0].b64_json` (GPT image models do not return a URL). The server decodes it, center-crops 1024×1536 onto 9:16, scales the still to 720×1280, and serves the PNG at `/media/images/{id}.png`. Each non-narrator cast member gets one character sheet (turnaround plus expression row, `1536x1024`, no 9:16 crop) stored on `cast_members.sheet_url`. Every scene still then uses `POST /v1/images/edits` with those sheets and the identity text. A scene with several characters sends every relevant sheet. A failed OpenAI call stays failed. `IMAGE_PROVIDER=ark` is the only way to call Seedream.

The scene runner reads `imagePrompt`, `motionPrompt`, `durationSec` (5 or 10), `vo`, and `voiceId` from the scene plan. Image, clip, and voice stages each run up to 3 scenes at once (`SCENE_CONCURRENCY`). Seedance runs when `ARK_API_KEY` is set and `MOCK` is not `1`. It gets the still as `first_frame`, with `duration` equal to `durationSec`, `generate_audio: false`, and no ratio. ElevenLabs speaks `vo` with `voiceId` when its key is set. Each still, clip, and voice line stores `provider`, `model`, and `providerLabel`, and the orchestrator emits `media.progress` with `sceneId` for that step. ffmpeg fits every clip to its voiceover (freeze the last frame, or trim with `-t`), concats the scenes, and writes a 9:16 faststart mp4. `BACKGROUND_MUSIC_URL` is optional; the voice is split with `asplit` so `sidechaincompress` and the mix can both use it. Regenerating a scene's image rebuilds that scene's clip and then the final cut. A clip or voice regenerate keeps the other steps and the other scenes, then re-concats. `MOCK=1` keeps placeholder media and skips ffmpeg.

Live clips are Seedance 2.5 (`dreamina-seedance-2-5-260628`) image-to-video. The first frame is `role: first_frame`. A still stored on this server is sent as `data:image/png;base64,...` so BytePlus does not have to fetch localhost. Do not send `ratio` or `--ratio` with a first frame (400 `TaskTypeConstraint`); the clip follows the image. The body sets `duration`, `resolution` (default `720p`), and `generate_audio: false`. Poll `GET /contents/generations/tasks/{id}` about every 8 seconds until `succeeded`, then read `content.video_url`.

Voice is the ElevenLabs bank in `packages/shared/voicePresets.ts` (`VOICE_PRESETS`, type `VoiceBankPreset`). All eleven lines use `eleven_multilingual_v2`. `VoicePreset` is the older persisted `/v1/voices` row and is not replaced. `VOICE_PRESETS_JSON` still overrides the live catalogue. Narration for a 5 second scene should stay around 15 words. The ffmpeg assembler freezes the last frame (`tpad=stop_mode=clone`) so a short clip lasts as long as the voiceover.

`GET /v1/videos/:id` includes `scenePlan` (`ScenePlan` / `PlannedScene` from the craft-skill plan). `POST /v1/videos/:id/regenerate` takes `{ sceneId, target: image|clip|voice, feedback? }`. A final artefact has `url` and `downloadUrl`. `GET /v1/videos/:id/download` sends `Content-Disposition: attachment`.

`npm run test:media` runs the ports with `MOCK=1`.

| Variable | Role |
|---|---|
| `MOCK` | `1` mocks ImageGen, ClipGen, VoiceGen, and the cast adapter. |
| `IMAGE_MOCK`, `CLIP_MOCK`, `VOICE_MOCK`, `CAST_MOCK` | Per-port override. `1` forces mock, `0` forces the live adapter. |
| `OPENAI_API_KEY` | Bearer token for gpt-image-2. Server-side only. |
| `ARK_API_KEY` | Bearer token for Seedance. Server-side only. Seedream uses it only when `IMAGE_PROVIDER=ark`. |
| `IMAGE_PROVIDER` | Blank defaults to gpt-image-2. `ark` selects Seedream. `mock` forces placeholders. |
| `SEEDREAM_MODEL` | Unused unless `IMAGE_PROVIDER=ark`. Default `seedream-5-0-260128`. |
| `SEEDANCE_MODEL` | Seedance model id. Default `dreamina-seedance-2-5-260628`. |
| `ELEVENLABS_API_KEY` | ElevenLabs `xi-api-key`. Server-side only. |
| `VOICE_PRESETS_JSON` | JSON array that replaces the voice catalogue. Each item needs `id` and `elevenlabsVoiceId`. |
| `CLIP_RESOLUTION` | Seedance tier. `480p`, `720p` (default), `1080p`, or `4k`. |
| `PUBLIC_BASE_URL` | Prefix for stored media and the final download URL. |
| `MEDIA_ROOT` | Directory for generated images. Default `server/data/media`. |
| `MEDIA_DIR` | Directory for live voice bytes. Default `server/data/media/voice`. |

## Saturday primary build

Today’s room demo is specified in **[docs/core](docs/core/CHECKLIST.md)**: a vernacular Learning coach. Five drills, tap-to-play voice, typing that always works, a scorecard in Replit DB. Public mobile URL by about 16:00 IST. About 20 users before 19:30. The Chotu kids version in [docs/04](docs/04-chotuchotu-studio.md) opens only if that main path is live by 14:00 IST.

[Shared orchestration](docs/09-shared-orchestration.md), [tomorrow’s approach](docs/10-tomorrow-problem-approach.md), and [D8](docs/06-unified-ideas.md) name Shopping AI as the earlier default demo. Use `docs/core` for the coach the room is building.

## Event

| | |
|---|---|
| When | Saturday 24 October 2026 |
| Where | Polaris School of Technology, DivyaSree Technopark A3, EPIP Zone, Brookefield, Bengaluru |
| Organiser | Airtribe |
| Frame | 12 hours, AI-first live product, about 20 real users outside the team, teams of 2–5 |
| Tracks | Learning · Commerce · Builders · Creators |
| Prize | ₹3.5L cash + Airtribe program credits; finalists pitch for investment intent |
| Title partner | Pine Labs — keynote *“The New OS for Commerce: Building the Agent Ecosystem”* (Sanjeev Kumar) |
| Venture partner | Peer Capital (Karthik Prabhakar, judge) |

Official track briefs and the partner roster are **CONFIRM**. Numbered booth challenges from Pine Labs, ElevenLabs, Vobiz, Replit, Render, Greptile, and Peer Capital were **not published** as of 23 October 2026. Those problem shapes are **INFER**. The rule is spelled out in [docs/05-partner-stack-architecture.md](docs/05-partner-stack-architecture.md) and in the [problem-statement archive](docs/research/builders-day-partner-problem-statements.md).

## Idea index

| Doc | Idea | Track | Status in this repo |
|---|---|---|---|
| [Saturday core pack](docs/core/CHECKLIST.md) | Vernacular Learning coach. Five drills, ElevenLabs tap-to-play, typing always, scorecard as the user counter. Chotu kids slice only after the 14:00 gate. | Learning / Saturday build | Saturday spec, docs only |
| [Shopping AI](docs/01-shopping-ai.md) | Broad buy / shortlist / agentic checkout. Any category. Pine Labs closes the loop. | Commerce | Architecture draft |
| [Saturday Shopping components](docs/08-shopping-ai-saturday-components.md) | Named component list and 2-coder ownership for the Saturday Shopping AI build. Host is Replit-only (D1). Does not retire Grocery, visual learning, or Chotuchotu. | Commerce / Saturday build | Day-of stub |
| [Grocery AI](docs/02-grocery-ai-cadences.md) | Household replenishment on **daily / weekly / monthly** cadences, vendors, and payment. | Commerce (vertical) | Architecture draft |
| [PDF → visual learning](docs/03-visual-learning-pdf.md) | Syllabus or PDF page becomes a grounded visual lesson and a quiz. | Learning | Architecture draft |
| [Chotuchotu](docs/04-chotuchotu-studio.md) | Existing private video studio (“checkout autoshort”). Audio is the gap. ElevenLabs, with Vobiz as a stretch. Saturday slice: [Saturday walkthrough](docs/04-chotuchotu-studio.md#saturday-walkthrough). | Creators | Architecture draft; studio internals **UNKNOWN** here |
| [Shared orchestration](docs/09-shared-orchestration.md) | Lite DAG for Saturday: supervisor routes, then Ranker / Checkout / Verify (Shopping) or Script / Voice / Verify (Chotu). AI SDK runtime. Not an agentswitch port. | Shared / Saturday build | Locked extract |
| [Tomorrow’s approach](docs/10-tomorrow-problem-approach.md) | Eight steps for any booth card. Default demo is Shopping AI; pivot keeps the same orchestration pattern. | Saturday build | Locked extract |
| [Backlog demos](docs/07-backlog-demos.md) | L1 Interview Drill Coach, B1 Multiplayer Prompt Room, B3 Small Software Deploy, CR1 Clip Autopilot | Learning / Builders / Creators | Backlog, not first-class |
| [Chotu mini](docs/11-chotu-mini.md) | Expo + Node kids explainer short-video maker (Script → Images → Voice → Render → Verify). Mock mode for booth. | Creators / Saturday build | **Runnable** `app/` + `server/` |

Shopping AI and Grocery AI are both Commerce. They are different products. Grocery is the recurring-cadence vertical. Shopping AI is the open-category agent that can check out. Read both before treating one as a mode of the other.

## How to read these docs

1. **Building today.** [docs/core checklist](docs/core/CHECKLIST.md), then the seven specs in `docs/core/` in order.
2. **Ten minutes on the portfolio.** This page, then [the single-pane matrix](docs/06-unified-ideas.md).
3. **Portfolio thesis and non-goals.** [Overview](docs/00-overview.md). TableTalk is named there once and stays out of this repo.
4. **One product.** Its idea doc (`docs/01`–`docs/04`), then the partner sections it cites in [partner architecture](docs/05-partner-stack-architecture.md). Saturday Shopping build: [component stub](docs/08-shopping-ai-saturday-components.md) and [shared orchestration](docs/09-shared-orchestration.md). Chotu on Saturday: the [Saturday walkthrough](docs/04-chotuchotu-studio.md#saturday-walkthrough) inside the studio doc.
5. **Day-of method.** [How to approach any problem tomorrow](docs/10-tomorrow-problem-approach.md), then the [orchestration decision memo](docs/research/agent-orchestration-memo.md) if you need the framework comparison.
6. **Architecture review (Saturn / Gaia).** Start at [partner architecture](docs/05-partner-stack-architecture.md), work the open questions at the bottom of each idea doc, and write decisions into the stubs in [unified ideas](docs/06-unified-ideas.md).
7. **Citations.** [docs/research/](docs/research/) is the archive (VC demand, partners and market, CONFIRM vs INFER problem cards, and the Neptune orchestration memo). Idea docs cite those files instead of restating every source URL.

## Map

```
README.md
docs/README.md
docs/core/CHECKLIST.md
docs/core/01-product-requirements.md
docs/core/02-technical-requirements.md
docs/core/03-app-flow.md
docs/core/04-design-brief.md
docs/core/05-backend-schema.md
docs/core/06-implementation-plan.md
docs/core/07-tools-provided.md
docs/00-overview.md
docs/01-shopping-ai.md
docs/02-grocery-ai-cadences.md
docs/03-visual-learning-pdf.md
docs/04-chotuchotu-studio.md
docs/05-partner-stack-architecture.md
docs/06-unified-ideas.md
docs/07-backlog-demos.md
docs/08-shopping-ai-saturday-components.md
docs/09-shared-orchestration.md
docs/10-tomorrow-problem-approach.md
docs/11-chotu-mini.md
app/   Expo client (web + Expo Go)
server/  Node pipeline + job API
docs/research/builders-day-vc-research.md
docs/research/builders-day-partners-and-market.md
docs/research/builders-day-partner-problem-statements.md
docs/research/agent-orchestration-memo.md
```

## Labels used everywhere

| Label | Meaning |
|---|---|
| **CONFIRM** | Published for this 24 October 2026 event (Airtribe brief, named partner, keynote title, toolkit roster). |
| **INFER** | Plausible booth problem drawn from public product docs and prior hackathon behavior. Not a numbered challenge handed out for this event. |
| **PROPOSAL** | An architecture choice written here so it can be criticised. Not a build decision. |
| **UNKNOWN** | Not in the research archive and not inspectable from this repo (notably Chotuchotu’s private codebase). |

## Source memos

- [VC demand + five ideas per track](docs/research/builders-day-vc-research.md)
- [Partners, market gaps, earlier top bets](docs/research/builders-day-partners-and-market.md)
- [Partner problem statements (CONFIRM vs INFER)](docs/research/builders-day-partner-problem-statements.md)
- [Agent orchestration decision memo (Neptune)](docs/research/agent-orchestration-memo.md)
