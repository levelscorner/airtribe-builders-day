# 16. Track 04 checklist — Chotu Studio

Status snapshot for Builders Day (chat-first video studio). Derived from [`docs/13-requirements-v2.md`](./13-requirements-v2.md) + [`docs/14-architecture.md`](./14-architecture.md). Update statuses when PRs merge.

**Legend:** ✅ done · 🟡 in progress / partial · ⬜ todo · 🔒 blocked on user/keys

**How to run the demo locally / Replit**

```bash
npm run install:all
npm run mobile:export   # Expo web → apps/mobile/dist (HTTP client, same-origin /v1)
MOCK=1 npm start        # migrate (pg-mem) + /v1 + static web on PORT (default 8787)
```

Replit: import this GitHub repo → set Secrets (`MOCK=1` until keys exist; optional `DATABASE_URL`) → start command `MOCK=1 npm start`.

Live Claude (brief, script, prompts, regenerate) without forcing samples:

```bash
# server/.env — names only in git; put the real key in the file or in Replit Secrets
# ANTHROPIC_API_KEY=...
# CLAUDE_MODEL=claude-sonnet-4-5
# LLM_PROVIDER=claude
MOCK=0 npm --prefix server start
```

`npm start` at the repo root sets `MOCK=1` and stays on samples. Web and mobile both read the same SSE chat.

---

## Pending user items (not code)

| Item | Owner | Status | Notes |
|---|---|---|---|
| Higgsfield API key + live prices | Abhinav / Neptune | 🔒 | Needed for N3 live images/clips; MOCK path ships without it |
| ElevenLabs API key + 4 confirmed library voice IDs | Abhinav / Neptune | 🔒 | Seed uses mock voice ids today |
| chotu-craft repo access (private skills) | Abhinav / Venus | 🔒 | Repo 404 here. Placeholders are vendored; swap in the real SKILL.md files when the repo is readable |
| `ANTHROPIC_API_KEY` + optional `CLAUDE_MODEL` for live brief, script, prompts | Abhinav / Saturn | 🔒 | Names only in `.env.example`. `MOCK=1` stays on samples |
| Pine Labs merchant + webhook secret | Abhinav / Mars | 🔒 | Packs checkout stubbed |
| Product name + starter credit amount | Sol / product | 🔒 | `STARTER_CREDITS` defaults to 80 |
| Public demo host (Replit / Render) | Mars / Abhinav | 🟡 | `npm start` ready; publish URL when import done |

---

## Saturn — orchestrator / db / contract

