import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "FocusModel.js" as FocusModel

// Control panel for the shared Focus service. The layout follows the
// first-party panels: a PanelHero header, one large readout, a progress bar,
// a separator, then the session picker and transport controls.
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
  readonly property bool breakPhase: service ? service.phase === "break" : false
  readonly property bool choosingNext: service
    ? (service.phase === "break" || service.running || service.paused)
    : false
  readonly property string sessionTypeLabel: root.choosingNext
    ? strings.t("panel.nextSession", "Next session")
    : strings.t("panel.sessionType", "Session type")
  readonly property bool queuedModeDiffers: service
    ? service.mode !== service.sessionMode
    : false
  readonly property string glyph: root.breakPhase ? "\u{f0176}" : "\u{f08c9}"

  readonly property string phaseLabel: !service
    ? strings.t("widget.name", "Focus")
    : root.breakPhase
      ? strings.t("panel.break", "Break")
      : (service.sessionMode === "deep"
        ? strings.t("panel.deep", "Deep Focus")
        : strings.t("panel.shortWork", "Short Focus"))
  readonly property string phaseMeta: {
    if (!service) return ""
    var minutes = numberText(Math.max(1, Math.round(service.totalMs / 60000)))
    if (root.breakPhase)
      return strings.t("panel.breakMeta", "%1 minute break").arg(minutes)
    return strings.t("panel.workMeta", "%1 minute work block").arg(minutes)
  }
  readonly property string heroMeta: !service
    ? strings.t("panel.unavailable", "Focus service is still loading.")
    : root.phaseMeta
  readonly property string primaryLabel: !service
    ? strings.t("panel.start", "Start")
    : service.running
      ? strings.t("panel.pause", "Pause")
      : service.paused
        ? strings.t("panel.resume", "Resume")
        : root.breakPhase
          ? strings.t("panel.startBreak", "Start break")
          : (service.sessionMode === "deep"
            ? strings.t("panel.startDeep", "Start deep focus")
            : strings.t("panel.startShortWork", "Start short focus"))
  readonly property string secondaryLabel: root.breakPhase
    ? strings.t("panel.skipBreak", "Skip break")
    : strings.t("panel.reset", "Reset")
  readonly property string secondaryIcon: root.breakPhase ? "\u{f04ad}" : "\u{f0709}"
  readonly property real progress: service ? service.progress : 0
  readonly property int sessions: service ? service.sessionsToday : 0
  readonly property var modeOptions: [
    {
      value: "deep",
      label: strings.t("panel.ultradian", "Ultradian"),
      tooltip: strings.t("panel.ultradianHint", "%1 minute deep focus block")
        .arg(numberText(service ? service.deepMinutes : 90))
    },
    {
      value: "pomodoro",
      label: strings.t("panel.pomodoro", "Pomodoro"),
      tooltip: strings.t("panel.pomodoroHint", "%1 minute short focus block")
        .arg(numberText(service ? service.pomodoroMinutes : 25))
    }
  ]

  function toggleTimer() {
    if (service) service.toggle()
  }

  function secondaryAction() {
    if (!service) return
    if (root.breakPhase) service.skipBreak()
    else service.reset()
  }

  function selectMode(value) {
    if (service) service.selectMode(value)
    root.modeIndex = value === "pomodoro" ? 1 : 0
  }

  // Keyboard cursor shared by the mouse and the panel key catcher, following
  // the first-party panel pattern: one row of choices, one row of transport.
  property bool cursorActive: false
  property string focusSection: "transport"
  property int modeIndex: 0
  property int transportIndex: 0

  function modeIndexFor(value) {
    return value === "pomodoro" ? 1 : 0
  }

  function resetCursor() {
    cursorActive = false
    focusSection = "transport"
    transportIndex = 0
    modeIndex = modeIndexFor(service ? service.mode : "deep")
  }

  function pointAtMode(index) {
    cursorActive = true
    focusSection = "mode"
    modeIndex = Math.max(0, Math.min(1, index))
  }

  function pointAtTransport(index) {
    cursorActive = true
    focusSection = "transport"
    transportIndex = Math.max(0, Math.min(1, index))
  }

  function moveCursor(dx, dy) {
    if (!cursorActive) {
      cursorActive = true
      return
    }

    if (focusSection === "mode") {
      if (dx !== 0) modeIndex = Math.max(0, Math.min(1, modeIndex + dx))
      else if (dy > 0) focusSection = "transport"
    } else {
      if (dx !== 0) transportIndex = Math.max(0, Math.min(1, transportIndex + dx))
      else if (dy < 0) focusSection = "mode"
    }
  }

  function activateCursor() {
    cursorActive = true
    if (focusSection === "mode") {
      var option = modeOptions[modeIndex]
      if (option) selectMode(option.value)
    } else if (transportIndex === 0) {
      toggleTimer()
    } else {
      secondaryAction()
    }
  }

  onOpenedChanged: if (opened) resetCursor()

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

      onMoveRequested: function(dx, dy) { root.moveCursor(dx, dy) }
      onActivateRequested: root.activateCursor()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: contentColumn
        width: parent.width
        spacing: Style.space(14)

        // ---- Hero: the current phase, state, and session length.
        PanelHero {
          width: parent.width
          title: root.phaseLabel
          meta: root.heroMeta
          foreground: root.contentForeground
          fontFamily: root.contentFontFamily

          iconComponent: Component {
            Text {
              textFormat: Text.PlainText
              text: root.glyph
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.display
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

        // ---- Progress.
        Item {
          width: parent.width
          height: Style.space(8)

          Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: Util.alpha(root.contentForeground, 0.12)
          }

          Rectangle {
            width: Math.max(parent.height, parent.width * root.progress)
            height: parent.height
            radius: height / 2
            color: root.contentForeground

            Behavior on width {
              NumberAnimation {
                duration: Style.duration(280)
                easing.type: Easing.OutCubic
              }
            }
          }
        }

        // ---- Today's completed focus blocks, as a label/value stat row.
        Row {
          width: parent.width
          spacing: Style.space(8)

          Text {
            text: strings.t("panel.today", "Today")
            textFormat: Text.PlainText
            color: root.contentForeground
            opacity: 0.6
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
          }

          Item {
            width: Math.max(0, parent.width - parent.children[0].implicitWidth
              - parent.children[2].implicitWidth - parent.spacing * 2)
            height: 1
          }

          Text {
            text: strings.tn("panel.sessionCount", root.sessions, "%1 sessions")
              .arg(Commons.I18n.formatNumber(root.sessions, 0))
            textFormat: Text.PlainText
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        PanelSeparator {
          foreground: root.contentForeground
        }

        // ---- Session type. While a session is active the buttons choose
        //      the type for the next work block instead of interrupting this one.
        Column {
          width: parent.width
          spacing: Style.space(10)

          PanelSectionHeader {
            text: root.sessionTypeLabel
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
          }

          Row {
            id: modeRow
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: root.modeOptions

              delegate: Button {
                required property var modelData
                required property int index
                width: (modeRow.width - modeRow.spacing) / 2
                text: modelData.label
                tooltipText: modelData.tooltip
                active: root.service
                  ? root.service.mode === modelData.value
                  : modelData.value === "deep"
                hasCursor: root.cursorActive && root.focusSection === "mode" && root.modeIndex === index
                bordered: true
                fontSize: Style.font.bodySmall
                foreground: root.contentForeground
                accent: Commons.Color.accent
                fontFamily: root.contentFontFamily
                horizontalPadding: Style.spacing.controlPaddingX
                verticalPadding: Style.spacing.controlPaddingY + Style.space(2)
                onClicked: root.selectMode(modelData.value)
                onHovered: function(hovered) { if (hovered) root.pointAtMode(index) }
              }
            }
          }

          Text {
            visible: root.queuedModeDiffers
            width: parent.width
            text: strings.t("panel.nextHint", "Applies to the next focus session.")
            textFormat: Text.PlainText
            color: root.contentForeground
            opacity: 0.6
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
          }
        }

        // ---- Transport.
        Row {
          width: parent.width
          spacing: Style.space(6)

          Button {
            width: (parent.width - parent.spacing) / 2
            text: root.primaryLabel
            iconText: root.service && root.service.running ? "\u{f03e4}" : "\u{f040a}"
            hasCursor: root.cursorActive && root.focusSection === "transport" && root.transportIndex === 0
            bordered: true
            foreground: root.contentForeground
            accent: Commons.Color.accent
            fontFamily: root.contentFontFamily
            onClicked: root.toggleTimer()
            onHovered: function(hovered) { if (hovered) root.pointAtTransport(0) }
          }

          Button {
            width: (parent.width - parent.spacing) / 2
            text: root.secondaryLabel
            iconText: root.secondaryIcon
            hasCursor: root.cursorActive && root.focusSection === "transport" && root.transportIndex === 1
            bordered: true
            foreground: root.contentForeground
            accent: Commons.Color.accent
            fontFamily: root.contentFontFamily
            onClicked: root.secondaryAction()
            onHovered: function(hovered) { if (hovered) root.pointAtTransport(1) }
          }
        }
      }
    }
  }
}
