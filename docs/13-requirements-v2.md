# 13. Requirements v2: AI chat video studio for Indian creators

Status: agreed with Abhinav on Sat 24 Oct 2026 (Builders Day, Track 04). Product name still to come.

> This doc supersedes the requirements in docs 00-12. Where they disagree, this one wins.
> PR #6 still follows the older step-by-step flow (topic, then script, then visuals). It has not yet been moved to the chat-first flow, the cast bank or HITL gates at every stage.

Visual version: https://cursor.com/canvas/store-0ff2c9ff-68a2-4f44-bcc1-b93dafba8fcc/9227e7ca-e5c3-47e5-adf4-e432e37f9050

## 1. One line
The creator chats with an AI production team in Hindi, Hinglish or English and gets a finished short video (a kids explainer, an ad or a faceless video). The same cast and voices are reused, so characters stay consistent.

## 2. Stack
- App: React Native (Expo), for web and phones.
- Server: Node on Replit, which also gives us the deploy link.
- DB: Postgres (users, chats, jobs, cast, voices, ledger, events).
- Visuals: Higgsfield through its API key, not MCP (MCP needs a browser sign-in). Seedance 2.0 / 2.5 is a stretch goal.
- Voice: ElevenLabs.
- Edit: ffmpeg in a Render Workflow, with Replit as the fallback.
- Payments: Pine Labs credit packs, plus a Postgres credit ledger that is a lite port of auto-shorts.
- AgenticOrg: parked. We plug one agent in at the very end, most likely the script agent through `agenticorg-sdk`.

## 3. Genres (configuration)
| Genre | Who | Tone | Shape |
|---|---|---|---|
| Kids edu-fun | parents, kids channels, tutors | playful, simple words, a mascot | hook, 3 facts, quiz, 45s |
| Ad | small brands, D2C, local shops | punchy, benefit-led | hook, problem, product, offer, CTA, 20-30s |
| Faceless | facts, story, motivation channels | narrator, curiosity | hook, beats, payoff, 45-60s |

Each genre config sets: the prompt template, scene count and length, art style presets, default cast and voice, caption style, and its follow-up questions.

## 4. Flow (chat-first, with an orchestrator behind it)
Sign up, then chat, then brief intake (clarifying questions), then cast (pick from the bank or create new, HITL), then script (HITL), then prompts (HITL), then images (HITL), then clips (HITL), then audio (HITL), then final cut (HITL), then download or share, then buy a credit pack.

## 5. Brief intake: clarifying questions in chat
- Genre (chips, but the chat can also guess it)
- Resolution and aspect ratio (9:16 by default; 720p or 1080p)
- Length
- Language: Hindi, Hinglish or English
- Audience
- **Art style**: presets plus free text. Presets: bright 2D cartoon (kids), soft 3D toon, clean product studio (ads), cinematic realistic, Indian miniature or folk-art flat. Free text is turned into traits; no artist or brand names go into the prompt (chotu-craft rule).
- **Cast**: who appears (pick from the bank, create new, or no on-screen character for faceless)
- Anything unclear in the brief: the orchestrator asks one question at a time, and the creator can always skip or accept defaults.

## 6. HITL gates
Every generated artefact gets **Approve**, **Reject with a note**, or **Regenerate**. Only approved items move forward.

| Stage | Shows | Actions |
|---|---|---|
| 0 Brief | the clarifying questions | answer, skip, use defaults |
| 1 Cast | character sheet text, reference images, voice sample | approve, edit, regenerate |
| 2 Script | scenes plus narration, with doubts flagged | approve, reject, regenerate, edit by chat |
| 3 Prompts | image and video prompt per scene | approve, edit, regenerate per scene |
| 4 Images | keyframe per scene | approve, reject, regenerate per scene |
| 5 Clips | clip per scene | approve, reject, regenerate per scene |
| 6 Audio | voice per scene | approve, change voice, regenerate |
| 7 Final cut | full video with captions | approve, redo a scene, download |

Each regeneration shows its credit cost before it runs. Every decision is logged with a timestamp, which also serves as traction proof. "Approve all remaining" keeps the demo fast.

## 7. Cast bank (new, core to consistency)
### What it is
A reusable, persistent bank of characters. Each character is locked once (a character sheet, reference images and a fixed voice), then attached to every generation of every scene, across videos. Consistency comes from reusing the same reference, not from describing the character again each time. The standard workflow: build a multi-angle sheet, lock it, attach it to every shot, version it when the look changes, and QC for drift against the sheet.

