# Technical requirements — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial stack and NFRs for the Learning coach. |

Stack changes update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR. Rule: [CHECKLIST — Change-control](CHECKLIST.md#change-control-rule).

Labels: [README](../../README.md#labels-used-everywhere). Product scope: [01-product-requirements](01-product-requirements.md).

## Stack

| Layer | Choice | Label |
|---|---|---|
| Client | Mobile web. One public HTTPS URL. No native app. | **PROPOSAL** shape. Replit as the phone URL is the Saturday host in [D1](../06-unified-ideas.md). |
| Host | Replit only: UI, server routes, secrets, DB. | **PROPOSAL** applied from D1. Render is not a live Saturday host. |
| Database | Replit DB. Keys in [05-backend-schema](05-backend-schema.md). | **PROPOSAL** records. Whether this Replit project’s DB is key-value or SQL is **UNKNOWN** until the app exists. The records stay either way. |
| Orchestration | Lite DAG on the **Vercel AI SDK**. Nodes: Supervisor → Drill worker → Learner turn → Grade worker → Verify. | Runtime default is the locked extract in [docs/09](../09-shared-orchestration.md). These nodes are the Learning **PROPOSAL**. |
| Worker calls | `generateObject` (or `generateText` parsed into the same Zod object). One model call for the plan. One model call per grade. | **PROPOSAL.** The Drill worker does not call the model on the happy path. It loads drill `n`, requests TTS, and serves the learner. A model call inside the Drill worker happens only when drill `n` failed verification and must be regenerated once. |
| Verify | Application code. Zod plus a grounding check against the stored drill. Not a model. | Matches “verify from truth” in [docs/09](../09-shared-orchestration.md). The truth here is the stored drill, not a PDF extract. |
| Retry | One retry of the worker that failed, with the verifier’s error strings attached. Then stop. | Same “light retry” idea as [docs/09](../09-shared-orchestration.md) and the orchestration memo. |
| TTS | ElevenLabs, server-side, premade voice. | **CONFIRM** toolkit. In-app voice uses it once a key is in Replit secrets. |
| STT | ElevenLabs, server-side, after push-to-talk. | **PROPOSAL** optional path. |
| Explainer and demo video | Higgsfield until ElevenLabs credits are available for voice. Then ElevenLabs for **in-app** drill voice. | Higgsfield is **not** an event partner (**CONFIRM** absence from the roster in [docs/05](../05-partner-stack-architecture.md)). Using it for media is **PROPOSAL**. |
| LLM | Bring-your-own, or the model Replit Agent exposes. | **CONFIRM** that no LLM vendor is an event partner ([docs/05](../05-partner-stack-architecture.md)). Provider and model id are **UNKNOWN**. |
| Pine Labs Toolkit | Not imported by this app. | Payments and P3P are cut. The partner stays listed in [07-tools-provided](07-tools-provided.md). |
| Vobiz | Not imported. | Cut. |
| Greptile | Not imported by the app. | Staff review only ([D7](../06-unified-ideas.md)). |
| OpenAI Agents SDK | Not used. | [docs/09](../09-shared-orchestration.md) flags the Node 22+ risk on Replit. This pack stays on the AI SDK. |

**Supervisor bound (PROPOSAL).** [docs/09](../09-shared-orchestration.md) keeps the Shopping supervisor as a router with no free-form goals. This coach’s supervisor has one job: emit `topic`, `language`, and exactly five drills. It does not browse, pay, or decide when the session is finished. The code decides the next node.

**Secrets.** ElevenLabs and LLM keys live in Replit secrets. They are not in the browser bundle, the repo, or these docs. Playback and STT go through our routes.

**Frozen pack (PROPOSAL).** By noon IST the team stores one human-written set of five drills for one team-owned topic. If the supervisor plan fails verification twice, the session loads that pack and the UI says “Using today’s practice set.” The frozen pack is the allow-list analogue of the catalog freeze in [docs/10](../10-tomorrow-problem-approach.md). The topic text itself is **UNKNOWN** until someone names it. It must be original. A copyrighted textbook page is out, same rights rule as [D5](../06-unified-ideas.md).

## NFRs

Airtribe has not published latency, autoplay, or credit SLOs. The numbers below are **PROPOSAL** build targets. Hall Wi-Fi quality is **UNKNOWN**.

### Latency

| Step | Target | If the target slips |
|---|---|---|
| Plan → first drill text | Under 15s after the learner submits a topic | One supervisor retry, then the frozen pack |
| Drill text | On screen before any audio request returns | Text never waits on TTS |
| TTS after Hear | Audio starts within about 5s of the tap when a cached file exists; first generation may be slower | Hear shows a failed state. Text and typing stay up |
| Grade + verify | Under about 8s | One grade retry, then the stored hint |
| STT after the learner releases talk | Under about 8s | Leave whatever text is already in the box. The learner edits and submits |
| Typed session | Five drills finish in one hall visit (aim: under about 5 minutes of taps) | Shorten frozen-pack prompts. Do not add a sixth drill |

The portfolio’s “artifact in under about two minutes” line ([docs/06](../06-unified-ideas.md)) is the reason the scorecard exists. Five spoken drills will often run longer than two minutes. The text path is the one we tune toward a short visit. Do not claim a two-minute voice session unless a timed run shows it.

### Mobile autoplay

Mobile browsers block audio that has sound until a user gesture. This NFR is the rule for that constraint.

- The drill `<audio>` element has no `autoplay` attribute.
- Sound starts in the Hear button’s click handler, or by calling `play()` on an element created from that tap.
- The first screen does not start speech on load.
- If a demo video is embedded, it is also tap-to-play and uses `playsinline`.
- Hear is a real button, at least 44px on the short side, with an accessible name.
- TTS failure, a silent hardware switch, or a blocked `play()` promise leaves the drill text and the answer box usable.

Push-to-talk uses `getUserMedia` only after the talk control is pressed. Replit’s HTTPS URL is what makes the mic permission possible. Permission denial is a normal path: hide the error behind one line and keep typing.

### Cost and credits

Event-day credit **amounts** for ElevenLabs, Replit, Render, Pine Labs, Greptile, and Vobiz are **UNKNOWN** ([docs/05](../05-partner-stack-architecture.md)). ElevenLabs’ public free tier of 10k credits/month is a product fact cited there, not this event’s grant.

| Control | Rule |
|---|---|
| TTS cache | One generation per stored `prompt`. Save the result on the drill record. Replay uses the cache. |
| Spoken length | `prompt` max 500 characters (schema). Write drills as one or two short sentences so a cache miss stays cheap. |
| STT | One clip per push-to-talk release. No streaming conversational session. Viva is cut, which also avoids Conversational AI session cost. |
| Plan and grade | One plan call per session, one grade call per drill, plus at most one retry each. |
| Media | Explainer video/audio and the final demo video go through Higgsfield while ElevenLabs credits are absent or should be saved for the live URL. When credits are in the Replit secret, in-app Hear switches to ElevenLabs. Re-voicing the demo video is optional and must not block 16:00. |
| Empty key | Hear reads “Voice not live yet.” Drills stay text. Do not play a stand-in clip and call it ElevenLabs. |

### Fallbacks

| Failure | Behavior |
|---|---|
| Supervisor plan fails Zod or the 1..5 shape, twice | Load the frozen pack. `planSource: "frozen_pack"`. UI: “Using today’s practice set.” |
| Drill `n` fails schema, twice | Use frozen-pack drill `n` when that pack has it. When it does not, stop the session. A missing drill does not write a scorecard and does not count as a hint. |
| Grade fails schema or grounding, twice | Show `drill.hint`. `shown: "hint"`. `passCount` does not move. |
| TTS error or missing key | Text path. Hear disabled with an honest label. |
| STT error or mic denial | Answer box remains. `inputMode` stays `type` unless a transcript was actually applied. |
| ElevenLabs credits exhausted mid-push | Turn Hear off for new generations. Cached clips may still play. Say that voice is paused. |
| Replit DB write fails | Tell the learner the score did not save. Do not show a success scorecard. Retry the write once. |
| Model timeout | Same as a failed worker: one retry, then the fallback in the rows above. |
| Chotu | Closed until the 14:00 gate says the main path is live ([06-implementation-plan](06-implementation-plan.md)). |

The learner-facing fallback copy is the **text hint** stored on the drill, or the frozen-pack line above. It is not a second model’s claim that the answer was correct.

## Interfaces that must stay server-side

| Call | Who may invoke it |
|---|---|
| LLM plan and grade | Server route only |
| ElevenLabs TTS and STT | Server route only |
| Replit DB writes | Server route only |
| Scorecard insert | Server, and only after attempts `1` through `5` each have `shown` set |

The browser sends name, language, topic, drill index, answer text, input mode, and audio blobs. It does not send API keys.

## Non-functional cuts

No PDF parser, no SVG diagram renderer, no payment SDK, no Vobiz SIP client, no Conversational AI websocket, no second host, no login session. Progress dots in CSS are allowed. They are not a diagram of the lesson.

## Related

- [03 App flow](03-app-flow.md)
- [05 Backend schema](05-backend-schema.md)
- [07 Tools](07-tools-provided.md)
- [docs/09 Shared orchestration](../09-shared-orchestration.md)
- [docs/05 Partner stack](../05-partner-stack-architecture.md)
