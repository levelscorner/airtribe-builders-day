> **Research archive** for [levelscorner/airtribe-builders-day](https://github.com/levelscorner/airtribe-builders-day).
> Original working title: `builders-day-partners-and-market.md`
> Compiled 23 Oct 2026 for Abhinav / Sol ahead of Airtribe AI Builders Day (Sat 24 Oct 2026, Bengaluru).
> What this file is: Confirmed partners, market gaps, and the earlier top bets.
> This copy is the citation source for the portfolio docs. CONFIRM vs INFER labels inside still apply.
> Paths that originally pointed at `/workspace/*.md` now point at this `docs/research/` folder.

# Airtribe AI Builders Day — Partners, Market Needs & Top Bets

**Event:** Sat 24 Oct 2026 · Polaris School of Technology, DivyaSree Technopark A3, EPIP Zone, Brookefield, Bengaluru  
**Organiser:** Airtribe · **Challenge:** 12 hours · AI-first live product · 20 real users outside the team · teams of 2–5  
**Tracks:** Learning / Commerce / Builders / Creators  
**Prize:** ₹3.5L cash + Airtribe program credits · finalists pitch for investment intent  

**This report extends** [builders-day-vc-research.md](./builders-day-vc-research.md) (YC/Sequoia/a16z/India VC demand + 5×4 idea map). It does **not** redo that VC research. Focus: (1) who backs *this* event and what they give builders, (2) market-needed tools per track beyond the existing idea list, (3) top 3 bets that plug into the partner stack + VC demand + 5h/20-user constraints.

**Primary sources:** [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/), [foundercal listing](https://foundercal.com/events/ai-builders-day-2026-317091143), Airtribe LinkedIn partner posts, public partner docs.

---

## 1. Companies / partners behind AI Builders Day

### Labeling rule
- **CONFIRMED** = named on the official event page, foundercal, and/or Airtribe LinkedIn for *this* Oct 24 2026 event.
- **LIKELY / INFERRED** = strong public evidence but not explicitly labeled as Title/Toolkit on the partner strip, or credit *amount* not published for this event.
- Event-day credit **dollar/rupee amounts** are mostly unpublished → labeled **event-day credits** (amount TBD at venue / claim link).

### 1.1 Confirmed partners (THIS event)

| Role | Org | What they are | What builders get | Maps to 5h demo |
|---|---|---|---|---|
| **Organiser** | **Airtribe** | AI-fluent builder learning community; hosts the day | Mentors (10+), live workshops, matchmaking for solos, ₹1.5L program credit for winning-team members | GTM coaching, pitch framing, user-acquisition push after 16:00 |
| **Venue host** | **Polaris School of Technology** | Engineering school @ DivyaSree Technopark A3, Brookefield | Physical room for ~500 builders; campus audience for “20 users” | Same-day users from campus + nearby Brookefield tech crowd |
| **Title / Powered by** | **Pine Labs** | India’s major merchant payments / digital payments platform | **Event-day credits** (foundercal: free credits from Pine Labs); Online Payments APIs; **MCP Server**, **Agent Enablement Toolkit** (`@plural_pinelabs/agent-toolkit`), **P3P** agentic payments (UPI ReservePay, cards, one-time mandates); keynote *“The New OS for Commerce: Building the Agent Ecosystem”* by Sanjeev Kumar (CTO, Digital Payments) | Auth+checkout, payment links, UPI demo, agent that creates orders/refunds, agentic commerce pitch that mirrors the keynote |
| **Venture partner** | **Peer Capital** | Bengaluru VC; Managing Partner **Karthik Prabhakar** is a listed judge | Finalists pitch for **investment intent**; thesis = India applied AI / services-as-software, voice, skilling, creator, commerce hyper-personalization | Pitch language: outcomes not chat; India complexity as moat |
| **Judge (listed)** | **Gaurav Mittal** | EVP – Technology; public profile ties him to **Pine Labs** payments tech leadership (confirm title badge on day) | Judging lens: production payments / commerce OS seriousness | Prefer demos that touch real payment rails or agent-commerce UX |
| **Judge (LinkedIn announce)** | **Pratyush Choudhury**, Co-Founder **Activate** | AI-focused early VC for technical founders ($500k–$3M at inception) | Additional judge perspective (Airtribe LinkedIn); Activate not on the main partner strip as Title/Venture | Technical depth + “is this a real company seed?” |
| **Toolkit** | **Greptile** | AI code review / PR understanding | **Event-day credits** (foundercal); public Starter = 50 credits/mo free | Paste PR → blast-radius / merge narrative; Builders-track “PR Risk Narrator” / API fire drill |
| **Toolkit** | **ElevenLabs** | TTS, STT, Conversational AI, voice clone/design | **Event-day credits** (foundercal); public Free = **10k credits/mo** (TTS/STT/agents) | Voice tutors, interview coach, creator VO, multilingual speech |
| **Toolkit** | **Replit** | AI Agent + IDE + instant deploy + auth/DB | **Event-day credits** (foundercal); Free Mode for Agent everyday tasks | Fastest path to a **phone URL** for 20 users |
| **Toolkit** | **Render** | Cloud hosting (web services, Postgres, TLS/CDN) | **Event-day credits** (foundercal); public Free web service + managed TLS + static sites (spin-down after 15m idle) | Host API / Next app / Postgres for same-day demo |
| **Toolkit** | **Vobiz** | Telephony infra for AI voice agents (SIP, DIDs India+, WebRTC) | **Event-day credits** for AI-native voice/telephony (Airtribe LinkedIn); new accounts get **₹25** signup credit; hackathons typically use **tagged claim links** for extra credits; integrates ElevenLabs / Vapi / Retell / LiveKit | Real phone-number voice agents; interview coach that *calls*; inbound DID demo |

**Sources (confirmed):**  
- Partners strip + judges/keynote: [airtribe.live/ai-builders-day](https://airtribe.live/ai-builders-day/)  
- Credits list + Pine Labs powered-by: [foundercal](https://foundercal.com/events/ai-builders-day-2026-317091143)  
- Vobiz toolkit + credits: [Airtribe LinkedIn – Vobiz](https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-voiceai-activity-7517148190001823744-c-Id)  
- Activate judge: [Airtribe LinkedIn – Activate](https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-activate-activity-7516815488522477569-AySO)  
- Venue: Polaris LinkedIn + foundercal address  

### 1.2 Partner capability map (public docs → 5h demo)

#### Pine Labs — payments + agentic commerce
- Docs hub: [pinelabs.com/docs/online-payments](https://www.pinelabs.com/docs/online-payments)  
- **Agent Toolkit:** LangChain / OpenAI Agents / Vercel AI SDK tools — `createOrder`, `getOrder`, `cancelOrder`, `createRefund` ([Agent Enablement Toolkit](https://www.pinelabs.com/docs/online-payments/ai/agent-enablement-toolkit))  
- **MCP Server:** natural-language ops against payment APIs from Cursor/Claude ([AI Solutions](https://www.pinelabs.com/docs/online-payments/ai))  
- **P3P:** HTTP 402 agent-native payments; UPI ReservePay + cards available now ([P3P quickstart](https://www.pinelabs.com/docs/online-payments/ai/p3p/quickstart))  
- **5h use:** payment link / UPI checkout for a ₹49–199 micro-SKU; “buy with agent” demo; Commerce-track pitch that echoes Sanjeev’s keynote. Prefer sandbox/test merchant; don’t promise production settlement without dashboard credentials.

#### Vobiz — voice telephony under the agent
- Product: [vobiz.ai](https://www.vobiz.ai/) — SIP trunks, India numbers, sub-80ms media hop, programmable call control  
- ElevenLabs SIP integration (dashboard or API): [docs](https://www.vobiz.ai/docs/integrations/elevenlabs)  
- New account: **₹25** credit after signup/verify; event credits via **hackathon-tagged login** (pattern from [Vobiz×Agora hackathon](https://www.vobiz.ai/events/agora-hackathon/))  
- **5h use:** browser mic *or* real outbound/inbound call for Learning/Creators; pair with ElevenLabs Conversational AI. Full DID+SIP in 5h is tight — web voice first, phone number as stretch wow.

#### ElevenLabs — speech layer
- Free: 10k credits/mo, TTS + STT + Agents ([pricing](https://elevenlabs.io/pricing), [API intro](https://join.elevenlabs.io/api/developer-api))  
- **5h use:** interview voice, multilingual explainers (Hindi/Kannada/English), creator voiceover, captions pipeline. Event-day credits on top of free tier.

#### Replit — ship the URL
- Agent builds + deploys; Free Mode for everyday Agent tasks ([replit.com](https://replit.com/), [Free Mode](https://replit.com/blog/replit-introduces-free-mode))  
- **5h use:** primary “get a phone URL in <30 min” path for non-infra teams. Auth + SQLite/DB stubs included.

#### Render — host the backend
- Free web services, managed TLS, free Postgres (30-day / 1 GB limits), static sites ([free tier docs](https://render.com/docs/free))  
- **5h caveat:** free web services **spin down after 15 min idle** (~1 min cold start) — keep a keepalive ping or use Replit for the public URL if cold starts kill demos.

#### Greptile — code understanding
- Starter free: 50 credits/mo, 1 developer ([pricing](https://www.greptile.com/pricing))  
- **5h use:** Builders track only — PR risk cards, “merge/don’t merge”, toy Dependabot-style narratives. Weak fit for Learning/Commerce/Creators unless the product *is* for builders.

#### Peer Capital — pitch alignment (not a toolkit)
- Thesis: India as applied-AI proving ground; services-as-software; voice as preview category; commerce hyper-personalization; creator/entertainment AI; skilling ([Substack](https://peercapitalvc.substack.com/p/the-india-ai-renaissance-from-services))  
- **Pitch tip:** say “we sell the work / outcome,” show India language/voice/UPI complexity, show same-day users — not “ChatGPT wrapper.”

### 1.3 Official track briefs (product framing from Airtribe)

From [event page](https://airtribe.live/ai-builders-day/):

1. **AI for Learning** — “Build the teacher most Indians never had: AI that knows each learner, teaches in their own language, and turns curiosity into real skill.”  
2. **AI for Commerce** — “Build AI that makes buying, selling and managing money as easy as UPI made paying.”  
3. **AI for Builders** — “Build the tools that build everything else, so the next million products come from people who never wrote code.”  
4. **AI for Creators** — “Build a full studio in one phone, so anyone can create in any Indian language.”

### 1.4 Gaps / uncertainty in the sponsor list

| Item | Status |
|---|---|
| Exact **event-day credit amounts** for Pine Labs / Replit / Render / ElevenLabs / Greptile / Vobiz | **Unpublished** publicly — treat as “event-day credits”; claim at venue / partner booths |
| Partner strip slots “Title 01 / Venture 02 / Community 03” | Logos implied (Pine Labs, Peer Capital, ?community) but Community Partner **name not published** on the page text extract |
| **Gaurav Mittal** employer on badge | Strongly Pine Labs from public career history; confirm on-day title card |
| **Activate** | Judge via LinkedIn; **not** listed on the 8-slot partner strip as Venture (Peer Capital is) |
| Full **mentor roster / mentor firms** | “10+ mentors” announced; individual names/firms **not** fully published as of research time |
| LLM provider (OpenAI/Anthropic/Google) as official partner | **Not** named for this event — bring your own keys or use Replit Agent models |
| Auth (Clerk/Firebase), WhatsApp BSP, Stripe/Razorpay | **Not** event partners — Pine Labs covers payments; WhatsApp is market channel only |

### 1.5 Inferred / typical India hackathon stack (NOT confirmed for THIS event)

Label clearly — useful fallbacks if event credits are slow to claim:

- **LLM:** OpenAI / Anthropic / Gemini personal keys; Groq free tier for latency  
- **Auth:** Clerk / Supabase Auth / magic link  
- **DB:** Supabase / Neon / Render Postgres free  
- **WhatsApp:** Meta Cloud API or Interakt/Wati (not free; avoid as core path in 5h)  
- **Payments fallback:** Razorpay test mode (but **prefer Pine Labs** here — judges + keynote)

---

## 2. Market-needed tools per track

*Goes beyond the VC file’s L1–L5 / C1–C5 / B1–B5 / CR1–CR5. Prefer ideas that plug into Pine Labs + Vobiz + ElevenLabs + Replit/Render + Greptile.*

### Cross-cutting India/Bengaluru heat (2025–2026)

- **Voice + vernacular** beats typed chat for fluency, placements, support (Stimuler voice ESL; Peer Capital “voice is a preview”).  
- **WhatsApp-native** learning/commerce reduces install friction (SkillBytes ~5.9L students via WhatsApp modules — [AIM](https://analyticsindiamag.com/ai-features/this-ai-edtech-startup-fights-short-attention-spans-by-teaching-on-whatsapp)).  
- **UPI / agentic checkout** is the commerce OS narrative Pine Labs is keynoting; Meta also shipping Business AI + upcoming in-chat UPI for SMBs ([Meta](https://about.fb.com/news/2026/05/introducing-business-ai-on-whatsapp-for-small-businesses-in-india/)).  
- **Creator monetization infra** still broken: DM → UPI screenshot → Drive link; need ₹99–1991 SKU autopilot ([ownstreet](https://ownstreet.in/blog/india-creator-economy-2026-platforms-monetization-guide)).  
- **Gap vs ChatGPT wrappers:** sell a **completed artifact** (scorecard, paid order, hosted app, clipped short) in <2 min; multiplayer or voice; India language/UPI rails.

### 2.1 Learning — hot problems & new wedges

| Need (beyond L1–L5) | Why hot in India | Gap vs ChatGPT | 20-user demo proof | Partner plug-in |
|---|---|---|---|---|
| **Placement voice loop on a real call** | Campus placement anxiety; Stimuler proved phone-call practice | ChatGPT can’t call your phone or score phonemes live | User dials / receives 3-min mock → shareable scorecard | **Vobiz + ElevenLabs**; Replit URL for scorecard |
| **Parent/peer “progress SMS” tutor** | Families manage kids’ studies on WhatsApp | Wrapper has no accountability loop | Student drills 5 Qs → parent gets one Hinglish summary link | ElevenLabs voice optional; Replit; (WhatsApp = stretch) |
| **Syllabus → oral viva in Kannada/Hindi** | State boards + multilingual classrooms | Generic GPT ignores uploaded syllabus grounding | Upload 1 PDF page → 90s oral viva + 3 check Qs | ElevenLabs STT/TTS; Replit |
| **Soft-skill assertiveness with rubric** | Bengaluru intern→FT conversion | Subjective chat without calibrated rubric | 2-min roleplay → radar chart | ElevenLabs Conversational AI |
| **College admissions follow-up agent** | Edtech activation cliff | Chatbots don’t call no-shows | Demo “missed trial” → agent calls attendee (with consent) | **Vobiz outbound** + ElevenLabs |

**Still best from VC file for ship/wow:** **L1 Interview Drill Coach**, **L2 Concept Explainer**.

### 2.2 Commerce — hot problems & new wedges

| Need (beyond C1–C5) | Why hot | Gap vs ChatGPT | 20-user demo | Partner plug-in |
|---|---|---|---|---|
| **Agentic micro-checkout** | Keynote = agent ecosystem for commerce | Chat can’t take UPI | Agent creates ₹99 order → user pays via Pine Labs link | **Pine Labs Agent Toolkit / payment links / P3P** |
| **Stall / café combo agent** | Brookefield food courts = captive merchants | Photo→chat with no offer→pay loop | Scan menu → combo offer → pay link | Pine Labs + vision LLM + Replit |
| **Kirana catalog → deal banner → collect** | SMB WhatsApp catalogs are messy | Cleanup without collection | Paste 10 SKUs → Hinglish deal → payment link | Pine Labs + Replit |
| **“Buy-for-me” with escrowed intent** | Shopping agents are VC-hot | Shortlists without money are blogs | Shortlist 3 earbuds → one-tap hold/pay | Pine Labs + Replit |
| **Refund / dispute narrator for D2C** | Trust layer for campus sellers | GPT essays ≠ API refunds | Fake order ID → agent files refund via toolkit | Pine Labs `createRefund` |

**Still best from VC file:** **C1 Stall Price & Pitch**, **C2 Buy-for-Me** — now stronger *because* Pine Labs is Title partner.

### 2.3 Builders — hot problems & new wedges

| Need (beyond B1–B5) | Why hot | Gap vs ChatGPT | 20-user demo | Partner plug-in |
|---|---|---|---|---|
| **Multiplayer shared agent room** | Direct YC Multiplayer AI RFS; Neander/Tangled show category forming | Private ChatGPT tabs ≠ shared state | One URL, 10 people steer one agent | Replit + realtime (PartyKit/Supabase) |
| **Describe → hosted internal tool** | YC “Cloud for Small Software”; track brief = tools for non-coders | Paste code ≠ shareable app | “Booth waitlist” → live URL in <3 min | **Replit Agent** or Render |
| **PR risk card for hackathon PRs** | Greptile is *in the room* | Diff paste into ChatGPT loses repo context | Paste PR → Greptile-assisted narrative | **Greptile** |
| **Eval arena (latency/cost/pass)** | Accel “LLM testing”; harness obsession | Single-model chat | Same task × 2 models → live leaderboard | Replit + own keys |
| **Voice-driven “build this form”** | Non-coders + India voice UX | Typing prompts is still coder UX | Speak requirements → form app URL | Vobiz/ElevenLabs + Replit |

**Still best from VC file:** **B1 Multiplayer Prompt Room**, **B3 Small Software Deploy**.

### 2.4 Creators — hot problems & new wedges

| Need (beyond CR1–CR5) | Why hot | Gap vs ChatGPT | 20-user demo | Partner plug-in |
|---|---|---|---|---|
| **Clip autopilot → captioned Shorts** | a16z agentic video; India Reels economy | Chat can’t cut video | Upload 2–5 min → 3 verticals | Replit + ffmpeg/API; ElevenLabs captions/VO |
| **₹199 digital product desk** | Offline UPI DM sales don’t scale | GPT writes copy; doesn’t checkout | Bio → rate card → **Pine Labs pay link** → file unlock | **Pine Labs** + Replit |
| **Hinglish brand-voice remix** | LinkedIn/X creator economy in BLR | Generic tone | Paste 3 posts → 3 platform drafts; blind vote | Replit + LLM |
| **Vernacular VO studio** | “Full studio in one phone” track brief | TTS demos without distribution | Script → ElevenLabs VO → share audio card | **ElevenLabs** |
| **Audience twin for campus creators** | Cheap feedback before posting | Fake comments unlabeled | Draft → 5 ICP comments → revise | Replit |

**Still best from VC file:** **CR1 Clip Autopilot**, **CR2 Brand Voice Remix** — add Pine Labs if monetization is the wedge.

---

## 3. Top 3 Builders Day bets

*Criteria: partner tools available **today** + VC demand (existing file) + shippable in ~5h build window + 20 phone-URL users + pitchable to Peer Capital / Pine Labs judges.*

### Bet 1 — **L1 Interview Drill Coach** (Learning) ★ primary recommendation

| | |
|---|---|
| **Why** | Matches YC tutors + Sequoia “sell the work” + Lightspeed/PeerCapital voice-skilling thesis + official Learning track brief (“teacher most Indians never had”). Placement anxiety = instant distribution among 500 builders + Polaris students. |
| **Partners / tools** | **ElevenLabs** Conversational AI + STT/TTS; **Vobiz** for stretch real-phone call; **Replit** for public scorecard URL; optional Render for API. |
| **Demo hook** | QR → 5-min mock FAANG/PM interview on phone → scorecard + “rewrite your weakest answer” card → WhatsApp/IG share. Target 20 interviews before 19:30. |
| **VC line** | “Autopilot interview coach, not another chatbot.” |
| **Main risk** | Hall noise / latency; keep turns short; offer typed fallback. Full Vobiz SIP may eat the clock — ship browser voice first. |

### Bet 2 — **C2 Buy-for-Me + Pine Labs checkout** (Commerce) ★ title-partner fit

| | |
|---|---|
| **Why** | Sanjeev Kumar’s keynote is literally agentic commerce OS; Gaurav Mittal judges from payments tech; Peer Capital lists commerce hyper-personalization. Turns “shopping agent” from blog into **paid intent**. |
| **Partners / tools** | **Pine Labs** Agent Toolkit / payment links (event-day credits); **Replit** app; LLM for shortlist reasoning. |
| **Demo hook** | “Earbuds under ₹3k, good for calls” → 3 ranked picks with tradeoffs → one-tap **Pine Labs** pay/hold link (even ₹1–₹49 test SKU or “intent deposit”). Users vote + optionally pay. |
| **VC line** | “Agent that buys, not chat that recommends.” |
| **Main risk** | Merchant account / sandbox access same day; if Pine Labs credentials lag, ship shortlist + **mock** receipt UI and narrate live API path — weaker but recoverable. Don’t overclaim P3P production. |

### Bet 3 — **B3 Small Software Deploy** *or* **B1 Multiplayer Prompt Room** (Builders) ★ track-brief + YC RFS

| | |
|---|---|
| **Why** | Track brief: “tools that build everything else… from people who never wrote code.” B3 = YC Cloud for Small Software; B1 = YC Multiplayer AI. Replit is an official toolkit — asymmetric advantage. |
| **Partners / tools** | **Replit Agent** (core); **Render** if custom host; **Greptile** only if you add a “review the generated PR” flourish; ElevenLabs if voice-to-app. |
| **Demo hook (B3 preferred for 5h)** | Attendee says “booth waitlist / feedback form / tip jar”; agent ships **live URL** in <3 min; 20 people submit real entries. |
| **Demo hook (B1)** | Shared room URL; 8–10 people steer one agent building a tiny app — spectacular if sync works. |
| **VC line** | B3: “Google-Doc-easy software.” B1: “Multiplayer agent, not private chat.” |
| **Main risk** | B1 state/sync complexity in 5h; B3 security — constrain to templates (forms, waitlists, polls), not arbitrary code exec. |

### Honorable mentions (if team skills dictate)

- **CR1 Clip Autopilot** — huge a16z tailwind; weaker *official* video partner (no Runway/Pika on strip); processing time risk.  
- **L2 Concept Explainer** — safest Learning ship; less “wow” than voice L1 with Vobiz/ElevenLabs in the room.  
- **Greptile-native B2/B5** — great for impressing builder judges; narrower non-dev user pool for “20 users.”

---

## 4. Practical stack recommendation for Saturday

| Layer | Use | Why |
|---|---|---|
| Ship URL | **Replit** first | Official credits + Agent + phone URL |
| Hosting backup | **Render** | Free TLS; watch 15-min spin-down |
| Voice | **ElevenLabs** (+ **Vobiz** if phone call) | Both toolkit partners |
| Payments | **Pine Labs** | Title partner + keynote + judge |
| Code review flourish | **Greptile** | Only for Builders-track code products |
| Pitch | Peer Capital language | Outcomes, India complexity, voice/UPI |

**Do not build:** TableTalk / interest-table meetup product (separate). This is a new Builders Day product.

**Judging reality:** Working AI loop on homepage > polished landing. Shareable artifact <2 min. One-tap signup. Sentence that matches a named thesis (“multiplayer agent”, “autopilot interview coach”, “agentic checkout”).

---

## 5. Source index

- Event: https://airtribe.live/ai-builders-day/  
- Register: https://airtribe.live/ai-builders-day/register  
- Sponsor tiers: https://airtribe.live/ai-builders-day/sponsor  
- Foundercal (credits + Pine Labs): https://foundercal.com/events/ai-builders-day-2026-317091143  
- Polaris LinkedIn: https://www.linkedin.com/posts/polaris-school-of-technology_aibuildersday2026-polarisschooloftechnology-activity-7516743660697473024-N4rP  
- Vobiz toolkit announce: https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-voiceai-activity-7517148190001823744-c-Id  
- Activate judge: https://www.linkedin.com/posts/airtribe_aibuilderday-aibuilders-activate-activity-7516815488522477569-AySO  
- Pine Labs AI/docs: https://www.pinelabs.com/docs/online-payments/ai  
- Vobiz: https://www.vobiz.ai/ · ElevenLabs pricing: https://elevenlabs.io/pricing · Greptile: https://www.greptile.com/pricing · Render free: https://render.com/docs/free  
- Peer Capital thesis: https://peercapitalvc.substack.com/p/the-india-ai-renaissance-from-services  
- Prior VC map: [builders-day-vc-research.md](./builders-day-vc-research.md)

---

*Report for Sol / Abhinav brainstorming. No code, no repo, no Page.*
