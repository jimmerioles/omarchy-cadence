# Cadence Roadmap

Cadence is a focused workday system for the Omarchy bar. It brings four small
tools into one rhythm:

- **Focus** — a timer that protects deep work.
- **Attention** — DND and notification control that keeps the world quiet.
- **Plan** — timeboxing that gives the day a shape.
- **Decide** — an Eisenhower matrix that chooses what matters.

The loop is **decide → plan → focus → rest**. Attention protects the focus
block; the break is the rest. The bar is the glance; the panel is the
workspace. Everything is local, private, and keyboard-first.

This file is directional, not a promise of dates. It describes the product
wedges, what is shipped, what comes next, and what Cadence deliberately will
not become.

- Current release: `1.0.0` — Focus + Attention core
- Next release: `1.1.0 — Finish Attention`
- Next major: `2.0.0 — Plan`
- Then: `3.0.0 — Decide`

## The product thesis

Most productivity tools add another place to manage. Cadence connects the
workday you already have. Focus without attention protection is just a
countdown; attention protection without a plan is just silence; planning
without decisions is a calendar full of the wrong things; decisions without
focus are intentions that never ship. Cadence connects the four.

### Why these four

- **Focus** creates the container. Attention is the scarce resource; a timer
  turns "I should work on this" into a bounded block.
- **Attention** protects the container. Notifications are the default
  interruption; DND and a gentle guard keep the world quiet without blocking it.
- **Plan** gives the container a place. A block without a time and an intention
  is a wish; timeboxing makes the day visible.
- **Decide** chooses what deserves the container. A calendar full of the wrong
  work is still failure; the Eisenhower matrix separates what matters from what
  merely feels urgent.

## Product wedges

A wedge is a complete, useful slice of the product—not a feature list. Each
wedge should be excellent on its own before the next one begins.

### Wedge 1 — Focus + Attention (shipped)

The first wedge proves the core loop: start a block, protect it, take a real
break, and come back.

Shipped in `v1.0.0`:

- Deep Focus (Ultradian 90/20) and Short Focus (Pomodoro 25/5) sessions.
- Automatic breaks, pause/resume/reset, skip break.
- DND while a work block is active, including pauses.
- Restores only the DND Cadence enabled itself; user-owned DND is left alone.
- Notification replay at the break.
- Persisted timer state, restart recovery, one service across monitors.
- Daily completed-session count.
- IPC control, keyboard navigation, translation-ready strings, and theme-aware UI.

Why this wedge first:

- It is the lowest-friction entry point: one click, immediate value.
- It creates the core data model for sessions, attention, and goals.
- It proves the reliability promises—restart recovery, monitor sync, local-only.
- It earns the right to add planning and decisions.

### Wedge 1.1 — Finish Attention (next)

The first wedge is not finished until attention protection is complete.

- **Session goal.** One optional line: "What is this block for?" Shown in the
  panel, bar tooltip, nudge card, and completion notification.
- **Gentle guard.** While a work block runs, detect the focused window through
  `ToplevelManager.activeToplevel`.
  - Active only while a work block runs. Never during a pause or break.
  - 60-second grace after starting.
  - Nudge after roughly 8 seconds in a distracting window.
  - One nudge per drift; no repeated nagging.
  - Conservative default app denylist: Slack, Discord, Telegram, WhatsApp,
    Signal, Steam.
  - Browser-title keywords: YouTube, X/Twitter, Reddit, Instagram, Facebook,
    TikTok, Netflix, Twitch. Only matched for known browser app IDs.
  - Non-modal card anchored to the Cadence bar icon. No focus stealing.
  - Auto-dismiss after roughly 15 seconds.
  - Suppressed while the main Cadence panel or park capture is open.
- **Parking lot.** Capture a distracting thought in one line, then return to
  work. Review it at the break.
- **Notification digest.** Replace the unfiltered six-card replay with a
  focus-session digest: group held notifications by app and show what waited.
- **Time integrity.** A two-minute wrap-up warning, auto-pause on idle or lock,
  and a clean recovery when the shell or machine sleeps.
- **Hooks.** Emit `omarchy hook focus-start`, `focus-break-start`,
  `focus-break-end`, and `focus-end`, each with session JSON (mode, phase,
  duration, goal). This is the supported integration point for external site
  blockers, music, status updates, and time trackers.
- **Settings.** Guard on/off, app list, title keywords, delay, grace, and
  parking-lot behavior. A small guard toggle in the panel.

Out of scope for 1.1:

- Strict allowlists or full-screen blocking.
- Built-in website, DNS, or hosts blocking.
- Full session history, weekly statistics, streaks, or daily targets.
- A full settings UI.

### Wedge 2 — Plan (v2.0.0)

Timeboxing makes the day visible and gives each focus block an intention.

- **Day timeline.** A compact view of today's timeboxes: start, duration,
  intention, session type, and status.
- **Timebox editing.** Add, edit, move, resize, mark done, and roll over—fully
  keyboard-driven, with mouse support.
