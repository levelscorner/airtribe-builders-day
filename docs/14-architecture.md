# 14. Architecture: chat-first video studio

Status: agreed for parallel build (Builders Day Track 04). Based on [`docs/13-requirements-v2.md`](./13-requirements-v2.md). Where this and older docs disagree, **13 + 14 win**.

> Target monorepo below. Today’s tree still has `app/` + `server/` from PR #6 (step-by-step flow). Migration tickets land the folders and owners in §1.

**Parallel owners:** Gaia (app), Neptune (media), Venus (creative), Mars (render/credits/deploy), Saturn (orchestrator/db/integration). Codex + humans pick tickets from §6.

---

## 1. Monorepo layout (one owner per folder)

```
/
├── apps/
│   └── mobile/                 # Gaia — Expo (web + Expo Go)
│       ├── App.tsx
│       ├── src/
│       │   ├── chat/           # message list, composer, SSE client
│       │   ├── screens/        # signup, packs, player, admin link
│       │   └── api.ts          # typed client from @chotu/shared
│       └── package.json
├── server/                     # Node + TypeScript (Express)
│   ├── src/
│   │   ├── orchestrator/       # Saturn — chat state machine
│   │   ├── db/                 # Saturn — migrations, queries, seed
│   │   ├── routes/             # Saturn — REST + SSE wiring
│   │   ├── integrations/       # Saturn — AgenticOrg script critic
│   │   ├── creative/           # Venus
│   │   │   ├── genres/         # genre configs (kids | ad | faceless)
│   │   │   ├── intake/         # brief clarifying questions
│   │   │   ├── script/         # ScriptGen (+ chotu-craft skills)
│   │   │   └── prompts/        # PromptGen (image + video prompts)
│   │   ├── media/              # Neptune
│   │   │   ├── higgsfield/     # ImageGen, ClipGen, Reference Elements
│   │   │   ├── elevenlabs/     # VoiceGen (+ preset catalogue)
│   │   │   └── cast/           # cast bank create / lock / attach
│   │   ├── render/             # Mars — ffmpeg assemble + captions
│   │   ├── credits/            # Mars — reserve / settle / refund
│   │   ├── payments/           # Mars — Pine Labs packs
│   │   ├── admin/              # Mars — /admin HTML + CSV
│   │   └── deploy/             # Mars — Replit start, static Expo web
│   └── package.json
├── packages/
│   └── shared/                 # Saturn owns contract; all consume
│       ├── package.json        # name: @chotu/shared
│       └── types.ts            # REST + SSE + module interfaces
├── docs/
│   ├── 13-requirements-v2.md
│   └── 14-architecture.md      # this file
└── package.json                # workspaces: apps/*, server, packages/*
```

| Path | Owner | Responsibility |
|---|---|---|
| `apps/mobile/**` | **Gaia** | Chat UI, approval cards, progress, player, signup, packs UI. Consumes `@chotu/shared` only — no provider secrets in the client. |
| `server/src/media/**` | **Neptune** | Higgsfield API (images, clips, Reference Elements), ElevenLabs TTS, cast element create/list. `MOCK=1` adapters mandatory. |
| `server/src/creative/**` | **Venus** | Genre configs, brief intake, ScriptGen, PromptGen. Loads **chotu-craft** skills server-side only (never ship to client). |
| `server/src/render/**`, `credits/**`, `payments/**`, `admin/**`, `deploy/**` | **Mars** | ffmpeg final cut, credit ledger, Pine Labs, traction admin, Replit single-process start. |
| `server/src/orchestrator/**`, `db/**`, `routes/**`, `integrations/agenticorg/**`, `packages/shared/**` | **Saturn** | Stage machine, Postgres schema/migrations, HTTP+SSE contract, AgenticOrg script critic, wiring modules together. |

**Rules for parallel work**
- Do not edit another owner’s folder without a ticket that names both owners.
- Cross-boundary changes go through `packages/shared/types.ts` first (Saturn merges the type PR; others implement against it).
- `MOCK=1` must keep the full chat → HITL → final cut path green without real keys.

