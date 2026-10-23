# Unified ideas

Single pane for the portfolio. Detail lives in the linked docs. This page is the one to keep open in an architecture discussion.

**No bet is locked.** Status describes documentation, not a running app.

## Status legend

| Status | Meaning |
|---|---|
| **idea** | Problem and user are named. No partner wiring yet. |
| **research** | Grounded in the [archive](research/). Booth cards still labeled CONFIRM or INFER. |
| **architecture** | A sketch names partner tools, a 20-user demo, and open questions. Ready for Saturn / Gaia to accept or replace. |

Everything first-class below is **architecture**. Nothing has moved to a build repo.

## Matrix

| Idea | Track | One-line | Partners it actually needs | Day-of problem shape | Label of that shape | Status | Doc |
|---|---|---|---|---|---|---|---|
| **Shopping AI** | Commerce | Budget + constraints → 3 tradeoff picks → Pine Labs pay | Replit URL; Pine Labs Toolkit or payment link; BYO model; Render if the order log is split out. ElevenLabs optional. P3P stretch | “Agent that buys, not a chat that recommends” (payment link / `createOrder`, sandbox OK) | **INFER** Pine Labs card 1. Commerce brief is **CONFIRM** | architecture | [01](01-shopping-ai.md) |
| **Grocery AI** | Commerce vertical | Same household, three clocks — daily / weekly / monthly — then a vendor quote and pay | Replit; Pine Labs; price book in Postgres (Render or Replit); BYO model. ElevenLabs read-aloud optional. Vobiz stretch. P3P stretch on monthly | Kirana list → offer → collect is the nearest card. **Cadence itself is not a published card** | Card: **INFER** Pine Labs 5 (and card 2 for a daily top-up). Cadence: **PROPOSAL** | architecture | [02](02-grocery-ai-cadences.md) |
| **PDF → visual learning** | Learning | One PDF page → visual cards, one diagram, 3 grounded questions | Replit; BYO model; Render for attempts. ElevenLabs TTS optional. Vobiz only if oral viva is added | “Teach this page in the learner’s language and check them” | Learning brief **CONFIRM**. ElevenLabs vernacular card **INFER** | architecture | [03](03-visual-learning-pdf.md) |
| **Chotuchotu** | Creators | Existing studio; add ElevenLabs audio. Vobiz phone-in is stretch | ElevenLabs TTS required for the gap. Replit only if the studio has no public URL. Render for the audio job log. Vobiz stretch. Studio repo **UNKNOWN** here | “Full studio in one phone, any Indian language” plus a VO/caption layer | Creators brief **CONFIRM**. ElevenLabs VO card **INFER** | architecture | [04](04-chotuchotu-studio.md) |
| L1 Interview Drill Coach | Learning | 5-min voice mock interview → scorecard | ElevenLabs Conversational AI; Replit; Vobiz stretch | Voice coach that speaks, not a TTS of a chat reply | **INFER** ElevenLabs card 1. Brief **CONFIRM** | research (backlog) | [07](07-backlog-demos.md) |
| B1 Multiplayer Prompt Room | Builders | One URL, many phones, one agent session | Replit; realtime layer is **not** a named event partner | Shared agent, not private chat | **INFER** Replit card 5. YC multiplayer is external demand, not a booth card. Builders brief **CONFIRM** | research (backlog) | [07](07-backlog-demos.md) |
| B3 Small Software Deploy | Builders | Plain English → hosted tiny app | Replit Agent; Render optional; Greptile optional flourish | Non-coder describes a tool and gets a URL | **INFER** Replit card 1. Builders brief **CONFIRM** | research (backlog) | [07](07-backlog-demos.md) |
| CR1 Clip Autopilot | Creators | Long clip → 3 vertical shorts | Replit + a cutter. ElevenLabs for VO/captions. No official video-gen partner | Studio-in-a-phone / clip to captioned shorts | Brief **CONFIRM**. Cutting pipeline is the backlog twin of Chotuchotu | research (backlog) | [07](07-backlog-demos.md) |

