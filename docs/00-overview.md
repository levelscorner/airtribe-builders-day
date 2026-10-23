# Portfolio overview

This repo is a portfolio, not a decision to build one app on Saturday. Abhinav is keeping four product directions alive through Airtribe AI Builders Day and beyond. Saturday is a forcing function: a phone URL, a real partner rail, and about 20 people who are not on the team. It is not a requirement to kill the other three ideas at kickoff.

## Thesis

India’s applied-AI bar, as the research archive reads it, is an **outcome a person can hold** — a paid intent, a weekly basket, a grounded lesson, a short with a voice — produced in a couple of minutes on a phone. Chat that stops at advice is the failure mode Peer Capital’s public thesis and the Commerce keynote both punish. See [VC demand](research/builders-day-vc-research.md) (Sequoia “sell the work”, YC agentic commerce, India application-layer notes) and [Peer Capital’s inferred judge lens](research/builders-day-partner-problem-statements.md).

The four ideas cover that bar on purpose:

| Idea | Outcome the user leaves with | Why it stays in the portfolio |
|---|---|---|
| [Shopping AI](01-shopping-ai.md) | Three ranked picks with tradeoffs, then a Pine Labs order or payment link | Broad agentic commerce. Matches the title-partner keynote. Any category, including ones that are not food. Saturday’s component list and 2-coder ownership: [Saturday Shopping components](08-shopping-ai-saturday-components.md). The Ranker sits in the [shared orchestration](09-shared-orchestration.md) DAG. |
| [Grocery AI](02-grocery-ai-cadences.md) | A household list tied to a **daily, weekly, or monthly** cadence, then payment | Recurring need with a planning loop Shopping AI does not have. Vendor relationship and repeat payment are the product. |
| [Visual learning](03-visual-learning-pdf.md) | A visual lesson and a three-question quiz **grounded in an uploaded PDF** | Learning-track brief. Students already carry syllabi. The artifact is a lesson, not a chat transcript. |
| [Chotuchotu](04-chotuchotu-studio.md) | A short from the existing studio, with an ElevenLabs audio track attached | Creators-track brief. The studio already exists. The missing piece is audio, which the event’s voice partners can fill. Saturday’s named components and lite DAG: [Saturday walkthrough](04-chotuchotu-studio.md#saturday-walkthrough). |

[Backlog demos](07-backlog-demos.md) (L1, B1, B3, CR1) stay available. They were strong same-day shapes in the partner memo. They are not the products this portfolio is organising around.

## Tracks

Airtribe’s published briefs (**CONFIRM**, [event page](https://airtribe.live/ai-builders-day/) via the [problem archive](research/builders-day-partner-problem-statements.md)):

1. **Learning** — “Build the teacher most Indians never had: AI that knows each learner, teaches in their own language, and turns curiosity into real skill.”
2. **Commerce** — “Build AI that makes buying, selling and managing money as easy as UPI made paying.”
3. **Builders** — “Build the tools that build everything else, so the next million products come from people who never wrote code.”
4. **Creators** — “Build a full studio in one phone, so anyone can create in any Indian language.”

Shopping AI and Grocery AI both answer Commerce. They answer different jobs. Visual learning answers Learning. Chotuchotu answers Creators. The Builders track shows up as **shared infrastructure** (Replit, Render, and Greptile on the backlog) and as the [backlog](07-backlog-demos.md), not as a fifth first-class product in this pass.

## What “keep going” means

Each first-class idea has three layers, and this repo only finishes the first two:

| Layer | Meaning | Where it lives |
|---|---|---|
| Idea | Who it is for and what “done” feels like | `docs/01`–`docs/04` |
| Research | VC demand, partner roster, inferred booth problems, and the orchestration framework pick | `docs/research/` including the [agent orchestration memo](research/agent-orchestration-memo.md) |
| Architecture | Named partner tools, demo shape, open questions | Idea docs + [partner stack](05-partner-stack-architecture.md) |
| Build | Running software | **Not this repo.** Saturn / Gaia discussion stubs in [unified ideas](06-unified-ideas.md) are the handoff. |

Status language for the matrix: **idea**, **research**, **architecture**. Implementation status is out of scope until a later repo exists.

## Saturday constraints (shared)

These come from the event brief and the research memos. They apply to every idea.

- **CONFIRM** open brief: working AI product, in market, ~20 real users outside the team before 19:30. The day is 12 hours. The research memos also plan around a ~5 hour build before an afternoon user push (URL aimed at ~16:00).
- One public **phone URL**. Signup is one tap (name, or magic link). The AI loop is the homepage.
- Shareable artifact in under about two minutes.
- Prefer **event partners** over lookalike tools: Pine Labs for money, ElevenLabs for speech, Vobiz when a real phone number matters, Replit to ship the URL, Render when Postgres or a webhook host is required, Greptile when the artifact is a pull request.
- LLM vendors are **not** named partners. Keys are bring-your-own, or whatever Replit Agent exposes. **CONFIRM** absence — [partner gaps](research/builders-day-partners-and-market.md).
- Event-day credit **amounts** are unpublished. Treat them as credits to claim at the booth.
- Sandbox payment and “we did not deliver a physical good today” must be said out loud. Overclaiming settlement or delivery is a trust failure, especially with a payments judge in the room.

## What we are not building in this repo

**TableTalk / interest-table meetup is a separate product.** It is out of scope here. Do not add schemas, flows, or partner wiring for it in these docs.

Also out of scope for this repository:

- Application source, CI, and deploy config.
- A forced ranking that declares one idea the Saturday build.
- Invented booth challenges. If a partner did not publish a numbered problem for 24 October 2026, the card stays **INFER**.
- A name for the Community Partner slot. It was unpublished in the page-text extract. No problems are written for that unknown org.
- WhatsApp Business API, Razorpay, Clerk, or an LLM vendor as if they were event partners. They are not.

## How the four ideas share a stack without collapsing

[Partner architecture](05-partner-stack-architecture.md) is the shared picture. The proposal, open to Saturn / Gaia:

- **Replit** is the phone URL for all four.
- **Render** Postgres is the system of record when the demo must show a live counter of real rows (orders, plans, quiz attempts, clip jobs).
- **Pine Labs** (Agent Toolkit, payment links, P3P as stretch) is the checkout executor for Shopping AI and Grocery AI. Learning and Chotuchotu do not depend on it for day one.
- **ElevenLabs** is required for Chotuchotu’s audio gap and optional narration for visual learning and for a spoken grocery list.
- **Vobiz** is a stretch DID in front of ElevenLabs, strongest as a phone-in voice take for Chotuchotu or a spoken list for Grocery. It is not on the critical path of Shopping AI.
- **Greptile** serves the Builders backlog (PR risk, API fire drill). It is not a dependency of the four first-class products.
- **Peer Capital** and **Activate** are pitch and judge lenses, not APIs. **Airtribe** is the brief and the 20-user process.

A shared checkout executor is a proposal so Grocery does not fork payments. It is not a proposal to make Grocery a tab inside Shopping AI. The planning models differ. That argument is in [Grocery AI](02-grocery-ai-cadences.md).

## Bengaluru, this weekend

The room is Polaris in Brookefield: campus students plus a tech-park crowd, on phones, with placement anxiety, side-project commerce, and creator habits in the same building. The portfolio uses that room as distribution, not as the whole market.

- Commerce ideas can put a real (sandbox) UPI moment in a judge’s hand because Pine Labs is the title partner and the keynote is the agent commerce OS.
- Learning can use a one-page syllabus the room already understands.
- Creators can use a booth clip because the studio already exists and the missing layer is speech, which ElevenLabs is in the room to provide.
- Voice and Hinglish / Kannada / Hindi are part of the India wedge in the [India VC notes](research/builders-day-vc-research.md) and the [market memo](research/builders-day-partners-and-market.md). Each idea names where language matters and where English is enough for the 20-user pass.

## Saturday operating notes

These lock how to build on the day. They do not retire Grocery, visual learning, or Chotuchotu. Shopping AI is the default demo; [how to approach any problem tomorrow](10-tomorrow-problem-approach.md) is the pivot if a morning booth card points elsewhere.

| Doc | What it locks |
|---|---|
| [Saturday Shopping components](08-shopping-ai-saturday-components.md) | Named boxes, ownership, Replit-only host |
| [Shared orchestration](09-shared-orchestration.md) | Lite DAG: supervisor routes, Ranker / Checkout / Verify. Chotu uses Script / Voice / Verify |
| [How to approach any problem tomorrow](10-tomorrow-problem-approach.md) | Eight steps that stay the same if the product changes |
| [Agent orchestration memo](research/agent-orchestration-memo.md) | Neptune’s framework comparison. Runtime default is Vercel AI SDK |

Chotu’s day-of slice is a section of the existing studio doc, not a new file: [Saturday walkthrough](04-chotuchotu-studio.md#saturday-walkthrough).

## Reading order for a critique

1. [Unified matrix](06-unified-ideas.md) — one table, four ideas, partners, inferred problem shape, status.
2. [Partner stack](05-partner-stack-architecture.md) — how each named tool plugs in, with CONFIRM vs INFER.
3. The idea doc under review, especially “Out of scope” and “Open questions”. For the Saturday Shopping build, read [Saturday Shopping components](08-shopping-ai-saturday-components.md) with [Shopping AI](01-shopping-ai.md) and [shared orchestration](09-shared-orchestration.md). For a Chotu Saturday read, open the [Saturday walkthrough](04-chotuchotu-studio.md#saturday-walkthrough) inside the studio doc.
4. Write the result back into the Saturn / Gaia stubs in the unified doc. Those sections are intentionally empty of decisions.
