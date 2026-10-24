# Backend schema — vernacular Learning coach

| | |
|---|---|
| Owner | Saturday build pack. Critique: Venus. |
| Status | Active Saturday spec for 24 Oct 2026. Docs only. |
| Last updated | 2026-10-24 |

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial Replit DB records and Zod node I/O. |

Schema changes update this change log and [CHECKLIST.md](CHECKLIST.md) in the same PR. Rule: [CHECKLIST — Change-control](CHECKLIST.md#change-control-rule).

Labels: [README](../../README.md#labels-used-everywhere). This file is the schema source for the pack. Flow: [03-app-flow](03-app-flow.md).

## Store

**PROPOSAL.** Use Replit DB, the Saturday store named in [D1](../06-unified-ideas.md). Keys below are the contract if the database is key-value. If the created Replit app exposes SQL instead, keep these records and treat each key prefix as a table name. Which product the app actually has is **UNKNOWN** until the project exists.

Prefix list of `scorecard:` is the mentor count. Do not keep a single mutable “counter” key as the source of truth. A lost increment would invent users.

Render table `learn_attempts` in [docs/05](../05-partner-stack-architecture.md) is the backup shape from the partner doc. It is not the Saturday live store.

No Pine Labs order row. No TableTalk table. No PDF blob.

## Keys

| Key | Record | When it is written |
|---|---|---|
| `session:{sessionId}` | Session | Start |
| `session:{sessionId}:drill:{n}` | Drill, `n` = 1..5 | Plan accepted, or frozen pack loaded |
| `session:{sessionId}:attempt:{n}` | Attempt | After verify resolves to feedback or hint |
| `scorecard:{sessionId}` | Scorecard | After attempts 1–5 exist |
| `pack:default` | Frozen pack | Seeded by noon, before learners arrive |

`sessionId` is a UUID generated on the server. `nameKey` is the display name trimmed and lowercased.

`scorecard:names:` is not a second source of truth. Unique users are computed by listing `scorecard:` and reducing `nameKey` where `source` is `room`.

## Records

Field types are the JSON stored at that key. Zod for model I/O is in the next section. Length caps match.

### Session

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | UUID |
| `name` | string | Trimmed display name, 1–40 |
| `nameKey` | string | Lowercased trim |
| `language` | `en` \| `hi` \| `hinglish` | |
| `topic` | string | 1–80. What the learner asked for |
| `topicServed` | string | Topic label actually drilled. Equals `topic` unless the frozen pack replaced a failed plan |
| `createdAt` | string | ISO-8601 |
| `status` | `planning` \| `in_drills` \| `complete` | `complete` only after the scorecard write |
| `planSource` | `model` \| `frozen_pack` | |
| `source` | `room` \| `team` | `team` when Start was opened with `?team=1` |

### Drill

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | |
| `n` | 1..5 | |
| `prompt` | string | Shown and, when voice works, spoken. 1–500 |
| `checks` | `{ id, text }[]` | 1–4 items. Written before the learner answers. `id` matches `^[a-z0-9-]{1,16}$`. Unique inside the drill |
| `hint` | string | Shown only after grade verify fails twice. 1–300 |
| `voice.status` | `pending` \| `ready` \| `failed` \| `skipped` | `skipped` when there is no ElevenLabs key |
| `voice.cacheKey` | string, optional | Server pointer to cached audio bytes or a same-origin play path. Not an API key. The browser plays via our route |

### Attempt

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | |
| `n` | 1..5 | One attempt per drill. A second submit after `shown` is set is rejected |
| `inputMode` | `type` \| `stt` | `stt` only if a transcript was written into the box |
| `answerText` | string | 1–1000, trimmed |
| `grade` | object or null | The verified grade, or null when the hint path discarded an unverified grade |
| `verify.ok` | boolean | |
| `verify.runs` | 1 \| 2 | 2 means the one retry was used |
| `verify.reason` | string, optional | Last verifier message. For the booth, not the learner UI |
| `shown` | `feedback` \| `hint` | |
| `createdAt` | string | ISO-8601 |

`grade` when present: `{ verdict: "pass" \| "miss", citedCheckIds: string[], feedback: string }`.

### Scorecard

Written only when five attempts exist. This row is the user-counter record ([01-product-requirements](01-product-requirements.md)).

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Same id, one card |
| `name`, `nameKey` | string | Copied from the session |
| `language` | enum | |
| `topic` | string | `topicServed` |
| `drills` | 5 | Constant |
| `passCount` | 0–5 | Attempts with `shown === "feedback"` and `verdict === "pass"` |
| `hintCount` | 0–5 | Attempts with `shown === "hint"` |
| `source` | `room` \| `team` | |
| `createdAt` | string | ISO-8601 |

`passCount + hintCount + missCount = 5`, where a miss is feedback with `verdict: "miss"`. The card stores `passCount` and `hintCount`. Misses are the remainder.

### Frozen pack

`pack:default` holds `{ topic: string, language: "en", drills: DrillBody[5] }`. Hindi and Hinglish rows may be added as `pack:hi` and `pack:hinglish` if a person has checked them. Until those keys exist, a frozen fallback for a Hindi or Hinglish session still uses `pack:default` and the UI keeps “Using today’s practice set.” Serving English checks under a Hindi chrome without saying so is a Venus fail. Minimum honest label: the practice-set line, plus the pack’s actual language if it differs.

Who writes the pack, and the topic name, are **UNKNOWN**.

### Mentor read model

Not a stored record. Computed on read.

| Field | Meaning |
|---|---|
| `roomUsers` | Distinct `nameKey` on scorecards with `source: "room"` |
| `roomScorecards` | Those rows |
| `teamScorecards` | Rows with `source: "team"` |
| `starts` | Session keys with no matching scorecard |

## Zod schemas for node I/O

**PROPOSAL.** TypeScript shapes for the build. Verify is code that runs these schemas and the extra checks under each block. One retry means: call the worker again with `repair: string[]` set to the verifier messages, then run Verify once more.

```ts
const Language = z.enum(["en", "hi", "hinglish"]);

const Check = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,16}$/),
  text: z.string().min(1).max(200),
});

const DrillBody = z.object({
  n: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  prompt: z.string().min(1).max(500),
  checks: z.array(Check).min(1).max(4),
  hint: z.string().min(1).max(300),
});

const SupervisorInput = z.object({
  topic: z.string().min(1).max(80),
  language: Language,
});

const SupervisorPlan = z.object({
  topic: z.string().min(1).max(80),
  language: Language,
  drills: z.array(DrillBody).length(5),
});

const LearnerTurn = z.object({
  n: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  answerText: z.string().trim().min(1).max(1000),
  inputMode: z.enum(["type", "stt"]),
});

const GradeInput = z.object({
  n: LearnerTurn.shape.n,
  prompt: z.string().min(1).max(500),
  checks: z.array(Check).min(1).max(4),
  answerText: z.string().min(1).max(1000),
  language: Language,
});

const GradeResult = z.object({
  n: LearnerTurn.shape.n,
  verdict: z.enum(["pass", "miss"]),
  citedCheckIds: z.array(z.string()).max(4),
  feedback: z.string().min(1).max(300),
});
```

`GradeInput` omits `hint` on purpose.

### Extra checks (not expressible as a single field)

**SupervisorPlan**

- The five `n` values are exactly the set {1, 2, 3, 4, 5}.
- Inside one drill, `checks[].id` values are unique.
- `language` equals the session language. A plan that switches language fails verify.

**GradeResult**, given the stored drill and the `LearnerTurn.n` being graded

- `GradeResult.n` equals that drill’s `n`.
- Every `citedCheckIds` entry is a `checks[].id` on that drill.
- `verdict: "pass"` requires `citedCheckIds.length >= 1`.
- `verdict: "miss"` may cite nothing.
- Unknown ids, the wrong `n`, or a pass with no citation: verify fails.

### Verify result (code output, not a model object)

| Field | Type |
|---|---|
| `ok` | boolean |
| `runs` | 1 \| 2 |
| `errors` | string[] |

### Retry then hint

| Failing node | Retry input | After the second failure |
|---|---|---|
| Supervisor | Same `SupervisorInput` plus `repair` errors | Load `pack:default`. Set `planSource` to `frozen_pack`. |
| Drill worker | Only if the stored body for `n` is invalid. Regenerate that one drill, not the whole plan | Do not invent a pass. If the frozen pack has this `n`, use it. If it does not, this session cannot scorecard. |
| Grade worker | Same `GradeInput` plus `repair` errors | Persist the attempt with `grade: null`, `shown: "hint"`, `verify.ok: false`. UI renders `hint`. |

Learner-turn Zod failures (empty answer) never call the grade worker. The phone stays on the drill.

## What is deliberately absent

Order ids, payment URLs, PDF extracts, diagram specs, Vobiz call ids, conversational-agent session ids, passwords, and API keys. Audio bytes, if cached, are not committed to git.

## Related

- [02 Technical requirements](02-technical-requirements.md)
- [03 App flow](03-app-flow.md)
- [07 Tools](07-tools-provided.md)
- [docs/09](../09-shared-orchestration.md)
