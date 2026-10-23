> **Research archive** for [levelscorner/airtribe-builders-day](https://github.com/levelscorner/airtribe-builders-day).
> Original working title: `builders-day-vc-research.md`
> Compiled 23 Oct 2026 for Abhinav / Sol ahead of Airtribe AI Builders Day (Sat 24 Oct 2026, Bengaluru).
> What this file is: YC / VC demand and the 5-ideas-per-track map.
> This copy is the citation source for the portfolio docs. CONFIRM vs INFER labels inside still apply.
> Paths that originally pointed at `/workspace/*.md` now point at this `docs/research/` folder.

# Airtribe AI Builders Day — VC Demand Research + Idea Map
**Context:** Bengaluru, ~24 Oct 2026 · Tracks: Learning / Commerce / Builders / Creators  
**Constraint for ideas:** AI-first · shippable live web app in ~5h by 3 builders · 20 real users same day · phone URL  

---

## 1. What YC & other capitalists say they want (2025–2026)

### Y Combinator — Requests for Startups

**Primary source:** [ycombinator.com/rfs](https://www.ycombinator.com/rfs) (Fall 2026 RFS, fetched Oct 2026)

| Theme | What YC literally asks for | Maps to track |
|---|---|---|
| **The Primer** | Adaptive AI that teaches children to read/write/arithmetic “at the quality of a devoted private tutor and at consumer scale”; entry point to a lifelong adaptive tutor | **Learning** |
| **AI-Powered Consumer Products for 1 Billion People** | New consumer icons beyond ChatGPT; agents for how people “get things done, get around, **learn**, stay healthy, manage money, play, connect” — “CONSUMER is going to be so back” | Learning / Commerce / Creators |
| **Multiplayer AI** | Shared live agent sessions (not private chat transcripts); drop-in, redirect, handoff like a teammate — for eng, sales, support, legal, marketing | **Builders** (+ Commerce GTM) |
| **A Cloud for Small Software** | Agent-built personal/team tools that are “as easy to share… as a Google Doc”; deploy/share/auth for bespoke agent software | **Builders** |
| **Self-Maintaining APIs** | Agents that scan customer codebases and open PRs when APIs change (Dependabot-for-APIs) | **Builders** |
| **AI-Native Compliance Infrastructure** | Compliance as AI-default monitoring/reports/audit trails, not spreadsheet stacks | Commerce / Builders (B2B) |
| **Agentic commerce** (under crypto RFS) | Explicitly lists “agentic commerce” among crypto/fintech bets | **Commerce** |
| **New OS for the Physical World** | Coordinate AI agents + robots + humans in field work; capture end-to-end work data | Commerce ops / Builders |

**Fall 2025 RFS (secondary but widely reported):** Inc summarizes YC’s Fall 2025 ask for **AI-powered vocational schools** — personalized multimodal AI (voice coach, AR/VR, vision feedback) to train electricians/HVAC/welders in months, employers pay for hires ([Inc, Aug 2025](https://www.inc.com/ben-sherry/heres-what-y-combinator-is-looking-for-in-ai-startups-right-now/91221760)). HuggingFace RFS dataset also lists **“Personal AI Tutors for Everyone”** and **“AI-Native Enterprise Software”** / multi-agent infra for Fall 2025 ([HF dataset](https://huggingface.co/datasets/vrajasekaran/yc-request-for-startups)).

### Sequoia Capital

- **[Services: The New Software](https://sequoiacap.com/article/services-the-new-software)** (Julien Bek, Mar 2026): Copilot sells the *tool*; **autopilot sells the *work***. Wedge = already-outsourced, intelligence-heavy tasks (NDAs, coding medical claims, IT MSP, recruitment screening, tax). “For every dollar spent on software, six are spent on services.”
- **[2026: This is AGI](https://sequoiacap.com/article/2026-this-is-agi)** (Grady & Huang, Jan 2026): Long-horizon agents that “figure things out”; apps of 2026 are **doers not talkers**; sell work/outcomes; obsess over agent harness + reliability.
- **[AI Ascent 2026](https://sequoiacap.com/article/ai-ascent-2026)**: “Get MAD” — moats from the customer back; 2026 = year of agents (models + tools + harnesses).

### a16z

- **[Notes on AI Apps in 2026](https://a16z.com/notes-on-ai-apps-in-2026/)** (Anish Acharya): Thick/narrow AI apps (multi-model, cornered data, network effects, feature surface); thinking tools vs making tools; “every team should be a software team.”
- **[Big Ideas 2026 Part 1](https://a16z.com/newsletter/big-ideas-2026-part-1/)**: Multimodal content creation (“killer use case”); **vertical AI → multiplayer**; systems of record lose primacy to agent execution; “year of me” personalization (AI tutors cited); agent-native infra; creating for agents not humans.
- **[It’s time for agentic video editing](https://a16z.com/its-time-for-agentic-video-editing/)** (Justine Moore, Jan 2026): Vision + tool-using agents for process/orchestrate/polish/adapt/optimize video — “What Cursor did for coding, these agents will do for video.”

### India VCs — Accel, Peak XV, Lightspeed, PeerCapital

- **Mint (May 2025)** — Accel / Peak XV / Lightspeed: shift to **application-layer** and **vertical AI agents**; Peak XV Surge: 8/14 AI; Anandan: vertical AI mega-theme (banks, insurance, retail, healthcare…); Mohapatra (Lightspeed): India’s moat is **data + domain workflows**, not frontier models; Accel Atoms AI backs agents for enterprise workflows ([Mint](https://www.livemint.com/technology/ai-application-startups-india-accel-peak-xv-lightspeed-technology-startups-vc-firms-11746162890711.html)).
- **Accel Atoms AI 2025** — “agents for enterprise workflows” to “LLM testing”; up to $1M + credits ([atoms.accel.com](https://atoms.accel.com/news/atoms-2025-and-beyond)).
- **Lightspeed India** — ~60% of recent India bets AI-native; edge = **applied innovation**, linguistic/regulatory complexity, voice-led usage ([ET EnterpriseAI](https://enterpriseai.economictimes.indiatimes.com/news/industry/lightspeed-bets-big-on-ai-indias-real-edge-is-in-applied-innovation-ravi-mhatre-bejul-somaia/128703784)); new ~$250M India fund focused early-stage AI ([TechCrunch Sep 2026](https://techcrunch.com/2026/09/24/lightspeed-targets-250m-for-new-india-fund-focusing-on-early-stage-ai/)). Example: Stimuler (voice-first ESL tutor).
- **PeerCapital** — India as **applied-AI proving ground**; “services as software”; commerce hyper-personalization, entertainment/creator workflows, skilling, voice ([PeerCapital Substack](https://peercapitalvc.substack.com/p/the-india-ai-renaissance-from-services)).

---

## 2. Five ideas per track

*All ideas assume: one public mobile URL, magic-link or name+phone OTP / Google, AI does the core loop in &lt;60s, shareable output for virality at the venue.*

### A. AI for Learning

| # | One-line pitch | Why YC/VCs care | Demo hook (20 users) | Main risk |
|---|---|---|---|---|
| **L1** | **Interview Drill Coach** — voice AI that runs a 5-min mock FAANG/product interview, scores you, and gives a rewrite of your weakest answer. | YC Primer + consumer AI; Sequoia autopilot for “outsourced” coaching; Lightspeed already funded voice ESL (Stimuler); India skilling thesis (PeerCapital/NITI). | QR at venue → speak answers on phone → get scorecard + shareable “level-up” card. | Latency/noise in a loud hall; voice quality uneven. |
| **L2** | **Concept Explainer in Your Language** — paste any syllabus PDF/slide; AI teaches it in Kannada/Hindi/English at your level with a 3-question check. | YC tutors + India multilingual moat (Lightspeed); a16z “year of me” personalization. | Upload one page → 90s lesson + quiz; teammates compare scores. | Hallucinated facts if not grounded to the uploaded text. |
| **L3** | **Mistake Mirror for Coders** — paste a failing LeetCode/assignment; AI diagnoses *your* misconception (not just the fix) and drills one micro-exercise. | YC personal tutors; Sequoia “intelligence work” autopilot wedge in tutoring; Peak XV vertical agents. | Paste broken code → misconception card + 1 drill → retake pass/fail. | Looks like ChatGPT wrapper unless misconception taxonomy is crisp. |
| **L4** | **Soft-Skills Roleplay for Campus Placements** — AI plays hiring manager / difficult teammate; ends with a rubric on assertiveness, clarity, listening. | Consumer AI (YC); India placement anxiety = distribution; PeerCapital skilling. | 2-min chat roleplay → radar chart → WhatsApp share. | Subjective scoring feels arbitrary without calibrated rubrics. |
| **L5** | **Trade Micro-Skill Coach (HVAC-lite)** — phone camera + voice: “wire this mock breaker / pack this order”; AI vision checks steps against a checklist. | Direct Fall 2025 YC vocational RFS (Taggar/Inc); physical-world OS adjacency. | Use printed checklist + phone cam at booth; pass/fail badge. | Hard to ship robust vision in 5h; lighting/false fails kill trust. |

**Hackathon-favored pick:** L1 or L2 (highest “wow / ship / share” ratio).

---

### B. AI for Commerce

| # | One-line pitch | Why YC/VCs care | Demo hook (20 users) | Main risk |
|---|---|---|---|---|
| **C1** | **Stall Price & Pitch Agent** — café/merchant snaps a menu photo; AI returns dynamic combo offers + a 15s sales script for walk-up customers. | YC consumer + agentic commerce; PeerCapital commerce hyper-personalization; India SMB ROI. | Partner with venue café or fake stall; scan menu → offer → staff uses script live. | Need a real merchant; otherwise demo feels fake. |
| **C2** | **Buy-for-Me Shortlist** — tell agent budget + constraints (“earbuds under ₹3k, good for calls”); it returns 3 ranked picks with tradeoffs (not ads). | YC consumer agents; a16z “creating for agents”; Sequoia doers; shopping-agent evals interest (YC companies like ORO). | 60s chat → shortlist card; users vote which pick they’d buy. | No real checkout → looks like comparison blog; need transparent criteria. |
| **C3** | **WhatsApp Catalog Doctor for Kirana/D2C** — paste messy product list; AI cleans titles, variants, SEO bullets, and a “today’s deal” banner in Hinglish. | India applied AI (Lightspeed/PeerCapital); Accel vertical retail agents; Sequoia services→software. | Founders/creators paste 10 SKUs → before/after catalog PDF. | Commodity catalog cleanup; need one magical vertical (e.g. food). |
| **C4** | **Objection Killer for Campus Sellers** — AI listens to a pitch rehearsal, predicts top 5 objections, and generates rebuttals + pricing framing. | Sequoia autopilot for GTM; a16z multiplayer/sales agents; YC multiplayer sales. | Record 30s pitch → objection pack; pair sellers to try rebuttals. | Generic sales tips unless domain-constrained (e.g. merch, tickets). |
| **C5** | **Trust-Layer Reviews** — upload a receipt/order screenshot; AI verifies purchase claim and writes a structured review; flags likely fake reviews on a sample page. | YC “Proving You’re Human” / trust layer; commerce integrity. | Scan a receipt → verified review badge on a demo storefront. | Fraud UX is sensitive; easy to overclaim “verification.” |

**Hackathon-favored pick:** C2 or C1 (clear AI-as-product; easy same-day users).

---

### C. AI for Builders

| # | One-line pitch | Why YC/VCs care | Demo hook (20 users) | Main risk |
|---|---|---|---|---|
| **B1** | **Multiplayer Prompt Room** — one shared agent session URL; everyone can watch, interrupt, and branch the same coding/research agent (Figma-for-agents lite). | **Direct YC Fall 2026 Multiplayer AI RFS**; a16z vertical→multiplayer. | Drop link in Discord/room; 10 people steer one agent building a tiny app. | Sync/state complexity; race conditions in 5h build. |
| **B2** | **PR Risk Narrator** — paste a GitHub PR diff; AI returns blast-radius map, test plan, and a “merge / don’t merge” rationale for humans. | YC self-maintaining APIs / agent harness culture; Sequoia coding agents as AGI wedge; Accel tooling. | Open laptop → paste diff → share risk card with teammate. | Needs good diff parsing; noisy on huge PRs. |
| **B3** | **Small Software Deploy Button** — describe a one-page internal tool; agent generates + hosts a shareable app link (auth stub) in minutes. | **YC Cloud for Small Software**; a16z “every team software”; consumer delight of agent-built apps. | “Build me a waitlist for our booth” → live URL in &lt;3 min; 20 people join waitlist. | Security (arbitrary code); keep to templated sandboxes. |
| **B4** | **Agent Eval Arena** — same task, 2–3 models/prompts; side-by-side pass/fail + latency/cost; vote which harness wins. | Accel “LLM testing”; Sequoia obsess over harness reliability; a16z multi-model thick apps. | Room runs one coding/support task; live leaderboard. | Cost spikes; may need mocked model slots if keys limited. |
| **B5** | **API Change Fire Drill** — simulate a Stripe-like breaking change; agent scans a toy codebase and opens a “fix PR” diff. | **YC Self-Maintaining APIs**; Builders-day Greptile partner fit. | Show before/after PR on screen; attendees submit their own sample file. | Narrow audience (devs only) — still OK at AI Builders Day. |

**Hackathon-favored pick:** B1 or B3 (most “AI product, not feature”; viral share URLs).

---

### D. AI for Creators

| # | One-line pitch | Why YC/VCs care | Demo hook (20 users) | Main risk |
|---|---|---|---|---|
| **CR1** | **Clip Autopilot** — upload a long phone video; AI finds hooks, cuts 3 vertical shorts with captions + thumbnail text. | a16z agentic video editing (Moore); Big Ideas multimodal; PeerCapital entertainment AI; YC consumer. | Upload 2–5 min talk → 3 shorts; post to IG/WhatsApp Status. | Processing time/cost; need short clips or aggressive trim. |
| **CR2** | **Brand Voice Remix** — paste 3 sample posts + a news link; AI writes in *your* voice for X/LinkedIn/Instagram with tone dial. | a16z thick apps + cornered style data; YC consumer; India creator economy. | Paste samples → 3 posts; friends blind-vote which sounds like you. | Style cloning quality; plagiarism optics if sourcing news. |
| **CR3** | **Micro-Drama Studio** — 4-panel storyboard → AI generates script + image frames + voiceover for a 30s India-context skit. | a16z multimodal + micro-dramas interest; Generative Media thesis; consumer AI. | Pick a trope (startup rejection, PG mess) → watch skit → share. | Model/API credits; consistency across frames. |
| **CR4** | **Creator Deal Desk** — paste a brand brief; AI scores fit vs your niche, drafts a rate card + negotiation email. | Sequoia sell-the-work (creator services autopilot); India creator monetization. | Creators at event paste IG bio + brief → rate card PDF. | Pricing advice liability; need honest “estimate” framing. |
| **CR5** | **Audience Twin** — answer 8 questions; AI simulates your ICP commenting on a draft post (likes, confusions, share triggers). | a16z thinking tools; multiplayer feedback without real audience; YC consumer. | Draft post → 5 synthetic comments from “Bengaluru PM” etc. → revise live. | Synthetic feedback can mislead if not labeled clearly. |

**Hackathon-favored pick:** CR1 or CR2 (instant shareable output = 20 users).

---

## 3. Hottest demand themes (cross-track)

1. **Sell the work (autopilot), not the chat (copilot)** — Sequoia: copilots → autopilots; 2026 agents are “doers”; price outcomes ([Services: The New Software](https://sequoiacap.com/article/services-the-new-software), [2026: This is AGI](https://sequoiacap.com/article/2026-this-is-agi)).
2. **Personal AI tutors & skilling at consumer scale** — YC Primer + Fall 2025 vocational tutors; a16z “year of me”; India voice/skilling (Lightspeed Stimuler, PeerCapital) ([YC RFS](https://www.ycombinator.com/rfs), [Inc](https://www.inc.com/ben-sherry/heres-what-y-combinator-is-looking-for-in-ai-startups-right-now/91221760)).
3. **Multiplayer / shared agents as the next moat** — YC Multiplayer AI; a16z vertical AI → multiplayer collaboration layer ([YC RFS](https://www.ycombinator.com/rfs), [Big Ideas 2026](https://a16z.com/newsletter/big-ideas-2026-part-1/)).
4. **Application-layer vertical agents (India’s edge)** — Accel/Peak XV/Lightspeed: apps & vertical agents over foundation models; linguistic/regulatory complexity as moat ([Mint](https://www.livemint.com/technology/ai-application-startups-india-accel-peak-xv-lightspeed-technology-startups-vc-firms-11746162890711.html), [Lightspeed/ET](https://enterpriseai.economictimes.indiatimes.com/news/industry/lightspeed-bets-big-on-ai-indias-real-edge-is-in-applied-innovation-ravi-mhatre-bejul-somaia/128703784)).
5. **Multimodal creation agents (especially video)** — a16z: content creation killer use case; agentic editing that “does what Cursor did for coding” ([Big Ideas](https://a16z.com/newsletter/big-ideas-2026-part-1/), [Agentic video editing](https://a16z.com/its-time-for-agentic-video-editing/)); YC consumer products for a billion people ([YC RFS](https://www.ycombinator.com/rfs)).

---

## Practical note for Builders Day (not architecture)

Judges want a **working AI product live in front of strangers**, not a docs-heavy social app. Prefer ideas where:
- the **AI loop is the homepage**,
- output is **shareable in &lt;2 minutes**,
- signup is **one tap**,
- and the pitch sentence matches a named RFS/thesis (“multiplayer agent”, “autopilot for X”, “personal tutor”, “video agent”).

**No repo / no code in this deliverable** — research + idea map only.
