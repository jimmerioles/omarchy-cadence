import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "FocusModel.js" as FocusModel

// Bar entry for the shared focus timer. The countdown itself lives in
// Service.qml so every monitor and every bar reload sees the same session.
BarWidget {
  id: root
  moduleName: "jimmerioles.focus"

  property var service: null

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  readonly property bool breakPhase: service ? service.phase === "break" : false
  readonly property string glyph: service && service.paused
    ? "\u{f03e4}"
    : (breakPhase ? "\u{f0176}" : "\u{f08c9}")
  readonly property string timeText: service
    ? FocusModel.formatClock(service.effectiveRemainingMs, Commons.I18n.formatNumber)
    : "00:00"
  readonly property string phaseLabel: service ? service.phaseLabel : strings.t("widget.name", "Focus")
  readonly property string tooltipText: {
    if (!service) return strings.t("widget.tooltip", "Focus timer")
    if (root.vertical)
      return root.phaseLabel + " · " + root.timeText + " · " + service.statusLabel
    return root.phaseLabel + " · " + service.statusLabel
  }
  readonly property bool active: service ? service.running : false

  // The bar label uses the same icon+value composition as the first-party
  // status widgets. The slot is measured from the countdown so the timer
  // never clips or changes width as the digits change.
  FontMetrics {
    id: timeMetrics
    font.family: root.bar ? root.bar.fontFamily : Style.font.family
    font.pixelSize: Style.bar.iconFont
  }
  // Measure the full session length rather than the ticking value, so the
  // slot keeps its width when the countdown crosses a digit boundary.
  readonly property string slotTimeText: service
    ? FocusModel.formatClock(service.totalMs, Commons.I18n.formatNumber)
    : root.timeText
  readonly property real timeWidth: timeMetrics.advanceWidth(root.slotTimeText)
  readonly property real buttonSlot: Math.max(
    Style.bar.iconSlot * 2,
    Math.ceil(root.timeWidth) + Style.bar.iconCanvas + Style.space(8))

  function resolveService() {
    if (root.service) return
    var api = root.bar
    var candidate = api && api.shell && typeof api.shell.serviceFor === "function"
      ? api.shell.serviceFor(root.moduleName)
      : null
    if (candidate) {
      root.service = candidate
      serviceRetry.stop()
      root.configureService()
      root.injectPanel()
    } else {
      serviceRetry.restart()
    }
  }

  function configureService() {
    if (!root.service) return
    root.service.configure(root.settings || {})
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("service" in target) target.service = root.service
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  // Shape contract for shell.summon/hide/toggle routing.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true
    : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: {
    resolveService()
    injectPanel()
  }
  onModuleNameChanged: resolveService()
  onSettingsChanged: configureService()
  onServiceChanged: injectPanel()

  Timer {
    id: serviceRetry
    interval: 200
    repeat: true
    running: root.service === null && root.bar !== null
    onTriggered: root.resolveService()
  }

  Component.onCompleted: resolveService()

  Commons.ShellIpc {
    target: "jimmerioles.focus"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function start(): void { if (root.service) root.service.start() }
    function pause(): void { if (root.service) root.service.pause() }
    function reset(): void { if (root.service) root.service.reset() }
    function skipBreak(): void { if (root.service) root.service.skipBreak() }
    function toggleTimer(): void { if (root.service) root.service.toggle() }
    function setMode(value: string): string { if (root.service) root.service.selectMode(String(value)); return root.service ? root.service.mode : "" }
    function status(): string { return root.service ? root.service.status() : "{}" }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.glyph
    labelText: root.vertical ? "" : root.timeText
    slotSize: root.vertical ? Style.bar.iconSlot : root.buttonSlot
    tooltipText: root.tooltipText
    active: root.active

    onPressed: function(button) {
      if (button === Qt.RightButton) {
        if (root.service) root.service.toggle()
      } else if (button === Qt.MiddleButton) {
        if (root.service) root.service.reset()
      } else {
        root.togglePanel()
      }
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }
}
