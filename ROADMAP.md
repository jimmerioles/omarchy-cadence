# Focus Roadmap

Focus is a Deep Focus (Ultradian) and Short Focus (Pomodoro) timer for the
Omarchy bar. It silences notifications while a work block is active and is
growing into a gentle anti-distraction companion that helps you notice when you
leave the task and return to it.

This file is the public direction for the plugin: what we intend to build, in
what order, and what we deliberately will not build. It is directional, not a
promise of dates.

- Current release: `2.0.0` (shipped)
- Next release: `2.1.0 — Focus Guard`

## Design principles

- **Gentle by default.** Nudge, don't punish. No hard blocking unless the user
  explicitly configures an external tool.
- **Real-time before analytics.** Help the user return to the task now; history,
  scores, and streaks come later.
- **Quiet UI.** The anti-distraction tool must not become another source of
  notifications, badges, or anxiety.
- **Local only.** No accounts, telemetry, or network calls in the plugin.
- **Private by default.** Window titles and notification contents stay in
  memory. Persist only app IDs, durations, and user-entered notes in the
  existing private state directory.
- **Small core.** The timer and DND behavior stay stable. External integrations
  belong in hooks or companion tools.
- **Keyboard-first.** Every new control works without a mouse.

## Shipped

### 2.0.0 — Focus timer

- Deep Focus (ultradian) and Short Focus (Pomodoro) sessions.
- Automatic breaks, pause/resume/reset, skip break.
- DND while a work block is active, including pauses.
- Restores only the DND state Focus enabled itself.
- Notification replay at the break.
- Persisted timer state and restart recovery.
- Daily completed-session count.
- IPC control, keyboard navigation, translation-ready strings, and theme-aware UI.

## Next

### 2.1.0 — Focus Guard

The goal is to close the gap between "the timer is running" and "I am actually
working on the goal." Gentle nudges only; no enforcement.

#### In scope

- **Session goal.** One optional line in the panel: "What is this block for?"
  Shown in the panel, bar tooltip, nudge card, and completion notification.

- **Gentle guard.** While a work block is running, detect the focused window
  through `ToplevelManager.activeToplevel`.
  - Active only while a work block is running. Never during a pause or break.
  - 60-second grace after starting.
  - Nudge after roughly 8 seconds in a distracting window.
  - One nudge per drift; no repeated nagging.
  - Conservative default app denylist: Slack, Discord, Telegram, WhatsApp,
    Signal, Steam.
  - Browser-title keywords: YouTube, X/Twitter, Reddit, Instagram, Facebook,
    TikTok, Netflix, Twitch. Only matched for known browser app IDs.
  - Non-modal card anchored to the Focus bar icon. No focus stealing.
  - Auto-dismiss after roughly 15 seconds.
  - Suppressed while the main Focus panel or park capture is open.
  - Proposed default: on with the conservative denylist, subject to final
    review. The panel toggle can turn it off.

- **Nudge actions.**
  - **Back to work:** reactivate the last allowed window. If it no longer
    exists, dismiss.
  - **Park it:** capture the distraction in a one-line input, then return to
    work.
  - **Ignore until break:** suppress that app for the rest of the work block.

- **Parking lot.** A local list of thoughts captured during focus.
  - Quick-capture keybind plus the guard's Park it action.
  - Saved locally in the Focus state directory.
  - Panel shows a live count: `Guard: on · 2 drifts · 3 parked`.

- **Hooks.** Emit:
  - `omarchy hook focus-start`
  - `omarchy hook focus-break-start`
  - `omarchy hook focus-break-end`
  - `omarchy hook focus-end`

  Each receives session JSON with mode, phase, duration, and goal. This is the
  supported integration point for external site blockers, music, status
  updates, and time trackers.

- **Settings.** Manifest/CLI settings for guard on/off, app list, title
  keywords, delay, and grace. A small guard toggle in the panel.

#### Out of scope for 2.1

- Strict allowlist or full-screen blocking.
- Built-in website, DNS, or hosts blocking.
- Break digest.
- Session history, weekly statistics, streaks, or daily targets.
- Auto-pause on idle or lock.
- Bar countdown or progress ring.
- Full settings UI.

#### Release criteria

- `GuardModel.js` pure rules with Node tests: app matching, browser gating,
  grace, delay, one-nudge-per-drift, and ignore-until-break.
- QML fixture covers the nudge card and park flow.
- No regressions in timer, DND ownership, persistence, or IPC.
- `omarchy plugin validate .` passes.
- README, settings, keybindings, hooks, privacy notes, and i18n updated.

#### Technical notes

- Do not add an `overlay` kind for the nudge. A loader kind changes how the
  shell routes `summon` and would stop the plugin behaving as a bar-widget
  panel. Render the nudge as a `PopupCard` inside `BarWidget.qml`; use a small
  `KeyboardPanel` for park capture.
- Keep timer rules in `FocusModel.js`. Put guard matching and timing in a new
  `GuardModel.js`; keep side effects in `Service.qml`.
- Persist only additive, defensively parsed state fields.
- Do not persist window titles.
- Do not route the nudge through the notification system: DND would silence it.
- Keep the existing DND ownership logic untouched.

## Backlog

The eight improvement areas from the design pass, kept here so they do not get
lost. **Next** is committed to 2.1; **Later** is valuable but not scheduled;
**Not planned** is a deliberate non-goal.

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Session goal | **Next** | One line per block. Daily targets deferred. |
| 2 | Focus Guard | **Next** | Gentle nudge, app and browser-title matching. |
| 3 | Break digest | Later | Filter notification history by session; replace unfiltered replay. |
| 4 | Parking lot | **Next** | Capture open loops; review at break. |
| 5 | Time integrity | Later | Wrap-up warning, extend in flow, auto-pause on idle/lock. |
| 6 | Review loop | Later | Session log, daily/weekly stats, optional daily target and streaks. |
| 7 | Start/end hooks | **Next** | External blockers and integrations. |
| 8 | Bar and settings polish | Later | Optional countdown/ring, richer tooltip, full settings view. |

### Later / Exploring

- **Break digest.** Read
  `~/.local/state/omarchy/notifications/history.json`, filter to the work
  block, group by app, and show a held-notification summary. This fixes the
  current unfiltered six-card replay.
- **Time integrity.** Two-minute wrap-up warning, extend-in-flow, break-end
  warning, auto-pause after idle or lock, optional idle inhibitor.
- **Review loop.** Local JSONL session log with goal, planned and actual
  duration, outcome, drift count, and parked count. Today and week views,
  optional daily target and streaks.
- **Bar and settings polish.** Optional bar countdown or progress ring, richer
  tooltip, full settings view using the existing Omarchy UI controls.
- **Strict mode.** Optional allowlist and deliberate override for users who
  want more friction. Never the default.

## Not planned

- Built-in website, DNS, or `/etc/hosts` blocking.
- Per-app notification allowlists. Omarchy's DND is global; this needs an
  upstream change to the notifications service.
- Hard app blocking or auto-closing apps by default.
- Network accounts, telemetry, or cloud sync.
- Shaming language, red failure badges, or mandatory streaks.
