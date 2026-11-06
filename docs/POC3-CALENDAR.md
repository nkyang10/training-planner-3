# POC3 — Calendar-first AI coach

**Status:** standalone proof of concept · **Surface:** private calendar + in-calendar coach bubble · **Repo:** training-planner-3

---

## 1. What POC3 is

POC3 keeps the conversation, memory and planning, but moves the **calendar to the centre of the product**. After login the
runner lands on a private month calendar. The coach lives in a bubble on that page: the runner talks to it, and the calendar
is the coach's working surface — it books, moves and deletes sessions in front of the runner, with a page-wide animation.

The coach is not a human. It is an LLM behind a small server that validates every proposal before writing anything. The
calendar is **system-owned**: it is not the runner's Google/Outlook calendar, and the runner never has to curate it by hand.

POC3 is deliberately narrower than the earlier proofs:

- **No Open WebUI requirement.** The calendar and the bubble are the product. Open WebUI is an optional companion surface
  (full chat + its native calendar mirror), not the front door.
- **One runner, one calendar.** Multi-user mapping and admin tooling are out of scope.
- **The coach is the only writer.** There is no manual edit form; the bubble is the edit path.

---

## 2. Why calendar-first

| Problem with chat-first | POC3 answer |
|---|---|
| A chat thread hides the plan; the runner has to remember what was booked | The plan is visible immediately: month grid, today ring, Garmin completions |
| "Coach said it changed something" is hard to verify | Every change is a visible cell edit + animation + `poc3.changes` metadata |
| Chat UIs are generic; a training plan has days, weeks and load | Calendar-native CRUD, batch edits, day detail |
| Embedding a full chat app is heavy (iframe, cookies, double login) | A same-origin bubble: no iframe, no second login, direct DOM access for animation |

The design decision is recorded in [`adr/0002-calendar-first-bubble.md`](adr/0002-calendar-first-bubble.md).

---

## 3. The user journey

1. Open `http://<host>:8091/login`, enter the demo token.
2. Land on **November 2026** (or the current month). Empty days are dashed; booked days carry session chips; Garmin days
   carry a `✓ n` badge.
3. Click **💬 Coach** (bottom-right). Tell it a goal or a constraint:
   - "I want to run a 10k in 8 weeks."
   - "Move Tuesday's run to Wednesday and delete Sunday's."
   - "I only have 30 minutes on weekdays."
4. The coach replies in the bubble and books the plan. The month grid updates **in place**; changed days animate.
5. Later, Garmin activities appear on the same calendar after a sync. The coach can refer to them on the next turn.
6. The **Full chat ↗** button opens Open WebUI for long-form conversation; the same coach gateway and the same SQLite are
   behind both surfaces.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                             │
│  :8091/calendar   month grid + day cells + Garmin badges            │
│  💬 Coach bubble  self-implemented HTML/CSS/JS, same-origin          │
│        │ POST /chat                                                  │
└────────┼────────────────────────────────────────────────────────────┘
         ▼
┌──────────────────────┐        ┌─────────────────────────────────────┐
│ POC3 web (:8091)     │        │ POC3 gateway (:8090)                │
│ src/web.ts           │───────▶│ src/gateway.ts                      │
│ - login / cookie     │  HTTP  │ - OpenAI-compatible /v1/chat/...    │
│ - month/day render   │        │ - prompt + validate + apply CRUD    │
│ - /calendar/data     │        │ - mirror to Open WebUI (optional)   │
│ - /sync (Garmin)     │        └───────────────┬─────────────────────┘
└──────────┬───────────┘                        │
           │                                    ▼
           │                          ┌──────────────────────────────┐
           │                          │ SQLite (node:sqlite)         │
           │                          │ messages, memories,          │
           │                          │ sessions, activities         │
           │                          └──────────────────────────────┘
           │                                    │
           ▼                                    ▼
   Garmin Personal API                  Open WebUI (:3010, optional)
   activities                            native Calendar mirror
