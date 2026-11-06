import QtQuick
import Quickshell

// Instantiates the real bar widget against a fake bar and service, checking
// the contract the shell/panel loader relies on without needing a compositor.
ShellRoot {
  id: root

  readonly property string pluginDir: Quickshell.env("FOCUS_PLUGIN_DIR") || ""
  readonly property string resultPath: Quickshell.env("FOCUS_TEST_RESULT") || ""

  property var widget: null
  property var failures: []
  property int step: 0
  property double stepStarted: Date.now()
  property bool done: false

  Item { id: host }

  QtObject {
    id: mockService
    property string phase: "work"
    property string mode: "deep"
    property string sessionMode: "deep"
    property bool running: true
    property bool paused: false
    property double effectiveRemainingMs: 90000
    property double totalMs: 5400000
    property real progress: 0.2
    property int sessionsToday: 1
    property int deepMinutes: 90
    property int pomodoroMinutes: 25
    property int breakMinutes: 20
    property string phaseLabel: "Deep Focus"
    property string statusLabel: "Running"
    function configure(values) {}
    function start() {}
    function pause() {}
    function toggle() {}
    function reset() {}
    function skipBreak() {}
    function selectMode(value) {}
    function startMode(value) {}
  }

  QtObject {
    id: mockShell
    function serviceFor(id) { return mockService }
  }

  QtObject {
    id: fakeBar
    property bool vertical: false
    property int barSize: 26
    property string fontFamily: "monospace"
    property color foreground: "white"
    property color background: "black"
    property color urgent: "red"
    property string omarchyPath: ""
    property var shell: mockShell
    function run(command) {}
    function showTooltip(target, text) {}
    function hideTooltip(target) {}
    function requestPopout(owner) {}
    function releasePopout(owner) {}
    function registerClickTarget(target) {}
    function unregisterClickTarget(target) {}
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

  function createWidget() {
    var component = Qt.createComponent("file://" + encodeURI(root.pluginDir) + "/BarWidget.qml", Component.PreferSynchronous)
    if (component.status !== Component.Ready) {
      root.fail("BarWidget.qml failed to load: " + component.errorString())
      root.finish()
      return
    }
    root.widget = component.createObject(host, { moduleName: "jimmerioles.focus", bar: fakeBar })
    if (!root.widget) {
      root.fail("BarWidget.qml failed to instantiate: " + component.errorString())
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
      root.createWidget()
      root.next(1)
      return
    }

    if (root.step === 1) {
      if (!root.waitFor(root.widget !== null && root.widget.service === mockService, 5000, "bar widget did not resolve its service")) return
      root.check(root.widget.implicitWidth > 0, "widget has a positive implicit width")
      root.check(root.widget.implicitHeight > 0, "widget has a positive implicit height")
      root.check(root.widget.timeText === "01:30", "widget formats the shared countdown")
      root.check(root.widget.tooltipText.indexOf("Deep Focus") >= 0, "tooltip names the phase")
      root.check(root.widget.tooltipText.indexOf("01:30") >= 0, "tooltip carries the countdown")
      root.check(root.widget.tooltipText.indexOf("Running") >= 0, "tooltip carries the state")
      root.check(root.widget.glyph === "\u{f08c9}", "work phase shows the target glyph")
      root.check(root.widget.active === true, "running session is active")
      try {
        root.widget.open()
        root.widget.close()
      } catch (error) {
        root.fail("open/close threw: " + error)
      }
      mockService.phase = "break"
      mockService.phaseLabel = "Break"
      mockService.running = false
      mockService.statusLabel = "Ready"
      root.next(2)
      return
    }

    if (root.step === 2) {
      root.check(root.widget.breakPhase === true, "break phase is reported to the widget")
      root.check(root.widget.glyph === "\u{f117c}", "break phase shows the stretching figure")
      root.check(root.widget.active === false, "stopped session is dimmed")
      root.check(root.widget.tooltipText.indexOf("Break") >= 0, "tooltip follows the break phase")
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
