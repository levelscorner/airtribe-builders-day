# Airtribe AI Builders Day — product portfolio

Documentation for the ideas Abhinav is keeping in play for **Airtribe AI Builders Day** (Saturday 24 October 2026, Bengaluru) and for the weeks after. This repository holds product and architecture notes only. There is no application source here.

Nothing in this repo locks a single Saturday bet. Four ideas stay first-class. A short backlog records earlier demo shapes that are still available if a booth challenge or the team’s skills pull that way.

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
| [Shopping AI](docs/01-shopping-ai.md) | Broad buy / shortlist / agentic checkout. Any category. Pine Labs closes the loop. | Commerce | Architecture draft |
| [Grocery AI](docs/02-grocery-ai-cadences.md) | Household replenishment on **daily / weekly / monthly** cadences, vendors, and payment. | Commerce (vertical) | Architecture draft |
| [PDF → visual learning](docs/03-visual-learning-pdf.md) | Syllabus or PDF page becomes a grounded visual lesson and a quiz. | Learning | Architecture draft |
| [Chotuchotu](docs/04-chotuchotu-studio.md) | Existing private video studio (“checkout autoshort”). Audio is the gap. ElevenLabs, with Vobiz as a stretch. | Creators | Architecture draft; studio internals **UNKNOWN** here |
| [Backlog demos](docs/07-backlog-demos.md) | L1 Interview Drill Coach, B1 Multiplayer Prompt Room, B3 Small Software Deploy, CR1 Clip Autopilot | Learning / Builders / Creators | Backlog, not first-class |

Shopping AI and Grocery AI are both Commerce. They are different products. Grocery is the recurring-cadence vertical. Shopping AI is the open-category agent that can check out. Read both before treating one as a mode of the other.

## How to read these docs

1. **Ten minutes.** This page, then [the single-pane matrix](docs/06-unified-ideas.md).
2. **Portfolio thesis and non-goals.** [Overview](docs/00-overview.md). TableTalk is named there once and stays out of this repo.
3. **One product.** Its idea doc (`docs/01`–`docs/04`), then the partner sections it cites in [partner architecture](docs/05-partner-stack-architecture.md).
4. **Architecture review (Saturn / Gaia).** Start at [partner architecture](docs/05-partner-stack-architecture.md), work the open questions at the bottom of each idea doc, and write decisions into the stubs in [unified ideas](docs/06-unified-ideas.md).
5. **Citations.** [docs/research/](docs/research/) is the archive of the three source memos (VC demand, partners and market, CONFIRM vs INFER problem cards). Idea docs cite those files instead of restating every source URL.

## Map

```
README.md
docs/00-overview.md
docs/01-shopping-ai.md
docs/02-grocery-ai-cadences.md
docs/03-visual-learning-pdf.md
docs/04-chotuchotu-studio.md
docs/05-partner-stack-architecture.md
docs/06-unified-ideas.md
docs/07-backlog-demos.md
docs/research/builders-day-vc-research.md
docs/research/builders-day-partners-and-market.md
docs/research/builders-day-partner-problem-statements.md
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