```

Key properties:

- **One store, two surfaces.** The calendar page and the gateway share the same SQLite file. The bubble never talks to the
  LLM directly; it always goes through `/chat` → gateway.
- **No iframe.** The bubble is part of the calendar document (ADR-0002). It can read the month cells and animate them.
- **Server-side validation.** The model proposes; `parseCoachTurn` validates day, horizon, kinds, counts and CRUD ids before
  any write (ADR-0001).
- **The calendar is a projection.** If the native mirror fails, the booking is still in SQLite; the calendar page reads
  SQLite, not Open WebUI.

---

## 5. Surfaces

| Surface | URL | Implementation | Purpose |
|---|---|---|---|
| Private calendar | `/calendar` (`:8091`) | `src/web.ts` + `src/styles.ts` | month grid, day detail, Garmin badges, login |
| Coach bubble | bottom-right of the calendar | self-implemented in `renderChatBubble()` | short turns, bookings, CRUD, animation |
| Coach gateway | `:8090/v1` | `src/gateway.ts` | OpenAI-compatible model `poc3-coach`; the only writer |
| Day detail | `/day/YYYY-MM-DD` | `src/web.ts` | one day's sessions and activities |
| Open WebUI | `:3010` (optional) | upstream Open WebUI | full chat thread + native Calendar mirror |
| Garmin sync | `POST /sync` | `src/garmin.ts` | pull recent activities into the calendar |

The bubble is **not** an Open WebUI widget, iframe or API-key embed. It is a same-origin client of `/chat`. Open WebUI is
reached only by the **Full chat ↗** link.

---

## 6. Data model

SQLite tables (created by `src/store.ts`):

| Table | Key fields | Notes |
|---|---|---|
| `messages` | `message_id`, `user_id`, `role`, `text`, `created_at` | conversation history for prompt context |
| `memories` | `memory_id`, `user_id`, `text`, `created_at` | durable facts the coach chose to remember |
| `sessions` | `session_id`, `user_id`, `day`, `payload`, `created_at` | the training plan; `payload` is the full session JSON |
| `activities` | `activity_id`, `user_id`, `day`, `payload`, `created_at` | Garmin activities mapped to calendar days |

Session payload:

```json
{
  "sessionId": "session:<sha256(userId:day:kind:title)[0..32]>",
  "userId": "demo-runner",
  "day": "2026-11-10",
  "title": "輕鬆跑",
  "kind": "easy",
  "distanceKm": 5,
  "durationMin": 35,
  "note": "可以邊跑邊講嘢嘅速度",
  "createdAt": "2026-11-06T01:00:00.000Z"
}
```

The session id is deterministic for an add (`day + kind + title`), so re-planning the same booking replaces it instead of
duplicating. `update` and `remove` target the existing id supplied by the prompt facts.

---

## 7. The coach contract

The model is asked for exactly one JSON object:

```json
{
  "reply": "string",
  "memories": ["string"],
  "sessions": [
    {
      "action": "add" | "update" | "remove",
      "sessionId": "session:… | null",
      "day": "YYYY-MM-DD",
      "title": "string",
      "kind": "easy" | "long" | "interval" | "tempo" | "rest" | "cross" | "race",
      "distanceKm": 0,
      "durationMin": 0,
      "note": "string | null"
    }
  ]
}
```

Rules enforced by `src/coach.ts`:

- `add` and `update` need a day in `[today, today + 56]`; a past day is rejected.
- `update` and `remove` need an existing `sessionId` from the facts.
- At most **14 actions** per turn; titles ≤ 80 chars; notes ≤ 280; distance 0–60 km; duration 0–300 min.
- Unknown keys, wrong types, invalid kinds and malformed days reject the whole turn.
- A rejected turn writes **nothing**; the reply is a deterministic fallback.
- The prompt includes the last 10 turns as "Conversation so far" plus the upcoming schedule with session ids, and asks the
  coach to review the existing plan before editing.

### CRUD, in one turn or many

A single reply may contain a batch of actions across days:

```json
"sessions": [
  { "action": "update", "sessionId": "session:a", "day": "2026-11-11", … },
  { "action": "update", "sessionId": "session:b", "day": "2026-11-13", … },
  { "action": "remove", "sessionId": "session:c" },
  { "action": "add",    "day": "2026-11-20", … }
]
```

The gateway applies the batch in order and then mirrors the **final state** of every affected session. A move-then-delete
therefore cannot leave a stale native event. Native events whose session no longer exists are pruned after the batch.

The response carries `poc3.changes` so the UI can animate:

```json
{
  "poc3": {
    "sessions": 4,
    "memories": 1,
    "calendarEvents": 4,
    "changes": [
      { "action": "update", "fromDay": "2026-11-10", "toDay": "2026-11-11", "title": "輕鬆跑", "kind": "easy" },
      { "action": "remove", "fromDay": "2026-11-17", "toDay": null, "title": "輕鬆跑", "kind": "easy" }
    ]
  }
}
```

---

## 8. Calendar UX and animation

- **Month grid** with Monday-first weeks, today ring, out-of-month dimming, previous/next month.
- **Session chips** carry title + distance; colours by kind (`easy`, `long`, `interval`, `tempo`, `rest`, `cross`, `race`).
- **Garmin badge** `✓ n` on days with activities.
- **Bubble** is a floating panel: messages, typing indicator, input, Send; mobile becomes full height.
- **CRUD animation** (verified in headless Chrome):
  - `update`: the chip leaves the old cell, flies in an arc to the new day, scales up and rotates; the target cell pulses green.
  - `remove`: the chip flies into a bin at the bottom centre, shrinks and fades; the old cell pulses red and the bin pops.
  - `add`: the new chip pops into the target day.
  - Multiple changes leave in a **140 ms stagger**, so a multi-day edit reads as one coordinated action.
  - A full-page warm flash + short shake runs behind the animation. The grid is refreshed **before** the animation, so the
    end state is correct even if the animation is interrupted.

![Calendar CRUD animation — a session chip flying into the bin while the deleted day pulses](design/calendar-crud-animation.png)

---

## 9. Garmin

`src/garmin.ts` calls the Garmin Personal API:

- Token endpoint returns a **bare JWT as `text/plain`**, not JSON; the client handles both.
- Activities: `activitylist-service/activities/search/activities?start=0&limit=N` with `Authorization: Bearer <jwt>`.
- `mapGarminActivity` maps an activity to `{ activityId, day, title, kind, distanceKm, durationMin, source: "garmin" }`.
- `POST /sync` pulls recent activities into SQLite and redirects back to the calendar. Garmin is the completion source; the
  coach is the booking source.

Environment: `GARMIN_PERSONAL_API_KEY`.

---

## 10. Optional Open WebUI native calendar mirror

POC3 can mirror sessions into Open WebUI's own Calendar so the plan also appears in the chat product's sidebar:

- `src/openwebui-calendar.ts` signs in, finds the default calendar, lists events in a generous window, creates or updates
  one all-day event per session, and deletes events whose session no longer exists.
- Events use **nanosecond** `start_at`/`end_at` (local midnight × 1e6) and `meta.poc3_session_id`, `meta.source: "poc3-coach"`.
- POC3 ignores PoC2-era events because the metadata key is namespaced; run POC3 against a separate Open WebUI account/calendar
  if you want strict isolation.
- A mirror failure never loses the booking in SQLite; the chat reply is unaffected.

Environment: `OPENWEBUI_URL`, `OPENWEBUI_EMAIL`, `OPENWEBUI_PASSWORD`, `POC3_TIMEZONE_OFFSET`.

Open WebUI is optional. The calendar page does not read it.

---

## 11. HTTP API

### Gateway (`:8090`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness + model name |
| `GET` | `/v1/models` | OpenAI-compatible model list (`poc3-coach`) |
| `POST` | `/v1/chat/completions` | one coach turn; `stream` supported (single-chunk SSE) |

Headers: `Authorization: Bearer <POC3_TOKENS value>` (optional in the demo), `x-poc3-user: <userId>`.

### Calendar web (`:8091`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/login`, `POST /login` | token login, sets `poc3` cookie |
| `GET` | `/logout` | clears the cookie |
| `GET` | `/calendar?month=YYYY-MM` | month grid |
| `GET` | `/day/YYYY-MM-DD` | day detail |
| `GET` | `/calendar/data?month=YYYY-MM` | JSON used by the in-place refresh |
| `POST` | `/chat` | bubble proxy → gateway; returns `{reply, sessions, changes}` |
| `POST` | `/sync` | Garmin pull |
| `GET` | `/static/app.css` | styles |

