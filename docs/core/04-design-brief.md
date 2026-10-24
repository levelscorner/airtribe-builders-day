# Design brief — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial mobile UI, copy, audio, and accessibility brief. |

UI changes that change scope update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR.

Labels: [README](../../README.md#labels-used-everywhere). Screens: [03-app-flow](03-app-flow.md).

## Mobile first

The client is a phone browser on venue Wi-Fi. Layout is a single column at 360px wide. Desktop may center that column. There is no side nav.

| Rule | Spec |
|---|---|
| Width | Content padding 16px. Controls stretch to the column width. |
| Type | Body at least 18px. Prompt at least 20px. System font stack so Devanagari comes from the phone. A custom webfont is out for Saturday. |
| Targets | Hear, Hold to talk, Submit, language chips, and topic chips are at least 44px on the short side. |
| Thumb | Submit sits at the bottom of the drill screen and stays reachable. |
| Chrome | One progress line: “Drill 2 of 5”. Five dots are allowed. They are progress, not a lesson diagram. SVG lesson diagrams are cut ([01-product-requirements](01-product-requirements.md)). |
| Motion | No autoplaying motion. A planning screen may use a static “Making 5 drills” line. |
| Color | Dark text on an off-white background. One accent for Hear. Pass and miss each use a word plus a mark, not color alone. |

Wireframe for the drill (**PROPOSAL** layout, not a pixel spec):

```
┌──────────────────────────┐
│ Drill 2 of 5             │
│ Halves                   │
│                          │
│ Half means one of two    │
│ equal parts.             │
│                          │
│ [ Hear ]                 │
│                          │
│ [ Type your answer     ] │
│ [ Hold to talk ]         │
│ [ Submit ]               │
└──────────────────────────┘
```

Start screen order: what this is (one sentence), name, language, topic, Start.

Scorecard order: passes out of 5, hint count, topic, language, name. The large thing is the score, so the artifact reads at arm’s length.

## Copy tone

Vernacular means the learner’s chosen language is the UI for that session, not a translate button buried under English chrome.

| Language | Script | Tone |
|---|---|---|
| English | Latin | Short. Coach, not an exam notice. One idea per sentence. |
| Hindi | Devanagari | Same length. Everyday words. No bureaucratic Hindi. |
| Hinglish | Latin, mixed Hindi and English the way the room already speaks | Same length. No forced slang, no puns. |

Sample strings are **PROPOSAL**. They are not locked copy. Who checks Hindi and Hinglish before doors is **UNKNOWN**.

| Moment | English | Hinglish | Hindi |
|---|---|---|---|
| Start | “Five short drills. Type, or tap to hear.” | “Paanch chhote drills. Type karo, ya sunne ke liye tap karo.” | “पाँच छोटे ड्रिल. लिखो, या सुनने के लिए टैप करो.” |
| Hear | “Hear” | “Suno” | “सुनो” |
| Typing | “Type your answer” | “Answer yahan likho” | “अपना जवाब लिखो” |
| Talk | “Hold to talk” | “Bolne ke liye dabaao” | “बोलने के लिए दबाओ” |
| Voice down | “Voice not live yet. You can type.” | “Voice abhi live nahi hai. Type kar sakte ho.” | “आवाज़ अभी लाइव नहीं है. तुम लिख सकते हो.” |
| Frozen pack | “Using today’s practice set.” | “Aaj wala practice set chal raha hai.” | “आज वाला अभ्यास सेट चल रहा है.” |
| Hint label | “Hint” | “Hint” | “संकेत” |
| Score | “4 of 5” | “5 mein se 4” | “5 में से 4” |

Do not write “You got it right” on the hint path. Do not write “Payment successful,” “Reel posted,” or “Course complete.”

The page `lang` is `en` for English, `hi` for Hindi, and `en` for Hinglish because that mode is Latin script. A better BCP-47 tag for Hinglish is **UNKNOWN**. The visible language name still says Hinglish.

Kannada strings are out. If a learner types Kannada in the answer box, the grade still runs on that text. The UI language and the TTS voice do not switch to Kannada.

## Tap-to-play audio

- Hear is the only control that starts drill audio.
- The prompt text is on screen before the tap and stays if playback fails.
- The button state goes idle → loading → playing, or idle → “Voice not live yet.”
- Replay uses the cached clip and is another tap.
- Do not start audio when Planning finishes or when Next opens the following drill.
- Hold to talk is a separate control. Releasing it inserts text. It does not play the drill and it does not submit.

Captions are the prompt itself. There is no second hidden transcript.

## Accessibility

Saturday will not include a formal WCAG audit. These are the build rules Venus can check on a phone.

| Check | Rule |
|---|---|
| Names | Every control has a visible label. Icon-only buttons are out. |
| Hearing | The full drill is text. Audio is extra. |
| Speech | Typing works with the mic blocked. |
| Sight | Body contrast is dark on off-white. Pass and miss are words. Focus ring is visible. |
| Motor | 44px targets. Submit is not a tiny text link. |
| Screen reader | Hear, Hold to talk, and Submit expose their names. Planning exposes a busy state. |
| Language | `lang` follows the table above when the session language is known. |
| Motion | No flashing. No required animation. |
| Zoom | Layout still submits at 200% zoom in the phone browser. Horizontal scroll of the whole page is a bug. |

## Mentor and team surfaces

The mentor count is a plain stacked list of three numbers and a start count. It uses the same type size. It does not show API keys, raw audio URLs, or another learner’s answer on the public scorecard share. The shared scorecard shows only that session.

`?team=1` can be a small line under Start: “Team practice — not counted.” Default is the room.

## What visual design is out

PDF page chrome, citation highlights, SVG diagrams, avatar tutors, payment badges, Kannada toggle, a keypad for a Vobiz number, and a TableTalk interest table. Pine Labs brand marks are out of this UI because this demo does not take payment.

## Related

- [01 Product requirements](01-product-requirements.md)
- [02 Technical requirements](02-technical-requirements.md)
- [03 App flow](03-app-flow.md)
