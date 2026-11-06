import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import "FocusModel.js" as FocusModel

// Shared Cadence session state. One instance serves every bar surface, so the
// countdown, mode, and session count stay identical on all monitors and across
// bar reloads. The bar widget only renders this and forwards clicks.
//
// The session rules live in FocusModel.js. This file owns the QML properties,
// timers, disk I/O, notifications, and the side effects those rules return.
Item {
  id: service

  // Injected by omarchy-shell's service loader.
  property var shell: null
  property var manifest: null

  readonly property string stateDir: (Quickshell.env("HOME") || "") + "/.local/state/omarchy/cadence"
  readonly property string statePath: stateDir + "/state.json"

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  // ---- Settings ---------------------------------------------------------
  // Defaults come from FocusModel so the manifest contract test can compare
  // both against the schema instead of keeping a third copy in QML.
  property int deepMinutes: FocusModel.defaultConfig().deepMinutes
  property int shortMinutes: FocusModel.defaultConfig().shortMinutes
  property int deepBreakMinutes: FocusModel.defaultConfig().deepBreakMinutes
  property int shortBreakMinutes: FocusModel.defaultConfig().shortBreakMinutes
  property bool autoStartBreak: FocusModel.defaultConfig().autoStartBreak
  property bool autoStartWork: FocusModel.defaultConfig().autoStartWork
  property bool notifications: FocusModel.defaultConfig().notifications

  // ---- Session ----------------------------------------------------------
  // mode is the session type chosen for the next session; sessionMode is the
  // type the current work block or break belongs to. They differ while a
  // session is running if the user has already picked what comes next.
  property string mode: "deep"          // "deep" | "short"
  property string sessionMode: "deep"   // "deep" | "short"
  property string phase: "work"         // "work" | "break"
  property bool running: false
  property bool paused: false
  property bool dndOwned: false
  property double endsAt: 0             // epoch ms; only meaningful while running
  property double remainingMs: FocusModel.defaultConfig().deepMinutes * 60000
  property double totalMs: FocusModel.defaultConfig().deepMinutes * 60000
  property double nowMs: Date.now()
  property int sessionsToday: 0
  property string sessionsDate: ""
  property bool stateLoaded: false
  property bool storeReady: false
  property bool dirty: false

  readonly property double effectiveRemainingMs: running
    ? Math.max(0, endsAt - nowMs)
    : Math.max(0, remainingMs)
  readonly property real progress: totalMs > 0
    ? Util.clamp(1 - effectiveRemainingMs / totalMs, 0, 1)
    : 0
  readonly property int workMinutes: sessionMode === "deep" ? deepMinutes : shortMinutes
  readonly property int breakMinutes: sessionMode === "deep" ? deepBreakMinutes : shortBreakMinutes

  readonly property string phaseLabel: phase === "break"
    ? strings.t("panel.break", "Break")
    : (sessionMode === "deep" ? strings.t("panel.deep", "Deep Focus") : strings.t("panel.short", "Short Focus"))
  readonly property string statusLabel: running
    ? strings.t("panel.running", "Running")
    : (paused ? strings.t("panel.paused", "Paused") : strings.t("panel.ready", "Ready"))

  // ---- State projection -------------------------------------------------
  function configSnapshot() {
    return {
      deepMinutes: deepMinutes,
      shortMinutes: shortMinutes,
      deepBreakMinutes: deepBreakMinutes,
      shortBreakMinutes: shortBreakMinutes,
      autoStartBreak: autoStartBreak,
      autoStartWork: autoStartWork,
      notifications: notifications
    }
  }

  function stateSnapshot() {
    return {
      mode: mode,
      sessionMode: sessionMode,
      phase: phase,
      running: running,
      paused: paused,
      dndOwned: dndOwned,
      endsAt: endsAt,
      remainingMs: remainingMs,
      totalMs: totalMs,
      sessionsToday: sessionsToday,
      sessionsDate: sessionsDate
    }
  }

  // Apply a pure transition and run the effects it asked for.
  function applyResult(result, now) {
    if (!result || !result.state) return

    var next = result.state
    var effects = result.effects || {}

    mode = next.mode
    sessionMode = next.sessionMode
    phase = next.phase
    running = next.running
    paused = next.paused
    dndOwned = next.dndOwned
    endsAt = next.endsAt
    remainingMs = next.remainingMs
    totalMs = next.totalMs
    sessionsToday = next.sessionsToday
    sessionsDate = next.sessionsDate
    if (now !== undefined) nowMs = now

    if (effects.stopHistoryReplay) historyReplayTimer.stop()

    if (effects.dnd === "query") {
      refreshSessionDnd()
    } else if (effects.dnd === "on") {
      Util.execArgv(["omarchy-shell", "notifications", "setDnd", "true"])
    } else if (effects.dnd === "off") {
      Util.execArgv(["omarchy-shell", "notifications", "setDnd", "false"])
      if (effects.replayHistory) historyReplayTimer.restart()
    }

    if (effects.notify === "workDone") notifyWorkDone()
    else if (effects.notify === "breakDone") notifyBreakDone()

    if (effects.save) {
      dirty = true
      saveSoon()
    }
  }

  // ---- Configuration ----------------------------------------------------
  function configure(values) {
    var resolved = FocusModel.resolveConfig(configSnapshot(), values)
    if (!resolved.changed) return

    var next = resolved.config
    deepMinutes = next.deepMinutes
    shortMinutes = next.shortMinutes
    deepBreakMinutes = next.deepBreakMinutes
    shortBreakMinutes = next.shortBreakMinutes
    autoStartBreak = next.autoStartBreak
    autoStartWork = next.autoStartWork
    notifications = next.notifications

    // A session that has not started yet follows its new length. A running or
    // paused session keeps the length it began with.
    if (stateLoaded && !running && !paused) {
      applyResult(FocusModel.applyConfigToState(stateSnapshot(), next), Date.now())
    }
  }

  // ---- Timer control ----------------------------------------------------
  function start() {
    var now = Date.now()
    applyResult(FocusModel.start(stateSnapshot(), configSnapshot(), now), now)
  }

  function pause() {
    var now = Date.now()
    applyResult(FocusModel.pause(stateSnapshot(), configSnapshot(), now), now)
  }

  function toggle() {
    if (running) pause()
    else start()
  }

  function reset() {
    var now = Date.now()
    applyResult(FocusModel.reset(stateSnapshot(), configSnapshot()), now)
  }

  function skipBreak() {
    var now = Date.now()
    applyResult(FocusModel.skipBreak(stateSnapshot(), configSnapshot()), now)
  }

  function selectMode(next) {
    var now = Date.now()
    applyResult(FocusModel.selectMode(stateSnapshot(), configSnapshot(), next), now)
  }

  // Start a fresh work block in the given mode. If a work session is already
  // running or paused, queue the mode instead so a shortcut cannot destroy
  // progress. A break gives way to the requested work block.
  function startMode(value) {
    var now = Date.now()
    applyResult(FocusModel.startMode(stateSnapshot(), configSnapshot(), value, now), now)
  }

  function tick() {
    var now = Date.now()
    nowMs = now
    var result = FocusModel.tick(stateSnapshot(), configSnapshot(), now)
    if (result.effects.save) applyResult(result, now)
  }

  // Kept for the panel tests and for a caller that wants to end a session
  // explicitly; the ticker normally reaches this through tick().
  function finishPhase() {
    var now = Date.now()
    applyResult(FocusModel.finishPhase(stateSnapshot(), configSnapshot(), now), now)
  }

  // ---- Do Not Disturb ---------------------------------------------------
  // Cadence only turns DND off again when it was the one that turned it on.
  // A DND the user set themselves is left alone.
  function refreshSessionDnd() {
    if (phase !== "work" || !running) return
    if (dndOwned) {
      Util.execArgv(["omarchy-shell", "notifications", "setDnd", "true"])
      return
    }
    if (!dndQuery.running) dndQuery.running = true
  }

  function applyDndQuery(raw) {
    var now = Date.now()
    applyResult(FocusModel.applyDndQuery(stateSnapshot(), raw), now)
  }

  // ---- Notifications ----------------------------------------------------
  function completionTime() {
    var locale = Qt.locale(Commons.I18n.formatLocale)
    return new Date().toLocaleString(locale, locale.timeFormat(Locale.ShortFormat))
  }

  function notifyWorkDone() {
    if (!notifications) return
    var minutes = Commons.I18n.formatNumber(breakMinutes, 0)
    var title = (sessionMode === "deep"
      ? strings.t("notify.deepDone", "Deep Focus complete · %1")
      : strings.t("notify.shortDone", "Short Focus complete · %1")).arg(completionTime())
    var body = autoStartBreak
      ? strings.t("notify.breakStarted", "A %1 minute break has started. Step away.").arg(minutes)
      : strings.t("notify.breakReady", "A %1 minute break is ready. Start it when you are.").arg(minutes)
    var extraAction = []
    if (!autoStartBreak) {
      extraAction = ["--action", strings.t("notify.startBreak", "Start break"),
                     "omarchy-shell", "jimmerioles.cadence", "start"]
    }
    sendNotification(title, body, "\u{f0430}", extraAction)
  }

  function notifyBreakDone() {
    if (!notifications) return
    var body = autoStartWork
      ? strings.t("notify.nextStarted", "The next session has started.")
      : strings.t("notify.ready", "Ready for the next session.")
    var extraAction = []
    if (!autoStartWork) {
      extraAction = ["--action", strings.t("notify.startWork", "Start focus"),
                     "omarchy-shell", "jimmerioles.cadence", "start"]
    }
    sendNotification(strings.t("notify.breakDone", "Break complete · %1").arg(completionTime()),
                     body, "\u{f117c}", extraAction)
  }

  function sendNotification(title, body, glyph, extraAction) {
    var argv = [
      "omarchy-notification-send",
      String(title), String(body),
      "-g", glyph,
      "-u", "normal",
      "--app-name", "Cadence",
      "--action", strings.t("notify.open", "Open Cadence"),
      "omarchy-shell", "jimmerioles.cadence", "open"
    ]
    if (extraAction && extraAction.length > 0) argv = argv.concat(extraAction)
    Util.execArgv(argv)
  }

  // ---- Persistence ------------------------------------------------------
  function loadState(raw) {
    if (stateLoaded) return
    stateLoaded = true

    // A user action that landed before the file was read wins.
    if (dirty) {
      saveSoon()
      return
    }

    var now = Date.now()
    applyResult(FocusModel.resolveLoadedState(FocusModel.parseState(raw), configSnapshot(), now), now)
  }

  function saveSoon() {
    if (!stateLoaded || !storeReady) return
    dirty = true
    if (!saveTimer.running) saveTimer.start()
  }

  function saveNow() {
    saveTimer.stop()
    if (!stateLoaded || !storeReady) return
    stateFile.setText(JSON.stringify(FocusModel.serializeState(stateSnapshot(), Date.now())))
    dirty = false
  }

  function status() {
    return JSON.stringify(FocusModel.statusSnapshot(stateSnapshot(), Date.now(), phaseLabel))
  }

  Timer {
    id: ticker
    interval: 250
    repeat: true
    running: service.running
    onTriggered: service.tick()
  }

  Timer {
    id: saveTimer
    interval: 200
    onTriggered: service.saveNow()
  }

  Process {
    id: dndQuery
    running: false
    command: ["omarchy-shell", "notifications", "isDnd"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: service.applyDndQuery(text)
    }
  }

  Timer {
    id: historyReplayTimer
    interval: 800
    onTriggered: Util.execArgv(["omarchy-shell", "notifications", "showHistory"])
  }

  Process {
    id: prepareStore
    command: FocusModel.prepareStoreCommand(service.stateDir, service.statePath)
    running: true
    onExited: function(code) { service.storeReady = code === 0 }
  }

  FileView {
    id: stateFile
    path: service.storeReady ? service.statePath : ""
    atomicWrites: true
    printErrors: false
    blockLoading: true
    onLoaded: { if (path !== "") service.loadState(text()) }
    onLoadFailed: { if (path !== "") service.loadState("") }
  }

  onStoreReadyChanged: {
    if (storeReady && stateLoaded && dirty) saveSoon()
  }

  Component.onDestruction: {
    if (dndOwned) Util.execArgv(["omarchy-shell", "notifications", "setDnd", "false"])
    saveNow()
  }
}
