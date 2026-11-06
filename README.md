# Focus

A Pomodoro and ultradian focus timer for the [Omarchy](https://omarchy.org/) bar.

![Focus panel](assets/focus-panel.png)

Two session types, each with its own recovery break:

- **Ultradian** — 90 minutes of deep focus, followed by a 20 minute break.
- **Pomodoro** — 25 minutes of short focus, followed by a 5 minute break.

The session buttons choose the method; the panel hero and action button use the focus type, so the context stays visible when the button changes from Start to Pause.

The timer lives in a shared Omarchy shell service, so every monitor shows the same countdown and a bar reload does not lose the session. A running session also survives a shell restart: the end time is stored on disk and the timer resumes from that wall-clock deadline.

## Features

- The session length stays visible in the bar in every state, so starting or pausing does not shift neighboring widgets.
- Panel with session type, progress, start/pause, and reset.
- Choosing a session type while a timer is running queues it for the next focus block without interrupting the current one.
- Skip a break from the panel to start the next focus block early.
- Automatic breaks (configurable) and desktop notifications when a phase ends.
- Notifications can open the panel, and start a ready break or focus block.
- Completed sessions counted for the day.
- Keyboard controls in the panel: `Space` start/pause, `R` reset, `1` Ultradian, `2` Pomodoro, `Escape` close.
- Localized strings and theme-aware colors, borders, and spacing.

## Install

```bash
omarchy plugin add https://github.com/jimmerioles/omarchy-focus.git --enable
```

Omarchy will validate the manifest and enable the widget. If it lands somewhere other than you like, move it:

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

While a session is running, picking a session type queues it for the next focus block; the current timer keeps its original length and break. Reset applies the queued type immediately.

During a break the secondary button becomes **Skip break**, and `R` skips the break and returns to a ready focus block.

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
omarchy-shell jimmerioles.focus open
omarchy-shell jimmerioles.focus close
```

`status` returns JSON with the current mode, phase, remaining milliseconds, progress, and today's completed session count.

Notifications can be clicked to open the panel. When a break or work block is ready rather than auto-started, the notification also offers a button to start it.

## Settings

Settings are stored on the widget's entry in `~/.config/omarchy/shell.json`:

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
| `deepMinutes` | `90` | Length of a deep focus block. |
| `pomodoroMinutes` | `25` | Length of a short focus block. |
| `deepBreakMinutes` | `20` | Break after deep focus. |
| `shortBreakMinutes` | `5` | Break after short focus. |
| `autoStartBreak` | `true` | Start the break when work ends. |
| `autoStartWork` | `false` | Start the next work block when a break ends. |
| `notifications` | `true` | Send a desktop notification when a phase ends. |

Changing a duration while a session is running does not alter that session; the new length applies to the next one.

## State

The timer state is kept in:

```text
~/.local/state/omarchy/focus/state.json
```

The directory is private to the user and the file is written atomically. A session that ends while the shell is down is completed silently, so the next phase is ready without a stale notification at login.

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
