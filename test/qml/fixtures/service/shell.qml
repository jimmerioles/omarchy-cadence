import QtQuick
import Quickshell
import Quickshell.Io

// Drives the real Service.qml through a complete focus/break cycle. The
// harness runs Quickshell on the offscreen platform, so this needs no
// compositor; the runner supplies a scratch HOME and stubs the Omarchy
// commands the service spawns.
ShellRoot {
  id: root

  readonly property string pluginDir: Quickshell.env("FOCUS_PLUGIN_DIR") || ""
  readonly property string resultPath: Quickshell.env("FOCUS_TEST_RESULT") || ""
  readonly property string commandLogPath: Quickshell.env("FOCUS_TEST_COMMAND_LOG") || ""
  readonly property string notificationLogPath: Quickshell.env("FOCUS_TEST_NOTIFICATION_LOG") || ""

  property var service: null
  property var failures: []
  property int step: 0
  property double stepStarted: Date.now()
  property bool done: false

  Item { id: host }

  FileView {
    id: commandLog
    path: root.commandLogPath
    watchChanges: true
    printErrors: false
    blockLoading: true
  }

  FileView {
    id: notificationLog
    path: root.notificationLogPath
    watchChanges: true
    printErrors: false
    blockLoading: true
  }

  function fail(message) {
    root.failures.push(String(message))
  }

  function check(condition, message) {
    if (!condition) root.fail(message)
  }

  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'"
  }

  function finish() {
    if (root.done) return
    root.done = true
    var payload = JSON.stringify({ ok: root.failures.length === 0, failures: root.failures })
    Quickshell.execDetached(["bash", "-c",
      "printf '%s' " + root.shellQuote(payload) + " > " + root.shellQuote(root.resultPath)])
  }

  function next(value) {
    root.step = value
    root.stepStarted = Date.now()
  }

  function waitFor(condition, timeout, message) {
    if (condition) return true
    if (Date.now() - root.stepStarted > timeout) {
      root.fail(message)
      root.finish()
    }
    return false
  }

  function fileContains(view, needle) {
    view.reload()
    return String(view.text()).indexOf(needle) >= 0
  }

  function createService() {
    var component = Qt.createComponent("file://" + encodeURI(root.pluginDir) + "/Service.qml", Component.PreferSynchronous)
    if (component.status !== Component.Ready) {
      root.fail("Service.qml failed to load: " + component.errorString())
      root.finish()
      return
    }
    root.service = component.createObject(host)
    if (!root.service) {
      root.fail("Service.qml failed to instantiate: " + component.errorString())
      root.finish()
    }
  }

  function advance() {
    if (root.done) return
    if (root.failures.length > 0) {
      root.finish()
      return
    }

    if (root.step === 0) {
      root.createService()
      root.next(1)
      return
    }

    if (root.step === 1) {
      if (!root.waitFor(root.service !== null && root.service.stateLoaded && root.service.storeReady, 8000, "service did not load its state")) return
      root.check(root.service.mode === "deep", "starts in deep mode")
      root.check(root.service.sessionMode === "deep", "starts in a deep session")
      root.check(root.service.phase === "work", "starts in the work phase")
      root.check(!root.service.running, "starts stopped")
      root.check(root.service.totalMs === 90 * 60000, "starts at ninety minutes")

      root.service.configure({
        deepMinutes: 45,
        pomodoroMinutes: 30,
        deepBreakMinutes: 10,
        shortBreakMinutes: 3,
        autoStartBreak: false,
        autoStartWork: false,
        notifications: true
      })
      root.check(root.service.deepMinutes === 45, "configure applies deep minutes")
      root.check(root.service.totalMs === 45 * 60000, "configure reshapes the ready session")
      root.check(root.service.remainingMs === 45 * 60000, "configure resets the ready countdown")
      root.next(2)
      return
    }

    if (root.step === 2) {
      root.service.start()
      root.next(3)
      return
    }

    if (root.step === 3) {
      if (!root.waitFor(root.service.running && root.service.dndOwned, 8000, "work session did not start or claim DND")) return
      root.check(root.service.phase === "work", "work session stays in the work phase")
      root.check(root.service.sessionMode === "deep", "work session keeps the deep type")
      root.check(root.service.totalMs === 45 * 60000, "work session uses the configured length")
      root.check(root.service.endsAt > Date.now(), "work session has a future deadline")
      root.service.pause()
      root.next(4)
      return
    }

    if (root.step === 4) {
      if (!root.waitFor(root.service.paused, 3000, "pause did not take effect")) return
      root.check(!root.service.running, "paused session is not running")
      root.check(root.service.remainingMs > 0 && root.service.remainingMs < 45 * 60000, "pause stores the remaining time")
      root.service.start()
      root.next(5)
      return
    }

    if (root.step === 5) {
      if (!root.waitFor(root.service.running && !root.service.paused, 3000, "resume did not restart the session")) return
      root.check(root.service.totalMs === 45 * 60000, "resume keeps the original session length")
      root.service.endsAt = Date.now() - 1
      root.service.tick()
      root.next(6)
      return
    }

    if (root.step === 6) {
      if (!root.waitFor(root.service.phase === "break" && !root.service.running, 3000, "work block did not finish into a break")) return
      root.check(root.service.sessionsToday === 1, "completed work block is counted once")
      root.check(root.service.totalMs === 10 * 60000, "break uses the configured deep break")
      root.check(!root.service.dndOwned, "Focus releases the DND it owned")
      if (!root.waitFor(root.fileContains(commandLog, "notifications showHistory"), 5000, "notification history was not replayed")) return
      if (!root.waitFor(root.fileContains(notificationLog, "Deep Focus complete"), 5000, "work completion notification did not arrive")) return
      root.service.skipBreak()
      root.next(7)
      return
    }

    if (root.step === 7) {
      root.check(root.service.phase === "work", "skip break returns to work")
      root.check(!root.service.running, "skip break leaves the next work block ready")
      root.check(root.service.sessionMode === "deep", "skip break keeps the queued mode")
      root.check(root.service.totalMs === 45 * 60000, "skip break restores the work length")
      root.service.selectMode("pomodoro")
      root.next(8)
      return
    }

    if (root.step === 8) {
      root.check(root.service.mode === "pomodoro", "mode selection updates the queued mode")
      root.check(root.service.sessionMode === "pomodoro", "idle mode selection updates the ready session")
      root.check(root.service.totalMs === 30 * 60000, "idle mode selection uses the pomodoro length")
      root.service.startMode("deep")
      root.next(9)
      return
    }

    if (root.step === 9) {
      if (!root.waitFor(root.service.running && root.service.sessionMode === "deep" && root.service.dndOwned, 8000, "startMode did not start a deep session")) return
      root.check(root.service.totalMs === 45 * 60000, "startMode uses the requested mode's length")
      root.service.endsAt = Date.now() - 1
      root.service.tick()
      root.next(10)
      return
    }

    if (root.step === 10) {
      if (!root.waitFor(root.service.phase === "break" && !root.service.running, 3000, "second work block did not finish")) return
      root.check(root.service.sessionsToday === 2, "second completed work block is counted")
      root.service.reset()
      root.next(11)
      return
    }

    if (root.step === 11) {
      root.check(root.service.phase === "break", "reset during a break keeps the break phase")
      root.check(!root.service.running && !root.service.paused, "reset during a break leaves it ready")
      root.check(root.service.totalMs === 10 * 60000, "reset during a break restores the break length")
      root.service.start()
      root.next(12)
      return
    }

    if (root.step === 12) {
      if (!root.waitFor(root.service.running && root.service.phase === "break", 3000, "break did not start")) return
      root.check(root.service.totalMs === 10 * 60000, "break start keeps the break length")
      root.service.endsAt = Date.now() - 1
      root.service.tick()
      root.next(13)
      return
    }

    if (root.step === 13) {
      if (!root.waitFor(root.service.phase === "work" && !root.service.running, 3000, "break did not finish into a ready work block")) return
      root.check(root.service.sessionMode === "deep", "finished break returns to the queued work type")
      root.check(root.service.totalMs === 45 * 60000, "finished break restores the configured work length")
      root.check(root.service.sessionsToday === 2, "a completed break does not add a session")
      if (!root.waitFor(root.fileContains(notificationLog, "Break complete"), 5000, "break completion notification did not arrive")) return

      var status = JSON.parse(root.service.status())
      root.check(status.mode === "deep", "status reports the queued mode")
      root.check(status.sessionMode === "deep", "status reports the session mode")
      root.check(status.phase === "work", "status reports the phase")
      root.check(status.running === false, "status reports the stopped state")
      root.check(status.paused === false, "status reports the unpaused state")
      root.check(status.sessionsToday === 2, "status reports today's sessions")
      root.check(status.label === "Deep Focus", "status carries the translated phase label")
      root.finish()
    }
  }

  Timer {
    interval: 25
    repeat: true
    running: !root.done
    onTriggered: root.advance()
  }
}