- **Start from a timebox.** One action starts a Deep or Short Focus block with
  the timebox's intention and length. The timer and the timebox stay in sync.
- **Day shape.** A bar indicator for the current and next timebox; the panel
  shows the whole day.
- **Rollover.** Unfinished blocks move to tomorrow with a clear prompt, not a
  guilt trip.
- **Shared model.** Timeboxes use the same local workday state as focus
  sessions; no second task database.

Out of scope for 2.0:

- Two-way calendar sync, recurring events, and team scheduling.
- A full task manager with projects, dependencies, and assignees.
- Automatic scheduling or AI planning.

### Wedge 3 — Decide (v3.0.0)

The Eisenhower matrix turns a task list into a decision about what deserves a
block.

- **Task inbox.** Capture tasks locally with a title and an optional note.
- **Four quadrants.** Do first (important + urgent), Schedule (important + not
  urgent), Batch or share (not important + urgent), and Eliminate (not
  important + not urgent). For a single-user tool, "Delegate" may become
  "Batch" or "Share."
- **Turn a decision into action.** Send a task to a timebox (Plan) or start a
  focus block (Focus) directly from its quadrant.
- **Review.** A short daily or weekly pass to clear the inbox, move stale
  tasks, and drop what no longer matters.
- **Keyboard-first.** Capture, classify, schedule, and focus without a mouse.

Out of scope for 3.0:

- Project management, subtasks, dependencies, and team assignment.
- Due-date complexity and recurring tasks.
- Gamification, streaks, and scores.

### Later — review and integrate

- **Session log.** A local JSONL record of timebox, goal, planned and actual
  duration, outcome, drift count, and parked count.
- **Daily and weekly review.** A quiet view of what got done, what moved, and
  what to drop.
- **More hooks and integrations.** External blockers, music, status updates,
  and time trackers through the existing hook surface.
- **Bar and settings polish.** Optional countdown or progress ring, richer
  tooltip, and a full settings view using Omarchy's controls.

## Design principles

- **One workday model, four views.** Focus sessions, timeboxes, tasks, and
  decisions will share one local state; they are not four separate apps.
- **Calm by default.** No badges, streaks, shame, or notification spam. The
  anti-distraction tool must not become a distraction.
- **Local-first and private.** No accounts, telemetry, or network calls. Window
  titles and notification contents stay in memory and are never persisted.
- **Keyboard-first, mouse-friendly.** Every control works without a mouse.
- **Integrate, don't replace.** Use Omarchy's DND, notifications, theme, and
  keybindings. Cadence is a guest in the shell.
- **Ship one wedge completely.** A new pillar starts only when the previous
  wedge is excellent on its own.
- **Gentle guard, not enforcement.** Nudge, don't block. The user stays in
  control.
- **The bar is a glance; the panel is the workspace.** Keep the bar quiet and
  the panel focused.

## What success looks like

- You can start a focus block in under five seconds.
- DND is automatic and correct; you never toggle it by hand.
- You can see the shape of your day and start the next block from it.
- You can decide what matters in under a minute.
- You end the day knowing what got done and what moved.
- Nothing leaves your machine.
- The tool never becomes another inbox.

## Backlog

| Area | Layer | Status | Notes |
| --- | --- | --- | --- |
| Session goal | Attention | **Next** | One line per block, carried into the guard and notifications. |
| Gentle guard | Attention | **Next** | Drift detection, one nudge per drift, conservative matching. |
| Parking lot | Attention | **Next** | Capture open loops; review at the break. |
| Notification digest | Attention | **Next** | Replace the unfiltered six-card replay. |
| Time integrity | Attention | **Next** | Wrap-up warning, auto-pause on idle/lock. |
| Hooks | Attention | **Next** | `focus-start`, `focus-break-start`, `focus-break-end`, `focus-end`. |
| Timeboxing | Plan | Next major | Day timeline, intentions, start from a block, rollover. |
| Eisenhower matrix | Decide | Later major | Task inbox, quadrants, turn into a timebox or focus block. |
| Session log | Review | Later | Local JSONL with goal, duration, outcome, drift, parked. |
| Daily and weekly review | Review | Later | What got done, what moved, what to drop. |
| Bar and settings polish | Cross-cutting | Later | Countdown/ring, richer tooltip, full settings view. |

## Not planned

- A full task manager with projects, subtasks, dependencies, tags, and kanban.
- A calendar replacement or two-way calendar sync.
- Team collaboration, shared workspaces, or assignees.
- Cloud accounts, sync, telemetry, or network calls.
- AI auto-scheduling or an assistant.
- Gamification: streaks, badges, points, or shame mechanics.
- Hard app blocking, DNS/hosts blocking, or site blockers by default.
- A mobile or web app.
- Rich analytics dashboards; only lightweight review that serves the workday.

## Release history

- `v1.0.0` (2026-11-06) — first tagged release: Focus + Attention core. Deep
  Focus and Short Focus sessions, DND ownership, notification replay, persisted
  state, keyboard navigation, and the public roadmap.