---

## 2. Orchestrator (chat-driven state machine)

Saturn owns `server/src/orchestrator`. One **video** (job) rides one **chat**. The UI never drives stages directly — it posts chat actions; the orchestrator advances state and emits SSE events.

### Stages

```
brief → cast → script → prompts → images → clips → audio → final → done
```

| Stage | Meaning | Exit when |
|---|---|---|
| `brief` | Clarifying questions (genre, ratio, length, language, audience, art style, cast pick) | Brief answers saved (or defaults / skip) |
| `cast` | Pick bank members and/or create new (HITL on identity, sheet, voice) | Selected cast approved & attached (`video_cast`) |
| `script` | Scenes + narration, then the AgenticOrg critic | Script artefact `approved` |
| `prompts` | Per-scene image + video prompts | All prompt artefacts `approved` |
| `images` | Per-scene keyframe | All image artefacts `approved` |
| `clips` | Per-scene clip (or Ken Burns still if clips off) | All clip artefacts `approved` |
| `audio` | Per-scene voice | All audio artefacts `approved` |
| `final` | Assembled MP4 + captions | Final artefact `approved` |
| `done` | Download / share; optional pack purchase | Terminal |

**Script critic (active).** After ScriptGen, Saturn calls AgenticOrg: `POST https://agenticorg.hackathon.pinelabs.com/api/v1/agents/{AGENTICORG_AGENT_ID}/run`. The result is `AgentReview` on the script artefact (`packages/shared/types.ts`, also `payload.agentReview`). `hitl_triggered` keeps the artefact `awaiting_approval`. `failed`, `budget_exceeded`, and HTTP 200 with `status: failed` are non-blocking: store the mock review plus a warning, and still wait for the creator. `MOCK=1`, or a blank `AGENTICORG_API_KEY` / `AGENTICORG_AGENT_ID`, uses that mock and does not call out.

### Artefact lifecycle

Every generated artefact (`script`, `prompt`, `image`, `clip`, `audio`, `final`, plus cast sub-artefacts `identity`, `sheet`, `anchor`, `voice_sample`) has:

```
pending → generating → awaiting_approval → approved
                              ↘ rejected → (regenerate) → generating → …
```

| State | Meaning |
|---|---|
| `pending` | Queued; prerequisites not ready or not started |
| `generating` | Module running (LLM / Higgsfield / ElevenLabs / ffmpeg) |
| `awaiting_approval` | Shown in chat as an **approval card** |
| `approved` | Locked; downstream may start |
| `rejected` | Note stored; must regenerate or edit before stage can exit |

### Actions (API + chat)

| Action | Effect |
|---|---|
| `approve` | Artefact → `approved`; log `approvals` + `events` |
| `reject` | Body `{ note }`; artefact → `rejected` |
| `regenerate` | **Show credit cost first** (`creditCost` on the card / `POST .../regenerate` preview). On confirm: debit/reserve, artefact → `generating`, replace payload |
| `approve_all_remaining` | Approve every `awaiting_approval` artefact in the **current stage** (demo speed). Does not skip future stages |

Only **approved** artefacts unlock the next stage. Per-scene stages (`prompts`…`audio`) require all scenes approved (or `approve_all_remaining`).

### Chat emission (high level)

1. Orchestrator enters stage → emits `progress` + may emit `question` (brief) or kick `generating`.
2. Module finishes → artefact `awaiting_approval` → SSE `approval` card.
3. User action → REST → orchestrator transitions → SSE updates.
4. Stage complete → advance stage → repeat until `done` → SSE `video`.

---

## 3. Postgres schema

Saturn owns migrations under `server/src/db/migrations`. IDs are `uuid` unless noted. Timestamps `timestamptz`.

