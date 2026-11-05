import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "FocusModel.js" as FocusModel

// Control panel for the shared Focus service. Opening, closing, and popout
// switching are inherited from Panel; the service owns all timer state.
Panel {
  id: root
  moduleName: "jimmerioles.focus"
  ipcTarget: "jimmerioles.focus"
  manageIpc: false

  property var service: null
  property var anchorItem: null

  // The bar tracks the widget in its slot, not this nested panel.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.foreground : Commons.Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color dim: Util.alpha(root.contentForeground, 0.55)

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  function numberText(value) {
    return Commons.I18n.formatNumber(value, 0)
  }

  readonly property string timeText: service
    ? FocusModel.formatClock(service.effectiveRemainingMs, Commons.I18n.formatNumber)
    : "00:00"
  readonly property string glyph: service && service.phase === "break"
    ? "\u{f0176}"
    : "\u{f051b}"
  readonly property string phaseLabel: !service
    ? strings.t("widget.name", "Focus")
    : service.phase === "break"
      ? strings.t("panel.break", "Break")
      : (service.mode === "deep" ? strings.t("panel.deep", "Deep work") : strings.t("panel.pomodoro", "Pomodoro"))
  readonly property string phaseMeta: {
    if (!service) return ""
    var minutes = numberText(Math.max(1, Math.round(service.totalMs / 60000)))
    if (service.phase === "break")
      return strings.t("panel.breakMeta", "Step away and reset for %1 minutes").arg(minutes)
    return (service.mode === "deep"
      ? strings.t("panel.deepMeta", "%1 minute ultradian focus block")
      : strings.t("panel.pomodoroMeta", "%1 minute pomodoro focus block")).arg(minutes)
  }
  readonly property string statusLabel: !service
    ? strings.t("panel.loading", "Loading")
    : service.running
      ? strings.t("panel.running", "Running")
      : (service.paused ? strings.t("panel.paused", "Paused") : strings.t("panel.ready", "Ready"))
  readonly property string primaryLabel: !service
    ? strings.t("panel.start", "Start")
    : service.running
      ? strings.t("panel.pause", "Pause")
      : (service.paused ? strings.t("panel.resume", "Resume") : strings.t("panel.start", "Start"))
  readonly property real progress: service ? service.progress : 0
  readonly property int sessions: service ? service.sessionsToday : 0
  readonly property var modeOptions: [
    {
      value: "deep",
      label: strings.t("panel.deepChip", "Deep work · %1 min").arg(numberText(service ? service.deepMinutes : 90))
    },
    {
      value: "pomodoro",
      label: strings.t("panel.pomodoroChip", "Pomodoro · %1 min").arg(numberText(service ? service.pomodoroMinutes : 25))
    }
  ]

  function toggleTimer() {
    if (service) service.toggle()
  }

  function resetTimer() {
    if (service) service.reset()
  }

  function selectMode(value) {
    if (service) service.selectMode(value)
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: false
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight)

    content: PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      implicitHeight: contentColumn.implicitHeight

      onActivateRequested: root.toggleTimer()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text, modifiers) {
        if (text === "r" || text === "R") root.resetTimer()
        else if (text === "1") root.selectMode("deep")
        else if (text === "2") root.selectMode("pomodoro")
      }

      Column {
        id: contentColumn
        width: parent.width
        spacing: Style.space(14)

        Text {
          visible: !root.service
          width: parent.width
          text: strings.t("panel.unavailable", "Focus service is still loading.")
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.Wrap
        }

        // ---- Hero: what phase is running, and its current state.
        Item {
          width: parent.width
          height: Math.max(heroGlyph.implicitHeight, heroLabels.implicitHeight, statusPill.implicitHeight)

          Text {
            id: heroGlyph
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: root.glyph
            textFormat: Text.PlainText
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.display
          }

          Column {
            id: heroLabels
            anchors.left: heroGlyph.right
            anchors.leftMargin: Style.space(12)
            anchors.right: statusPill.left
            anchors.rightMargin: Style.space(12)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: root.phaseLabel
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: root.phaseMeta
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }

          BorderSurface {
            id: statusPill
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            implicitWidth: statusText.implicitWidth + Style.space(12)
            implicitHeight: statusText.implicitHeight + Style.space(4)
            radius: Style.cornerRadius
            color: root.service && root.service.running
              ? Util.alpha(Commons.Color.accent, 0.14)
              : "transparent"
            borderSpec: Border.controlSpec(
              root.service && root.service.running ? "selected" : "normal",
              root.contentForeground,
              Commons.Color.accent)

            Text {
              id: statusText
              anchors.centerIn: parent
              text: root.statusLabel
              textFormat: Text.PlainText
              color: root.service && root.service.running ? Commons.Color.accent : root.dim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
          }
        }

        // ---- Countdown.
        Text {
          width: parent.width
          text: root.timeText
          textFormat: Text.PlainText
          color: root.contentForeground
          font.family: root.contentFontFamily
          font.pixelSize: Math.round(Style.font.displayLarge * 1.65)
          font.bold: true
          horizontalAlignment: Text.AlignHCenter
        }

        Item {
          width: parent.width
          height: Style.space(4)

          Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: Util.alpha(root.contentForeground, 0.12)
          }

          Rectangle {
            width: parent.width * root.progress
            height: parent.height
            radius: height / 2
            color: Commons.Color.accent
            Behavior on width {
              NumberAnimation {
                duration: Style.duration(240)
                easing.type: Easing.Linear
              }
            }
          }
        }

        // ---- Session type. Chips are inert while running so a stray click
        //      cannot throw away an in-progress session.
        PanelSectionHeader {
          text: strings.t("panel.sessionType", "Session type")
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily
        }

        Item {
          width: parent.width
          height: modeGroup.implicitHeight
          opacity: root.service && root.service.running ? 0.45 : 1

          ButtonGroup {
            id: modeGroup
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.verticalCenter: parent.verticalCenter
            options: root.modeOptions
            value: root.service ? root.service.mode : "deep"
            foreground: root.contentForeground
            accent: Commons.Color.accent
            fontFamily: root.contentFontFamily
            focusable: false
            onChanged: function(value) { root.selectMode(value) }
          }

          MouseArea {
            anchors.fill: parent
            enabled: root.service && root.service.running
            acceptedButtons: Qt.AllButtons
          }
        }

        // ---- Transport.
        Row {
          width: parent.width
          spacing: Style.space(8)

          Button {
            id: primaryButton
            width: Math.round((parent.width - parent.spacing) * 0.62)
            text: root.primaryLabel
            iconText: root.service && root.service.running ? "\u{f03e4}" : "\u{f040a}"
            selected: true
            bordered: true
            foreground: root.contentForeground
            accent: Commons.Color.accent
            fontFamily: root.contentFontFamily
            onClicked: root.toggleTimer()
          }

          Button {
            width: parent.width - primaryButton.width - parent.spacing
            text: strings.t("panel.reset", "Reset")
            iconText: "\u{f0709}"
            bordered: true
            foreground: root.contentForeground
            accent: Commons.Color.accent
            fontFamily: root.contentFontFamily
            onClicked: root.resetTimer()
          }
        }

        // ---- Today + keyboard hints.
        Item {
          width: parent.width
          height: Math.max(sessionsText.implicitHeight, keysText.implicitHeight)

          Text {
            id: sessionsText
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: strings.tn("panel.sessions", root.sessions, "%1 sessions today")
              .arg(Commons.I18n.formatNumber(root.sessions, 0))
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
          }

          Text {
            id: keysText
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, Math.max(0, parent.width - sessionsText.width - Style.space(8)))
            text: strings.t("panel.keys", "Space start/pause · R reset · 1/2 type")
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignRight
            elide: Text.ElideRight
          }
        }
      }
    }
  }
}
