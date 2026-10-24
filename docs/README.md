# Docs

Portfolio notes for Airtribe AI Builders Day. The full index, event facts, and labels live in the [root README](../README.md). Thesis and non-goals: [overview](00-overview.md).

## Saturday primary build (`docs/core`)

The room’s build spec for 24 Oct 2026 is the vernacular Learning coach. Start at the [checklist](core/CHECKLIST.md).

| Doc | What it is |
|---|---|
| [Checklist](core/CHECKLIST.md) | Tracker, change-control rule, open UNKNOWNs |
| [01 Product requirements](core/01-product-requirements.md) | Problem, users, 20-user goal, scope, stories |
| [02 Technical requirements](core/02-technical-requirements.md) | Stack, latency, mobile autoplay, credits, fallbacks |
| [03 App flow](core/03-app-flow.md) | Screens and the lite DAG |
| [04 Design brief](core/04-design-brief.md) | Mobile UI, Hinglish copy, tap-to-play, access |
| [05 Backend schema](core/05-backend-schema.md) | Replit DB records and Zod node I/O |
| [06 Implementation plan](core/06-implementation-plan.md) | Clock to 16:00 IST, cut lines, Higgsfield demo video |
| [07 Tools provided](core/07-tools-provided.md) | Partner tools, credential placeholders, no secrets |

[docs/09](09-shared-orchestration.md), [docs/10](10-tomorrow-problem-approach.md), and [D8](06-unified-ideas.md) name Shopping AI as the earlier default. The core pack is the coach build.

## Idea docs

| Doc | What it is |
|---|---|
| [00 Overview](00-overview.md) | Thesis, shared constraints, Saturday operating notes |
| [01 Shopping AI](01-shopping-ai.md) | Broad buy / shortlist / checkout |
| [02 Grocery AI](02-grocery-ai-cadences.md) | Daily / weekly / monthly replenishment |
| [03 Visual learning](03-visual-learning-pdf.md) | PDF page → grounded lesson and quiz |
| [04 Chotuchotu](04-chotuchotu-studio.md) | Existing studio; audio is the gap. Saturday slice: [Saturday walkthrough](04-chotuchotu-studio.md#saturday-walkthrough) |
| [05 Partner stack](05-partner-stack-architecture.md) | How each named tool plugs in |
| [06 Unified ideas](06-unified-ideas.md) | Single-pane matrix |
| [07 Backlog demos](07-backlog-demos.md) | L1, B1, B3, CR1 |

## Saturday operating notes

| Doc | What it locks |
|---|---|
| [08 Shopping components](08-shopping-ai-saturday-components.md) | Named boxes and 2-coder ownership. Replit-only host |
| [09 Shared orchestration](09-shared-orchestration.md) | Lite DAG. Shopping: Ranker / Checkout / Verify. Chotu: Script / Voice / Verify |
| [10 Tomorrow’s approach](10-tomorrow-problem-approach.md) | Eight steps if a booth card changes the product |

## Research archive

- [VC demand](research/builders-day-vc-research.md)
- [Partners and market](research/builders-day-partners-and-market.md)
- [Problem statements (CONFIRM vs INFER)](research/builders-day-partner-problem-statements.md)
- [Agent orchestration decision memo](research/agent-orchestration-memo.md) — Neptune’s framework comparison. Runtime default is Vercel AI SDK. The locked lite extract is [09](09-shared-orchestration.md).
