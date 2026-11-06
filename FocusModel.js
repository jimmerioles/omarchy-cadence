// Pure helpers and session transitions for the Cadence timer. State parsing
// validates everything that comes back from disk, so a hand-edited or
// truncated state file can only ever produce a reset timer, never a bad
// duration or an unsafe display value.
//
// Every transition takes a state snapshot, a configuration object, and the
// current time, and returns a new state plus the side effects the QML service
// must apply. Nothing here touches QML, processes, translation catalogs, or
// Date.now(), which is what makes the whole timer testable from Node.

var STATE_VERSION = 2
var MAX_STATE_MS = 8640000000000000
var MAX_SESSION_MS = 12 * 60 * 60 * 1000
var MIN_SESSION_MS = 60 * 1000

function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || typeof value === "boolean") return fallback
  if (typeof value === "string" && value.trim() === "") return fallback
  var n = Number(value)
  if (!isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max))
}

function twoDigits(value) {
  var text = String(value)
  return text.length < 2 ? "0" + text : text
}

function padNumber(value, formatNumber) {
  var format = typeof formatNumber === "function"
    ? formatNumber
    : function(number) { return String(number) }
  var text = String(format(value, 0))
  var zero = String(format(0, 0))
  return text.length < 2 ? zero + text : text
}

function formatClock(ms, formatNumber) {
  var totalSeconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000))
  var minutes = Math.floor(totalSeconds / 60)
  var seconds = totalSeconds % 60
  return padNumber(minutes, formatNumber) + ":" + padNumber(seconds, formatNumber)
}

function dateKey(date) {
  var d = date || new Date()
  return d.getFullYear() + "-" + twoDigits(d.getMonth() + 1) + "-" + twoDigits(d.getDate())
}

// ---- Configuration ----------------------------------------------------

function defaultConfig() {
  return {
    deepMinutes: 90,
    shortMinutes: 25,
    deepBreakMinutes: 20,
    shortBreakMinutes: 5,
    autoStartBreak: true,
    autoStartWork: false,
    notifications: true
  }
}

function configLimits() {
  return {
    deepMinutes: { min: 15, max: 180, step: 5 },
    shortMinutes: { min: 5, max: 60, step: 5 },
    deepBreakMinutes: { min: 5, max: 45, step: 5 },
    shortBreakMinutes: { min: 1, max: 15, step: 1 }
  }
}

function boolValue(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  var text = String(value).toLowerCase()
  if (text === "true" || text === "1" || text === "on" || text === "yes") return true
  if (text === "false" || text === "0" || text === "off" || text === "no") return false
  return fallback
}

function resolveConfig(current, values) {
  var base = current || defaultConfig()
  var fallback = defaultConfig()
  var v = values || {}
  var limits = configLimits()

  function configNumber(value, currentValue, fallbackValue, range) {
    var safeCurrent = clampInt(currentValue, fallbackValue, range.min, range.max)
    return clampInt(value, safeCurrent, range.min, range.max)
  }

  var next = {
    deepMinutes: configNumber(v.deepMinutes, base.deepMinutes, fallback.deepMinutes, limits.deepMinutes),
    shortMinutes: configNumber(v.shortMinutes, base.shortMinutes, fallback.shortMinutes, limits.shortMinutes),
    deepBreakMinutes: configNumber(v.deepBreakMinutes, base.deepBreakMinutes, fallback.deepBreakMinutes, limits.deepBreakMinutes),
    shortBreakMinutes: configNumber(v.shortBreakMinutes, base.shortBreakMinutes, fallback.shortBreakMinutes, limits.shortBreakMinutes),
    autoStartBreak: boolValue(v.autoStartBreak, base.autoStartBreak === true),
    autoStartWork: boolValue(v.autoStartWork, base.autoStartWork === true),
    notifications: boolValue(v.notifications, base.notifications === true)
  }

  var changed = next.deepMinutes !== base.deepMinutes
    || next.shortMinutes !== base.shortMinutes
    || next.deepBreakMinutes !== base.deepBreakMinutes
    || next.shortBreakMinutes !== base.shortBreakMinutes
    || next.autoStartBreak !== (base.autoStartBreak === true)
    || next.autoStartWork !== (base.autoStartWork === true)
    || next.notifications !== (base.notifications === true)

  return { config: next, changed: changed }
}

