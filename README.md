# Airtribe AI Builders Day — product portfolio

Documentation for the ideas Abhinav is keeping in play for **Airtribe AI Builders Day** (Saturday 24 October 2026, Bengaluru) and for the weeks after. The repo now also holds the Track 04 **Chotu Studio** app (`apps/mobile` + `server`).

## Chotu Studio (supported client)

**Supported UI:** [`apps/mobile`](apps/mobile) (Expo web + Expo Go). It talks to Saturn `/v1` (REST + SSE).

```bash
npm run install:all
npm run mobile:export          # Expo web → apps/mobile/dist
MOCK=1 npm start               # /v1 API + static Expo web (default PORT 8787)
```

The web client has an independent conversation-first interface: a prompt and local reference attachments, one replacing configuration box, a single completed plan summary, script approval/revision, and a right-hand visual canvas. Native screens remain separate. `chat_canvas` is an opt-in experience in the existing `/v1` contract, so other clients retain their flow.

Run browser flow checks with `npm --prefix apps/mobile run test:web` against the server above. `npm run test:orchestrator` covers script-first approvals, targeted revisions, refresh recovery, and configuration persistence. See [DESIGN.md](DESIGN.md) for the web design system.

This preview uses sample generation and credits. Attachments remain in the current browser; the sample generator does not read them. Actual script/frame generation is awaiting the teammate-owned provider integration and must be verified after those changes are available.

Legacy Chotu mini (`app/` → `/api/jobs`) is still available via a separate process:

```bash
npm run start:legacy           # old Express /api/jobs server (server/src/index.ts)
npm run app                    # Expo app against that API
```

See [`docs/14-architecture.md`](docs/14-architecture.md) and [`docs/16-checklist.md`](docs/16-checklist.md).

Four ideas stay first-class in the portfolio. A short backlog records earlier demo shapes that are still available if a booth challenge or the team’s skills pull that way.

## Chotu Studio media ports

Neptune's adapters live in `server/src/media`. They implement `ImageGen`, `ClipGen`, and `VoiceGen` from [`packages/shared/types.ts`](packages/shared/types.ts). `createMediaPorts(env)` returns those ports plus a cast reference adapter. `MOCK=1` completes a job immediately with the same job fields the live adapters use (`jobId`, `provider`, `status`, `result`, `error`, `costCredits`, `idempotencyKey`) and a placeholder file under `server/public/mock/`.

Cast stays REST-only. Higgsfield Reference Elements are not on the public REST API, so `higgsfieldElementId` is `ref:` plus the encoded face-anchor URL. Keyframes call `alibaba/qwen-image-3/edit` with that anchor and the identity text. A scene with no cast calls `alibaba/qwen-image-3/text-to-image`. One character clip calls `bytedance/seedance-2.0/image-to-video` from the approved keyframe. Two or more characters call `bytedance/seedance-2.0/reference-to-video`. `generate_audio` is false because ElevenLabs owns the soundtrack. An MCP Elements adapter can replace `createCastAdapter` later without renaming the field.

Voice presets are provisional Hindi library ids (Mini, Chintu, Riya, Narrator). Final lines use `eleven_multilingual_v2`. Cast-gate samples use `eleven_flash_v2_5`. Both go through `/v1/text-to-speech/{voice_id}/with-timestamps`, and the result includes character alignment in milliseconds for captions. Replace the catalogue with `VOICE_PRESETS_JSON` after the voices are confirmed in the ElevenLabs account.

`npm run test:media` runs the ports with `MOCK=1`.

| Variable | Role |
|---|---|
| `MOCK` | `1` mocks ImageGen, ClipGen, VoiceGen, and the cast adapter. No provider calls. |
| `IMAGE_MOCK`, `CLIP_MOCK`, `VOICE_MOCK`, `CAST_MOCK` | Per-port override. `1` forces mock, `0` forces the live adapter. |
| `HIGGSFIELD_API_KEY` | Higgsfield REST credential as `KEY_ID:KEY_SECRET`. Server-side only. `HF_CREDENTIALS` or `HF_KEY` are the same shape. `HF_API_KEY_ID` and `HF_API_KEY_SECRET` are the split form. Sent as `Authorization: Key ID:SECRET`. |
| `ELEVENLABS_API_KEY` | ElevenLabs `xi-api-key`. Server-side only. |
| `VOICE_PRESETS_JSON` | JSON array that replaces the provisional presets. Each item needs `id` and `elevenlabsVoiceId`. |
| `CLIP_RESOLUTION` | Seedance tier when the clip port has no resolution field. `480p`, `720p` (default), `1080p`, or `4k`. |
| `PUBLIC_BASE_URL` | Prefix for mock and stored media URLs. |
| `MEDIA_CONCURRENCY` | Higgsfield submit limit. Default `4`. Polling does not take a slot. |
| `MEDIA_DIR` | Directory for live voice bytes. Default `server/data/media/voice`. Mock mode does not write it. |
| `HF_POLL_TIMEOUT_MS` | Stop polling a Higgsfield request after this many milliseconds. Default `180000`. |

Image credit placeholders on the job are 8 for a still, 40 for a clip, 5 for a final line, and 2 for a voice sample. They are not Higgsfield console prices. Mars replaces them with the ledger quote.

The older `server/src/visuals` path still talks to Higgsfield over MCP for Chotu mini. New studio work should use `server/src/media` and the API key.

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
