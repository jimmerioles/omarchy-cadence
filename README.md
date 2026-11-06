# Focus

A Pomodoro and ultradian focus timer for the [Omarchy](https://omarchy.org/) bar.

![Focus panel](assets/focus-panel.png)

Two session types, each with its own recovery break:

- **Ultradian** — 90 minutes of Deep Focus, followed by a 20 minute break.
- **Pomodoro** — 25 minutes of Short Focus, followed by a 5 minute break.

The session buttons choose the focus type; their tooltips name the underlying method. The panel hero and action button keep the focus type visible when the button changes from Start to Pause.

The timer lives in a shared Omarchy shell service, so every monitor shows the same countdown and a bar reload does not lose the session. A running session also survives a shell restart: the end time is stored on disk and the timer resumes from that wall-clock deadline.

## Features

- Icon-only bar widget: a dimmed target when idle or paused, a full target while focusing, and a stretching figure during breaks; hover it for the remaining time and state.
- Panel with session type, progress, start/pause, and reset.
- The session type is locked while a work block is running, so a stray click cannot change the current session.
- Session buttons show their configured lengths (`Deep Focus · 90 min`, `Short Focus · 25 min`), so both options stay comparable while queueing the next block. Tooltips name the Ultradian and Pomodoro methods, explain what each is best for, and give concrete examples; they appear on both hover and keyboard focus.
- While a session is active, the session-type header shows the upcoming sequence on its right: the break and next focus type during work, or just the next focus type during a break.
- Skip a break from the panel to return to a ready focus block early.
- Automatic breaks (configurable) and desktop notifications when a phase ends.
- Silences desktop notifications while a work block is active, then restores DND and replays Omarchy's notification history when the break begins.
- Leaves a Do Not Disturb setting you enabled yourself untouched.
- Notifications can open the panel, and start a ready break or focus block.
- Completed sessions counted for the day.
- Keyboard navigation in the panel: arrow keys or `j`/`k` move between rows, `h`/`l` move between buttons, `Enter`/`Space` activate, and `Escape` closes.
- Localized strings and theme-aware colors, borders, and spacing.

## Requirements

An Omarchy install with the Quickshell shell and its notifications service.

## Install

```bash
omarchy plugin add https://github.com/jimmerioles/omarchy-focus.git --enable
```

Omarchy will validate the manifest and enable the widget. The widget installs into the middle section; to put it at the right edge of that section:

```bash
omarchy bar move jimmerioles.focus --section centerEnd --after omarchy.system-update
```

Plugins run as unsandboxed code inside the shell process. Only install plugins whose source you trust; this repository is small enough to read first.

Update the plugin later with:

```bash
omarchy plugin update jimmerioles.focus
```

## Usage

- **Left click** the bar widget: open the timer panel.
- **Right click**: start or pause.
- **Middle click**: reset the current session.

While a work block is running, the session type is locked. Pause the block or wait for the break to choose the next focus type. During a break, the buttons choose what comes next without changing the break.

While a work block is paused, **Reset** applies the queued focus type immediately. During a break, **Reset** restarts the break instead.

During a break the secondary button becomes **Skip break**; select it and press `Enter` or `Space` to return to a ready focus block.

The panel also exposes its controls over IPC:

```bash
omarchy-shell jimmerioles.focus status
omarchy-shell jimmerioles.focus start
omarchy-shell jimmerioles.focus pause
omarchy-shell jimmerioles.focus toggleTimer
omarchy-shell jimmerioles.focus reset
omarchy-shell jimmerioles.focus skipBreak
omarchy-shell jimmerioles.focus setMode deep
omarchy-shell jimmerioles.focus setMode pomodoro
omarchy-shell jimmerioles.focus startMode deep
omarchy-shell jimmerioles.focus startMode pomodoro
omarchy-shell jimmerioles.focus open
omarchy-shell jimmerioles.focus close
```

`status` returns JSON with the selected and current mode, phase, paused/running state, remaining milliseconds, progress, and today's completed session count.

### Notifications and DND

While a work block is active—including pauses—Focus enables Omarchy's Do Not Disturb. When the work block ends, Focus restores the previous DND state if it was the one that enabled DND. A DND you set yourself is left on, and Focus does not replay history in that case.

At the break, Focus invokes Omarchy's existing notification-history replay. It shows the shell's recent history (the latest six cards), not a focus-only list, so it can include older or unrelated notifications. Invoking history again replays the same cards again.

Focus completion notifications include their local send time, so separate runs remain distinguishable when history is replayed.

Focus's own completion notifications are sent after DND is restored. If you want a strict focus-only review, the native replay is not filtered; a dedicated digest or list would be needed.

## Keybindings

One shortcut opens the panel. This key is free in stock Omarchy:

```lua
o.bind("SUPER + ALT + O", "Focus timer", { panel = "jimmerioles.focus" })
```

If you prefer `SUPER + CTRL + ALT + F`, use `o.rebind` instead. It replaces the stock **Toggle full screen desktop** binding:

```lua
o.rebind("SUPER + CTRL + ALT + F", "Focus timer", { panel = "jimmerioles.focus" })
```

The panel uses the same shell toggle path as the first-party panels, so it opens on the focused monitor. Once open, everything is keyboard navigation:

- `↑` / `↓` or `j` / `k` move between the session-type row and the transport row.
- `←` / `→` or `h` / `l` move between the two buttons in the current row.
- `Enter` or `Space` activates the focused button.
- `Tab` / `Shift + Tab` switch to another bar panel.
- `Escape` closes the panel.

## Settings

Settings are stored on the widget's entry in `~/.config/omarchy/shell.json`. They are currently configured with the CLI; the timer panel does not have a settings view.

```bash
omarchy bar set jimmerioles.focus deepMinutes 90
omarchy bar set jimmerioles.focus pomodoroMinutes 25
omarchy bar set jimmerioles.focus deepBreakMinutes 20
omarchy bar set jimmerioles.focus shortBreakMinutes 5
omarchy bar set jimmerioles.focus autoStartBreak true
omarchy bar set jimmerioles.focus autoStartWork false
omarchy bar set jimmerioles.focus notifications true
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `deepMinutes` | `90` | Length of a Deep Focus block. |
| `pomodoroMinutes` | `25` | Length of a Short Focus block. |
| `deepBreakMinutes` | `20` | Break after Deep Focus. |
| `shortBreakMinutes` | `5` | Break after Short Focus. |
| `autoStartBreak` | `true` | Start the break when work ends. |
| `autoStartWork` | `false` | Start the next work block when a break ends. |
| `notifications` | `true` | Send Focus completion notifications. DND behavior is separate. |

Changing a duration while a session is running does not alter that session; the new length applies to the next one.

## State

The timer state is kept in:

```text
~/.local/state/omarchy/focus/state.json
```

The directory is private to the user and the file is written atomically. A session that ends while the shell is down is completed silently, so the next phase is ready without a stale notification at login. DND ownership is persisted so a shell restart cannot strand DND on.

## Uninstall

```bash
omarchy plugin remove jimmerioles.focus
```

## Development

The plugin is a standard Omarchy shell plugin: `manifest.json` at the repository root, with a `bar-widget` entry point and a `service` entry point.

Validate a checkout before installing it:

```bash
omarchy plugin validate .
```

## License

MIT. See [LICENSE](LICENSE).