Peer Capital and Activate appear on every row as **pitch lenses**, not as dependencies. Airtribe appears on every row as the 20-user process. Greptile appears as a product dependency only on a Builders backlog pivot.

## How the four first-class ideas sit together

```mermaid
flowchart LR
  subgraph commerce [Commerce CONFIRM brief]
    shop[Shopping AI episodic checkout]
    groc[Grocery AI cadence planner]
  end
  shop --- pay[Shared pay proposal: Pine Labs]
  groc --- pay
  learn[Visual learning PDF]
  studio[Chotuchotu plus ElevenLabs]
  learn --- el[ElevenLabs optional or required]
  studio --- el
  pay --- replit[Replit phone URL]
  el --- replit
  learn --- replit
```

Shopping AI does not store a cadence. Grocery AI does not rank earbuds. Visual learning does not charge. Chotuchotu does not become a tutor. Shared pieces are the phone URL, the optional Postgres counter, and — for the two commerce ideas only — a checkout function. That sharing is a [proposal](05-partner-stack-architecture.md), not a merge.

## Partner coverage at a glance

| If the room asks for… | Label today | Portfolio response |
|---|---|---|
| Official Commerce brief | **CONFIRM** | Shopping AI or Grocery AI, said as two products |
| Official Learning brief | **CONFIRM** | Visual learning |
| Official Creators brief | **CONFIRM** | Chotuchotu audio path; CR1 only if the studio cannot boot |
| Official Builders brief | **CONFIRM** | Not a first-class product. Backlog B3 or B1 |
| “Complete a purchase” | **INFER** Pine Labs | Shopping AI Flow A. Grocery if they want a basket instead of a shortlist |
| “Speak / call” | **INFER** Vobiz + ElevenLabs | Chotuchotu voice, or Grocery read-aloud, or backlog L1. Browser before DID |
| “Live URL a non-coder described” | **INFER** Replit | Any idea’s homepage; B3 if the product *is* the generator |
| “Artifact in under 2 minutes” | **INFER** Peer / Activate | Receipt, cadence plan, scorecard, or audio file |
| “Blast radius of a PR” | **INFER** Greptile | Backlog, not the four |
| 20 users before 19:30 | **CONFIRM** Airtribe | Whichever URL is actually up |

When a booth hands a written card, copy it into the matching stub below and change the label to **CONFIRM**.

## Saturday shape, still unlocked

Each idea’s 20-phone demo is specified in its own doc. Common bar:

- Public URL, one-tap name, AI loop on the homepage.
- Artifact in about two minutes: receipt or honest mock, cadence plan, scorecard, or audio file.
- Counter of unique people.
- Partner call that is live is labeled live. Partner call that is mocked is labeled mock.
- Sandbox money is not described as a delivered good. A lesson is not described as a full course. A voice file beside a video is not described as a finished theatrical cut.

The build window inside the 12-hour day is tight. The research memos plan for a URL around 16:00 and users before 19:30. Whichever idea is picked up that morning still leaves the other three documented.

## Research pointers

| Question | Archive |
|---|---|
| What do YC, Sequoia, a16z, Accel, Peak XV, Lightspeed, Peer Capital say they want? | [VC map](research/builders-day-vc-research.md) |
| Who is confirmed on this event, and what can their tools do in a few hours? | [Partners and market](research/builders-day-partners-and-market.md) |
| Which problem statements were actually published? | [CONFIRM vs INFER](research/builders-day-partner-problem-statements.md) |
| How does a tool plug into the system? | [Partner architecture](05-partner-stack-architecture.md) |

Earlier “top 3 bets” in the partner memo were L1, C2 with Pine Labs, and B3 or B1. This portfolio **keeps C2’s commerce job** and widens it into Shopping AI, **adds Grocery as its own vertical**, **keeps L2’s learning job** and makes it visual, and **keeps the creator job** as Chotuchotu rather than a new cutter. L1, B1, B3, and CR1 stay on the backlog. That is a change of emphasis, not a claim the earlier bets were wrong.

---

## Saturn / Gaia — architecture discussion stubs

Fill these in discussion. Leave the prompt text. Add decisions under each heading. Do not delete the open questions; mark them resolved when they are.

