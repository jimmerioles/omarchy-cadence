# Cadence reference

Exact commands, settings, IPC, and state for Cadence.

## Compatibility

| Component | Tested |
| --- | --- |
| Omarchy | 4.5.0 (Quattro) |
| Quickshell | 0.3.2 |
| Omarchy plugin manifest | `schemaVersion: 1` |
| Node for the test suite | 20 or newer |

Cadence requires Omarchy 4.5+ with the bundled Quickshell notifications service.
The plugin CI targets Omarchy `v4.5.0`. Newer releases are not assumed
compatible until they are tested.

## Commands

### Install, update, remove

```bash
omarchy plugin add https://github.com/jimmerioles/omarchy-cadence.git --enable
omarchy plugin update jimmerioles.cadence
omarchy plugin remove jimmerioles.cadence
```

Releases are tagged `vX.Y.Z`; [v1.0.0](https://github.com/jimmerioles/omarchy-cadence/releases/tag/v1.0.0)
is the first. The installer and `omarchy plugin update` follow the default
branch (`master`), not tags.

`omarchy plugin add --enable` validates the manifest, clones the repository into
`~/.config/omarchy/plugins/jimmerioles.cadence`, and, when run interactively, asks
where to place the widget. The manifest default is `centerEnd`, the right edge
of the center group.

### Placement

```bash
omarchy bar move jimmerioles.cadence --section centerEnd
omarchy bar move jimmerioles.cadence --section right
omarchy bar move jimmerioles.cadence --section centerEnd --after omarchy.system-update
```

Valid sections are `left`, `centerBegin`, `center`, `centerEnd`, `tray`, and
`right`. `center` is the box in the middle of the bar; use `centerBegin` or
`centerEnd` to sit beside the clock without moving it off center.

### Keybinding

Add to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + O", "Cadence timer", { panel = "jimmerioles.cadence" })
```

To replace the stock **Toggle full screen desktop** binding:

```lua
o.rebind("SUPER + CTRL + ALT + F", "Cadence timer", { panel = "jimmerioles.cadence" })
```

Apply and validate:

```bash
hyprctl reload
hyprctl configerrors
```

## Settings

Settings are stored on the widget's entry in
`~/.config/omarchy/shell.json`. The timer panel has no settings view; use
`omarchy bar set` or edit `shell.json` directly.

| Setting | Default | Range | What it does |
| --- | --- | --- | --- |
| `deepMinutes` | `90` | 15–180, step 5 | Length of a Deep Focus block. |
| `shortMinutes` | `25` | 5–60, step 5 | Length of a Short Focus block. |
| `deepBreakMinutes` | `20` | 5–45, step 5 | Break after a Deep Focus block. |
| `shortBreakMinutes` | `5` | 1–15, step 1 | Break after a Short Focus block. |
| `autoStartBreak` | `true` | boolean | Start the break when a focus block ends. |
| `autoStartWork` | `false` | boolean | Start the next focus block when a break ends. |
| `notifications` | `true` | boolean | Send completion notifications. DND and history replay are separate. |

Examples:

```bash
omarchy bar set jimmerioles.cadence deepMinutes 90
omarchy bar set jimmerioles.cadence shortMinutes 25
omarchy bar set jimmerioles.cadence deepBreakMinutes 20
omarchy bar set jimmerioles.cadence shortBreakMinutes 5
omarchy bar set jimmerioles.cadence autoStartBreak true
omarchy bar set jimmerioles.cadence autoStartWork false
omarchy bar set jimmerioles.cadence notifications true
```

Read one value:

```bash
omarchy bar get jimmerioles.cadence deepMinutes
```

Changing a duration while a focus block is running or paused leaves that block
alone. A ready phase picks up the new length immediately; otherwise the new
length applies to the next phase.

## IPC

Cadence exposes its controls through the `jimmerioles.cadence` IPC target.

| Method | Arguments | What it does |
| --- | --- | --- |
| `status` | none | Return the current state as JSON. |
| `start` | none | Start or resume the current focus block or break. |
| `pause` | none | Pause a running block. |
| `toggleTimer` | none | Start when stopped; pause when running. |
| `reset` | none | Reset the current block or break. |
| `skipBreak` | none | End a break and return to a ready focus block. |
| `setMode` | `deep` or `short` | Select the next session type. Returns the selected mode. |
| `startMode` | `deep` or `short` | Start a fresh focus block in that mode. Queues while a work block is running or paused; gives way to work during a break. |
| `open` | none | Open the panel. |
| `show` | none | Alias for `open`. |
| `close` | none | Close the panel. |
| `hide` | none | Alias for `close`. |
| `toggle` | none | Toggle the panel. This is not a timer toggle. |

Examples:

```bash
omarchy-shell jimmerioles.cadence status
omarchy-shell jimmerioles.cadence start
omarchy-shell jimmerioles.cadence pause
omarchy-shell jimmerioles.cadence toggleTimer
omarchy-shell jimmerioles.cadence reset
omarchy-shell jimmerioles.cadence skipBreak
omarchy-shell jimmerioles.cadence setMode deep
omarchy-shell jimmerioles.cadence startMode short
omarchy-shell jimmerioles.cadence open
omarchy-shell jimmerioles.cadence close
```

### `status` response

`status` returns one JSON object:

| Field | Type | Meaning |
| --- | --- | --- |
| `mode` | `"deep"` or `"short"` | Session type selected for the next focus block. |
| `sessionMode` | `"deep"` or `"short"` | Session type of the current focus block or break. |
| `phase` | `"work"` or `"break"` | Current phase. |
| `running` | boolean | Whether the countdown is running. |
| `paused` | boolean | Whether the current phase is paused. |
| `remainingMs` | integer | Remaining milliseconds. |
| `totalMs` | integer | Total milliseconds for the current phase. |
| `progress` | integer | Progress from `0` to `100`. |
| `sessionsToday` | integer | Completed focus blocks today. |
| `label` | string | Localized phase label. |

Example:

```json
{
  "mode": "deep",
  "sessionMode": "deep",
  "phase": "work",
  "running": false,
  "paused": false,
  "remainingMs": 5400000,
  "totalMs": 5400000,
  "progress": 0,
  "sessionsToday": 0,
  "label": "Deep Focus"
}
```

## State file

Cadence keeps its timer state at:

```text
~/.local/state/omarchy/cadence/state.json
```

The directory is created with mode `700`; the state file is written with mode
`600` and atomically replaced. The file is versioned (`version: 2`) and parsed
defensively. A missing, truncated, or invalid file produces a clean ready timer
rather than a bad duration or negative countdown.

The state includes the selected and current session type, phase, run and pause
state, wall-clock deadline, remaining and total milliseconds, DND ownership, and
today's date and count.

If Cadence owned DND when the shell stopped, that ownership is persisted so a
restart can reassert DND during a running or paused focus block, or release it
if the phase is no longer active.

### Reset the state

```bash
omarchy plugin disable jimmerioles.cadence
rm ~/.local/state/omarchy/cadence/state.json
omarchy plugin enable jimmerioles.cadence
```

## Data and privacy

Cadence is local-only. It has no accounts, telemetry, or network calls.

It reads and writes:

- settings on its entry in `~/.config/omarchy/shell.json`
- timer state in `~/.local/state/omarchy/cadence/state.json`

It runs these Omarchy commands:

- `omarchy-shell notifications isDnd`
- `omarchy-shell notifications setDnd true|false`
- `omarchy-shell notifications showHistory`
- `omarchy-notification-send`

No notification contents or window titles are stored in the state file.

## Related docs

- [Using Cadence](usage.md) — day-to-day behavior, DND, keyboard, troubleshooting.
- [Architecture](architecture.md) — internals, state machine, testing.
- [Contributing](../CONTRIBUTING.md) — setup, tests, release checklist.