---

## 12. Run it

Requirements: Node.js 24+, pnpm 12+ (or npm), a model endpoint that speaks OpenAI chat completions.

```bash
pnpm install
```

Set the minimum environment (PowerShell shown):

```powershell
$env:POC3_TOKENS='{"demo-token":"demo-runner"}'
$env:POC3_DB='sqlite:data/poc3.sqlite'
$env:POC3_MODEL_BASE_URL='http://192.168.1.202:8102/v1'
$env:POC3_MODEL_API_KEY='<model key>'
$env:POC3_MODEL_NAME='dgx/general'
$env:POC3_CALENDAR_URL='http://127.0.0.1:8091/calendar'
$env:POC3_TIMEZONE_OFFSET='+08:00'
$env:GARMIN_PERSONAL_API_KEY='<Garmin personal API key>'
pnpm dev
```

Then:

- Calendar: `http://127.0.0.1:8091/calendar` (token `demo-token` by default)
- Gateway: `http://127.0.0.1:8090/health`
- Optional Open WebUI: set `OPENWEBUI_URL/EMAIL/PASSWORD`, open `http://127.0.0.1:3010`, then add an OpenAI connection
  pointing at `http://<host>:8090/v1` with model `poc3-coach` in Open WebUI's admin settings.

Ports: `POC3_GATEWAY_PORT` (default `8090`), `POC3_WEB_PORT` (default `8091`).