```sql
-- users
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  phone_or_email  text UNIQUE,
  credit_balance  integer NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- chats (one active production chat per video; reopen allowed)
CREATE TABLE chats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  video_id        uuid,                         -- filled once video row exists
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- messages (append-only chat transcript; also mirrored over SSE)
CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  kind            text NOT NULL CHECK (kind IN (
                    'text', 'question', 'approval', 'progress', 'video'
                  )),
  body            jsonb NOT NULL,               -- ChatMessage payload
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_chat_created ON messages(chat_id, created_at);

-- videos (one production job)
CREATE TABLE videos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  chat_id         uuid NOT NULL REFERENCES chats(id),
  genre           text NOT NULL CHECK (genre IN ('kids', 'ad', 'faceless')),
  language        text NOT NULL CHECK (language IN ('hi', 'hinglish', 'en')),
  aspect_ratio    text NOT NULL DEFAULT '9:16',
  resolution      text NOT NULL DEFAULT '1080p' CHECK (resolution IN ('720p', '1080p')),
  target_seconds  integer NOT NULL DEFAULT 45,
  art_style       text,
  brief           jsonb NOT NULL DEFAULT '{}',
  stage           text NOT NULL DEFAULT 'brief' CHECK (stage IN (
                    'brief', 'cast', 'script', 'prompts', 'images',
                    'clips', 'audio', 'final', 'done'
                  )),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN (
                    'active', 'failed', 'cancelled', 'done'
                  )),
  output_url      text,
  reserved_credits integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- scenes
CREATE TABLE scenes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx             integer NOT NULL,
  title           text,
  narration       text,
  duration_ms     integer,
  doubts          jsonb NOT NULL DEFAULT '[]',
  UNIQUE (video_id, idx)
);

-- artefacts (any HITL unit)
CREATE TABLE artefacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  scene_id        uuid REFERENCES scenes(id) ON DELETE CASCADE,  -- null for whole-video
  kind            text NOT NULL CHECK (kind IN (
                    'identity', 'sheet', 'anchor', 'voice_sample',
                    'script', 'prompt', 'image', 'clip', 'audio', 'final'
                  )),
  state           text NOT NULL DEFAULT 'pending' CHECK (state IN (
                    'pending', 'generating', 'awaiting_approval',
                    'approved', 'rejected'
                  )),
  payload         jsonb NOT NULL DEFAULT '{}',  -- urls, prompt text, etc.
  credit_cost     integer NOT NULL DEFAULT 0,   -- shown before regenerate
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artefacts_video_kind ON artefacts(video_id, kind, state);

-- approvals (traction + audit)
CREATE TABLE approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artefact_id     uuid NOT NULL REFERENCES artefacts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id),
  action          text NOT NULL CHECK (action IN (
                    'approve', 'reject', 'regenerate', 'approve_all_remaining'
                  )),
  note            text,
  credit_charged  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- voices (4 MVP presets)
CREATE TABLE voices (
  id              text PRIMARY KEY,             -- our preset key, e.g. warm_kid_female
  elevenlabs_voice_id text NOT NULL,
  label           text NOT NULL,
  language_hint   text NOT NULL,
  stability       real NOT NULL DEFAULT 0.4,
  style           real NOT NULL DEFAULT 0.2,
  default_cast_name text,
  is_preset       boolean NOT NULL DEFAULT true
);

-- cast bank
CREATE TABLE cast_members (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id           uuid REFERENCES users(id),   -- null = system preset
  name                    text NOT NULL,
  role                    text NOT NULL CHECK (role IN (
                            'mascot', 'presenter', 'hero', 'product', 'narrator'
                          )),
  identity_text           text NOT NULL,
  dna_chips               jsonb NOT NULL DEFAULT '[]',
  art_style               text,
  sheet_url               text,
  anchor_url              text,
  higgsfield_element_id   text,
  voice_id                text REFERENCES voices(id),
  version                 integer NOT NULL DEFAULT 1,
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'approved', 'archived'
                          )),
  is_preset               boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cast_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id         uuid NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('sheet', 'anchor', 'sample_audio')),
  url             text NOT NULL,
  approved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE video_cast (
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  cast_id         uuid NOT NULL REFERENCES cast_members(id),
  cast_version    integer NOT NULL,
  PRIMARY KEY (video_id, cast_id)
);

CREATE TABLE scene_cast (
  scene_id        uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  cast_id         uuid NOT NULL REFERENCES cast_members(id),
  PRIMARY KEY (scene_id, cast_id)
);

-- credit ledger (lite auto-shorts port): 1 credit = $0.01, 60% margin, round up
CREATE TABLE credit_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  ref             text NOT NULL UNIQUE,         -- idempotency key
  delta           integer NOT NULL,             -- +pack / -spend / +refund
  reason          text NOT NULL CHECK (reason IN (
                    'signup_grant', 'pack_purchase', 'reserve', 'settle',
                    'refund', 'regenerate', 'cast_create'
                  )),
  video_id        uuid REFERENCES videos(id),
  meta            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  pack_id         text NOT NULL,
  credits         integer NOT NULL,
  amount_inr      integer NOT NULL,
  provider        text NOT NULL DEFAULT 'pine_labs',
  provider_ref    text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'paid', 'failed', 'mocked'
                  )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- traction / audit stream (also feeds /admin CSV)
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id),
  video_id        uuid REFERENCES videos(id),
  kind            text NOT NULL CHECK (kind IN (
                    'signup', 'chat_started', 'stage_enter', 'approval',
                    'reject', 'regenerate', 'payment', 'render_done',
                    'download', 'agent_activity'
                  )),
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_created ON events(created_at DESC);
```

