> **Research archive** for [levelscorner/airtribe-builders-day](https://github.com/levelscorner/airtribe-builders-day).
> Original working title: `builders-day-partner-problem-statements.md`
> Compiled 23 Oct 2026 for Abhinav / Sol ahead of Airtribe AI Builders Day (Sat 24 Oct 2026, Bengaluru).
> What this file is: CONFIRM vs INFER partner problem cards. No product bet locked.
> This copy is the citation source for the portfolio docs. CONFIRM vs INFER labels inside still apply.
> Paths that originally pointed at `/workspace/*.md` now point at this `docs/research/` folder.

# Airtribe AI Builders Day — Partner Problem Statements

**Event:** Sat 24 Oct 2026 · Polaris School of Technology, Brookefield, Bengaluru  
**Organiser:** Airtribe · **Challenge frame:** 12h · AI-first live product · ~20 same-day users outside the team  
**Tracks:** Learning / Commerce / Builders / Creators  
**This report does NOT lock a product bet.** It maps what each partner would plausibly put in front of teams.

**Prior context:** extends [builders-day-partners-and-market.md](./builders-day-partners-and-market.md) (partner stack) and optionally [builders-day-vc-research.md](./builders-day-vc-research.md) (VC demand).

---

## 0. Official challenge packs for *this* Oct 24 event

| What | Status | Label | Source |
|---|---|---|---|
| Per-company numbered problem pack / booth brief PDF | **Not published** as of research time (23 Oct 2026 IST) | — | Exhaustive search of airtribe.live, foundercal, partner LinkedIn, partner hackathon pages |
| Open event brief (idea → AI product → 20 users) | **Published** | **CONFIRM** | [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/) |
| Four track briefs (Learning / Commerce / Builders / Creators) | **Published** | **CONFIRM** | Same page |
| Sponsor page offers “**live challenges**” as custom activation | **Published** (capability, not a named challenge) | **CONFIRM** that live challenges *may* appear on day; **INFER** content below | [airtribe.live/ai-builders-day/sponsor](https://airtribe.live/ai-builders-day/sponsor) — *“Custom activations (workshops, track sponsorships, branded fuel stations, live challenges) available at any tier.”* |
| Community Partner name (slot “Community 03”) | **Not named** in public text extract | Uncertain | Partner strip lists Title / Venture / Community / 5 toolkits; Community logo not identified in page text |
| Mentors’ individual problem lists | **Not published** | — | “10+ mentors” announced; firms/names incomplete |

**Rule used below:** every company-specific problem is labeled **INFER** unless a source explicitly publishes it for *this* Oct 24 event. Soft LinkedIn hints (e.g. Vobiz “explore what they can build with voice/telephony”) are **INFER**, not CONFIRM numbered problems.

**Confirmed official track briefs (Airtribe)** — these *are* the closest thing to “handed to teams”:

1. **Learning (CONFIRM):** “Build the teacher most Indians never had: AI that knows each learner, teaches in their own language, and turns curiosity into real skill.”
2. **Commerce (CONFIRM):** “Build AI that makes buying, selling and managing money as easy as UPI made paying.”
3. **Builders (CONFIRM):** “Build the tools that build everything else, so the next million products come from people who never wrote code.”
4. **Creators (CONFIRM):** “Build a full studio in one phone, so anyone can create in any Indian language.”

---

## 1. Pine Labs — Title Partner / keynote

**Role:** Title / “powered by”; keynote *“The New OS for Commerce: Building the Agent Ecosystem”* by Sanjeev Kumar (CTO, Digital Payments).  
**Official Oct 24 numbered challenges:** **None published** → all problems **INFER**.  
**Why they care:** Prove P3P + Agent Enablement Toolkit in the wild; seed agentic-commerce builders; keynote narrative needs demos that *pay*, not chat.

### Problem statements (INFER)

1. **Agent that buys, not recommends.** Build an AI shopping assistant that returns ranked picks *and* creates a real order / payment link (sandbox OK) the user can complete on their phone — no human at the final checkout click beyond pre-approved consent.  
2. **UPI-native micro-SKU autopilot.** Build a campus/stall seller agent that takes a natural-language order (“2 filter coffees + 1 sandwich”), creates a Pine Labs order, and returns a pay link / UPI ReservePay flow under ₹199.  
3. **Refund / dispute narrator.** Given an order ID, an agent explains status in plain language and can call `createRefund` / `cancelOrder` via the Agent Toolkit — sell trust, not a FAQ bot.  
4. **Mandate-bounded personal shopper.** Demo a one-time spend mandate (₹500 cap, 1 hour) where the agent completes a purchase within limits and shows a verifiable receipt (P3P / ReservePay framing).  
5. **Kirana catalog → offer → collect.** Paste a messy 10-SKU list; agent cleans it, writes a Hinglish deal banner, and attaches a payment link.

### Track map
Primarily **Commerce**; secondary **Creators** (creator tip jar / ₹99 digital product) and **Learning** (paid drill packs).

### Suggested ≤5h / ~20-user demo
Replit phone URL → user types budget + need → 3 cards → **Hold/Pay** via Pine Labs payment link or Agent Toolkit `createOrder` (sandbox) → count paid intents + unique phones. Stretch: narrate P3P mandate path even if full production P3P credentials aren’t same-day.

### Sources
- Keynote + Title role: [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/), [Airtribe LinkedIn – Pine Labs keynote](https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-pinelabs-activity-7516151887805616128-03JU)  
- Agent Toolkit (`createOrder`, `getOrder`, `cancelOrder`, `createRefund`): [pinelabs.com/docs/.../agent-enablement-toolkit](https://www.pinelabs.com/docs/online-payments/ai/agent-enablement-toolkit)  
- P3P agent-native payments: [P3P docs](https://www.pinelabs.com/docs/online-payments/ai/p3p), [P3P launch note](https://www.pinelabs.com/media-analyst/the-ai-agent-can-now-pay-pine-labs-launches-p3p-indias-first-agentic-payment-protocol-built-on-upi)  
- Prior Bengaluru Pine Labs×AWS hackathon theme = agentic payments/commerce (Mar 2026): [Pine Labs LinkedIn](https://www.linkedin.com/posts/pine_labs_online_saturday-well-spent-pine-labs-in-association-activity-7439201194436374528-3G5c)

---

## 2. Peer Capital — Venture partner / judge (Karthik Prabhakar)

**Role:** VC partner; finalists pitch for investment intent. Not a toolkit.  
**Official Oct 24 numbered challenges:** **None** → **INFER** from public thesis.  
**Why they care:** See applied-AI outcomes that survive India complexity (language, price sensitivity, voice, commerce ROI) — not ChatGPT wrappers.

### Problem statements (INFER)

1. **Sell the work, not the chat.** Build a product where the user leaves with a finished artifact (scorecard, paid order, hosted app, clipped short) in under 2 minutes — prove outcome > conversation.  
2. **Voice as the India interface.** Build a vernacular voice loop (Hindi/Kannada/Hinglish) that replaces typing for a real job-to-be-done (practice, buy, book, coach).  
3. **Commerce hyper-personalization with conversion.** Research-led shopping agent that assimilates tradeoffs and drives a measurable pay/hold action — not a recommendation blog.  
4. **Skilling with an accountability loop.** Adaptive coach that ties practice to a visible outcome parents/peers can see (progress card, next drill, mock score).  
5. **Services-as-software wedge.** Automate one painful India workflow (support call, catalog cleanup, admissions follow-up) end-to-end with AI as the execution layer.

### Track map
All four tracks — thesis spans skilling, commerce, voice/consumer, builder tooling. Strongest judge lens on **Learning + Commerce**.

### Suggested ≤5h / ~20-user demo
Any track demo that (a) uses India language/voice or UPI, (b) shows same-day unique users, (c) pitches “outcome sold” in one sentence. Peer Capital does not give APIs — stack = other partners.

### Sources
- Venture slot + judge: [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/)  
- Thesis: [The India AI Renaissance (Peer Capital Substack)](https://peercapitalvc.substack.com/p/the-india-ai-renaissance-from-services) — voice as preview; commerce hyper-personalization; skilling; services-as-software  
- Commerce research-led shopping framing: [Peer Capital LinkedIn](https://www.linkedin.com/posts/peer-capital_activity-7428096272500420608-iFZS)

---

## 3. Greptile — Toolkit

**Role:** Toolkit partner; event-day credits.  
**Official Oct 24 numbered challenges:** **None** → **INFER** from Fast Hackathon brief + product.  
**Why they care:** Get builders to feel whole-repo PR understanding / blast-radius review; seed India usage of Greptile credits.

### Problem statements (INFER)

1. **PR Risk Narrator.** Paste a PR URL (or diff); return a phone-friendly card: what breaks, who to ping, merge/don’t-merge with confidence — readable by a non-author.  
2. **Blast-radius map for non-coders.** Given a small public repo + “what if we change X?”, show second-order effects (callers, contracts) as a diagram a PM can share.  
3. **Merge coach for first-time open-source contributors.** Guide a beginner through “is this safe to merge?” using Greptile context, not generic LLM review.  
4. **API fire-drill explainer.** Feed a failing request / stack snippet; agent explains root cause using repo graph context and suggests a fix PR outline.  
5. **Devtool for “people who never wrote code.”** Wrap Greptile so a founder can ask “will this change break payments?” in plain English and get a shareable answer.

### Track map
Primarily **Builders**; weak fit elsewhere unless the product *is* for builders.

### Suggested ≤5h / ~20-user demo
Replit URL → user pastes a public PR (or picks from a curated list) → Greptile Starter credits → shareable risk card. Count unique completed reviews. Aligns with Greptile Fast Hackathon spirit (“devtools that help developers build better software”) — [Luma Fast Hackathon](https://luma.com/yc-meetup-3817), [Greptile winners post](https://www.linkedin.com/posts/greptile_on-sunday-we-hosted-our-second-fast-hackathon-activity-7498394084353458176-vdRu).

### Sources
- Toolkit listing + credits: [foundercal AI Builders Day](https://foundercal.com/events/ai-builders-day-2026-317091143), [airtribe.live](https://airtribe.live/ai-builders-day/)  
- Product: [greptile.com](https://www.greptile.com/), [graph-based context docs](https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context)

---

## 4. ElevenLabs — Toolkit

**Role:** Toolkit; TTS/STT/Conversational AI credits.  
**Official Oct 24 numbered challenges:** **None** → **INFER** from ElevenHacks pattern + Creators/Learning track briefs.  
**Why they care:** Voice demos that *ship* as phone URLs; India multilingual / creator VO use cases; credit burn that converts to ongoing accounts.

### Problem statements (INFER)

1. **Conversational coach that speaks.** Build a voice agent (browser mic first) that runs a 3–5 minute skill drill, interrupts naturally, and leaves a scorecard — not a TTS of a chat reply.  
2. **Vernacular explainer.** User uploads one concept / PDF page; agent teaches it aloud in Hindi or Kannada with 3 check questions.  
3. **Full studio in one phone (Creators).** Voice Design / clone a character voice → generate a 30–60s VO + captions the user can download and post.  
4. **Speech Engine on your own LLM logic.** Wire ElevenLabs speech layer to custom agent logic (interview, sales roleplay, story) so voice turn-taking is production-grade.  
5. **Creator dub / localization lite.** Paste English script → Hindi/Hinglish voiceover + timed captions in one tap.

### Track map
**Learning** + **Creators** primary; secondary Commerce (voice order-taking) and Builders (voice SRE / voice coding assistant — stretch).

### Suggested ≤5h / ~20-user demo
ElevenLabs Conversational AI agent + Replit scorecard URL. QR → Start → 3 voice turns → shareable card. Pattern matches ElevenHacks (ship + demo video; voice agent required) — e.g. [Hack #3 Replit](https://hacks.elevenlabs.io/hackathons/2), [Hack #10 Speech Engine](https://hacks.elevenlabs.io/hackathons/9).

### Sources
- Toolkit + credits: [foundercal](https://foundercal.com/events/ai-builders-day-2026-317091143)  
- ElevenHacks challenge style: [hacks.elevenlabs.io](https://hacks.elevenlabs.io/hackathons/0)  
- Creators track brief (CONFIRM): [airtribe.live](https://airtribe.live/ai-builders-day/)

---

## 5. Replit — Toolkit

**Role:** Toolkit; Agent + instant deploy + auth/DB. Fastest path to a phone URL.  
**Official Oct 24 numbered challenges:** **None** → **INFER** from Agent 4 / Ship It buildathons + Builders track.  
**Why they care:** Every team ships on Replit; “idea → live URL” is the brand moment; Agent usage on event credits.

### Problem statements (INFER)

1. **Google-Doc-easy software.** Non-coder describes a tiny tool in plain English; Agent generates and deploys a shareable app link in minutes (waitlist, poll, tip jar, form).  
2. **Ship it before 16:00.** Constraint challenge: working public URL with auth + one DB write before the market window — proof of Replit Agent velocity.  
3. **App factory for booths.** Generate N one-page apps for other teams/stalls on site; each new URL that gets submissions counts as distribution.  
4. **Voice app that ships.** Combine Replit deploy with ElevenLabs Voice Design/Cloning so the published app *speaks* (mirrors ElevenHacks×Replit).  
5. **Multiplayer shared agent room.** One room URL where several phones steer the same Agent session (Figma-for-agents lite) — harder sync, high wow.

### Track map
**Builders** primary; hosting layer for all tracks.

### Suggested ≤5h / ~20-user demo
Template-constrained Agent: “waitlist for merch booth” → public Replit URL → 20 phone submissions. Matches [Agent 4 Buildathon](https://buildathons.replit.app/agent-4-buildathon) Explore→Build→Ship and [Ship It Hack](https://luma.com/zumzawms) “idea to live product in an afternoon.”

### Sources
- Toolkit listing: [airtribe.live](https://airtribe.live/ai-builders-day/), [foundercal](https://foundercal.com/events/ai-builders-day-2026-317091143)  
- Builders track brief (CONFIRM): same event page  
- Prior framing: Agent 4 / Ship It links above

---

## 6. Render — Toolkit

**Role:** Toolkit; web services / Postgres / TLS hosting credits.  
**Official Oct 24 numbered challenges:** **None** → **INFER** from hackathon partner pattern (“build it, deploy it”).  
**Why they care:** Backend/API hosting that isn’t a laptop; Postgres for real user data; habit of deploying on Render.

### Problem statements (INFER)

1. **Always-reachable API.** Ship a public HTTPS API + simple phone frontend that survives mentor walks — deploy on Render, not localhost.  
2. **Postgres-backed 20-user proof.** Store real user events (signups, drills, orders) in Render Postgres and show a live counter judges can trust.  
3. **Cold-start-aware demo.** Design a keepalive or static+API split so free-tier spin-down doesn’t kill the 19:30 demo.  
4. **Backend for an agent.** Host the tool-calling server (orders, scorecards, webhooks) on Render while the UI lives on Replit or static.

### Track map
Infra for **all tracks**; judged most visibly in **Builders** and **Commerce** (webhooks, order state).

### Suggested ≤5h / ~20-user demo
Render Web Service + free Postgres for session/order/score rows; Replit or static front. Note free web services spin down after ~15 min idle ([Render free docs](https://render.com/docs/free)) — ping or keep warm. Partner pattern: [Hackyard × Render](https://www.linkedin.com/posts/joinhackyard_hackyardbuild2026-render-buildanddeploy-activity-7508261677629607936-Rbk8).

### Sources
- Toolkit + credits: [foundercal](https://foundercal.com/events/ai-builders-day-2026-317091143)  
- Credits redemption: [render.com/docs/credits](https://render.com/docs/credits)

---

## 7. Vobiz — Toolkit

**Role:** Toolkit; AI-native voice/telephony (SIP, India DIDs, WebRTC).  
**Official Oct 24 numbered challenges:** **None**. Soft hint only → **INFER**.  
**Soft hint (still INFER, not numbered):** Airtribe LinkedIn — credits to “explore what they can build with AI-native voice and telephony”; “products that can actually speak, call and interact.”  
**Why they care:** Move demos off browser tabs onto real phone numbers; India DID + SIP under ElevenLabs/Vapi/etc.

### Problem statements (INFER)

1. **Agent that reaches any phone.** Wire a conversational agent to a real Vobiz number so judges dial in from their handset — not just browser mic.  
2. **Outbound practice call.** With consent, agent calls the user’s phone for a 3-minute interview/sales drill and posts a scorecard URL after hangup.  
3. **Inbound campus hotline.** One DID for the day: callers get a Learning or Commerce voice flow (placement Qs / stall order); log 20 unique callers.  
4. **Browser → PSTN upgrade path.** Ship WebRTC first; show the same agent answering a Vobiz inbound as the stretch wow.  
5. **Missed-lead callback agent.** Simulate an edtech/commerce no-show; agent places one outbound reminder call and books a slot.

### Track map
**Learning** + **Creators** + **Commerce** (voice order); Builders if the product is “voice infra for agents.”

### Suggested ≤5h / ~20-user demo
Claim tagged hackathon credits (pattern from [Vobiz×Agora](https://www.vobiz.ai/events/agora-hackathon/)) → India number → ElevenLabs SIP integration → QR shows the DID + scorecard link. If DID setup slips, fall back to browser voice and narrate the PSTN path. Prior Vobiz event literally: “you get a problem statement in the morning” + “real phone number for whatever you make.”

### Sources
- Soft hint: [Airtribe LinkedIn – Vobiz](https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-voiceai-activity-7517148190001823744-c-Id)  
- Product: [vobiz.ai](https://www.vobiz.ai/), [ElevenLabs integration docs](https://www.vobiz.ai/docs/integrations/elevenlabs)  
- Prior hackathon format: [vobiz.ai/events/agora-hackathon](https://www.vobiz.ai/events/agora-hackathon/)

---

## 8. Airtribe — Organiser

**Role:** Host; mentors; workshops; program credits for winners.  
**Official challenges:** **CONFIRM** open brief + 4 track briefs (see §0). No extra per-sponsor pack published.  
**Why they care:** Teams ship, get 20 real users, learn judgment-by-shipping; community retention into Airtribe programs.

### Problem statements

1. **(CONFIRM — open brief)** In 12 hours, build a working AI product, put it in market, and land 20 real users outside your team before 19:30.  
2. **(CONFIRM — Learning track)** Build the teacher most Indians never had…  
3. **(CONFIRM — Commerce track)** Build AI that makes buying, selling and managing money as easy as UPI made paying.  
4. **(CONFIRM — Builders track)** Build the tools that build everything else…  
5. **(CONFIRM — Creators track)** Build a full studio in one phone…  
6. **(INFER — workshop/mentor framing)** Treat “half-built AI folder” syndrome: pick one idea, ship the outcome, measure want — not polish the repo. (From Airtribe’s own marketing copy.)

### Track map
Owns all tracks; assigns track mentors.

### Suggested ≤5h / ~20-user demo
Whatever product: public phone URL by ~16:00, GTM push 16:00–18:00, user count before 19:30 — process is the Airtribe “problem.”

### Sources
- [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/)  
- [Airtribe LinkedIn event post](https://www.linkedin.com/posts/airtribe_aibuildersday-airtribe-activity-7517233978643361792-VxXe)  
- Sponsor “live challenges” option: [sponsor page](https://airtribe.live/ai-builders-day/sponsor)

---

## 9. Polaris School of Technology — Venue

**Role:** Host campus / room for ~500 builders.  
**Official Polaris-authored challenge pack for this event:** **None found.** Polaris LinkedIn promotes Airtribe’s brief only.  
**Prior campus agentathons** (e.g. Lyzr Agentathon) are separate events — do **not** treat as Oct 24 briefs.

### Problem statements
- **No INFER list recommended** beyond using campus foot traffic as the 20-user pool. Venue is infrastructure, not a problem-setter for AIBD-26.

### Sources
- [Polaris LinkedIn – AI Builders Day](https://www.linkedin.com/posts/polaris-school-of-technology_aibuildersday2026-polarisschooloftechnology-activity-7516743660697473024-N4rP)  
- Venue address: [foundercal](https://foundercal.com/events/ai-builders-day-2026-317091143)

---

## 10. Activate — Judge (extra; not Title/Venture strip)

**Role:** Pratyush Choudhury (Co-Founder) announced as judge via Airtribe LinkedIn; Activate **not** on the main partner strip as Venture (Peer Capital is).  
**Official Oct 24 numbered challenges:** **None** → **INFER** from fund thesis.  
**Why they care:** Spot inception-stage technical founders with durable problems, velocity, and product taste — India AI-native services / consumer & voice / vertical apps / sovereign infra.

### Problem statements (INFER)

1. **Is this a real company seed?** Build something a technical founder would still work on Monday — durable customer pain, not a weekend wrapper.  
2. **Consumer / voice AI for India’s mass market.** Tutor, coach, shopper, or creator tool that works on a phone in vernacular.  
3. **AI services wedge.** Turn one services workflow into software-with-an-outcome (support, ops, sales follow-up).  
4. **Depth over demo glitter.** Prefer architecture that can survive real users (state, auth, payments, voice) over slide-ware.

### Track map
All tracks; strongest on technical depth + consumer/voice.

### Suggested ≤5h / ~20-user demo
Same as Peer Capital bar, plus show technical taste (clean agent loop, real rail). Stack = toolkit partners. Note Activate LP network includes Pine Labs’ Amrish Rau — commerce/voice demos double-land.

### Sources
- Judge announce (search hit): [Airtribe LinkedIn – Activate](https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-activate-activity-7516815488522477569-AySO)  
- Thesis: [activatevc.ai](https://www.activatevc.ai/) — Sovereign AI / AI Services / Consumer AI; inception $500k–$3M  
- Coverage: [Indian Startup News – $75M fund](https://indianstartupnews.com/news/activate-launches-75-million-fund-to-back-indias-early-stage-ai-founders-10880453)

---

## 11. Community Partner / other sponsors

| Entity | Status |
|---|---|
| **Community 03** on partner strip | Slot exists; **name not published** in page text extract → cannot invent problems for an unnamed org |
| LLM providers (OpenAI/Anthropic/Google) | **Not** named as event partners |
| WhatsApp BSP / Razorpay / Clerk | **Not** event partners |
| Additional mentors’ firms | Incomplete public list — skip until named |

If a Community Partner is revealed at kickoff, treat any booth “live challenge” as **CONFIRM** only when handed in writing / projector.

---

## 12. Cross-company matrix

| # | Problem (short) | Best partner stack | Track | Label |
|---|---|---|---|---|
| 1 | Agent that buys + payment link / order | **Pine Labs** Agent Toolkit ± P3P + Replit | Commerce | INFER |
| 2 | Voice coach / vernacular teacher on phone | **ElevenLabs** + **Vobiz** + Replit scorecard | Learning | INFER (Vobiz soft-hinted) |
| 3 | Non-coder → deployed tiny app URL | **Replit** Agent (± Render Postgres) | Builders | INFER |
| 4 | Full studio VO + captions on phone | **ElevenLabs** Voice Design/TTS + Replit | Creators | INFER (+ Creators brief CONFIRM) |
| 5 | PR risk / blast-radius card | **Greptile** + Replit | Builders | INFER |
| 6 | Stall / micro-SKU UPI collect | Pine Labs + Replit (± vision LLM BYO) | Commerce | INFER |
| 7 | Real DID inbound/outbound agent | Vobiz + ElevenLabs | Learning / Commerce | INFER |
| 8 | Postgres-backed live user counter | Render + any front | All | INFER |
| 9 | Outcome artifact in <2 min (pitch lens) | Any toolkit + Peer/Activate framing | All | INFER |
| 10 | Open brief: ship + 20 users | Airtribe process | All | **CONFIRM** |

---

## 13. Top 5 most likely *distributed* problem statements (across partners)

*Ranked by: (a) alignment with published track/keynote, (b) prior hackathon behavior of that partner, (c) booth/credit incentive, (d) feasibility for 5h + 20 phone users. All five are **INFER** as day-of booth cards unless Airtribe projects them.*

1. **“Build an agent that completes a purchase (order + pay link), not a chat that recommends.”** — Pine Labs / Commerce keynote echo. Highest title-partner probability.  
2. **“Build a voice product that can speak / call / interact — browser or real phone number.”** — Vobiz soft LinkedIn hint + ElevenLabs toolkit + Learning/Creators briefs.  
3. **“Ship a live URL a non-coder could have described in plain English.”** — Replit brand + Builders track brief.  
4. **“Leave the user with a finished artifact in under 2 minutes (scorecard, clip, receipt, hosted app).”** — Peer Capital / Activate judge lens + Airtribe “judgment by shipping.”  
5. **“Show blast radius / merge risk for a real PR in language a teammate can use.”** — Greptile Fast Hackathon DNA; narrower but very “toolkit booth challenge”-shaped.

**Honorable mention:** Creators “studio in one phone” is already a **CONFIRM** track brief — if a partner “distributes” anything for Creators, expect ElevenLabs-shaped VO/dub variants of that brief.

---

## 14. CONFIRM vs INFER — quick ledger

| Item | Label |
|---|---|
| Open 12h / 20-user brief | **CONFIRM** |
| 4 track briefs | **CONFIRM** |
| Sponsor page allows “live challenges” | **CONFIRM** (mechanism only) |
| Pine Labs Title + keynote title | **CONFIRM** |
| Toolkit roster (Greptile, ElevenLabs, Replit, Render, Vobiz) | **CONFIRM** |
| Peer Capital venture + Karthik judge | **CONFIRM** |
| Activate as additional judge (LinkedIn) | **CONFIRM** (role); problems **INFER** |
| Vobiz “explore voice/telephony” LinkedIn | Soft hint → problems **INFER** |
| Every numbered per-company problem in §§1–7, 10 | **INFER** |
| Named Community Partner + their problems | **Unknown / unpublished** |
| Polaris-authored challenge list | **None** |

---

## 15. Research gaps / what to grab on site

1. Booth one-pagers / QR “challenge cards” at Pine Labs, Vobiz, Greptile, ElevenLabs, Replit, Render.  
2. Kickoff slides — any “partner challenges” slide turns INFER → CONFIRM.  
3. Community Partner logo reveal.  
4. Exact event-day credit claim links (especially Vobiz tagged login, Pine Labs merchant sandbox).  
5. Mentor-track office hours — mentors often rephrase partner problems verbally.

*No product bet locked. No Page / code / repo created.*