**How to write a decision:** one paragraph, the alternative rejected, and which doc must change if the decision sticks. If a partner booth upgrades a card to CONFIRM, paste the card text.

D1–D4 below are Saturn’s decisions from 2026-10-23. D5–D8 are Gaia’s decisions from 2026-10-23.

### Discussion log

| Date | People | Topic | Decision id |
|---|---|---|---|
| 2026-10-23 | Saturn | Host split; Pine Labs rail; Shopping × Grocery; Grocery demo cadence | D1–D4 |
| 2026-10-23 | Gaia | D5–D8 (visual, Chotuchotu, Greptile/Vobiz, Saturday demo) | D5–D8 |

### D1 — Host split

- **Question:** Replit only, or Replit UI plus Render secrets/Postgres? See [partner architecture §8.1](05-partner-stack-architecture.md). **Resolved 2026-10-23 (Saturn).**
- **Decision:** Replit-only for Saturday as the public phone URL, auth stub, DB counter, and secrets host. Render Web Service + Postgres stays documented as a backup slide / post-event shape, not a second live host on the day.
- **Gaia alternative (conditional):** If the Saturday demo is Commerce (Shopping/Grocery), prefer Replit UI + Render secrets/Postgres for Pine Labs webhooks and merchant keys; if Learning or Creators, Replit-only is enough.
- **Rejected alternative:** Dual Replit UI + Render secrets/Postgres on Saturday (seam risk near 18:00; Airtribe URL + 20-user counter must not depend on two half-configured hosts).
- **Follow-through:** The §3 diagram caption and §8 item 1 in [partner architecture](05-partner-stack-architecture.md) now record Saturday’s primary pick as Replit-only. Render table names stay for later. Warm-up / keepalive notes still apply if anyone later turns Render on.

### D2 — Pine Labs rail

- **Question:** Payment link, Toolkit `createOrder`, or P3P mandate for the judged pay tap? Credentials actually received at the booth: **UNKNOWN** as of 2026-10-23. **Resolved 2026-10-23 (Saturn)** for the rail; paste the booth credential answer on this line when it arrives.
- **Decision:** Judged pay path is Pine Labs Agent Toolkit `createOrder` (or the payment-link equivalent from the Toolkit) returning `{order_id, url}`. The browser opens `url`. The return path calls `getOrder` and writes the order row. P3P / UPI ReservePay / mandates are a stretch second screen only if booth credentials confirm P3P is enabled; otherwise narrate from the keynote and keep the live path on the link. Partner tools stay first-class: Pine Labs Agent Toolkit, MCP at build time, and P3P as stretch — not a generic payment gateway.
- **What the UI is allowed to say:** “Sandbox payment” or “Demo order” when the call is sandbox. Never claim settlement or delivered goods for sandbox or mocks. If credentials are late, ship the shortlist or cadence artifact and label the receipt **mock**.
- **Follow-through:** Shared server-side `pay(amount, sku_label, user_id)` wrapper on Replit. `cancelOrder` and `createRefund` are staff-only. Record booth credential answers in this stub when known. Noted on [partner architecture §8](05-partner-stack-architecture.md) item 2.

### D3 — Shopping AI × Grocery AI

- **Question:** Two products with a shared `pay()`, or one app with a mode? Cadence storage if Grocery stays separate: **Resolved 2026-10-23 (Saturn).**
- **Decision:** Two products. They share only `pay()` and the Replit URL / user-counter pattern. No mode flag merges them. Grocery owns `groc_plans` (or the Replit DB equivalent) with daily, weekly, and monthly clock fields as first-class data, not prompt text. Shopping owns the episodic shortlist and checkout and has no cadence fields.
- **Rejected alternative:** One Commerce app with a mode switch. That collapses the Grocery thesis that cadence is the product.
- **Follow-through:** Idea docs [01](01-shopping-ai.md) and [02](02-grocery-ai-cadences.md) stay separate. The matrix on this page stays two rows. Noted on [partner architecture §8](05-partner-stack-architecture.md) item 3.

### D4 — Grocery demo cadence