// ---- Session values ---------------------------------------------------

function canonicalMode(value) {
  if (value === "deep" || value === "short") return value
  return null
}

function normalizedMode(value, fallback) {
  return canonicalMode(value) || canonicalMode(fallback) || "deep"
}

function workMinutes(config, mode) {
  var c = config || defaultConfig()
  var minutes = mode === "short" ? Number(c.shortMinutes) : Number(c.deepMinutes)
  if (!isFinite(minutes)) minutes = mode === "short" ? 25 : 90
  return minutes
}

function breakMinutes(config, mode) {
  var c = config || defaultConfig()
  var minutes = mode === "short" ? Number(c.shortBreakMinutes) : Number(c.deepBreakMinutes)
  if (!isFinite(minutes)) minutes = mode === "short" ? 5 : 20
  return minutes
}

function durationFor(config, state, phase) {
  var minutes = phase === "break"
    ? breakMinutes(config, state.sessionMode)
    : workMinutes(config, state.sessionMode)
  return Math.max(MIN_SESSION_MS, minutes * 60000)
}

function effectiveRemainingMs(state, now) {
  return state.running
    ? Math.max(0, state.endsAt - now)
    : Math.max(0, state.remainingMs)
}

function progressOf(state, now) {
  var total = Number(state.totalMs)
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(1, 1 - effectiveRemainingMs(state, now) / total))
}

// ---- State parsing ----------------------------------------------------

function copyState(state) {
  var source = state || {}
  var mode = normalizedMode(source.mode, "deep")
  return {
    mode: mode,
    sessionMode: normalizedMode(source.sessionMode, mode),
    phase: source.phase === "break" ? "break" : "work",
    running: source.running === true,
    paused: source.paused === true,
    dndOwned: source.dndOwned === true,
    endsAt: clampNumber(source.endsAt, 0, 0, MAX_STATE_MS),
    remainingMs: clampNumber(source.remainingMs, 0, 0, MAX_STATE_MS),
    totalMs: clampNumber(source.totalMs, 0, 0, MAX_STATE_MS),
    sessionsToday: clampInt(source.sessionsToday, 0, 0, 9999),
    sessionsDate: typeof source.sessionsDate === "string" ? source.sessionsDate : ""
  }
}

