# Using Focus

Focus is a bar timer for two working rhythms. Deep Focus follows the Ultradian
90/20 pattern; Short Focus follows Pomodoro 25/5. Both lengths are configurable,
so the rhythm can fit your work instead of the other way around.

## Concepts

- **Focus block** — one work interval. Completing a focus block counts toward
  today's session count.
- **Break** — the recovery interval after a focus block. Breaks do not count as
  sessions.
- **Session type** — Deep Focus or Short Focus. The type decides both the focus
  block and its break length.
- **Method** — the rhythm behind a session type: Ultradian for Deep Focus,
  Pomodoro for Short Focus.
- **Mode** — the machine value for a session type: `deep` or `short`. Settings
  and IPC use modes.
- **Queued mode** — the session type selected for the next focus block while
  another block or break is still active.

## A focus cycle

1. Choose Deep Focus or Short Focus.
2. Start the focus block.
3. When the block ends, Focus moves to the matching break. The break can start
   automatically or wait for you.
4. When the break ends, Focus returns to a ready focus block. It can start
   automatically or wait for you.

The panel header names the current phase. While a block or break is active, the
right side of the session-type header shows what comes next: the break length
and next session type during work, or just the next session type during a
break.

## Start, pause, and resume

- **Start** begins the selected focus block or a ready break.
- **Pause** stops a running block and keeps its remaining time.
- **Resume** continues a paused block from the same remaining time.

A paused focus block keeps its original length. Changing a duration setting
while a block is running or paused does not change that block; the new length
applies to the next phase.

## Choose what comes next

The session-type buttons always choose the type for the next focus block. What
happens immediately depends on the current phase:

| Current phase | Choosing a session type | Reset |
| --- | --- | --- |
| Ready focus block | Applies immediately and updates the countdown. | Restarts the ready block in the queued type. |
| Running focus block | Queues the type; the current block is locked. | Stops the block and applies the queued type. |
| Paused focus block | Queues the type; the paused block is kept. | Stops the paused block and applies the queued type. |
| Running or paused break | Queues the type; the break is kept. | Restarts the break. |
| Ready break | Queues the type; the ready break is kept. | Restarts the ready break. |

Use **Skip break** to end a break early and return to a ready focus block in the
queued type. Skip break only appears during a break.

Resetting a focus block also releases DND that Focus owns. Reset during a break
only restarts the break and does not change DND.

## Auto-start behavior

`autoStartBreak` controls what happens when a focus block ends.
`autoStartWork` controls what happens when a break ends.

| `autoStartBreak` | `autoStartWork` | Focus block ends | Break ends |
| --- | --- | --- | --- |
| `true` | `false` | Break starts. | Next focus block is ready. |
| `true` | `true` | Break starts. | Next focus block starts. |
| `false` | `false` | Break is ready. | Next focus block is ready. |
| `false` | `true` | Break is ready. | Next focus block starts when that break finishes. |

With `autoStartBreak` off, `autoStartWork` has no effect until you start the
ready break yourself.

## Bar states

| State | Icon | Hover |
| --- | --- | --- |
| Idle or paused focus | Dimmed target | Phase, remaining time, and state. |
| Focus block running | Full target | Phase, remaining time, and state. |
| Break ready or running | Stretching figure; dimmed when the break is not running | Phase, remaining time, and state. |

- **Left click** opens or closes the panel.
- **Right click** starts or pauses.
- **Middle click** resets the current block.

## Keyboard

