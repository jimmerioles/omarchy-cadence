# Architecture

Focus is a small Omarchy shell plugin with a deliberately narrow core: a pure
timer model, a QML service that applies the model's effects, a bar widget, and
a panel. The separation keeps every rule testable from Node and keeps QML
changes away from timer logic.

## Repository map

| Path | Role |
| --- | --- |
| `manifest.json` | Plugin contract: id, entry points, settings schema, defaults. |
| `FocusModel.js` | Pure state parsing, configuration, transitions, effects, and status. |
| `Service.qml` | Shared state, timers, disk I/O, notifications, DND commands, IPC status. |
| `BarWidget.qml` | Icon-only bar entry and IPC handlers. |
| `Panel.qml` | Panel UI, keyboard cursor, and per-control actions. |
| `i18n/en.json` | English strings. |
| `test/` | Node tests, QML lint, and headless Quickshell fixtures. |
| `docs/` | User guide, reference, and this architecture note. |

## Runtime flow

```text
BarWidget.qml ── bars/settings ──▶ Service.qml ── pure calls ──▶ FocusModel.js
      │                                │
      │                                ├── state.json (atomic, private)
      │                                ├── omarchy-shell notifications ...
      │                                └── omarchy-notification-send ...
      │
      └── Panel.qml ── controls ──────▶ Service.qml
```

`Service.qml` is a singleton in practice: every bar surface resolves the same
service instance through the shell, so the countdown, mode, and daily count are
identical on every monitor and survive a bar reload. The bar widget only
renders the service and forwards clicks; the panel only edits the service.

## Pure model and effects

`FocusModel.js` never reads the clock, touches QML, runs a command, or reads a
file. Every transition takes a state snapshot, a configuration object, and the
current time, then returns:

```js
{ state: nextState, effects: effects }
```

The service applies the returned state and performs the effects:

| Effect | Meaning |
| --- | --- |
| `dnd: "query"` | Ask Omarchy whether DND is already on before claiming it. |
| `dnd: "on"` | Turn DND on. |
| `dnd: "off"` | Turn DND off. |
| `replayHistory: true` | Ask Omarchy to replay recent notifications after releasing DND. |
| `notify: "workDone" \| "breakDone"` | Send the matching completion notification. |
| `save: true` | Persist the new state. |
| `stopHistoryReplay: true` | Cancel a pending history replay when work resumes. |

This contract is why the timer rules can be tested exhaustively without a
compositor, a running shell, or a clock.

## States and transitions

The model has two phases (`work` and `break`) and a small set of practical
shapes: ready work, running work, paused work, ready break, and running or
paused break.

| From | Action | Result |
| --- | --- | --- |
| Ready work | `start` | Running work in the selected mode. |
| Running work | `pause` | Paused work with the remaining wall-clock time stored. |
| Paused work | `start` | Resumes the same block and remaining time. |
| Running work | `reset` | Ready work in the queued mode; releases owned DND. |
| Any break | `reset` | Ready break restarted from its break length. |
| Any break | `skipBreak` | Ready work in the queued mode. |
| Any | `selectMode` | Applies immediately when ready; otherwise queues the next type. |
| Any | `startMode` | Starts fresh work when idle; queues during running/paused work; gives way to work during a break. |
| Running phase | deadline passes | Moves to the next phase, counts completed work, and emits notification/DND effects. |

`finishPhase` is the live transition. `finishPast` is its quieter sibling for a
deadline that passed while the shell was down: it moves the phase and updates
the count without a stale notification.

## Persistence and restart recovery

State lives in `~/.local/state/omarchy/focus/state.json`. The directory is mode
`700`, the file is mode `600`, and writes are atomic. `Service.qml` prepares the
directory and file through an argv-safe shell command before loading anything.

On load, `resolveLoadedState`:

- validates the version and known values,
- resumes a running block from its stored wall-clock `endsAt`,
- silently completes a phase whose deadline passed while the shell was down,
- keeps a paused block's remaining time,
- adopts changed durations for a ready phase,
- rolls the daily count over at local midnight,
- repairs DND ownership for the loaded phase.

The file is deliberately defensive: a hand-edited or corrupt state can only
produce a valid timer, never an unsafe duration or display value.

## DND ownership

Focus is a guest in Omarchy's global notification state. It only turns DND off
when it was the component that turned it on:

1. Starting or resuming work queries DND when not already owned.
2. If DND is off, Focus turns it on and records ownership.
3. If DND is already on, Focus leaves it alone and records no ownership.
4. When work ends, owned DND is released and history is replayed. User-owned DND
   stays on and no replay is triggered.
5. Ownership is persisted so a restart can reassert or release it correctly.

Focus's own completion notification is sent after DND is restored, so it is not
silenced by the DND that Focus just released. Notification ordering and the
history replay delay live in `Service.qml`; the decision to emit them lives in
the model.

## Safety and failure handling

- **Untrusted state.** Every field from disk is clamped, type-checked, and
  version-gated. Invalid files become a clean ready timer.
- **Private state.** The state directory and file are owner-only, and symlinked
  state files are replaced instead of followed.
- **Argv-safe commands.** Paths are passed to the store-preparation command as
  arguments, never interpolated into shell text.
- **No network.** The plugin has no accounts, telemetry, or remote calls. It
  invokes only local Omarchy commands.
- **Plain text.** Display text uses `Text.PlainText` where the plugin owns the
  sink; translated strings are kept whole with `%1` placeholders.
- **No hard blocking.** Focus never closes or blocks applications. Future guard
  work is expected to nudge, not enforce.

## Testing

| Layer | Command | Covers |
| --- | --- | --- |
| Fast suite | `npm test` | Model transitions, parsing, config, manifest contract, i18n keys, state-store setup, docs accuracy. |
| Manifest validation | `npm run validate` | The exact checks the shell and installer apply. |
| QML lint | `npm run lint:qml` | `qmllint` against installed Omarchy imports. |
| Headless fixtures | `npm run test:qml` | Real `Service.qml`, `BarWidget.qml`, restart recovery, corrupt state, and stub command effects. |

The Node suite is dependency-free and runs on Node 20+. The QML checks need
`quickshell`, `jq`, and an Omarchy checkout at `OMARCHY_PATH`; they run
offscreen and never touch live timer state.

The docs test keeps `docs/reference.md` aligned with the manifest, the model,
the IPC surface, and the state version. When a setting or IPC method changes,
update the reference and let the test confirm the rest.

## Compatibility contract

Focus targets the Omarchy 4.5 shell plugin API (`schemaVersion: 1`) and the
bundled notifications service. The CI workflow pins Omarchy `v4.5.0`. When the
shell contract changes, bump the tested reference deliberately rather than
assuming compatibility.
