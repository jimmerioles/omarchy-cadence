# Contributing

Thanks for helping improve Focus. The timer core is small on purpose; the best
changes are focused, tested, and easy to reason about.

## Before you start

You need:

- Omarchy 4.5+ with Quickshell and the notifications service
- Node 20 or newer
- `jq` and `quickshell` for the QML checks
- An Omarchy checkout at `OMARCHY_PATH` (defaults to `/usr/share/omarchy`)

## Develop against a live shell

Clone the repository, then link it into the Omarchy plugins directory:

```bash
git clone https://github.com/jimmerioles/omarchy-focus.git
cd omarchy-focus

# If the released plugin is already installed, remove it first.
omarchy plugin remove jimmerioles.focus

ln -s "$PWD" ~/.config/omarchy/plugins/jimmerioles.focus
omarchy-shell shell rescanPlugins
omarchy plugin enable jimmerioles.focus
```

The plugin folder itself may be a symlink. Files inside it may not be; the
installer refuses symlinks inside a plugin. Saving a file under the plugin
reloads it automatically. If a change does not apply:

```bash
omarchy-shell shell rescanPlugins
```

When you are done, remove the development link:

```bash
omarchy plugin remove jimmerioles.focus
```

The test fixtures make their own isolated `HOME` and never touch your live
timer state.

## Run the checks

```bash
npm test
npm run validate
npm run lint:qml
npm run test:qml
```

What each one does:

- `npm test` — Node tests for the timer model, manifest contract, translation
  keys, private state-store setup, and documentation accuracy.
- `npm run validate` — the same manifest checks the shell and installer use.
- `npm run lint:qml` — `qmllint` against the installed Omarchy imports.
- `npm run test:qml` — headless Quickshell fixtures for the real service, bar
  widget, restart recovery, and corrupt-state paths.

On a non-Omarchy machine, the QML commands print a skip and exit successfully
unless `REQUIRE_QMLLINT=1` or `REQUIRE_QML=1` is set.

## Manual smoke test

Before opening a pull request that changes behavior, check on the target
desktop:

- left click opens the panel; `Escape` closes it
- start, pause, resume, reset, and skip break behave as documented
- the session-type row locks while a focus block is running
- choosing a type while paused queues it; Reset applies it
- DND turns on for work and off at the break; user-owned DND stays on
- completion notification actions open the panel and start a ready phase
- restarting the shell mid-session resumes the same countdown
- disabling and re-enabling the plugin leaves the shell clean

## Code conventions

- Keep timer rules in `FocusModel.js` as pure functions. Do not read the clock,
  QML objects, environment, or files there.
- Keep side effects in `Service.qml`: timers, disk I/O, notifications, DND
  commands, and IPC.
- Return effects from the model instead of running commands from it.
- Use the existing translation catalog for user-facing text. Keep strings whole
  with `%1` placeholders; use `Text.PlainText` where the plugin owns the text
  sink.
- Use Omarchy theme tokens (`Style`, `Commons.Color`) instead of hard-coded
  colors, spacing, or font sizes.
- Keep the manifest schema, `FocusModel.defaultConfig()`, and
  `FocusModel.configLimits()` in sync. The tests check all three.
- Prefer a small diff with a test over a broad refactor with none.

## Changing settings or IPC

When adding or changing a setting:

1. Update `manifest.json` (schema and defaults).
2. Update `FocusModel.js` (defaults, limits, config resolution).
3. Update `Service.qml` if the value needs new behavior.
4. Update `docs/reference.md` and any README summary.
5. Run `npm test`; the docs test checks the reference table against the code.

When adding or changing an IPC method:

1. Add the handler to `Commons.ShellIpc` in `BarWidget.qml`.
2. Add it to the IPC table in `docs/reference.md`.
3. Run `npm test`; the docs test checks the table against the handlers.

## Adding a language

Focus ships English only today, but the UI is ready for more catalogs:

1. Copy `i18n/en.json` to the Omarchy language code, for example `da.json` or
   `pt-BR.json`.
2. Translate the values, not the keys. Keep `%1` placeholders in place and keep
   plural entries as objects with the forms the language needs.
3. Check the locale code against
   `$OMARCHY_PATH/default/i18n/locales.json`.
4. Run `npm test` and switch Omarchy's language to confirm the panel updates
   live.

Keep brand names, units, and key names unchanged. Leave logs and diagnostics in
English.

## Documentation

The docs are part of the product:

- `README.md` is the front door: install, use, configure, troubleshoot.
- `docs/usage.md` is the day-to-day manual and edge-case guide.
- `docs/reference.md` is the exact settings, IPC, and state reference.
- `docs/architecture.md` explains the internal design for contributors.
- `ROADMAP.md` is directional and should not promise dates.

If behavior changes, update the relevant doc in the same pull request. The docs
test validates relative links, settings/defaults/ranges, IPC methods, the
`status` sample, the state path, and the roadmap's current release.

## Release checklist

1. Bump the same version in `manifest.json` and `package.json`.
2. Update `ROADMAP.md` so the current release matches the manifest and the next
   release is accurate.
3. Update the README, reference, or usage guide for any behavior change.
4. Recapture `assets/focus-demo.gif` if the panel or bar changed visibly.
5. Run the full checklist:

   ```bash
   npm test
   npm run validate
   npm run lint:qml
   npm run test:qml
   ```

6. Commit, tag `vX.Y.Z`, and push. If the plugin is listed on the Omarchy
   marketplace, update the listing after the tag is live.

## Reporting bugs

Open an issue with:

- Omarchy version (`pacman -Q omarchy`)
- the output of `omarchy-shell jimmerioles.focus status`
- whether the problem survives `omarchy restart shell`
- reproduction steps

Do not include notification contents or window titles; they are not needed to
diagnose the timer.
