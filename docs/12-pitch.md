# Chotu Studio — Track 04 pitch (AI for Creators)

**Product name:** Chotu Studio  
**One-liner:** An AI production team for Indian creators — Hindi/Hinglish first — that drafts, voices, edits, and publishes short explainers with the creator in the approval loop.

## Problem

Indian creators who teach, review, or explain in vernacular still stitch tools by hand: write a script in one place, generate pictures in another, voiceover in a third, edit captions, then figure out how to get paid. English-first studios leave Hindi/Hinglish creators translating twice. Silent exports still need a separate VO app. There is no single phone URL that feels like a **crew** — Script, Voice, Edit, Publish — with the creator as showrunner.

## Insight

Creators do not want a fully autonomous black box. They want a **production team that asks before spending the brand**. Two gates matter: approve the **script** before visuals/voice burn credits and compute, and approve the **final cut** before download/publish. Pair that with vernacular-first generation and a simple India-priced credit pack, and the booth demo is a complete creator loop — not a toy collage.

## Agent team

| Role | Job in Chotu Studio |
|---|---|
| **Script** | Kids/creator explainer draft (4–5 scenes), Hindi or English |
| **Voice** | ElevenLabs TTS (MCP, REST fallback) — warm, multilingual |
| **Edit** | Visuals (Higgsfield / OpenArt MCP or mock) + ffmpeg assemble, captions |
| **Publish** | Unlock download/share only after final approval |
| **Creator** | Human-in-the-loop: script approval + final-cut approval (logged) |

Lite DAG (unchanged shape): Supervisor → Script → **(approval)** → Visuals → Voice → Render → Verify → **(approval)** → Publish.

## Money

- **Video packs via Pine Labs** — env-configured payment link / toolkit; mock checkout in dev. Credits gate each generation.
- Starter credit on signup so the first booth user can finish one short without paying.
- Stretch (not inventing traction): learning creators can later sell **mini-courses** (bundled shorts + pack rails) — same credit/payment primitives, not built as a marketplace on day one.

## Differentiators

1. **Vernacular first** — Hindi/Hinglish as a first-class language field, not an afterthought.
2. **Creator’s own voice path** — ElevenLabs multilingual TTS today; studio framing leaves room for the creator’s voice identity without requiring clone on day one.
3. **Full pipeline** — script → visuals → voice → edit → publish on one phone URL.
4. **Approval gate** — human-in-the-loop before expensive production and before publish.
5. **Monetization** — Pine Labs packs, not “freemium forever” hand-waving.
6. **India pricing** — pack priced in ₹ (env default ₹99 / 5 credits; adjustable).

## Submission checklist (Track 04)

Do not invent stats. Only claim what the live system and logs show.

- [ ] **Live URL** — Replit (or equivalent) running Chotu Studio app + API
- [ ] **Timestamped proof** — `/admin` event log (signup, job created, approval, payment, render done) screenshot and/or CSV export
- [ ] **≤ 2 min demo video** — signup → topic → approve script → agent activity → approve final → download; optional pack purchase
- [ ] **LinkedIn post** — tag Airtribe and Pine Labs
- [ ] **X and/or Instagram post** — tag Airtribe and Pine Labs

## Demo beat sheet (≤ 2 min)

1. Signup (name + email/phone) — show credit balance  
2. Topic in Hindi, watercolor — spend 1 credit  
3. Approve script (read one scene aloud)  
4. Point at agent activity log (MCP/tool rows)  
5. Approve final cut → download  
6. Open `/admin` — timestamped events  
7. Optional: buy video pack (mock or Pine Labs link)

## What we will not claim

- Live settled GMV or user counts we did not log  
- That OpenArt has a public REST API (it does not; MCP is the path)  
- Voice cloning of attendees without consent  
- Automatic posting to Instagram/Reels