### A cast member has
- `name` and `role` (narrator mascot, presenter, hero, product)
- `identity paragraph`: age, build, face, hair, outfit and one distinctive detail. The exact same wording is reused in every prompt.
- `dna_chips`: 4-6 short tags (same idea as auto-shorts `dna_chips`)
- `sheet image`: front, 3/4, profile and back, plus a face close-up, on a neutral background with even light and no held props
- `face anchor image`: one clean front portrait. One-reference models read a multi-view sheet as several people (auto-shorts issue #711), so we send this single image instead of the sheet.
- `higgsfield_element_id`: a Higgsfield Reference Element made from the anchor image
- `voice_id`: one of the preset ElevenLabs voices (section 8)
- `art_style`: the style the character was locked in. A new style means a new version.
- `version`, `status` (draft, approved, archived), `owner_user_id`, `is_preset`

### What Higgsfield supports
- **Reference Elements** (create/list/get): instant, from one clear image, with categories character / environment / prop. In a prompt, embed `<<<element_id>>>`. Several elements per prompt are allowed (multi-character shots). Works with image models nano_banana_pro, nano_banana_2, gpt_image_2, seedream_v4_5, seedream_v5_lite, cinematic_studio_2_5 and video models seedance_2_0, cinematic_studio_video_v2, cinematic_studio_3_0, kling3_0 (Kling needs a start_image). Only completed elements are usable. **This is our MVP path.**
- **Soul Characters**: a trained identity from 5-20 photos, about 10 minutes, usable only with soul_2 and soul_cinematic, one soul per generation. Too slow and too narrow for the demo, so it is a stretch goal.
- No real person's face is ever used as input (chotu-craft rule and consent).

### Cast creation via chat (HITL)
1. The creator says "make a mascot, a curious 8-year-old girl called Mini" (or picks a genre preset).
2. The orchestrator drafts the identity paragraph and DNA chips. **Gate:** approve, edit, regenerate.
3. Generate the sheet image and the face anchor (Nano Banana Pro). **Gate:** approve, regenerate.
4. Pick a voice from the presets and play a sample line. **Gate:** approve or change.
5. On approval: create the Higgsfield Element from the anchor and save it to Postgres. The character is now in the bank.

### Use per video
- At intake, the creator picks 1-2 cast members (presets for the genre, or their own).
- The script agent writes a `cast` list per scene.
- The prompt step inserts the identity paragraph plus `<<<element_id>>>` for every character in the scene.
- Voice per line = the speaking character's `voice_id`.
- A drifted scene is rejected and regenerated with the reference attached. If drift keeps happening, fix the sheet, not the shot.

### Starter bank (presets, so the demo works from the first second)
- Kids: "Chintu", a cheerful cartoon boy mascot, plus "Mini", a curious girl
- Ad: "Riya", a friendly presenter
- Faceless: no on-screen character, narrator voice only

### Postgres
```
cast_members(id, owner_user_id, name, role, identity_text, dna_chips jsonb, art_style,
  sheet_url, anchor_url, higgsfield_element_id, voice_id, version, status, is_preset,
  created_at, updated_at)
cast_assets(id, cast_id, kind  -- sheet|anchor|sample_audio, url, approved bool, created_at)
video_cast(video_id, cast_id, cast_version)
scene_cast(scene_id, cast_id)
```

## 8. Voices (MVP: 4 presets)
Pick 4 voices from the ElevenLabs Voice Library that read Hindi well (Multilingual v2 or v3 model). Store the fixed `voice_id`, plus stability and style settings, per preset. One voice belongs to one cast member, and the same voice is used for every line in every video.

| Preset | Use | Language | Default cast |
|---|---|---|---|
| Warm kid-friendly female | kids narrator / Mini | Hindi, Hinglish | Mini |
| Playful young male | kids mascot | Hinglish | Chintu |
| Confident presenter female | ads | Hinglish, English | Riya |
| Deep storyteller male | faceless narrator | Hindi, English | Narrator |

Not in the MVP: voice cloning, a voice designer, per-line emotion controls.

## 9. Prompt skills reused from chotu-craft (levelscorner/chotu-craft)
We load these as system-prompt material on the server (they are private, so never expose them in the client).

| Our step | chotu-craft skill | Files we use |
|---|---|---|
| Script | `skills/script-per-genre/SKILL.md` | references: cards-format-kids, kids, cards-format-explainer (kids edu-fun); cards-format-advert, cards-format-product, cards-format-ugc (ads); cards-format-documentary, story-shape, cards-format-vertical-short (faceless); plus cards-hook, cards-script, script-shape, dialogue, india-platforms, compliance-india, festival, mythology |
| Character sheet / cast | `skills/image-prompt/SKILL.md` | references: sheet, cards-continuity, production-design |
| Image prompt | `skills/image-prompt/SKILL.md` | references: cards-image-prompt, still, cards-camera, cards-light, cards-colour, cards-checks, titles |
| Video prompt | `skills/video-prompt/SKILL.md` | references: cards-video-prompt, clip, cards-continuity, cards-camera, cards-pace, performance, editing |
| Art style | `skills/ingredients/SKILL.md` | references: art-style, colour, light, composition, pace |
| Voice, captions | `skills/sound/SKILL.md` | references: narration, captions, cards-captions, cards-sound |
| Model dialect | `skills/models/SKILL.md` | references: nano-banana, seedance, kling, elevenlabs, sarvam |
| QC / verify | quality-check.md in image-prompt and video-prompt | |

Rules we inherit: prompts stay private; no real person's face or voice; no brand, studio or artist names in prompts (describe traits instead); keep the AI-content label; plain words. The "offer 2-3 options, then ask" answer shape fits our HITL gates directly.

## 10. Requirements (MoSCoW)
Must: own AI chat; orchestrator; genres as config; vernacular; brief intake incl. art style; **cast bank (create via chat with HITL, pick per video, persisted)**; **4 preset voices mapped to cast**; HITL on every stage; credits plus Pine Labs; traction log; agent activity in chat.
Should: captions; redo a single scene; chotu-craft prompt skills on the server.
Could: brand kit for ads (product photo as a prop Element); Seedance clips; AgenticOrg script agent (at the end).
Later: Soul training, voice cloning, auto-post, subscriptions.

## 11. Credits
Token credit packs, not a subscription. Reserve the maximum cost per video, settle the difference, refund on failure. Cast creation and every regeneration are priced and shown before they run. Ledger: `ref UNIQUE`, 1 credit = $0.01, 60% margin, rounded up.

## 12. Out of scope today
Subscriptions, auto-posting, videos over 60s, voice cloning, Soul training, AgenticOrg until the end.

## 13. Open questions
- Which LLM runs the orchestrator?
- Ads: does the creator upload a product photo (and do we turn it into a prop Element)?
- Stills with motion, or Higgsfield clips for every scene?
- Which 4 exact ElevenLabs voice IDs?
- Starter credits: one free video?
- Product name.