Add a binding to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + O", "Focus timer", { panel = "jimmerioles.focus" })
```

`SUPER + ALT + O` is free in stock Omarchy. To use `SUPER + CTRL + ALT + F`
instead, replace the stock **Toggle full screen desktop** binding:

```lua
o.rebind("SUPER + CTRL + ALT + F", "Focus timer", { panel = "jimmerioles.focus" })
```

Hyprland reloads Lua bindings on save. To apply and validate manually:

```bash
hyprctl reload
hyprctl configerrors
```

Once the panel is open:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move between the session-type and transport rows. |
| `←` / `→` or `h` / `l` | Move between buttons in the current row. |
| `Enter` / `Space` | Activate the focused button. |
| `Tab` / `Shift + Tab` | Switch to another bar panel. |
| `Escape` | Close the panel. |

## Notifications and DND

Focus uses Omarchy's global Do Not Disturb and notification history; it does not
run its own notification daemon.

### While focusing

- When a focus block starts or resumes and DND is **off**, Focus turns it on and
  remembers that it owns it.
- If DND was **already on**, Focus leaves it on but does not claim ownership.
- DND stays on while a focus block is paused.
- Focus never changes DND during a break.

### When the focus block ends

- If Focus owns DND, it turns DND off and asks Omarchy to replay recent
  notifications.
- If you own DND, Focus leaves it on and does not trigger a replay.
- Focus sends its completion notification after restoring DND. If your own DND
  is still on, that completion card stays quiet until you turn DND off.

The replay is Omarchy's shell-wide history: the latest six cards. It is not a
focus-only list, so it may include older or unrelated notifications. Replaying
again shows the same cards again.

### Completion notifications

Completion notifications can open the panel. When a break is ready but not
started, the work-complete notification also offers **Start break**. When the
next focus block is ready but not started, the break-complete notification
offers **Start focus**.

The `notifications` setting controls these completion cards only. Turning it off
does not disable DND or history replay.

Focus completion cards include their local send time, so separate runs remain
distinguishable when history is replayed.

## Daily count

Completing a focus block increments **Today** in the panel. The count rolls
over at local midnight as the timer next updates and is stored with the timer
state.

Breaks do not increment the count. Resetting or skipping a block does not count
it as complete.

## Reloads, restarts, and sleep

The timer is a shared shell service, not a per-monitor widget. Every monitor
shows the same countdown, and reloading the bar does not create a second timer.

A running block stores its wall-clock end time. After a shell restart, Focus
resumes from that deadline instead of starting over.

If a block ends while the shell is down, Focus completes it silently when the
shell next loads: the session count is updated, DND is released, and the next
phase is ready without a stale notification at login.

If the computer sleeps during a block, the timer catches up when the shell runs
again. The next tick finishes the phase, so the completion notification may
arrive when you wake rather than at the original deadline.

## Troubleshooting

### The widget is missing

```bash
omarchy plugin list
omarchy plugin enable jimmerioles.focus
```

If the plugin is enabled but not on the bar:

```bash
omarchy bar move jimmerioles.focus --section centerEnd
```

### The panel shortcut does nothing

Check the binding in `~/.config/hypr/bindings.lua`, then run:

```bash
hyprctl reload
hyprctl configerrors
```

### The panel says “Focus service is still loading”

The shared service has not finished loading. Wait a moment after shell startup.
If it persists:

```bash
omarchy restart shell
```

### Notifications are quiet

- Check `notifications` is `true`:
  `omarchy bar get jimmerioles.focus notifications`
- Check whether Do Not Disturb is still on. Focus only clears DND it enabled.
- If you turned DND on yourself, turn it off with the Omarchy notification
  controls or `omarchy-shell notifications setDnd false`.

### DND is still on after a block

That is expected when you enabled DND yourself. Focus only turns off DND it
claimed. Turn it off with the Omarchy notification controls.

### The timer needs a clean slate

Disable the plugin, remove the state file, then enable it again:

```bash
omarchy plugin disable jimmerioles.focus
rm ~/.local/state/omarchy/focus/state.json
omarchy plugin enable jimmerioles.focus
```

The state directory is private to your user. A corrupt or truncated state file
is ignored automatically; you do not need to edit it by hand.

### The plugin will not install or update

```bash
omarchy plugin validate ~/.config/omarchy/plugins/jimmerioles.focus
omarchy plugin update jimmerioles.focus
```

If an update cannot fast-forward because of local changes, remove and reinstall
the plugin. Only do that after checking you do not have local edits you want to
keep.

### Reporting a bug

Open an issue at
[github.com/jimmerioles/omarchy-focus/issues](https://github.com/jimmerioles/omarchy-focus/issues)
with:

- your Omarchy version (`pacman -Q omarchy`)
- the output of `omarchy-shell jimmerioles.focus status`
- whether the problem happens after a shell restart
- the steps that reproduce it

Do not paste notification contents or window titles into an issue. They are not
needed to diagnose the timer.