- **Question:** Which clock is polished (proposal: weekly), and are daily and monthly still one tap? **Resolved 2026-10-23 (Saturn).**
- **Price book owner and freeze time:** Team-owned static book in the DB. Freeze by noon Saturday. No quick-commerce private APIs.
- **Charge:** Full sandbox basket total via the Pine Labs path, clearly labeled sandbox. Not a silent ₹ hold that judges might misread as production.
- **Decision:** Polish **weekly** for the judged path: household basket, then a vendor quote from the price book, then pay. Daily and monthly remain one-tap secondary demos using the same plan schema.
- **Follow-through:** Seed the weekly plan and the price book in the Replit DB early afternoon.

### D5 — Visual lesson fidelity

- **Question:** Citation cards only, or cards plus the SVG diagram spec? **Resolved.** Citation cards plus one SVG diagram from a tiny schema.
- **Booth sample page (rights):** **Resolved** as a rights rule. A team-owned syllabus or PDF the team can print and host, with clear rights to show it. A scraped copyrighted textbook stays out. The filename itself is **UNKNOWN** until the team names the file.
- **Languages in the 20-user script:** **Resolved.** English and Hindi/Hinglish. Kannada only if a teammate owns that copy before doors. “Teach in the learner’s language” is the Learning brief (**CONFIRM**). This language set is the Saturday script.
- **Narration default:** off, proposal stands unless changed. **Resolved.** ElevenLabs TTS is an optional toggle. The scripted path leaves the toggle off.
- **Decision:** The lesson is citation cards plus an SVG diagram drawn from a tiny schema. Fail closed if extraction is empty or the schema is empty: stop the lesson, and do not fill the gap from model memory or from an image API. Image generation is not an event partner (**CONFIRM** absence, [partner architecture §7](05-partner-stack-architecture.md)); this path has no unpartnered bitmap or image-gen API. Narration defaults off. ElevenLabs TTS (**CONFIRM** toolkit) is the optional toggle when someone asks for it. The 20-user languages are English and Hindi/Hinglish. Kannada ships only if a teammate owns the copy. The booth sample is a team-owned syllabus or PDF with clear rights. The vernacular-explainer booth card stays **INFER**. The wiring above is the accepted **PROPOSAL** for Saturday.
- **Rejected alternative:** Cards only — too weak for a lesson called visual. Requiring an image-generation model — not an event partner.
- **Follow-through:** [docs/03](03-visual-learning-pdf.md) and [docs/05 §8.4](05-partner-stack-architecture.md). Learning pitch stays a grounded lesson plus a scorecard.

### D6 — Chotuchotu audio interface

- **Repo / branch / what “checkout autoshort” means:** **UNKNOWN.** Open until the private repo is readable. Do not invent studio internals. What “checkout autoshort” refers to — repo, branch, button, or flag — is **UNKNOWN** here; resolve it from the private repo in hour one.
- **Export the audio service can take:** **UNKNOWN** until that read. The plan until then is the contract `(media_ref, script, language)` → an ElevenLabs TTS job → logged files (Replit DB, or Render if Render is already used).
- **Public at the venue: yes / no** **UNKNOWN** until the private repo is opened in hour one.
- **Mux audio into video: yes / side-by-side files** **Resolved.** Side-by-side audio file and video. Mux only if the studio already muxes.
- **ElevenLabs voice ids (English / Hindi / Hinglish):** Open. Pick at the booth from ElevenLabs English, Hindi, and Hinglish voices. Record the ids on this line when chosen.
- **Vobiz in the Saturday script: yes / no** **Resolved** as no, unless a DID is live by noon IST. Otherwise browser or file only. A phone-in DID stays **INFER** (Vobiz card), not the spoken script.
- **Decision:** Plan a side audio service: `(media_ref, script, language)` → ElevenLabs TTS job → logged files in Replit DB, or on Render if Render is already in use. ElevenLabs TTS is the **CONFIRM** speech partner for this gap. The plan is provisional. The first architecture hour on Saturday is opening the private studio repo; if an audio hook already exists, delete the side-service plan and attach there. Saturday’s delivery is a side-by-side audio file and video. On this Saturday the job log is Replit DB: D1’s accepted host is Replit-only, so Render is not already in use. Vobiz stays out of the spoken script unless a DID is live by noon IST; the path that must work is browser or file. Voice ids are picked at the booth from ElevenLabs English / Hindi / Hinglish and written on the line above. Repo, branch, export, venue reachability, and the meaning of “checkout autoshort” stay **UNKNOWN**.
- **Follow-through:** [docs/04](04-chotuchotu-studio.md) and [docs/05 §8.5](05-partner-stack-architecture.md). Creators pitch: “the studio finishes the voice, in the script’s language.”

