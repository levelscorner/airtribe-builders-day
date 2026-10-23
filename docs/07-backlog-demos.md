# Backlog demos

These four shapes scored well in the [VC map](research/builders-day-vc-research.md) and the [partner memo](research/builders-day-partners-and-market.md). They are **not** first-class products in this portfolio. Use them if a written booth card or the team’s skills make a first-class idea impossible on the day. Do not start one “in case” while a first-class demo is half up.

Status of all four: **research**. They do not have architecture drafts of their own. Partner wiring, if needed, is the shared [stack](05-partner-stack-architecture.md).

| Id | Pitch | Track | Why it is backlog | Nearest first-class idea |
|---|---|---|---|---|
| **L1** | Interview Drill Coach — voice mock interview, score, rewrite of the weakest answer | Learning | Strongest voice demo in the partner memo’s top bets. The portfolio’s Learning bet is the PDF lesson, which does not need a live conversation to prove grounding | [Visual learning](03-visual-learning-pdf.md) can grow an oral viva later. L1 is the whole product if the bet becomes “placement voice” |
| **B1** | Multiplayer Prompt Room — one shared agent URL, many phones steer it | Builders | Direct echo of YC’s multiplayer RFS, and a fragile sync problem for a short build | None of the four. A pivot, not a feature |
| **B3** | Small Software Deploy — describe a tiny internal tool, get a hosted URL | Builders | Matches the Builders brief and Replit’s strength. The portfolio uses Replit as a host, not as the product | Any first-class URL already “deploys a small app.” B3 is the product only when the generator is the thing being judged |
| **CR1** | Clip Autopilot — long phone video to three captioned vertical shorts | Creators | a16z agentic-video demand. No official video-generation partner on the strip. Processing time is the risk the partner memo names | [Chotuchotu](04-chotuchotu-studio.md). Extend the studio. Build CR1 from scratch only if that repo cannot run |

## L1 — Interview Drill Coach

**One-liner.** A five-minute voice interview for a FAANG-style or product role, then a scorecard and a rewrite of the weakest answer.

**Why it was favored.** YC tutor demand, Sequoia “sell the work,” Peer Capital skilling, and ElevenLabs plus Vobiz actually being in the room. Placement anxiety is instant distribution in a student building.

**20 phones.** QR → speak answers → scorecard → share. Browser voice first. Vobiz outbound only as stretch. Typed fallback if the hall is loud.

**Partners.** ElevenLabs Conversational AI (**INFER** card 1). Vobiz (**INFER**). Replit for the scorecard URL. Render optional for attempt rows.

**Day-one trap.** Latency and noise. Full SIP will eat the clock.

## B1 — Multiplayer Prompt Room

**One-liner.** A shared agent session: watch, interrupt, and branch, instead of a private transcript.

**Why it was favored.** YC Fall 2026 multiplayer request, quoted in the VC map. Spectacular if ten phones steer one agent.

**20 phones.** One room link; eight to ten people is already the demo. “Twenty” can mean twenty observers plus a smaller steering set — say which you are counting.

**Partners.** Replit. A realtime layer (the partner memo mentions PartyKit or Supabase) is **not** an event partner. Greptile is a poor fit unless the shared agent is reviewing a PR.

**Day-one trap.** Sync and race conditions. The partner memo prefers B3 when the clock is short.

## B3 — Small Software Deploy

**One-liner.** “Build me a waitlist for our booth” becomes a live URL in a few minutes, and strangers submit real rows.

**Why it was favored.** YC “cloud for small software,” Builders brief (**CONFIRM**), Replit as official toolkit.

**20 phones.** One generated app (waitlist, poll, or feedback form). Twenty submissions. Templates only — forms, polls, waitlists — not arbitrary code execution.

**Partners.** Replit Agent. Render if the generated app should outlive Replit’s session. Greptile only as a “review the generated diff” flourish (**INFER**).

**Day-one trap.** Security of generated code. Constrain the template.

## CR1 — Clip Autopilot

**One-liner.** Upload a 2–5 minute talk, get three vertical shorts with captions and a title line.

**Why it was favored.** Agentic video editing demand in the VC map. Shareable output.

**Why it yields to Chotuchotu.** The studio already exists and the named gap is audio. A second cutter splits the team. CR1’s caption-and-short shape is the acceptance test for the studio once its repo is readable: if Chotuchotu cannot export a short at all, CR1 is the Creators fallback and should still put **ElevenLabs** on captions or voiceover rather than shipping silent files only.

**Partners.** No Runway/Pika-style partner is on the strip (partner memo). Replit for the URL. ElevenLabs for voice and captions. Pine Labs only if the wedge becomes “pay for the file,” which is a different product.

**Day-one trap.** Render time and cost. Pre-trim the sample.

## Pivot rule

1. A **CONFIRM** written booth card beats this backlog’s preferences.
2. An **INFER** card does not, by itself, retire Shopping AI, Grocery AI, visual learning, or Chotuchotu.
3. If the pivot is L1 or B3 or B1, leave a line in [unified ideas D8](06-unified-ideas.md) so the other ideas stay stated as waiting, not deleted.