**FK note:** after `videos` insert, set `chats.video_id` (or create chat+video in one Saturn transaction).

---

## 4. REST + SSE contract (`packages/shared`)

Source of truth: [`packages/shared/types.ts`](../packages/shared/types.ts). Summarised here.

### Chat message kinds (SSE + persisted `messages.body`)

| Kind | Purpose |
|---|---|
| `text` | Plain assistant/user prose |
| `question` | Brief intake chip/free-text question |
| `approval` | HITL card for one artefact (or batch) |
| `progress` | Stage / agent activity line |
| `video` | Final (or preview) playable URL |

### HTTP endpoints

| Method | Path | Owner | Notes |
|---|---|---|---|
| `POST` | `/v1/users` | Saturn | Signup; optional starter credits |
| `GET` | `/v1/me` | Saturn | User + balance |
| `POST` | `/v1/chats` | Saturn | Start chat (+ video row at brief) |
| `GET` | `/v1/chats/:id/messages` | Saturn | History |
| `POST` | `/v1/chats/:id/messages` | Saturn | User text / question answers |
| `GET` | `/v1/chats/:id/events` | Saturn | **SSE** stream of `ChatMessage` + heartbeats |
| `POST` | `/v1/artefacts/:id/approve` | Saturn | |
| `POST` | `/v1/artefacts/:id/reject` | Saturn | `{ note }` |
| `POST` | `/v1/artefacts/:id/regenerate` | Saturn | Query `?confirm=0` returns cost; `confirm=1` runs |
| `POST` | `/v1/videos/:id/approve-all-remaining` | Saturn | Current stage only |
| `GET` | `/v1/cast` | Neptune+Saturn | Presets + user’s bank |
| `POST` | `/v1/cast` | Neptune | Start create-via-chat (orchestrator may own UX) |
| `GET` | `/v1/voices` | Neptune | 4 presets |
| `GET` | `/v1/videos/:id` | Saturn | Stage + artefacts summary |
| `GET` | `/v1/videos/:id/download` | Mars | Final MP4 |
| `GET` | `/v1/packs` | Mars | Credit packs |
| `POST` | `/v1/packs/checkout` | Mars | Pine Labs (mock when `MOCK=1`) |
| `POST` | `/v1/packs/webhook` | Mars | Provider callback |
| `GET` | `/admin` | Mars | HTML traction |
| `GET` | `/admin/export.csv` | Mars | CSV |

### Module interfaces (server; each has mock when `MOCK=1`)

