> **Research archive** for [levelscorner/airtribe-builders-day](https://github.com/levelscorner/airtribe-builders-day).
> Original working title: Neptune shared-agent orchestration decision memo.
> Written Fri 23 Oct 2026 (Asia/Calcutta) for Abhinav, via Saturn, ahead of Airtribe AI Builders Day.
> What this file is: the framework comparison and the cheapest Ranker-loop design. Saturday’s runtime default is Vercel AI SDK.
> The locked lite extract (supervisor routes; Ranker, Checkout, and Verify are nodes) is [shared orchestration](../09-shared-orchestration.md). This memo is not rewritten by that extract. Section 2 still records multi-agent topology as overkill for a 12-hour Ranker; the extract keeps a *routing* supervisor only.
> Paths that originally pointed at `/workspace/*.md` now point at this repo.

# Builders Day — Shared Agent Orchestration Decision Memo

**For:** Abhinav (via Saturn)
**Event:** Airtribe AI Builders Day · Sat 24 Oct 2026 · Polaris / Brookefield Bengaluru
**Constraint:** ~2 coders · ~12h · Replit Node/TS · phone URL · shared layer for Shopping AI today, Grocery later, etc.
**Pine Labs:** Agent Enablement Toolkit confirmed (Node 18+)
**Written:** Fri 23 Oct 2026, Asia/Calcutta

**No product lock.** This freezes *orchestration infra*, not the Commerce bet.

---

## 1. Agentic loop vs Ranker loop

| | **Agentic loop** | **Ranker loop** |
|---|---|---|
| **Plain English** | The model keeps calling tools until *it* decides the job is done (or hits a hard cap). Goal-seeking; can wander, retry, invent steps. | The model runs a **bounded** plan: update constraints → search allow-listed catalog → emit a short ranked shortlist (often fixed N). Optional final step: hand off to a **server** `pay()`, not an open-ended agent wander. |
| **Control** | Soft: instructions + max turns. Hard to demo-predict. | Hard: schema + allow-list SKUs + step budget (e.g. ≤5). Demo is reproducible. |
| **Fits 1-day hackathon when…** | Open-ended builder tools (codegen deploy, multiplayer rooms) where surprise is the product. | Commerce / Grocery / any “pick from catalog + checkout” — judges need reliable 3 cards + a pay link in under a minute. |
| **Saturday default for Shopping** | Overkill / risky (latency, hallucinated SKUs, flaky pay). | **Yes — default.** |

**Rule of thumb:** If the win condition is “20 phones got a real shortlist + sandbox order,” use a **Ranker loop**. Save full agentic loops for a stretch or a Builders-track app.

---

## 2. Orchestration components — must vs overkill (2 coders / 12h)

| Component | Must / Overkill | Saturday note |
|---|---|---|
| **Session / memory** | **MUST** | Persist `session_id` + message list in Replit DB (or Postgres). Load → append model/tool turns → save. Enough for Shopping → Grocery reuse. |
| **Tool calling** | **MUST** | Exactly 3 app tools: `search_catalog`, `update_constraints`, plus server `pay()` (see §4). Pine Labs tools only behind `pay()`. |
| **Schema validation** | **MUST** | Zod (or toolkit schemas) on tool args; Ranker output = exactly 3 catalog ids + tradeoffs. Reject invented SKUs. |
| **Allow-lists** | **MUST** | Frozen demo catalog (8–12 SKUs). `pay()` amount/SKU from shortlist only — never free-form “charge ₹X”. |
| **Retries / harness** | **MUST (light)** | 1 retry on tool/LLM failure; timeout; label sandbox errors in UI. Do not build a custom retry framework. |
| **Context management** | **MUST (light)** | Cap history (last N messages or ~4k–8k tokens). Drop old tool payloads; keep constraints + last shortlist. |
| **MCP wiring** | **OVERKILL** | Pine Labs Toolkit is already function-calling tools. MCP adds another hop with no Saturday upside. |
| **Multi-agent DAG / LangGraph topology** | **OVERKILL** | One Ranker + one Checkout executor. No supervisor/worker graph. |
| **Durable checkpointing / time-travel** | **OVERKILL** | Nice in prod; wastes hours tomorrow. |
| **Human-in-the-loop tool approval framework** | **Stretch** | For pay: prefer **UI button → server `pay()`**, not model-initiated `createOrder` without a click. |

---

## 3. Framework comparison (Node/TS · Replit · Pine Labs)

**Official Pine Labs Agent Toolkit frameworks** ([docs](https://www.pinelabs.com/docs/online-payments/ai/agent-enablement-toolkit)):

| Import | Framework | Sample shape |
|---|---|---|
| `@plural_pinelabs/agent-toolkit/openai` | OpenAI Agents SDK (`Agent`, `run`) **and** raw `chat.completions` tools | Full agent or manual tool loop |
| `@plural_pinelabs/agent-toolkit/langchain` | LangChain | Docs sample: `AgentExecutor` + `createOpenAIFunctionsAgent` |
| `@plural_pinelabs/agent-toolkit/ai-sdk` | Vercel AI SDK | `generateText` + `tools` + `maxSteps` |

**Available tools from toolkit:** `createOrder`, `getOrder`, `cancelOrder`, `createRefund`. Auth via `PINE_CLIENT_ID` / `PINE_CLIENT_SECRET` (UAT or PRODUCTION).

### Recommendation table

| Framework | Fit for Ranker | Pine Labs adapter | Replit / Node | Complexity | Saturday risk | Verdict |
|---|---|---|---|---|---|---|
| **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) | Excellent — `generateText` / `streamText` + tools + step stop = Ranker | **Official** `/ai-sdk` | Node 18+ OK; Replit default ~Node 20 | Low | Docs sample uses `maxSteps` (v4); current docs prefer `stopWhen: isStepCount(n)` (v5) — pin version or change one line | **DEFAULT** |
| **OpenAI Agents SDK** (`@openai/agents`) | Good but biased to open agentic loops / handoffs | **Official** `/openai` | Docs: **Node 22+**; Replit often Node 20 unless `.replit` bumped | Medium | Node mismatch + more surface than Ranker needs | Runner-up |
| **LangChain JS** (`createAgent` / classic executor) | OK | **Official** `/langchain` | Fine on Node 20 | Medium–high | Toolkit sample uses **legacy** `AgentExecutor` / `createOpenAIFunctionsAgent` (now `@langchain/classic`); v1 `createAgent` is LangGraph under the hood | Avoid for Saturday |
| **LangGraph.js** (custom graph) | Poor ROI for Ranker | Via LangChain tools only | Fine | High | DAG/checkpointers = day-eating | Overkill |
| **Mastra** | Good product DX | **Not listed** by Pine Labs | Fine | Medium + glue | Must wrap OpenAI Agents or AI SDK tools yourself | Skip Saturday |

**Sources:**  
- Pine Labs Agent Toolkit: https://www.pinelabs.com/docs/online-payments/ai/agent-enablement-toolkit  
- OpenAI Agents SDK JS: https://openai.github.io/openai-agents-js/ (Node 22+) · https://www.npmjs.com/package/@openai/agents  
- Vercel AI SDK tools / multi-step: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling (`stopWhen` / `isStepCount`)  
- LangChain JS agents / v1: https://docs.langchain.com/oss/javascript/langchain/agents · legacy vs `createAgent`  
- Mastra: https://mastra.ai/ · SDK agents (wraps other SDKs): https://mastra.ai/docs/connections/sdk-agents  

---

## 4. Cheapest Ranker-loop design (Shopping AI) — components only

**Goal:** shared orchestration module other verticals (Grocery) can import by swapping catalog + system prompt.

```
Phone UI (Replit public URL)
    │
    ▼
POST /api/chat  { session_id, user_message }
    │
    ├─ load messages from DB
    ├─ Ranker: generateText / streamText
    │     tools:
    │       • update_constraints({ budget, must_haves, avoid })
    │       • search_catalog({ query, filters })  → ONLY allow-list SKUs
    │     stopWhen: isStepCount(5)   // or maxSteps: 5 if pinned to AI SDK v4 / Pine sample
    │     system: “Emit exactly 3 catalog ids + tradeoffs; never invent products/prices”
    │
    ├─ save messages + last_shortlist[3] to DB
    │
    └─ UI renders 3 cards
            │
            ▼ user taps Pay / Hold
         POST /api/pay  { session_id, sku_id }   // NOT model-initiated
            │
            ├─ validate sku_id ∈ last_shortlist ∩ allow-list
            ├─ server pay(): PinelabsAgentToolkit.createOrder (UAT)
            │     import from @plural_pinelabs/agent-toolkit/ai-sdk
            └─ return { order_id, redirect_url } → phone opens URL
                    │
                    ▼ return path / poll
                 getOrder → receipt row in DB
```

**Explicitly out:** Firecrawl, live Amazon scrape, MCP, multi-agent supervisor, model calling `createOrder` with arbitrary amounts.

**Shared module exports (conceptual):** `runRanker({ sessionId, message, catalog, systemPrompt })`, `pay({ sessionId, skuId })`, `getSession(sessionId)`. Shopping and Grocery differ only in `catalog` + prompt + SKU fields.

---

## 5. One-paragraph final pick

**Default Saturday stack: Vercel AI SDK + `@plural_pinelabs/agent-toolkit/ai-sdk` on Replit (Node 18+/20).** It is one of the three frameworks Pine Labs documents with sample code; its `generateText` + tools + step limit is the natural Ranker loop; it ships phone UX cleanly via `streamText` / `useChat`; and it avoids OpenAI Agents’ Node 22+ footgun and LangChain’s legacy-sample / LangGraph weight. Own session messages in Replit DB; keep Pine Labs behind a server `pay()` that only charges allow-listed shortlist SKUs. What it still does **not** give you: durable multi-agent DAGs, built-in cross-session memory product, or automatic MCP — none of which you need before 20 users. Pin `ai` to the major version that matches the Pine Labs sample (`maxSteps`) **or** spend five minutes swapping to `stopWhen: isStepCount(5)` on current AI SDK.

**Fallback if AI SDK version skew fights the toolkit:** OpenAI Agents SDK path (`/openai`) after bumping Replit to Node 22 — still official, slightly more glue for a Ranker.

---

## 6. Top risks (act on these first)

1. **AI SDK API drift:** Pine Labs sample uses `maxSteps`; current AI SDK docs use `stopWhen`. Pin versions early or adapt one line before building UI.  
2. **OpenAI Agents on default Replit Node 20:** Official Agents SDK wants Node 22+ — do not pick it without an explicit runtime bump.  
3. **Model invents SKUs/prices:** Enforce allow-list in `search_catalog` + validate Ranker output ids server-side.  
4. **Agent-initiated pay:** Prefer button → `/api/pay`; if you expose `createOrder` as a model tool, wrap with amount/SKU allow-list + UI confirmation.  
5. **Late Pine Labs credentials:** Shortlist still real; receipt labeled mock — never fake a successful charge (aligns with Shopping component stub).

---

## Cross-links

- Lite Saturday extract: [shared orchestration](../09-shared-orchestration.md)
- Day-of approach (any booth card): [how to approach a problem tomorrow](../10-tomorrow-problem-approach.md)
- Prior partner/market: [builders-day-partners-and-market.md](./builders-day-partners-and-market.md)
- Partner problem statements: [builders-day-partner-problem-statements.md](./builders-day-partner-problem-statements.md)
- Shopping Saturday components: [08-shopping-ai-saturday-components.md](../08-shopping-ai-saturday-components.md)
- VC demand notes: [builders-day-vc-research.md](./builders-day-vc-research.md)  