### D7 — Greptile and Vobiz scope

- **Greptile on a first-class homepage: no, unless this decision says yes.** **Resolved.** No. Off Shopping, Grocery, visual learning, and Chotuchotu. Staff tool during the build, and Builders backlog B2/B5 only (research ideas in the VC map, not booth cards).
- **Vobiz DID status at noon:**
- **Decision:** Greptile stays off all four first-class homepages. It is a staff tool, and a product only on Builders backlog B2/B5 — not a Shopping, Grocery, visual-learning, or Chotuchotu user flow. That matches the existing Greptile **PROPOSAL** and is accepted here. Vobiz is never the only path. Browser mic or file → ElevenLabs first (**CONFIRM** toolkit for speech; Vobiz DID problems stay **INFER**). A DID is stretch and drops from the script if it is not live by noon IST. Noon DID status is **UNKNOWN** until the day and stays blank on the line above for that fill.
- **Follow-through:** [docs/05 §4.4, §4.7, §8.6–8.7](05-partner-stack-architecture.md).

### D8 — What Saturday actually runs

This stub is the only place a single demo is allowed to be chosen, and only for the day. It does not retire the other ideas.

- **Demo chosen for the room:** **Shopping AI.** Architecture recommendation for the day, unlockable morning-of (**PROPOSAL**). It does not retire Grocery AI, visual learning, or Chotuchotu. D1–D4 stay Saturn’s.
- **Why:** Pine Labs is the **CONFIRM** title partner, and the keynote is **CONFIRM**: “The New OS for Commerce: Building the Agent Ecosystem.” The clearest booth shape is **INFER** Pine Labs card 1, “agent that buys.” Peer Capital “commerce that converts” is **INFER**, and it is true of this demo if `createOrder` or a payment link works. The Commerce brief is **CONFIRM**. Aligned with Saturn on the commerce demo and on D2’s Pine Labs rail. D3 stays two products; this choice does not fold Grocery in.
- **Why the others wait:** Grocery AI is the morning pivot if the booth card is kirana, list, or cadence-shaped. Visual learning is the Learning-track path if Commerce credentials fail. Chotuchotu is the Creators path if the studio boots and audio is the gap.
- **Mock vs live partner calls:** Replit URL is live, on the Replit-only host D1 accepted (phone URL, auth stub, DB counter, secrets). Pine Labs is live if sandbox credentials arrive; otherwise the receipt is labeled **mock** (never fake a successful charge). Credential arrival is **UNKNOWN** until the booth. A live pay call follows D2: Pine Labs Agent Toolkit `createOrder` or the Toolkit payment-link equivalent. ElevenLabs stays off for the Shopping default. Greptile and Vobiz are not in the user flow. Render stays D1’s backup slide. This recommendation does not turn on D1’s conditional Commerce alternative (Replit UI + Render).
- **User-count method:** A unique name, or the auth stub, writes a row in Replit DB (D1). The mentor-visible counter is that row count. No spreadsheet on stage. Postgres stays the backup shape only if Render is later turned on.
- **Sentence for Peer Capital:** “An agent that buys — shortlist under constraints, then a real Pine Labs pay action — not a chat that only recommends.”

### Parking lot

| Item | Owner | Note |
|---|---|---|
| Community Partner name, if revealed | | Do not invent before the logo is real |
| Exact event-day credit claim links | | |
| Gaurav Mittal badge employer | | Confirm on the day |
| TableTalk | | Separate product. Do not design it here |
