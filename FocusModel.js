.pragma library

// Pure helpers for the Focus timer. State parsing validates everything that
// comes back from disk, so a hand-edited or truncated state file can only ever
// produce a reset timer, never a bad duration or an unsafe display value.

function clampNumber(value, fallback, min, max) {
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

function parseState(raw) {
  var parsed
  try {
    parsed = JSON.parse(String(raw || ""))
  } catch (e) {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  return {
    mode: parsed.mode === "pomodoro" ? "pomodoro" : "deep",
    phase: parsed.phase === "break" ? "break" : "work",
    running: parsed.running === true,
    endsAt: clampNumber(parsed.endsAt, 0, 0, 8640000000000000),
    remainingMs: clampNumber(parsed.remainingMs, 0, 0, 8640000000000000),
    totalMs: clampNumber(parsed.totalMs, 0, 0, 8640000000000000),
    sessionsToday: clampInt(parsed.sessionsToday, 0, 0, 9999),
    sessionsDate: typeof parsed.sessionsDate === "string" ? parsed.sessionsDate : ""
  }
}