| Interface | Owner | Role |
|---|---|---|
| `ScriptGen` | Venus | Brief + cast → script artefact + scenes |
| `PromptGen` | Venus | Script scene → imagePrompt + videoPrompt |
| `ImageGen` | Neptune | Prompt + element ids → keyframe URL |
| `ClipGen` | Neptune | Image + video prompt → clip URL (or stub) |
| `VoiceGen` | Neptune | Narration + voice_id → audio URL |
| `Renderer` | Mars | Scenes (clips + audio + captions) → MP4 |
| `Credits` | Mars | reserve / settle / refund / quote |
| `Payments` | Mars | createCheckout / handleWebhook |

Factories: `createX(env) → X`. When `process.env.MOCK === '1'`, return the mock implementation (deterministic, offline, no network).

---

## 5. Env vars and Replit handoff

### Environment

| Variable | Required | Owner | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes (prod) | Saturn | Postgres connection string |
| `HIGGSFIELD_API_KEY` | yes (live) | Neptune | Images, clips, Reference Elements (**API key, not MCP**) |
| `ELEVENLABS_API_KEY` | yes (live) | Neptune | TTS |
| `LLM_API_KEY` | yes (live) | Venus/Saturn | Orchestrator + ScriptGen + PromptGen |
| `LLM_BASE_URL` | no | Venus/Saturn | OpenAI-compatible base |
| `LLM_MODEL` | no | Venus/Saturn | Default model id |
| `PINE_LABS_MERCHANT_ID` | live pay | Mars | Checkout |
| `PINE_LABS_API_KEY` | live pay | Mars | Checkout |
| `PINE_LABS_WEBHOOK_SECRET` | live pay | Mars | Verify webhook |
| `RENDER_API_KEY` | stretch | Mars | Trigger Render Workflow ffmpeg; if unset, local/Replit ffmpeg |
| `MOCK` | demo | all | `1` = all modules mock; no external calls |
| `AGENTICORG_API_KEY` | live critic | Saturn | AgenticOrg bearer token. Blank → mock review |
| `AGENTICORG_AGENT_ID` | live critic | Saturn | Agent id for `POST /api/v1/agents/{AGENTICORG_AGENT_ID}/run`. Blank → mock review |
| `PORT` | no | Mars | Default `8787` |
| `PUBLIC_BASE_URL` | prod | Mars | Absolute URLs for media + SSE |
| `STARTER_CREDITS` | no | Mars | Signup grant (open question in reqs) |

`.env` stays out of git. Replit **Secrets** mirror the table above.

### Replit handoff (Mars)

1. **Build in GitHub** on feature branches / PRs (this repo). Do not treat Replit as the source of truth for code.
2. **Import** the GitHub repo into a Replit Node repl (or connect GitHub).
3. Attach **Replit Postgres**; copy its URL into Secret `DATABASE_URL`. Run Saturn migrations on boot (or `npm run db:migrate`).
4. Set Secrets for keys; set `MOCK=1` until keys exist.
5. **Single start command** (Mars `server/src/deploy`):
   - build Expo web into `server/public/` (or symlink `apps/mobile` dist),
   - start Express on `PORT`,
   - serve `/v1/*` API + SSE, static web at `/`, media under `/media`.
6. Example: `"start": "node server/dist/deploy/start.js"` after `tsc` + `expo export -p web`.
7. Share the Replit URL as the demo link (web). Expo Go points `EXPO_PUBLIC_API_URL` at the same host.

---

## 6. Task board

Ordered within each owner. **Deps** must be Done before starting. **Suit:** Codex = mechanical/scaffold/tests; Human = product judgement, keys, design, live provider tuning.

### Saturn — contract & spine

| ID | Ticket | Deps | Suit |
|---|---|---|---|
| S0 | Land `packages/shared` + `types.ts` (this PR) | — | Codex |
| S1 | Move to workspaces; stub `server/src/{orchestrator,db,routes}` | S0 | Codex |
| S2 | SQL migrations for full schema §3 + seed voices + preset cast | S1 | Codex |
| S3 | Users/chats/messages REST + SSE skeleton | S2 | Codex |
| S4 | Stage machine + artefact state transitions + approve/reject/regenerate/approve-all | S3 | Codex |
| S5 | Wire module ports (inject Venus/Neptune/Mars) | S4, V1, N1, M1 | Human+Codex |
| S6 | Integration smoke: `MOCK=1` brief→done | S5 | Codex |