### Environment reference

| Variable | Default | Meaning |
|---|---|---|
| `POC3_GATEWAY_PORT` | `8090` | gateway port |
| `POC3_WEB_PORT` | `8091` | calendar port |
| `POC3_DB` | `sqlite:data/poc3.sqlite` | SQLite spec; directory is created |
| `POC3_USER_ID` | `demo-runner` | fallback user when no `x-poc3-user` |
| `POC3_TOKENS` | `{"demo-token":"demo-runner"}` | token → user JSON |
| `POC3_MODEL_BASE_URL` | `http://192.168.1.202:8102/v1` | OpenAI-compatible endpoint |
| `POC3_MODEL_API_KEY` | empty | model bearer |
| `POC3_MODEL_NAME` | `dgx/general` | model name |
| `POC3_MODEL_ID` | `poc3-coach` | id exposed to Open WebUI |
| `POC3_CALENDAR_URL` | `http://127.0.0.1:8091/calendar` | link appended to replies |
| `POC3_GATEWAY_URL` | `http://127.0.0.1:8090` | web → gateway |
| `POC3_CHAT_URL` | empty | Full chat link (optional; hidden when empty) |
| `POC3_TIMEZONE_OFFSET` | `+08:00` | native calendar all-day offset |
| `GARMIN_PERSONAL_API_KEY` | empty | Garmin Personal API key |
| `OPENWEBUI_URL` | empty | enables the native mirror |
| `OPENWEBUI_EMAIL` | empty | mirror account |
| `OPENWEBUI_PASSWORD` | empty | mirror password |

Never commit real keys or `.env` files.

---

## 13. Testing and gates

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Current state: **51 tests in 6 files** — coach contract/actions/history, gateway streaming + CRUD + batch + mirror,
store CRUD, Garmin mapping/token quirks, calendar web, native mirror create/update/delete/prune.

The lint gate is `tools/lint.mjs`: no `console` in `src` except `index.ts`, no `TODO`, no `any`, no obvious secrets.

---

## 14. Honest limits

1. **The bubble does not reload conversation history** after a page refresh. Messages are in SQLite and feed the coach, but the
   panel starts empty. Open WebUI keeps its own threads.
2. **No streaming in the bubble.** `/chat` waits for the whole reply; the gateway supports streaming for Open WebUI.
3. **One runner.** `POC3_USER_ID` / `x-poc3-user`; there is no multi-tenant mapping or signup.
4. **No manual edit form.** The coach is the only writer by design; the runner can only ask it.
5. **Native calendar is a view.** Open WebUI's UI refreshes on navigation; the calendar page is the live view.
6. **No external calendar sync.** Open WebUI's native calendar does not sync Google/Outlook/CalDAV.
7. **Single-process SQLite.** Fine for a PoC; not a multi-instance production store.
8. **Animation is best-effort.** It is DOM/CSS/Web Animations; reduced-motion users get the grid update without the flourish.

---

## 15. Documents

- [`FEATURES-FOR-REVIEW.md`](FEATURES-FOR-REVIEW.md) — candidate features from PoC1/PoC2/Open WebUI, prioritised for review.
- [`adr/0001-server-validated-coach.md`](adr/0001-server-validated-coach.md)
- [`adr/0002-calendar-first-bubble.md`](adr/0002-calendar-first-bubble.md)
- [`adr/0003-native-calendar-mirror.md`](adr/0003-native-calendar-mirror.md)
- [`design/calendar-crud-animation.png`](design/calendar-crud-animation.png)

POC3 is a proof of concept, not a production plan. The next step is the owner's review of the feature backlog.
