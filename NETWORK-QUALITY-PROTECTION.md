# Network Quality Protection

Additive feature — no existing feature, endpoint, or security check was
changed or removed. All changes are frontend-only.

## What it does

**Before a quiz starts** (`QuizInstructions.jsx`)
- Runs a short connection-stability check (3 pings to the existing
  `/api/health` endpoint) in the background while the student reads the
  instructions.
- "Start Quiz" stays disabled until the check reports a stable connection,
  in addition to the existing slide/countdown gates. A status pill shows
  Checking / Connection stable / Connection unstable, with a manual
  "Retry connection check" option.

**During the quiz** (`QuizRunner.jsx`)
- A live connection monitor (browser online/offline events + a periodic
  health-ping heartbeat, so it also catches "Wi-Fi connected but the server
  is unreachable") detects when the connection drops.
- On drop:
  - The visible timers (overall quiz timer + per-question timer) **pause**
    — they stop ticking down instead of counting through time the student
    can't act on.
  - A full-screen **"Connection Lost – Reconnecting…"** overlay appears,
    blocking interaction with the quiz (same pattern already used for the
    "exit fullscreen" overlay).
  - Any answer that fails to save due to the network error is queued
    locally (in memory + `localStorage`) instead of being silently lost.
    A continuous local backup of all current answers is also kept as a
    safety net.
- On reconnect (confirmed by a real ping, not just the browser's `online`
  event):
  - The overlay closes and the timers resume.
  - Queued answers are automatically retried and saved.
  - Remaining time / per-question deadlines / violation count are
    re-synced from the server using the same idempotent `start` endpoint
    the page already calls on load.
  - The student's current question is **never changed** by any of this —
    it simply never moved while disconnected, so the quiz resumes exactly
    where it left off.

## What was intentionally left unchanged

- All proctoring / security logic (tab-switch detection, fullscreen
  enforcement, devtools/screenshot detection, violation reporting and
  auto-submit thresholds) — untouched, byte-for-byte.
- The server remains the sole authority on both the overall quiz deadline
  and every per-question deadline. Nothing in this feature can grant extra
  accepted time — pausing only affects what's *displayed* on the student's
  screen. Answers/questions are still rejected server-side once the real
  deadline has passed, exactly as before.
- No backend code, routes, or database schema were touched.

## Files changed / added

- `frontend/src/hooks/useNetworkQuality.js` — **new**. Pre-quiz stability
  check + live connection monitor.
- `frontend/src/components/QuizInstructions.jsx` — pre-quiz network gate
  added to the existing Start Quiz conditions.
- `frontend/src/components/Timer.jsx` — added an optional `paused` prop
  (defaults to `false`, fully backward compatible) and a resync-from-prop
  effect.
- `frontend/src/pages/student/QuizRunner.jsx` — wires the live monitor in,
  pauses both timers, shows the reconnect overlay, and adds the local
  answer queue + reconnect resync.

## Verification performed

- `npm run build` — succeeds, zero errors.
- `npx oxlint src` — 0 errors across the whole frontend (only pre-existing
  style warnings that already existed in untouched files such as
  `useProctoring.js`, in the same categories).
- `node --check` on every backend source file — all pass (backend was not
  modified, verified unchanged and still syntactically valid).
