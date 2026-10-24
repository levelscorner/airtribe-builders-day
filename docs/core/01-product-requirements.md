# Product requirements — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial PRD. Primary demo is the vernacular Learning coach. |

Scope changes update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR. Rule: [CHECKLIST — Change-control](CHECKLIST.md#change-control-rule).

Labels mean what the [README](../../README.md#labels-used-everywhere) says: **CONFIRM**, **INFER**, **PROPOSAL**, **UNKNOWN**.

## How this pack sits with the portfolio

This folder is the build spec for the room on Sat 24 Oct 2026. The primary demo is a vernacular Learning coach: five short drills, tap-to-play speech, typing that always works, and a scorecard stored in Replit DB.

[docs/09](../09-shared-orchestration.md), [docs/10](../10-tomorrow-problem-approach.md), and [D8](../06-unified-ideas.md) name Shopping AI as the earlier default demo. Those notes stay in place. Builders working the coach follow `docs/core`. The lite DAG pattern (bounded nodes, verify from stored truth, Vercel AI SDK, Replit-only, Replit DB) is the same pattern, with Learning nodes in place of Ranker and Checkout. See [03-app-flow](03-app-flow.md) and [02-technical-requirements](02-technical-requirements.md).

Shopping AI, Grocery AI, PDF visual learning, and Chotuchotu stay documented in `docs/01`–`docs/04`. This PRD cuts PDF upload and SVG diagrams out of today’s coach. It does not rewrite those idea docs.

## Problem

Airtribe’s Learning brief is **CONFIRM**: “Build the teacher most Indians never had: AI that knows each learner, teaches in their own language, and turns curiosity into real skill.” Source: the event page, quoted in [docs/00](../00-overview.md) and the [problem archive](../research/builders-day-partner-problem-statements.md).

A chat reply that only explains leaves nothing the learner can show. The portfolio’s bar is an outcome a person can hold ([docs/00](../00-overview.md)). For this demo the outcome is a **scorecard after five drills**.

The hall is loud, phones are the client, and speech credits may arrive late. A coach that speaks and cannot be answered by typing will stall the 20-user push. Typing is the path that must finish. Voice is how the drill is heard when ElevenLabs is live.

The nearest published-style cards are **INFER**, not a booth brief handed out for this event (no per-company problem pack as of 23 Oct 2026, [docs/05](../05-partner-stack-architecture.md)):

| Source | What it asks | What this PRD takes |
|---|---|---|
| Learning brief | Teacher, learner’s language, real skill | **CONFIRM.** Five drills, language choice, scorecard. |
| ElevenLabs card 2 — vernacular explainer | One PDF page taught aloud, with checks | **INFER.** Language and checks stay. PDF upload is cut. |
| ElevenLabs card 1 — conversational coach | A voice agent that interrupts for 3–5 minutes | **INFER.** Not this build. Viva and live call are cut. Speech here is TTS of the drill plus optional push-to-talk. |
| Peer Capital card 4 — skilling loop | A visible score, then a next step | **INFER.** The scorecard is that artifact. |
| [docs/03](../03-visual-learning-pdf.md) visual lesson | PDF page, citation cards, one SVG | Portfolio idea. Today’s coach cuts the PDF and the SVG. |

**What we claim.** “Five short drills in the language you picked, a voice you can tap, and a score saved on this phone URL.” We claim a finished scorecard. We claim the grade was checked against the drill’s stored checks. We do not claim a full teacher, a course, exam prediction, a textbook citation, or a payment.

**Grounding limit (PROPOSAL).** PDF upload is cut, so there is no page span to cite. The ground is the drill record written before the learner answers: prompt, checks, and hint. A pass must cite those checks. That is consistency with the drill the coach stored, which is weaker than [docs/03](../03-visual-learning-pdf.md)’s “cite the uploaded page.” The frozen topic pack is the stronger ground, because a person writes its checks. Say this if a mentor asks what the score is grounded in.

## Users

| User | Who they are on Saturday | What they need |
|---|---|---|
| Learner | Someone in the Polaris / Brookefield room who is not on the team. Phone, one hand, a few minutes. | A name, a language, a topic, five drills they can finish by typing. |
| Mentor / judge | Airtribe mentor or a judge who asks whether 20 users happened. | A count of scorecards that matches Replit DB. |
| Booth teammate | The person on the QR table. | A 60-second script and a second phone on the same URL. |

**CONFIRM** process target: about 20 real users outside the team before 19:30 ([docs/00](../00-overview.md), [docs/05](../05-partner-stack-architecture.md)). This pack’s counter is defined under Success metrics. If a mentor on the day counts “user” differently, that rule is **UNKNOWN** until they say so.

Kannada-first learners are out of today’s script. Kannada is cut. English, Hindi, and Hinglish are the Saturday languages, matching the language set already resolved on visual learning in [D5](../06-unified-ideas.md), with Kannada removed for this coach.

## Goals

1. Ship one public **mobile web** URL on **Replit** by about **16:00 IST**. The ~16:00 URL and the user push after it are the research-memo plan cited in [docs/00](../00-overview.md) and [docs/05](../05-partner-stack-architecture.md). Exact doors-open time is **UNKNOWN**.
2. Land **20 users** outside the team before **19:30 IST**, counted as finished room scorecards (metric below).
3. Every learner can finish five drills by **typing**, with or without audio.
4. When an ElevenLabs key is in Replit secrets, each drill can be **heard** after a tap.
5. Push-to-talk can fill the answer box. It is optional. The box stays editable.
6. After drill 5, one **scorecard** row is saved. That row is the user counter.

## Non-goals (cut for this demo)

These are cuts, not backlog promises inside the 16:00 build.

| Cut | Where the wider portfolio still talks about it |
|---|---|
| PDF upload and page extraction | [docs/03](../03-visual-learning-pdf.md) |
| SVG or other lesson diagrams | [docs/03](../03-visual-learning-pdf.md), [D5](../06-unified-ideas.md) |
| Auth beyond a name | [D1](../06-unified-ideas.md) auth stub is a name. No magic link, no Clerk. |
| Pine Labs payments, P3P, mandates, receipts | [D2](../06-unified-ideas.md). Partner stays first-class in [07-tools-provided](07-tools-provided.md). It is not in this loop. |
| Kannada UI and Kannada TTS | [D5](../06-unified-ideas.md) allowed Kannada only if a teammate owned the copy. This pack cuts it. |
| Viva, Conversational AI agent, interruption | ElevenLabs card 1 is **INFER**. Cut. |
| Vobiz DID, PSTN, outbound calls | [D7](../06-unified-ideas.md). Cut for this coach. |
| TableTalk | Out of scope for the repo ([docs/00](../00-overview.md)). |
| Shopping, Grocery, catalog, `pay()` | Earlier default in D8. Not built in this pack. |
| Render as a live second host | [D1](../06-unified-ideas.md). Backup slide only. |
| Greptile inside the product UI | [D7](../06-unified-ideas.md). Staff tool only. |
| Chotu studio rewrite, mux, captions burn-in, voice clone | [docs/04](../04-chotuchotu-studio.md) |

**Chotu kids version.** The fallback product is the Saturday slice in [docs/04](../04-chotuchotu-studio.md#saturday-walkthrough): one script, ElevenLabs TTS, playable audio beside a sample, one job row. “Kids version” in this pack means that thin slice pointed at a short learning line. A separate children’s product, if someone meant that, is **UNKNOWN**. Studio internals, repo URL, and “checkout autoshort” stay **UNKNOWN**, as in docs/04.

**14:00 IST gate (this brief).** Open the Chotu kids build only if the coach main path is already live. Main path means: name → plan of five drills → learner answers by typing → grade or stored hint → scorecard row in Replit DB. TTS may still be down. If the main path is not live at 14:00, Chotu stays shut and the team stays on the coach through the 16:00 freeze. Chotu is the second story after the coach works. It is not a mid-day replacement build. Schedule: [06-implementation-plan](06-implementation-plan.md).

## Success metrics

| Metric | Target | Label |
|---|---|---|
| Public phone URL | Up by ~16:00 IST, HTTPS, usable on a phone browser | **PROPOSAL** clock, aligned to the memo plan |
| Users | 20 distinct `nameKey` values on **room** scorecards before 19:30 IST | **CONFIRM** is “~20 real users outside the team.” **PROPOSAL** is “distinct names on finished scorecards.” |
| Main path | Live at 14:00 IST (definition above) | **PROPOSAL** internal gate |
| Finish rate | A learner who submits a name can reach a scorecard by typing without using the mic or Hear | **PROPOSAL** acceptance bar |
| Honesty | A verify failure does not increase the pass count | **PROPOSAL** product rule, required |
| Voice | Hear plays coach audio only after a tap, and only when ElevenLabs returned audio | **PROPOSAL** |

Starts that never reach drill 5 are sessions, not users, in this counter. The mentor page shows starts beside the user count so a bounce is visible. Team scorecards are stored and excluded from the 20. Two strangers who type the same name count as one user. That under-count is accepted for the day.

## Scope of the product

In the Saturday URL:

- Name, language (`en` / `hi` / `hinglish`), topic.
- Supervisor plans exactly five drills. A frozen pack substitutes if that plan fails verification twice.
- Each drill shows text. Hear is tap-to-play when audio exists.
- Answer by typing. Optional push-to-talk writes into the same box.
- Grade against the stored checks. Verify is code (Zod plus grounding). One retry. Then the stored text hint.
- Scorecard after five drills, one row, used as the user counter.

A progress mark of five steps is UI chrome. It is not the SVG lesson diagram this pack cuts.

## User stories

| Id | Story | Acceptance |
|---|---|---|
| US-1 | As a learner, I enter my name, pick English, Hindi, or Hinglish, and pick a topic, so the drills match that choice. | Name required. Language is one of the three. Topic is a chip or a short line. |
| US-2 | As a learner, I see five drills one at a time, so I always know which step I am on. | Each screen shows `n` of 5. Drill `n+1` waits until drill `n` has feedback or a hint. |
| US-3 | As a learner, I read the drill and type an answer with audio and mic unavailable, so the hall cannot block me. | With ElevenLabs disabled, Submit still grades and a scorecard still saves. |
| US-4 | As a learner, I tap Hear and the same words I see are spoken, so voice matches the text. | Audio starts after the tap. The text is already on screen. Failed audio leaves the text in place. |
| US-5 | As a learner, I hold to talk and then edit the transcript, so a bad STT guess is not submitted for me. | Push-to-talk fills the box. Submit is a separate tap. Mic denial leaves typing in place. |
| US-6 | As a learner, I see a short result after each drill, so I know what to do next. | Verified grade shows feedback and pass or miss. Failed verify shows the stored hint and does not mark a pass. |
| US-7 | As a learner, I reach a scorecard after five drills, so I leave with a result. | One scorecard per session. It shows name, language, topic, passes, and hints. |
| US-8 | As a mentor, I open a count view and see room users, so I can believe the 20 without a spreadsheet. | Count equals distinct room `nameKey`s on scorecard records. Team rows are separate. |
| US-9 | As a booth teammate, I run a team practice with `source: team`, so our rehearsal does not pad the 20. | Team scorecards stay in the database and stay out of `roomUsers`. |

## Out of scope reminder

TableTalk has no screens, keys, or partner wiring here. Pine Labs is a named partner and is unused in the learner flow. Higgsfield is for explainer and demo media ([07-tools-provided](07-tools-provided.md)), not a feature inside the five drills.

## Related

- [02 Technical requirements](02-technical-requirements.md)
- [03 App flow](03-app-flow.md)
- [06 Implementation plan](06-implementation-plan.md)
- [CHECKLIST](CHECKLIST.md)