function parseState(raw) {
  var parsed
  try {
    parsed = JSON.parse(String(raw || ""))
  } catch (e) {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  if (parsed.version !== STATE_VERSION) return null
  if (parsed.mode !== undefined && canonicalMode(parsed.mode) === null) return null
  if (parsed.sessionMode !== undefined && canonicalMode(parsed.sessionMode) === null) return null

  var state = copyState(parsed)
  state.paused = typeof parsed.paused === "boolean"
    ? parsed.paused
    : (parsed.running !== true
      && Number(parsed.remainingMs) > 0
      && Number(parsed.remainingMs) < Number(parsed.totalMs) - 500)
  return state
}

// ---- Effects and shared state helpers ---------------------------------

function noEffects() {
  return {
    dnd: null,              // "query" | "on" | "off"
    replayHistory: false,
    notify: null,           // "workDone" | "breakDone"
    save: false,
    stopHistoryReplay: false
  }
}

function saveEffects() {
  var effects = noEffects()
  effects.save = true
  return effects
}

function combineEffects(base, extra) {
  var combined = noEffects()
  combined.dnd = extra.dnd !== null ? extra.dnd : base.dnd
  combined.replayHistory = base.replayHistory === true || extra.replayHistory === true
  combined.notify = extra.notify !== null ? extra.notify : base.notify
  combined.save = base.save === true || extra.save === true
  combined.stopHistoryReplay = base.stopHistoryReplay === true || extra.stopHistoryReplay === true
  return combined
}

function ensureToday(state, now) {
  var key = dateKey(new Date(now))
  if (state.sessionsDate !== key) {
    state.sessionsDate = key
    state.sessionsToday = 0
  }
  return state
}

function initialState(config, now) {
  var state = {
    mode: "deep",
    sessionMode: "deep",
    phase: "work",
    running: false,
    paused: false,
    dndOwned: false,
    endsAt: 0,
    remainingMs: 0,
    totalMs: 0,
    sessionsToday: 0,
    sessionsDate: dateKey(new Date(now))
  }
  state.totalMs = durationFor(config, state, "work")
  state.remainingMs = state.totalMs
  return state
}

// ---- Timer transitions ------------------------------------------------

function start(state, config, now) {
  if (state.running) return { state: state, effects: noEffects() }

  state = ensureToday(copyState(state), now)

  if (state.phase === "work" && !state.paused) {
    state.sessionMode = state.mode
    state.totalMs = durationFor(config, state, "work")
    state.remainingMs = state.totalMs
  }

  if (state.totalMs <= 0 || state.remainingMs <= 0 || state.remainingMs > state.totalMs + 1000) {
    state.totalMs = durationFor(config, state, state.phase)
    state.remainingMs = state.totalMs
  }
  if (state.remainingMs <= 0) {
    return { state: state, effects: saveEffects() }
  }

  state.endsAt = now + state.remainingMs
  state.running = true
  state.paused = false

  var effects = saveEffects()
  if (state.phase === "work") {
    effects.stopHistoryReplay = true
    effects.dnd = state.dndOwned ? "on" : "query"
  }
  return { state: state, effects: effects }
}

function pause(state, config, now) {
  if (!state.running) return { state: state, effects: noEffects() }

  var left = Math.max(0, state.endsAt - now)
  if (left <= 0) return finishPhase(state, config, now)

  state = copyState(state)
  state.remainingMs = left
  state.running = false
  state.paused = true
  state.endsAt = 0
  return { state: state, effects: saveEffects() }
}

function reset(state, config) {
  state = copyState(state)
  var effects = saveEffects()

  if (state.phase === "work") {
    if (state.dndOwned) {
      state.dndOwned = false
      effects.dnd = "off"
    }
    state.sessionMode = state.mode
  }

  state.running = false
  state.paused = false
  state.endsAt = 0
  state.totalMs = durationFor(config, state, state.phase)
  state.remainingMs = state.totalMs
  return { state: state, effects: effects }
}

function skipBreak(state, config) {
  if (state.phase !== "break") return { state: state, effects: noEffects() }

  state = copyState(state)
  state.running = false
  state.paused = false
  state.endsAt = 0
  state.phase = "work"
  state.sessionMode = state.mode
  state.totalMs = durationFor(config, state, "work")
  state.remainingMs = state.totalMs
  return { state: state, effects: saveEffects() }
}

function selectMode(state, config, next) {
  var mode = canonicalMode(next)
  if (!mode) {
    return { state: state, effects: noEffects() }
  }

  state = copyState(state)

  if (mode === state.mode) {
    if (state.phase === "work" && !state.running && !state.paused && state.sessionMode !== state.mode) {
      state.sessionMode = state.mode
      state.totalMs = durationFor(config, state, "work")
      state.remainingMs = state.totalMs
      return { state: state, effects: saveEffects() }
    }
    return { state: state, effects: noEffects() }
  }

  state.mode = mode
  if (state.phase === "work" && !state.running && !state.paused) {
    state.sessionMode = state.mode
    state.totalMs = durationFor(config, state, "work")
    state.remainingMs = state.totalMs
  }
  return { state: state, effects: saveEffects() }
}

function startMode(state, config, next, now) {
  var mode = canonicalMode(next)
  if (!mode) {
    return { state: state, effects: noEffects() }
  }
  if (state.phase === "work" && (state.running || state.paused)) {
    return selectMode(state, config, mode)
  }

  state = copyState(state)
  state.mode = mode
  state.phase = "work"
  state.sessionMode = mode
  state.running = false
  state.paused = false
  state.endsAt = 0
  state.totalMs = durationFor(config, state, "work")
  state.remainingMs = state.totalMs
  return start(state, config, now)
}

function tick(state, config, now) {
  if (!state.running || state.endsAt > now) {
    return { state: state, effects: noEffects() }
  }
  return finishPhase(state, config, now)
}

function finishPhase(state, config, now) {
  if (!state.running) return { state: state, effects: noEffects() }

  state = copyState(state)
  state.running = false
  state.paused = false
  state.endsAt = 0
  state.remainingMs = 0

  var effects = saveEffects()

  if (state.phase === "work") {
    if (state.dndOwned) {
      state.dndOwned = false
      effects.dnd = "off"
      effects.replayHistory = true
    }

    ensureToday(state, now)
    state.sessionsToday += 1
    state.phase = "break"
    state.totalMs = durationFor(config, state, "break")
    state.remainingMs = state.totalMs
    effects.notify = "workDone"

    if (config.autoStartBreak === true) {
      var breakStart = start(state, config, now)
      state = breakStart.state
      effects = combineEffects(effects, breakStart.effects)
    }
  } else {
    state.phase = "work"
    state.sessionMode = state.mode
    state.totalMs = durationFor(config, state, "work")
    state.remainingMs = state.totalMs
    effects.notify = "breakDone"

    if (config.autoStartWork === true) {
      var workStart = start(state, config, now)
      state = workStart.state
      effects = combineEffects(effects, workStart.effects)
    }
  }

  return { state: state, effects: effects }
}

function finishPast(state, config, now) {
  state = copyState(state)
  var effects = saveEffects()

  if (state.phase === "work") {
    if (state.dndOwned) {
      state.dndOwned = false
      effects.dnd = "off"
    }
    ensureToday(state, now)
    state.sessionsToday += 1
    state.phase = "break"
  } else {
    state.phase = "work"
    state.sessionMode = state.mode
  }

  state.running = false
  state.paused = false
  state.endsAt = 0
  state.totalMs = durationFor(config, state, state.phase)
  state.remainingMs = state.totalMs
  return { state: state, effects: effects }
}

// ---- Do Not Disturb ---------------------------------------------------

function applyDndQuery(state, raw) {
  if (state.phase !== "work" || !state.running) {
    return { state: state, effects: noEffects() }
  }

  var answer = String(raw || "").trim().toLowerCase()
  state = copyState(state)

  if (answer === "on") {
    if (!state.dndOwned) return { state: state, effects: noEffects() }
    state.dndOwned = false
    return { state: state, effects: saveEffects() }
  }
  if (answer !== "off") return { state: state, effects: noEffects() }

  state.dndOwned = true
  var effects = saveEffects()
  effects.dnd = "on"
  return { state: state, effects: effects }
}

function syncDndAfterLoad(state) {
  state = copyState(state)
  var effects = noEffects()

  if (state.dndOwned) {
    if (state.phase === "work" && (state.running || state.paused)) {
      effects.dnd = "on"
    } else {
      state.dndOwned = false
      effects.dnd = "off"
      effects.save = true
    }
  } else if (state.running && state.phase === "work") {
    effects.dnd = "query"
  }

  return { state: state, effects: effects }
}

// ---- Configuration and loading ----------------------------------------

function applyConfigToState(state, config) {
  state = copyState(state)
  if (state.running || state.paused) {
    return { state: state, effects: noEffects() }
  }

  if (state.phase === "work") state.sessionMode = state.mode
  state.totalMs = durationFor(config, state, state.phase)
  state.remainingMs = state.totalMs
  return { state: state, effects: saveEffects() }
}

function resolveLoadedState(parsed, config, now) {
  if (!parsed) {
    return { state: initialState(config, now), effects: saveEffects() }
  }

  var state = ensureToday(copyState(parsed), now)
  var effects = saveEffects()

  var storedTotal = state.totalMs > 0 ? state.totalMs : durationFor(config, state, state.phase)
  state.totalMs = Math.max(MIN_SESSION_MS, Math.min(storedTotal, MAX_SESSION_MS))

  if (state.running && state.endsAt > now) {
    var left = Math.max(0, state.endsAt - now)
    if (left > state.totalMs) state.totalMs = Math.min(left, MAX_SESSION_MS)
    state.remainingMs = Math.min(left, state.totalMs)
    state.endsAt = now + state.remainingMs
    state.running = true
    state.paused = false
  } else if (state.running) {
    var finished = finishPast(state, config, now)
    state = finished.state
    effects = combineEffects(effects, finished.effects)
  } else {
    state.running = false
    state.paused = state.paused === true
    state.endsAt = 0
    state.remainingMs = state.remainingMs > 0 ? state.remainingMs : state.totalMs
    state.remainingMs = Math.min(state.remainingMs, state.totalMs)

    // Previously idle or ready to begin: adopt the current configured
    // durations, which may have changed since the state was written. A paused
    // session keeps its remaining time.
    if (!state.paused && state.remainingMs >= state.totalMs - 500) {
      if (state.phase === "work") state.sessionMode = state.mode
      state.totalMs = durationFor(config, state, state.phase)
      state.remainingMs = state.totalMs
    }
    if (state.remainingMs <= 0) {
      state.paused = false
      if (state.phase === "work") state.sessionMode = state.mode
      state.totalMs = durationFor(config, state, state.phase)
      state.remainingMs = state.totalMs
    }
  }

  var synced = syncDndAfterLoad(state)
  state = synced.state
  effects = combineEffects(effects, synced.effects)
  effects.save = true
  return { state: state, effects: effects }
}

// ---- Persistence and status -------------------------------------------

function serializeState(state, now) {
  return {
    version: STATE_VERSION,
    mode: state.mode,
    sessionMode: state.sessionMode,
    phase: state.phase,
    running: state.running,
    paused: state.paused,
    dndOwned: state.dndOwned,
    endsAt: state.running ? Math.round(state.endsAt) : 0,
    remainingMs: Math.round(effectiveRemainingMs(state, now)),
    totalMs: Math.round(state.totalMs),
    sessionsToday: state.sessionsToday,
    sessionsDate: state.sessionsDate
  }
}

function statusSnapshot(state, now, label) {
  var progress = progressOf(state, now)
  return {
    mode: state.mode,
    sessionMode: state.sessionMode,
    phase: state.phase,
    running: state.running,
    paused: state.paused,
    remainingMs: Math.round(effectiveRemainingMs(state, now)),
    totalMs: Math.round(state.totalMs),
    progress: Math.round(progress * 100),
    sessionsToday: state.sessionsToday,
    label: label
  }
}

function prepareStoreCommand(stateDir, statePath) {
  return [
    "bash", "-c",
    "umask 077\n" +
    "dir=$1\n" +
    "file=$2\n" +
    "mkdir -p -- \"$dir\" && chmod 700 -- \"$dir\" || exit 1\n" +
    "if [[ -L $file ]]; then rm -f -- \"$file\"; fi\n" +
    "if [[ -f $file ]]; then chmod 600 -- \"$file\"; elif [[ ! -e $file ]]; then : >\"$file\"; fi\n",
    "omarchy-cadence", stateDir, statePath
  ]
}

if (typeof module !== "undefined") {
  module.exports = {
    STATE_VERSION: STATE_VERSION,
    MAX_STATE_MS: MAX_STATE_MS,
    MAX_SESSION_MS: MAX_SESSION_MS,
    MIN_SESSION_MS: MIN_SESSION_MS,
    clampNumber: clampNumber,
    clampInt: clampInt,
    twoDigits: twoDigits,
    padNumber: padNumber,
    formatClock: formatClock,
    dateKey: dateKey,
    defaultConfig: defaultConfig,
    configLimits: configLimits,
    boolValue: boolValue,
    resolveConfig: resolveConfig,
    canonicalMode: canonicalMode,
    normalizedMode: normalizedMode,
    workMinutes: workMinutes,
    breakMinutes: breakMinutes,
    durationFor: durationFor,
    effectiveRemainingMs: effectiveRemainingMs,
    progressOf: progressOf,
    copyState: copyState,
    parseState: parseState,
    noEffects: noEffects,
    saveEffects: saveEffects,
    combineEffects: combineEffects,
    ensureToday: ensureToday,
    initialState: initialState,
    start: start,
    pause: pause,
    reset: reset,
    skipBreak: skipBreak,
    selectMode: selectMode,
    startMode: startMode,
    tick: tick,
    finishPhase: finishPhase,
    finishPast: finishPast,
    applyDndQuery: applyDndQuery,
    syncDndAfterLoad: syncDndAfterLoad,
    applyConfigToState: applyConfigToState,
    resolveLoadedState: resolveLoadedState,
    serializeState: serializeState,
    statusSnapshot: statusSnapshot,
    prepareStoreCommand: prepareStoreCommand
  }
}
