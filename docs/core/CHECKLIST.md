# Saturday checklist — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial tracker for docs, build, integrations, Venus critique, demo media, and the 20-user push. |

## Change-control rule

Any change to **scope**, **stack**, or **schema** ships in a PR that does both of these:

1. Updates the change log of every affected doc in `docs/core/`. Scope lives in [01-product-requirements](01-product-requirements.md). Stack and NFRs live in [02-technical-requirements](02-technical-requirements.md). Flow lives in [03-app-flow](03-app-flow.md). UI rules live in [04-design-brief](04-design-brief.md). Schema lives in [05-backend-schema](05-backend-schema.md). Schedule and cut lines live in [06-implementation-plan](06-implementation-plan.md). Tools and credential placeholders live in [07-tools-provided](07-tools-provided.md).
2. Updates this checklist in the same PR: add, remove, or reword the boxes that the change affects.

A PR that changes scope, stack, or schema and touches only one of those two places is incomplete.

Labels: [README](../../README.md#labels-used-everywhere).

## Documents

| Doc | Role |
|---|---|
| [01 Product requirements](01-product-requirements.md) | Problem, users, goals, stories |
| [02 Technical requirements](02-technical-requirements.md) | Stack and NFRs |
| [03 App flow](03-app-flow.md) | Screens and DAG |
| [04 Design brief](04-design-brief.md) | Mobile UI, copy, audio, access |
| [05 Backend schema](05-backend-schema.md) | Replit DB and Zod |
| [06 Implementation plan](06-implementation-plan.md) | Clock, cuts, demo media |
| [07 Tools provided](07-tools-provided.md) | Partners, Higgsfield, TBD credential locations |

Portfolio context, unchanged by this pack’s file list: [docs/09](../09-shared-orchestration.md), [docs/04](../04-chotuchotu-studio.md), [docs/05](../05-partner-stack-architecture.md), [docs/06](../06-unified-ideas.md), [docs/10](../10-tomorrow-problem-approach.md).

### Docs boxes

- [x] `docs/core/` has 01–07 plus this checklist, each with owner, status, last-updated, and a change log.
- [x] [README](../../README.md) and [docs/README](../README.md) link this pack.
- [x] Claims in the pack use CONFIRM / INFER / PROPOSAL / UNKNOWN.
- [ ] Frozen topic title written into [07](07-tools-provided.md) and into `pack:default`.
- [ ] Hindi and Hinglish reviewer named in [07](07-tools-provided.md), or those chips marked off.
- [ ] 14:00 gate result written on the build section below.
- [ ] Credential **locations** in [07](07-tools-provided.md) filled where known. No secret values in git.

## Build

Main path = name → five drills → typed answers → grade or stored hint → scorecard row. TTS is not required for the gate.

- [ ] Replit app has a public HTTPS URL a phone can open.
- [ ] Start screen: name, language, topic. No password.
- [ ] `?team=1` stores `source: "team"`.
- [ ] Supervisor returns five drills and Verify enforces `n` = 1..5 and the check ids.
- [ ] Second plan failure loads `pack:default` and the UI says “Using today’s practice set.”
- [ ] Drill screen shows prompt text before any audio call.
- [ ] Answer box and Submit work with Hear disabled and the mic blocked.
- [ ] Grade Verify checks cited ids against the stored drill. Pass with no citation fails.
- [ ] One retry, then the stored hint. Hint path does not increase `passCount`.
- [ ] Scorecard key `scorecard:{sessionId}` is written only after five attempts.
- [ ] A second submit for the same drill `n` is rejected.
- [ ] Mentor view: `roomUsers`, `roomScorecards`, `teamScorecards`, `starts`.
- [ ] `roomUsers` is distinct room `nameKey`s, computed from scorecard records.
- [ ] Failed DB write does not show a successful scorecard.
- [ ] 14:00 IST main path live: TBD (yes/no). Filled on the day.

## Integrations

- [ ] LLM secret is only in Replit secrets. Provider and model id recorded in [07](07-tools-provided.md).
- [ ] ElevenLabs secret is only on the server. Hear uses a same-origin play route.
- [ ] TTS cached per prompt. Replay does not call ElevenLabs again.
- [ ] Missing ElevenLabs key: Hear shows “Voice not live yet.”
- [ ] Push-to-talk fills the box and does not auto-submit. Off if the typed scorecard is not done.
- [ ] No Pine Labs call from this app.
- [ ] No Vobiz call from this app.
- [ ] No Render host in the live path.
- [ ] Greptile, if used, is on the team’s PR, not in the learner UI.
- [ ] Higgsfield, if used, is for explainer and demo video only.

## QA / critique by Venus

- [ ] The spoken claim matches the build: five drills, language choice, tap to hear, typing always, scorecard. No “full teacher,” no textbook citation, no payment.
- [ ] Labels in the pitch match the docs. **INFER** cards are not described as the official brief.
- [ ] Typed run with ElevenLabs disabled reaches a scorecard (US-3).
- [ ] Hear does not autoplay. First sound is a tap (US-4).
- [ ] Mic denial leaves typing (US-5).
- [ ] A forced bad grade (unknown check id) shows the hint and leaves `passCount` unchanged (US-6).
- [ ] Scorecard appears only after five attempts (US-7).
- [ ] Mentor numbers match a manual list of `scorecard:` keys (US-8).
- [ ] A `?team=1` run stays out of `roomUsers` (US-9).
- [ ] UI has no PDF upload, lesson SVG, login, pay button, Kannada control, viva, or Vobiz number.
- [ ] TableTalk is absent.
- [ ] Frozen-pack sessions are labeled “Using today’s practice set.”
- [ ] Hindi or Hinglish, if the chips are on, has been read aloud by a person.
- [ ] Pass and miss are words, not color alone. Controls are at least 44px.
- [ ] No API key in the page source, the repo, or `docs/core`.
- [ ] Score grounding explanation is available: checks stored on the drill, not a PDF span.

## Demo media

- [ ] Explainer (about 30–45s) started on Higgsfield if that login exists. Status of the login recorded in [07](07-tools-provided.md).
- [ ] Explainer and demo video include on-screen words and do not fake a user total.
- [ ] Final demo video (about 45–60s) shows the real phone URL after a real scorecard exists.
- [ ] Until ElevenLabs credits are loaded, that video’s voice is Higgsfield.
- [ ] When credits are loaded, in-app Hear uses ElevenLabs. The video re-voice does not block 16:00.
- [ ] Missing Higgsfield login does not slip the Replit URL.

## Launch / 20 users

- [ ] Feature freeze at 16:00 IST. No new scope after it.
- [ ] QR points at Start. A second phone has the same URL.
- [ ] Booth script from [06](06-implementation-plan.md) matches what the phone actually does, including voice-not-live if that is the truth.
- [ ] User push uses people outside the team.
- [ ] `roomUsers` reaches 20 before 19:30 IST.
- [ ] If TTS credits die during the push, new generations stop and typing still works.
- [ ] Chotu kids route: open only if the 14:00 line above is yes and a two-line TTS call already returns audio. If yes, it is the [docs/04](../04-chotuchotu-studio.md#saturday-walkthrough) slice and it must not take the coach URL down. If no, Chotu stays shut. A silent Chotu page is not the fallback.

## Open UNKNOWNs

Unchecked items here are facts this pack does not have. Checking one means the fact was written into [07](07-tools-provided.md) or the relevant change log, not guessed.

- [ ] Event-day credit amounts and claim results for ElevenLabs, Replit, Render, Pine Labs, Greptile, and Vobiz.
- [ ] Whether the ElevenLabs key is loaded at 11:00, and the premade voice ids for English, Hindi, and Hinglish.
- [ ] LLM provider and model id.
- [ ] Higgsfield account ready or not.
- [ ] Replit project URL, and whether DB is key-value or SQL.
- [ ] Published doors-open time. The 11:00 start in [06](06-implementation-plan.md) is a **PROPOSAL**.
- [ ] Frozen topic title, and the person who checks Hindi and Hinglish.
- [ ] What “Chotu kids version” means beyond the docs/04 Saturday slice. Studio repo, export, venue reachability, and “checkout autoshort” stay unknown there too.
- [ ] Whether a mentor counts a typed name, a start, or a finished scorecard as the Airtribe “user.” This pack counts distinct room names on finished scorecards.
- [ ] Hall network quality, and which phones are available for the iPhone Safari check.
- [ ] Hinglish `lang` tag. The pack uses `en` because the script is Latin.
- [ ] Community Partner name, if one is revealed. Do not invent it ([docs/06 parking lot](../06-unified-ideas.md)).

## Related

- [01 Product requirements](01-product-requirements.md)
- [06 Implementation plan](06-implementation-plan.md)
- [07 Tools provided](07-tools-provided.md)
