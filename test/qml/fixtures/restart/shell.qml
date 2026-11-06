import QtQuick
import Quickshell
import Quickshell.Io

// Verifies the on-disk session survives a service restart and that a corrupt
// state file falls back to a clean timer. Runs on the offscreen platform.
ShellRoot {
  id: root

  readonly property string pluginDir: Quickshell.env("CADENCE_PLUGIN_DIR") || ""
  readonly property string resultPath: Quickshell.env("CADENCE_TEST_RESULT") || ""
  readonly property string home: Quickshell.env("HOME") || ""

  property var service: null
  property string statePath: home + "/.local/state/omarchy/cadence/state.json"
  property var failures: []
  property int step: 0
  property double stepStarted: Date.now()
  property bool done: false

  Item { id: host }

  FileView {
    id: stateFile
    path: root.statePath
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

  function destroyService() {
    if (root.service) root.service.destroy()
    root.service = null
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
      if (!root.waitFor(root.service !== null && root.service.stateLoaded && root.service.storeReady, 8000, "first service did not load")) return
      root.service.configure({ deepMinutes: 45, notifications: false })
      root.service.start()
      root.next(2)
      return
    }

    if (root.step === 2) {
      if (!root.waitFor(root.service.running && root.service.dndOwned, 8000, "first session did not start")) return
      root.service.saveNow()
      root.next(3)
      return
    }

    if (root.step === 3) {
      if (!root.waitFor(root.fileContains(stateFile, '"running":true'), 5000, "state file did not record the running session")) return
      root.destroyService()
      root.next(4)
      return
    }

    if (root.step === 4) {
      if (!root.waitFor(Date.now() - root.stepStarted > 300, 1000, "service did not quiesce")) return
      root.createService()
      root.next(5)
      return
    }

    if (root.step === 5) {
      if (!root.waitFor(root.service !== null && root.service.stateLoaded && root.service.storeReady, 8000, "restarted service did not load")) return
      root.check(root.service.running, "restarted service resumes the running session")
      root.check(root.service.phase === "work", "restarted service resumes the work phase")
      root.check(root.service.sessionMode === "deep", "restarted service keeps the session type")
      root.check(root.service.totalMs === 45 * 60000, "restarted service keeps the stored session length")
      root.check(root.service.remainingMs > 0 && root.service.remainingMs <= 45 * 60000, "restarted service keeps the remaining time")
      root.check(root.service.dndOwned, "restarted service reclaims its DND")
      root.destroyService()
      root.next(6)
      return
    }

    if (root.step === 6) {
      if (!root.waitFor(Date.now() - root.stepStarted > 500, 1500, "service did not quiesce before corruption")) return
      Quickshell.execDetached(["bash", "-c",
        "printf '%s' 'not a state file' > " + root.shellQuote(root.statePath)])
      root.next(7)
      return
    }

    if (root.step === 7) {
      if (!root.waitFor(Date.now() - root.stepStarted > 300, 1000, "corrupt state was not written")) return
      root.createService()
      root.next(8)
      return
    }

    if (root.step === 8) {
      if (!root.waitFor(root.service !== null && root.service.stateLoaded && root.service.storeReady, 8000, "service did not recover from corrupt state")) return
      root.check(root.service.phase === "work", "corrupt state resets to the work phase")
      root.check(!root.service.running, "corrupt state resets to stopped")
      root.check(!root.service.paused, "corrupt state resets the paused flag")
      root.check(root.service.sessionsToday === 0, "corrupt state resets today's sessions")
      root.service.configure({ deepMinutes: 45, notifications: false })
      root.check(root.service.totalMs === 45 * 60000, "recovered timer follows the configured duration")
      root.service.saveNow()
      if (!root.waitFor(root.fileContains(stateFile, '"version":2'), 5000, "recovered state was not rewritten")) return
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
