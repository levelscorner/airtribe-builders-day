# Tools provided — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial partner and media table. Credential cells are placeholders. No secrets. |

When a credential location or a credit fact becomes known, update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR. Paste locations, not keys.

Labels: [README](../../README.md#labels-used-everywhere). How partners plug in generally: [docs/05](../05-partner-stack-architecture.md). This file is the Saturday subset for the coach.

## Rules for this table

- Partner tools stay listed even when today’s learner flow does not call them.
- Status says whether **this** demo calls the tool.
- “Credentials location” is a placeholder for where a human will put the secret (Replit secret name, booth claim link, or “not used”). Values stay out of git and out of this file.
- Event-day credit amounts are **UNKNOWN** unless a cell is filled on the day from a booth card. Do not invent amounts.
- **TBD** means “fill later.” Leave the cell until someone knows.

## Partner and media tools

| Tool | Purpose on this demo | Status | Credentials location |
|---|---|---|---|
| **Replit** | Phone URL, mobile web host, server routes, Replit DB, secrets host. **CONFIRM** toolkit. | Must. Live path. [D1](../06-unified-ideas.md). | TBD. Replit account and project URL. DB product (key-value vs SQL) TBD. |
| **ElevenLabs** | Drill TTS. Optional push-to-talk STT. **CONFIRM** toolkit (TTS, STT, Conversational AI, voice design). | TTS required for Hear. Text path runs without it. STT optional. Conversational AI and voice clone are cut. | TBD. Replit secret name to be chosen at setup. Suggested placeholder name: `ELEVENLABS_API_KEY`. Do not paste the key. |
| **Higgsfield** | Explainer video/audio and the final demo video, until ElevenLabs credits are available for voice. Then ElevenLabs speaks **in the app**. | Media path. **PROPOSAL.** Not an Airtribe toolkit partner (**CONFIRM** absence from the roster). | TBD. Account / project. Not required inside the Replit app. |
| **BYO LLM** | Supervisor plan and grade worker, via Vercel AI SDK. | Must for the model path. Frozen pack can run a drill without a live call. | TBD. Provider **UNKNOWN**. Replit secret name TBD. No LLM vendor is an event partner (**CONFIRM**). |
| **Vercel AI SDK** | Runtime for the two model nodes. **PROPOSAL** for this DAG. Saturday runtime default in [docs/09](../09-shared-orchestration.md). | Must for model nodes. npm dependency, not a booth credential. | Not a secret. Package version TBD at `npm install` (pin the major the code is written against). |
| **Pine Labs** | Title partner. Agent Toolkit, MCP, P3P. **CONFIRM** capabilities in [docs/05](../05-partner-stack-architecture.md). | First-class partner. **Not called** by this coach. Payments and P3P are cut. | TBD if someone claims booth credits anyway. Not a Replit secret for this demo. |
| **Vobiz** | India voice / telephony. **CONFIRM** toolkit. | First-class partner. **Cut** for this coach. DID problems stay **INFER**. | TBD. Not used. Noon DID status **UNKNOWN** and unused while the cut holds. |
| **Render** | Web service and Postgres in the partner architecture. | Backup slide only ([D1](../06-unified-ideas.md)). Not the Saturday store. | TBD. Not provisioned for this demo. |
| **Greptile** | Code-graph review of the team’s own PR. **CONFIRM** toolkit. | Staff only ([D7](../06-unified-ideas.md)). Not a user-flow call. | TBD. Staff account. |
| **Airtribe** | Brief, mentors, user push after 16:00, ~20 users before 19:30. **CONFIRM** process. | Process, not an SDK. | None. |
| **Peer Capital** | Pitch lens. Judge: Karthik Prabhakar. **CONFIRM** venture partner. No API. | Pitch only. | None. |
| **Activate** | Judge lens (Pratyush Choudhury). **CONFIRM** as judge via Airtribe LinkedIn, in [docs/05](../05-partner-stack-architecture.md). No API. | Pitch only. | None. |
| **Polaris** | Venue. **CONFIRM** host. | Room and phones. Not a problem author. | None. |

Zod is a library in the app, not a partner. It is specified in [05-backend-schema](05-backend-schema.md).

## Fill on the day

Leave these TBD until a person has the fact. Then replace TBD in the same PR as the checklist tick. Never paste a secret, a card number, or a full claim URL that embeds a token. A public docs URL is fine.

| Fact | Value | Label until filled |
|---|---|---|
| Replit project URL | TBD | **UNKNOWN** |
| Replit DB shape (key-value or SQL) | TBD | **UNKNOWN** |
| ElevenLabs secret **name** (not the value) | TBD | **UNKNOWN** |
| ElevenLabs event credit amount and whether the key is loaded | TBD | **UNKNOWN** |
| Voice id, English | TBD | **UNKNOWN** |
| Voice id, Hindi | TBD | **UNKNOWN** |
| Voice id, Hinglish | TBD | **UNKNOWN** |
| LLM provider and model id | TBD | **UNKNOWN** |
| LLM secret **name** (not the value) | TBD | **UNKNOWN** |
| Higgsfield account ready (yes/no) | TBD | **UNKNOWN** |
| Pine Labs booth credential claimed (yes/no). Unused by the coach either way | TBD | **UNKNOWN** |
| Greptile used on the docs PR (yes/no) | TBD | **UNKNOWN** |
| Frozen topic title | TBD | **UNKNOWN** |
| Hindi/Hinglish reviewer name | TBD | **UNKNOWN** |

Public product notes that are already known, and are **not** this event’s grant:

| Fact | Note | Label |
|---|---|---|
| ElevenLabs public free tier | 10k credits/month cited in [docs/05](../05-partner-stack-architecture.md) | Product fact in the partner memo, not the event grant |
| Vobiz new-account credit | ₹25 cited in [docs/05](../05-partner-stack-architecture.md) | Product fact. This demo does not call Vobiz |
| Render free-tier spin-down | About 15 minutes idle, cited in [docs/05](../05-partner-stack-architecture.md) | Irrelevant while Render stays off |

## Where each tool sits in the DAG

| Node | Tool |
|---|---|
| Supervisor | BYO LLM through Vercel AI SDK |
| Verify | Zod in our code. No partner |
| Drill worker, happy path | Our code. ElevenLabs TTS when Hear is used |
| Learner turn | Phone browser. Optional ElevenLabs STT |
| Grade worker | BYO LLM through Vercel AI SDK |
| Scorecard | Replit DB |
| Explainer and demo video | Higgsfield, off the request path |
| Chotu kids route, after 14:00 only | ElevenLabs TTS plus a Replit DB job row, per [docs/04](../04-chotuchotu-studio.md) |

## Explicit non-uses

TableTalk. WhatsApp BSP, Razorpay, Stripe, Clerk. A Kannada TTS voice. Pine Labs `createOrder` on this URL. Vobiz SIP. An image-generation API for diagrams. Greptile as a homepage widget.

## Related

- [02 Technical requirements](02-technical-requirements.md)
- [05 Backend schema](05-backend-schema.md)
- [06 Implementation plan](06-implementation-plan.md)
- [docs/05 Partner stack](../05-partner-stack-architecture.md)