### Gaia — app

| ID | Ticket | Deps | Suit |
|---|---|---|---|
| G0 | Relocate `app/` → `apps/mobile`; typed API client from `@chotu/shared` | S0 | Codex |
| G1 | Signup + chat shell (message list, composer) | G0, S3 | Codex |
| G2 | Render `question` chips + free text | G1 | Human+Codex |
| G3 | Approval card UI (approve / reject+note / regenerate+cost / approve-all) | G1, S4 | Human+Codex |
| G4 | Progress + agent activity lines; final `video` player | G3 | Codex |
| G5 | Packs / balance screen | G4, M3 | Codex |

### Venus — creative

| ID | Ticket | Deps | Suit |
|---|---|---|---|
| V0 | Genre config JSON (kids / ad / faceless) + intake question lists | S0 | Human+Codex |
| V1 | `ScriptGen` interface + mock | S0 | Codex |
| V2 | Load chotu-craft skills server-side (private path / submodule) | V1 | Human |
| V3 | Live ScriptGen via LLM + doubts flags | V2, S4 | Human+Codex |
| V4 | `PromptGen` + mock; per-scene image/video prompts with `<<<element_id>>>` | V1, N2 | Codex |
| V5 | Live PromptGen using image-prompt / video-prompt skills | V2, V4 | Human |

### Neptune — media & cast

| ID | Ticket | Deps | Suit |
|---|---|---|---|
| N0 | Higgsfield REST client (image, element create/get); drop MCP for visuals | S0 | Codex |
| N1 | `ImageGen` / `ClipGen` / `VoiceGen` mocks | S0 | Codex |
| N2 | Cast bank CRUD + sheet/anchor generation path (mock first) | N1, S2 | Codex |
| N3 | Live ImageGen + Element attach; face-anchor-only for one-ref models | N0, N2 | Human+Codex |
| N4 | Live VoiceGen; pick 4 ElevenLabs voice IDs into `voices` seed | N1 | Human |
| N5 | ClipGen live or Ken Burns fallback flag | N3, M2 | Human |

### Mars — render, money, deploy

| ID | Ticket | Deps | Suit |
|---|---|---|---|
| M0 | `Credits` + `Payments` interfaces + mocks; ledger `ref UNIQUE` | S0, S2 | Codex |
| M1 | `Renderer` mock (concat silence + colour frames OK) | S0 | Codex |
| M2 | ffmpeg Renderer: clips/stills + audio + captions → 9:16 MP4 | M1 | Codex |
| M3 | Pine Labs checkout + webhook (mock default); packs API | M0 | Human+Codex |
| M4 | `/admin` + CSV export from `events` | S2 | Codex |
| M5 | Replit start: API + Expo web static; Secrets doc | G0, S3, M2 | Human+Codex |
| M6 | Optional Render Workflow job when `RENDER_API_KEY` set | M2 | Codex |

### Critical path (demo)

```
S0 → S1 → S2 → S3 → S4
 G0 → G1 → G3
 V0 → V1    N1 → N2    M0 → M1 → M2
         ↘     ↓      ↙
              S5 → S6 (MOCK=1 E2E)
                   M5 (Replit URL)
```

Live keys (N3, N4, M3, V3) can land after S6 without blocking the demo path.

---

## 7. Non-goals (today)

Subscriptions, auto-post, >60s videos, voice cloning, Soul training, MCP for Higgsfield (API key only). AgenticOrg is active as the script critic (see §2).

## 8. Open questions (carry from reqs §13)

Still open: orchestrator LLM choice, product photo → prop Element, stills vs clips default, exact ElevenLabs IDs, starter credits, product name. Record answers in this doc when decided; do not block S0–S6 / G0–G3 / mocks.
