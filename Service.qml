import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import "FocusModel.js" as FocusModel

// Shared focus-timer state. One instance serves every bar surface, so the
// countdown, mode, and session count stay identical on all monitors and across
// bar reloads. The bar widget only renders this and forwards clicks.
Item {
  id: service

  // Injected by omarchy-shell's service loader.
  property var shell: null
  property var manifest: null

  readonly property string stateDir: (Quickshell.env("HOME") || "") + "/.local/state/omarchy/focus"
  readonly property string statePath: stateDir + "/state.json"

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  // ---- Settings ---------------------------------------------------------
  // Defaults mirror manifest.json's barWidget.defaults. The bar widget feeds
  // these from its shell.json entry whenever the user changes them.
  property int deepMinutes: 90
  property int pomodoroMinutes: 25
  property int deepBreakMinutes: 20
  property int shortBreakMinutes: 5
  property bool autoStartBreak: true
  property bool autoStartWork: false
  property bool notifications: true

  // ---- Session ----------------------------------------------------------
  // mode is the work type chosen for the next session; sessionMode is the
  // type the current work block or break belongs to. They differ while a
  // session is running if the user has already picked what comes next.
  property string mode: "deep"          // "deep" | "pomodoro"
  property string sessionMode: "deep"   // "deep" | "pomodoro"
  property string phase: "work"         // "work" | "break"
  property bool running: false
  property double endsAt: 0             // epoch ms; only meaningful while running
  property double remainingMs: 90 * 60000
  property double totalMs: 90 * 60000
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
  readonly property int workMinutes: sessionMode === "deep" ? deepMinutes : pomodoroMinutes
  readonly property int breakMinutes: sessionMode === "deep" ? deepBreakMinutes : shortBreakMinutes
  readonly property bool paused: !running && effectiveRemainingMs < totalMs - 500

  readonly property string phaseLabel: phase === "break"
    ? strings.t("panel.break", "Break")
    : (sessionMode === "deep" ? strings.t("panel.deep", "Deep work") : strings.t("panel.shortWork", "Short work"))
  readonly property string statusLabel: running
    ? strings.t("panel.running", "Running")
    : (paused ? strings.t("panel.paused", "Paused") : strings.t("panel.ready", "Ready"))

  // ---- Configuration ----------------------------------------------------
  function boolValue(value, fallback) {
    if (value === undefined || value === null) return fallback
    if (typeof value === "boolean") return value
    var text = String(value).toLowerCase()
    if (text === "true" || text === "1" || text === "on" || text === "yes") return true
    if (text === "false" || text === "0" || text === "off" || text === "no") return false
    return fallback
  }

  function configure(values) {
    var v = values || {}
    var nextDeep = FocusModel.clampInt(v.deepMinutes, deepMinutes, 15, 180)
    var nextPomodoro = FocusModel.clampInt(v.pomodoroMinutes, pomodoroMinutes, 5, 60)
    var nextDeepBreak = FocusModel.clampInt(v.deepBreakMinutes, deepBreakMinutes, 5, 45)
    var nextShortBreak = FocusModel.clampInt(v.shortBreakMinutes, shortBreakMinutes, 1, 15)
    var nextAutoBreak = boolValue(v.autoStartBreak, autoStartBreak)
    var nextAutoWork = boolValue(v.autoStartWork, autoStartWork)
    var nextNotifications = boolValue(v.notifications, notifications)

    var changed = nextDeep !== deepMinutes
      || nextPomodoro !== pomodoroMinutes
      || nextDeepBreak !== deepBreakMinutes
      || nextShortBreak !== shortBreakMinutes
      || nextAutoBreak !== autoStartBreak
      || nextAutoWork !== autoStartWork
      || nextNotifications !== notifications
    if (!changed) return

    deepMinutes = nextDeep
    pomodoroMinutes = nextPomodoro
    deepBreakMinutes = nextDeepBreak
    shortBreakMinutes = nextShortBreak
    autoStartBreak = nextAutoBreak
    autoStartWork = nextAutoWork
    notifications = nextNotifications

    // A session that has not started yet follows its new length. A running or
    // paused session keeps the length it began with.
    if (stateLoaded && !running && !paused) {
      if (phase === "work") sessionMode = mode
      totalMs = durationFor(phase)
      remainingMs = totalMs
      dirty = true
      saveSoon()
    }
  }

  function durationFor(kind) {
    var minutes = kind === "break" ? breakMinutes : workMinutes
    return Math.max(60000, minutes * 60000)
  }

  // ---- Timer control ----------------------------------------------------
  function start() {
    if (running) return
    ensureToday()

    // Starting a fresh work block adopts the queued mode. Resuming a paused
    // session keeps the mode it was already using.
    if (phase === "work" && !paused) {
      sessionMode = mode
      totalMs = durationFor("work")
      remainingMs = totalMs
    }

    if (totalMs <= 0 || remainingMs <= 0 || remainingMs > totalMs + 1000) {
      totalMs = durationFor(phase)
      remainingMs = totalMs
    }
    if (remainingMs <= 0) return

    var now = Date.now()
    endsAt = now + remainingMs
    nowMs = now
    running = true
    dirty = true
    saveSoon()
  }

  function pause() {
    if (!running) return
    var now = Date.now()
    var left = Math.max(0, endsAt - now)
    nowMs = now
    if (left <= 0) {
      finishPhase()
      return
    }
    remainingMs = left
    running = false
    endsAt = 0
    dirty = true
    saveSoon()
  }

  function toggle() {
    if (running) pause()
    else start()
  }

  function reset() {
    running = false
    endsAt = 0
    nowMs = Date.now()
    if (phase === "work") sessionMode = mode
    totalMs = durationFor(phase)
    remainingMs = totalMs
    dirty = true
    saveSoon()
  }

  function skipBreak() {
    if (phase !== "break") return
    running = false
    endsAt = 0
    nowMs = Date.now()
    phase = "work"
    sessionMode = mode
    totalMs = durationFor("work")
    remainingMs = totalMs
    dirty = true
    saveSoon()
  }

  function selectMode(next) {
    if (next !== "deep" && next !== "pomodoro") return

    // While a session is running, paused, or on a break, a new mode is queued
    // for the next work block instead of throwing the current one away.
    if (next === mode) {
      if (phase === "work" && !running && !paused && sessionMode !== mode) {
        sessionMode = mode
        totalMs = durationFor("work")
        remainingMs = totalMs
        dirty = true
        saveSoon()
      }
      return
    }

    mode = next
    if (phase === "work" && !running && !paused) {
      sessionMode = mode
      totalMs = durationFor("work")
      remainingMs = totalMs
    }
    dirty = true
    saveSoon()
  }

  function tick() {
    nowMs = Date.now()
    if (running && endsAt <= nowMs) finishPhase()
  }

  function finishPhase() {
    if (!running) return

    nowMs = Date.now()
    running = false
    endsAt = 0
    remainingMs = 0

    if (phase === "work") {
      ensureToday()
      sessionsToday += 1
      phase = "break"
      totalMs = durationFor("break")
      remainingMs = totalMs
      notifyWorkDone()
      if (autoStartBreak) start()
    } else {
      phase = "work"
      sessionMode = mode
      totalMs = durationFor("work")
      remainingMs = totalMs
      notifyBreakDone()
      if (autoStartWork) start()
    }

    dirty = true
    saveSoon()
  }

  // A session that ended while the shell was down is completed silently: the
  // user sees the next phase ready rather than a stale notification at login.
  function finishPast() {
    if (phase === "work") {
      ensureToday()
      sessionsToday += 1
      phase = "break"
    } else {
      phase = "work"
      sessionMode = mode
    }
    running = false
    endsAt = 0
    totalMs = durationFor(phase)
    remainingMs = totalMs
    dirty = true
  }

  function ensureToday() {
    var key = FocusModel.dateKey(new Date())
    if (sessionsDate !== key) {
      sessionsDate = key
      sessionsToday = 0
    }
  }

  // ---- Notifications ----------------------------------------------------
  function notifyWorkDone() {
    if (!notifications) return
    var minutes = Commons.I18n.formatNumber(breakMinutes, 0)
    var title = sessionMode === "deep"
      ? strings.t("notify.deepDone", "Deep work complete")
      : strings.t("notify.pomodoroDone", "Pomodoro complete")
    var body = autoStartBreak
      ? strings.t("notify.breakStarted", "A %1 minute break has started. Step away.").arg(minutes)
      : strings.t("notify.breakReady", "A %1 minute break is ready. Start it when you are.").arg(minutes)
    var extraAction = []
    if (!autoStartBreak) {
      extraAction = ["--action", strings.t("notify.startBreak", "Start break"),
                     "omarchy-shell", "jimmerioles.focus", "start"]
    }
    sendNotification(title, body, "\u{f051b}", extraAction)
  }

  function notifyBreakDone() {
    if (!notifications) return
    var body = autoStartWork
      ? strings.t("notify.nextStarted", "The next session has started.")
      : strings.t("notify.ready", "Ready for the next session.")
    var extraAction = []
    if (!autoStartWork) {
      extraAction = ["--action", strings.t("notify.startWork", "Start focus"),
                     "omarchy-shell", "jimmerioles.focus", "start"]
    }
    sendNotification(strings.t("notify.breakDone", "Break complete"), body, "\u{f0176}", extraAction)
  }

  function sendNotification(title, body, glyph, extraAction) {
    var argv = [
      "omarchy-notification-send",
      String(title), String(body),
      "-g", glyph,
      "-u", "normal",
      "--app-name", "Focus",
      "--action", strings.t("notify.open", "Open Focus"),
      "omarchy-shell", "jimmerioles.focus", "open"
    ]
    if (extraAction && extraAction.length > 0) argv = argv.concat(extraAction)
    Util.execArgv(argv)
  }

  // ---- Persistence ------------------------------------------------------
  function resetForLoad() {
    running = false
    endsAt = 0
    nowMs = Date.now()
    phase = "work"
    sessionMode = mode
    totalMs = durationFor("work")
    remainingMs = totalMs
    ensureToday()
  }

  function loadState(raw) {
    if (stateLoaded) return
    stateLoaded = true

    // A user action that landed before the file was read wins.
    if (dirty) {
      saveSoon()
      return
    }

    var parsed = FocusModel.parseState(raw)
    if (!parsed) {
      resetForLoad()
      dirty = true
      saveSoon()
      return
    }

    mode = parsed.mode
    sessionMode = parsed.sessionMode
    phase = parsed.phase
    sessionsToday = parsed.sessionsToday
    sessionsDate = parsed.sessionsDate
    ensureToday()

    var now = Date.now()
    nowMs = now
    var storedTotal = parsed.totalMs > 0 ? parsed.totalMs : durationFor(phase)
    totalMs = Math.max(60000, Math.min(storedTotal, 12 * 60 * 60 * 1000))

    if (parsed.running && parsed.endsAt > now) {
      var left = Math.max(0, parsed.endsAt - now)
      if (left > totalMs) totalMs = Math.min(left, 12 * 60 * 60 * 1000)
      remainingMs = Math.min(left, totalMs)
      endsAt = now + remainingMs
      running = true
    } else if (parsed.running) {
      finishPast()
    } else {
      running = false
      endsAt = 0
      remainingMs = parsed.remainingMs > 0 ? parsed.remainingMs : totalMs
      remainingMs = Math.min(remainingMs, totalMs)

      // Previously idle or ready to begin: adopt the current configured
      // durations, which may have changed since the state was written.
      if (remainingMs >= totalMs - 500) {
        if (phase === "work") sessionMode = mode
        totalMs = durationFor(phase)
        remainingMs = totalMs
      }
      if (remainingMs <= 0) {
        if (phase === "work") sessionMode = mode
        totalMs = durationFor(phase)
        remainingMs = totalMs
      }
    }

    dirty = true
    saveSoon()
  }

  function saveSoon() {
    if (!stateLoaded || !storeReady) return
    dirty = true
    if (!saveTimer.running) saveTimer.start()
  }

  function saveNow() {
    saveTimer.stop()
    if (!stateLoaded || !storeReady) return
    stateFile.setText(JSON.stringify({
      version: 1,
      mode: mode,
      sessionMode: sessionMode,
      phase: phase,
      running: running,
      endsAt: running ? Math.round(endsAt) : 0,
      remainingMs: Math.round(effectiveRemainingMs),
      totalMs: Math.round(totalMs),
      sessionsToday: sessionsToday,
      sessionsDate: sessionsDate
    }))
    dirty = false
  }

  function status() {
    return JSON.stringify({
      mode: mode,
      sessionMode: sessionMode,
      phase: phase,
      running: running,
      paused: paused,
      remainingMs: Math.round(effectiveRemainingMs),
      totalMs: Math.round(totalMs),
      progress: Math.round(progress * 100),
      sessionsToday: sessionsToday,
      label: phaseLabel
    })
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
    id: prepareStore
    command: ["bash", "-c",
      "umask 077\n" +
      "dir=$1\n" +
      "file=$2\n" +
      "mkdir -p -- \"$dir\" && chmod 700 -- \"$dir\" || exit 1\n" +
      "if [[ -L $file ]]; then rm -f -- \"$file\"; fi\n" +
      "if [[ -f $file ]]; then chmod 600 -- \"$file\"; elif [[ ! -e $file ]]; then : >\"$file\"; fi\n",
      "omarchy-focus", service.stateDir, service.statePath]
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

  Component.onDestruction: saveNow()
}
