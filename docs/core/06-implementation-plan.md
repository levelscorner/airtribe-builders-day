# Implementation plan — Saturday 24 Oct 2026

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial hour-by-hour plan through 16:00 IST, cut lines, and demo media. |

Schedule or cut-line changes update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR.

Labels: [README](../../README.md#labels-used-everywhere). Product: [01-product-requirements](01-product-requirements.md).

## Clock

| Milestone | IST | Definition of done |
|---|---|---|
| Frozen pack seeded | 12:00 | `pack:default` has five human-written drills for one original topic |
| Main-path gate | 14:00 | Name → five typed drills → grade or hint → one room scorecard row. TTS may be down |
| Feature freeze | 16:00 | Public Replit URL. No new scope after this |
| Users | 19:30 | `roomUsers` at 20. **CONFIRM** process target is ~20 people outside the team |

The blocks below assume work can start at **11:00 IST**. That start is **PROPOSAL**. The published doors-open time is **UNKNOWN**. 14:00 and 16:00 stay fixed. If the room starts later, compress the blocks before 14:00. Do not move the gate or the freeze.

Two coders is the constraint stated in the [orchestration memo](../research/agent-orchestration-memo.md). Split: one person on Start, drill UI, and scorecard page; one person on the DAG, Zod, Replit DB, and ElevenLabs routes. The booth person, if present, claims credits, holds the QR, and runs the script.

## Already cut (do not start these)

PDF upload, SVG lesson diagrams, auth beyond a name, Pine Labs pay and P3P, Kannada, viva / Conversational AI, Vobiz, TableTalk, Render as a live host, Greptile in the UI, Shopping catalog and `pay()`, a Chotu studio rewrite.

## 11:00–12:00 — URL, schema, frozen pack

- Create the Replit app and a public HTTPS URL. Start screen can be static.
- Add the Zod objects and key names from [05-backend-schema](05-backend-schema.md). Secrets stay in Replit. Write only the **location** into [07-tools-provided](07-tools-provided.md).
- Write `pack:default` in English: five drills, checks, hints, one original topic. Record the topic name in the checklist.
- Note whether an ElevenLabs key is already in secrets. Amount of event credit is **UNKNOWN**.
- If Higgsfield is logged in, start the explainer (see Demo media). Do not spend ElevenLabs on that video.
- Checkpoint: a phone on venue or phone hotspot opens the URL.

## 12:00–13:00 — Typed loop

- Supervisor call returns a `SupervisorPlan`. Verify. Save session and five drills.
- Drill screen: prompt, answer box, Submit. Hear can be a disabled button.
- Grade call, Verify against stored check ids, one retry, then `hint`.
- Second submit for the same `n` is rejected.
- Checkpoint: one phone finishes drill 1 in English by typing, on the model plan or on the frozen pack, and the attempt row exists.

## 13:00–14:00 — Scorecard, count, Hear

- After drill 5, write the scorecard. Mentor page shows `roomUsers`.
- A team run with `?team=1` increments `teamScorecards` only.
- Hear: server TTS, tap to play, text already visible. No `autoplay`.
- Missing ElevenLabs key: Hear shows “Voice not live yet.” Typing still finishes a scorecard.
- Pass one Android Chrome phone and one iPhone Safari if those devices are in the room. Device mix is **UNKNOWN**.
- **14:00 checkpoint.** Fill the gate line in [CHECKLIST](CHECKLIST.md): main path live, yes or no. Main path does not require TTS.

## 14:00–15:00 — Gate

**Main path live.** Optional Chotu kids slice, on a separate route, using the [docs/04](../04-chotuchotu-studio.md#saturday-walkthrough) nodes (Script → Voice → Verify). Side-by-side audio and sample. One job row. Studio internals stay **UNKNOWN**. Open that route only if a two-line TTS call already returns audio and wiring it will not risk the coach URL. Coach Hear has first claim on ElevenLabs credits. If the credits cannot cover both, skip Chotu. A silent Chotu page is not the fallback. Vobiz stays off.

**Main path not live.** Chotu stays shut. Push-to-talk stays shut. Fix the typed loop, the scorecard write, and the mentor count. Use the frozen pack if the model path is the thing failing.

Push-to-talk starts only after a typed scorecard already works. Mic denial must leave the box usable.

Hindi and Hinglish: a person reads the Start line, one prompt, and the score line aloud. If nobody has checked them, keep those chips off and ship English plus the practice-set label. Reviewer name is **UNKNOWN** until someone signs the checklist.

## 15:00–16:00 — Freeze and demo prep

- Stop feature work at 16:00. [docs/10](../10-tomorrow-problem-approach.md) uses the same freeze, then the user push.
- QR code to the Start URL. Second phone bookmarked to the same URL.
- 60-second booth script: name, language, topic chip, type drill 1, show Hear only if it played in rehearsal, explain that the scorecard is the finish.
- Higgsfield demo video of the real phone path (see below). A screen recording is the input if Higgsfield needs footage. The video is not a substitute for the live URL.
- One team scorecard exists so the mentor page is not an error state. It is excluded from `roomUsers`.
- Venus runs the critique section of the checklist.
- Anything still broken that sits on the day-of cut list below is removed rather than half-wired.

## 16:00–19:30 — Twenty users

- No new screens, nodes, or keys.
- Table QR and the Airtribe user push after 16:00 (the push is the process drawn in [docs/05](../05-partner-stack-architecture.md)).
- Watch `roomUsers`. The goal is 20 distinct room names on scorecards.
- If TTS credits run out, leave cached clips, stop new generations, and say voice is paused. Typing continues.
- A failed scorecard write is said out loud as not saved. It is not counted.

## Day-of cut order

Use this order when the clock slips. Items in “Already cut” never come back today.

1. Chotu route.
2. Push-to-talk.
3. Extra voices (one premade ElevenLabs voice is enough if the on-screen language is still correct).
4. Hindi and Hinglish chips, if the strings are unchecked. English remains.
5. Higgsfield polish on the demo video. A single honest screen recording can ship. The live URL cannot wait on the video.
6. Model-planned topics beyond the frozen pack. Chips serve `pack:default` only.

Never cut: the answer box, Verify, the “not a pass” hint path, the scorecard write, the mentor count, or the public URL.

## Demo media

**PROPOSAL** production path, from this pack’s brief.

| Piece | Tool | When |
|---|---|---|
| Explainer, about 30–45 seconds, of the loop (name → drill → tap to hear → scorecard) | Higgsfield for picture and temporary voice | 11:00 onward, if the Higgsfield login exists. Login status is **UNKNOWN**. |
| Final demo video, about 45–60 seconds, of the real phone URL | Higgsfield for the cut and the voice until ElevenLabs credits are in hand | 15:00–16:00, after a typed run has produced a real scorecard |
| In-app drill voice | ElevenLabs TTS | As soon as the key is in Replit secrets. This replaces Higgsfield **inside the app**. It does not require re-exporting the demo video before 16:00 |

The explainer and the demo video carry on-screen words so they make sense muted. They show a real scorecard screen from the app once that screen exists. They do not show a fake “20 users” total. They do not show a payment or a posted Reel.

ElevenLabs credits arriving means: put the key in Replit secrets, point Hear at TTS, cache by prompt. The demo video may keep its Higgsfield voice through judging. Re-voice it only if the live app is already boringly stable.

Higgsfield is not on the learner’s critical path. A missing Higgsfield login does not slip the 16:00 URL.

## Booth script (spoken)

“This is a learning coach on your phone. You pick English, Hindi, or Hinglish, you get five drills, you can type every answer, and you tap if you want to hear the question. At the end there is a scorecard. The score checks the drill we stored, not a textbook page. Voice is ElevenLabs when it is live. If it is not live, we say so.”

If the frozen pack is what just ran, add: “That set was today’s practice set.”

Peer Capital sentence for this demo (**PROPOSAL**, and only if the URL does it): “Five drills in the learner’s language, then a scorecard — a result they can show.”

## Related

- [02 Technical requirements](02-technical-requirements.md)
- [07 Tools](07-tools-provided.md)
- [CHECKLIST](CHECKLIST.md)
- [docs/10](../10-tomorrow-problem-approach.md)
- [docs/04](../04-chotuchotu-studio.md)