| ID | Task | Status | Evidence |
|---|---|---|---|
| S0 | `packages/shared` + `types.ts` contract | ✅ | PR #8 |
| S0b | `Brief.topic` + regenerate `feedback` | ✅ | PR #17 |
| S0c | `optionIds`, artefact responses, `GET /v1/chats/:id` | ✅ | PR #20 |
| S0d | Approval `generating` state; question answered flag; optional VideoSummary genre/language; approve-all returns artefacts | 🟡 | Queued after preview slice |
| S1 | Workspaces + stub folders | ✅ | Monorepo layout landed with app/server/packages |
| S2 | Postgres schema + migrations + seed voices/cast; `MOCK=1` pg-mem | ✅ | PR #21 |
| S3 | Users/chats/messages REST + SSE | ✅ | PR #22 |
| S4 | Stage machine + HITL approve/reject/regen/approve-all + events | ✅ | PR #22 |
| S5 | Wire Venus creative + Neptune media ports | ✅ | PR #22 (mock path) |
| S6 | `MOCK=1` kids E2E chat → done | 🟡 | `server/src/scripts/e2e-kids-mock.ts` (merge with deploy PR) |
| S7 | Single-process deploy start (API + Expo web) | 🟡 | `server/src/deploy/start.ts` + root `npm start` (PR #24) |
| S8 | Gaia HTTP `StudioClient` against `/v1` | 🟡 | `apps/mobile/src/http-studio.ts` (PR #24) |
| S9 | Per-browser signed cookie sessions + isolation test | ✅ | Fixes #25 on PR #24 |
| S10 | SSE reconnect hydrate + Last-Event-ID replay | ✅ | Fixes #25 on PR #24 |
| S11 | Claude for brief, ScriptGen, PromptGen, regenerate | 🟡 | `LLM_PROVIDER=claude\|mock`. `MOCK=1` samples. SSE unchanged |

---

## Gaia — Expo app

| ID | Task | Status | Evidence |
|---|---|---|---|
| G0 | `apps/mobile` + typed client surface | ✅ | PR #19 |
| G1 | Signup + chat shell | ✅ | PR #19 |
| G2 | Question chips + free text / defaults / skip | ✅ | PR #19 |
| G3 | Approval cards (approve / reject+note / regen cost / approve-all) | ✅ | PR #19 |
| G4 | Progress strip + final video card | ✅ | PR #19 |
| G5 | Packs / balance screen | ⬜ | Depends M3 |
| G6 | Point web build at live `/v1` (not in-process mock) | 🟡 | HTTP client + `mobile:export` |
| G7 | Mobile reject body uses `rejectNote` | ✅ | Follow-up on #19 branch |

---

## Venus — creative + QA

| ID | Task | Status | Evidence |
|---|---|---|---|
| V0 | Genre configs (kids / ad / faceless) + schemas | ✅ | PR #11 |
| V1 | ScriptGen interface + mock | ✅ | PR #13 |
| V2 | Load chotu-craft skills server-side | 🟡 | Placeholder vendor + router. Real repo 404 from this environment |
| V3 | Live ScriptGen via LLM + doubts | ⬜ | After V2 + keys |
| V4 | PromptGen + mock (`<<<el_*>>>` tokens) | ✅ | PR #13 |
| V5 | Live PromptGen with craft skills | 🔒 | After V2 |
| V6 | Brief intake questions | ✅ | PR #12 |
| V7 | Creative unit tests / samples | ✅ | `npm run test:creative` / `sample:creative` |
| V8 | QA pass on MOCK kids path (script → prompts copy) | ⬜ | Human after preview URL |

---

## Neptune — media

| ID | Task | Status | Evidence |
|---|---|---|---|
| N0 | Higgsfield REST client (not MCP) | ✅ | PR #16 |
| N1 | ImageGen / ClipGen / VoiceGen MOCK=1 | ✅ | PR #10 |
| N2 | Cast bank create/list path (mock) | 🟡 | Ports exist; orchestrator uses seed presets |
| N3 | Live ImageGen + Element attach | 🔒 | API key + prices |
| N4 | Live VoiceGen + confirm 4 ElevenLabs IDs | 🔒 | API key + library voices |
| N5 | ClipGen live or Ken Burns fallback | ⬜ | After N3 / M2 |
| N6 | Mock asset placeholders (`/mock/*`) | ✅ | PR #10 |

---

## Mars — render / credits / payments / deploy

| ID | Task | Status | Evidence |
|---|---|---|---|
| M0 | Credits interface + ledger uniqueness | 🟡 | Saturn stub implements `Credits`; Mars owns real ledger |
| M1 | Renderer mock | 🟡 | Orchestrator emits mock final MP4 URL |
| M2 | ffmpeg assemble + captions | ⬜ | Real cut |
| M3 | Pine Labs packs checkout + webhook | ⬜ | `/v1/packs` list stub only |
| M4 | `/admin` + CSV from events | ⬜ | |
| M5 | Replit single start: API + Expo web | 🟡 | `MOCK=1 npm start` |
| M6 | Optional Render Workflow | ⬜ | |

---

## Sol — pitch / demo

| ID | Task | Status | Notes |
|---|---|---|---|
| Sol1 | One-liner + audience (Track 04) | 🟡 | Docs 13/14; finalize product name |
| Sol2 | Live walkthrough script (signup → brief → approve-all → video) | 🟡 | Matches MOCK E2E |
| Sol3 | Public preview URL for judges | 🟡 | Publish after Replit/import or tunnel |
| Sol4 | Backup recording if live keys fail | ⬜ | Capture from MOCK preview |
| Sol5 | Credits/pricing slide (Higgsfield + ElevenLabs) | 🔒 | Needs vendor prices |

---

## Merged PR index (spine)

| PR | Title |
|---|---|
| #7 | docs/13 requirements v2 |
| #8 | docs/14 + `@chotu/shared` |
| #10 | Neptune media MOCK ports |
| #11 | Venus genre configs |
| #12 | Venus brief intake |
| #13 | Venus ScriptGen + PromptGen |
| #16 | Neptune live adapters |
| #17 | Contract Brief.topic / feedback |
| #19 | Gaia Expo chat shell |
| #20 | Contract optionIds / GET chat |
| #21 | Saturn DB + pg-mem migrate |
| #22 | Saturn orchestrator + /v1 + credits stub |

---

## Thin vertical slice (demo gate)

Must stay green under `MOCK=1` with no external keys:

1. Signup → starter credits  
2. Chat opens; brief questions (genre → cast)  
3. Cast / script / prompts / images / clips / audio / final HITL (approve-all OK)  
4. Final `video` card with mock URL  
5. Served by one process: `MOCK=1 npm start` (API + Expo web)
