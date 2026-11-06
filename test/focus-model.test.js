"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { Model, at, state, encoded } = require("./support.js")

test("clampNumber falls back for invalid values and clamps the rest", () => {
  assert.equal(Model.clampNumber(5, 7, 0, 10), 5)
  assert.equal(Model.clampNumber(-4, 7, 0, 10), 0)
  assert.equal(Model.clampNumber(40, 7, 0, 10), 10)
  assert.equal(Model.clampNumber("6", 7, 0, 10), 6)
  assert.equal(Model.clampNumber("", 7, 0, 10), 7)
  assert.equal(Model.clampNumber(null, 7, 0, 10), 7)
  assert.equal(Model.clampNumber(true, 7, 0, 10), 7)
  assert.equal(Model.clampNumber(undefined, 7, 0, 10), 7)
  assert.equal(Model.clampNumber(NaN, 7, 0, 10), 7)
  assert.equal(Model.clampNumber(Infinity, 7, 0, 10), 7)
})

test("clampInt rounds the clamped number", () => {
  assert.equal(Model.clampInt(4.4, 0, 0, 10), 4)
  assert.equal(Model.clampInt(4.5, 0, 0, 10), 5)
  assert.equal(Model.clampInt("7.6", 0, 0, 10), 8)
  assert.equal(Model.clampInt(null, 3, 0, 10), 3)
})

test("twoDigits zero-pads single digits", () => {
  assert.equal(Model.twoDigits(0), "00")
  assert.equal(Model.twoDigits(9), "09")
  assert.equal(Model.twoDigits(10), "10")
  assert.equal(Model.twoDigits(123), "123")
})

test("padNumber pads with the locale's zero glyph", () => {
  assert.equal(Model.padNumber(5, (n) => String(n)), "05")
  assert.equal(Model.padNumber(12, (n) => String(n)), "12")
  assert.equal(Model.padNumber(5), "05")
  assert.equal(Model.padNumber(1, (n) => n === 0 ? "٠" : String(n)), "٠1")
})

test("formatClock rounds up to whole seconds and never shows a negative clock", () => {
  assert.equal(Model.formatClock(0), "00:00")
  assert.equal(Model.formatClock(1), "00:01")
  assert.equal(Model.formatClock(999), "00:01")
  assert.equal(Model.formatClock(59999), "01:00")
  assert.equal(Model.formatClock(60000), "01:00")
  assert.equal(Model.formatClock(90 * 60000), "90:00")
  assert.equal(Model.formatClock(100 * 60000), "100:00")
  assert.equal(Model.formatClock(-1), "00:00")
  assert.equal(Model.formatClock(NaN), "00:00")
  assert.equal(Model.formatClock(undefined), "00:00")
})

test("formatClock honors a custom number formatter", () => {
  const format = (n) => n === 0 ? "٠" : String(n)
  assert.equal(Model.formatClock(90000, format), "٠1:30")
  assert.equal(Model.formatClock(0, format), "٠٠:٠٠")
})

test("dateKey is local and zero-pads month and day", () => {
  assert.equal(Model.dateKey(new Date(2026, 0, 5)), "2026-01-05")
  assert.equal(Model.dateKey(new Date(2024, 1, 29)), "2024-02-29")
  assert.equal(Model.dateKey(new Date(2026, 11, 31)), "2026-12-31")
  assert.match(Model.dateKey(), /^\d{4}-\d{2}-\d{2}$/)
})

test("defaultConfig matches the documented defaults", () => {
  assert.deepEqual(Model.defaultConfig(), {
    deepMinutes: 90,
    shortMinutes: 25,
    deepBreakMinutes: 20,
    shortBreakMinutes: 5,
    autoStartBreak: true,
    autoStartWork: false,
    notifications: true
  })
})

test("configLimits match the manifest schema", () => {
  assert.deepEqual(Model.configLimits(), {
    deepMinutes: { min: 15, max: 180, step: 5 },
    shortMinutes: { min: 5, max: 60, step: 5 },
    deepBreakMinutes: { min: 5, max: 45, step: 5 },
    shortBreakMinutes: { min: 1, max: 15, step: 1 }
  })
})

test("boolValue reads the settings spellings and keeps the fallback otherwise", () => {
  assert.equal(Model.boolValue(true, false), true)
  assert.equal(Model.boolValue(false, true), false)
  assert.equal(Model.boolValue("true", false), true)
  assert.equal(Model.boolValue("TRUE", false), true)
  assert.equal(Model.boolValue("1", false), true)
  assert.equal(Model.boolValue("on", false), true)
  assert.equal(Model.boolValue("yes", false), true)
  assert.equal(Model.boolValue("false", true), false)
  assert.equal(Model.boolValue("0", true), false)
  assert.equal(Model.boolValue("off", true), false)
  assert.equal(Model.boolValue("no", true), false)
  assert.equal(Model.boolValue("maybe", true), true)
  assert.equal(Model.boolValue(null, true), true)
  assert.equal(Model.boolValue(undefined, false), false)
})

test("resolveConfig clamps values and reports whether anything changed", () => {
  const current = Model.defaultConfig()
  const unchanged = Model.resolveConfig(current, {})
  assert.equal(unchanged.changed, false)
  assert.deepEqual(unchanged.config, current)

  const clamped = Model.resolveConfig(current, {
    deepMinutes: 1,
    shortMinutes: 999,
    deepBreakMinutes: "30",
    shortBreakMinutes: 0
  })
  assert.equal(clamped.changed, true)
  assert.equal(clamped.config.deepMinutes, 15)
  assert.equal(clamped.config.shortMinutes, 60)
  assert.equal(clamped.config.deepBreakMinutes, 30)
  assert.equal(clamped.config.shortBreakMinutes, 1)

  const booleans = Model.resolveConfig(current, {
    autoStartBreak: "off",
    autoStartWork: "yes",
    notifications: "0"
  })
  assert.equal(booleans.changed, true)
  assert.equal(booleans.config.autoStartBreak, false)
  assert.equal(booleans.config.autoStartWork, true)
  assert.equal(booleans.config.notifications, false)

  const invalid = Model.resolveConfig(current, {
    deepMinutes: "nonsense",
    shortMinutes: null,
    autoStartBreak: "maybe"
  })
  assert.equal(invalid.changed, false)
  assert.deepEqual(invalid.config, current)
})

test("resolveConfig ignores the old pomodoroMinutes key", () => {
  const current = Model.defaultConfig()
  const result = Model.resolveConfig(current, { pomodoroMinutes: 40 })
  assert.equal(result.changed, false)
  assert.equal(result.config.shortMinutes, 25)
})

test("resolveConfig does not mutate the current configuration", () => {
  const current = Model.defaultConfig()
  const snapshot = JSON.parse(JSON.stringify(current))
  Model.resolveConfig(current, { deepMinutes: 45, notifications: false })
  assert.deepEqual(current, snapshot)
})

test("workMinutes and breakMinutes follow the selected work type", () => {
  const config = { deepMinutes: 90, shortMinutes: 25, deepBreakMinutes: 20, shortBreakMinutes: 5 }
  assert.equal(Model.workMinutes(config, "deep"), 90)
  assert.equal(Model.workMinutes(config, "short"), 25)
  assert.equal(Model.breakMinutes(config, "deep"), 20)
  assert.equal(Model.breakMinutes(config, "short"), 5)
  assert.equal(Model.workMinutes(undefined, "deep"), 90)
  assert.equal(Model.workMinutes(undefined, "short"), 25)
  assert.equal(Model.breakMinutes(undefined, "deep"), 20)
  assert.equal(Model.breakMinutes(undefined, "short"), 5)
})

test("durationFor never returns less than a minute", () => {
  const config = Model.defaultConfig()
  assert.equal(Model.durationFor(config, { sessionMode: "deep" }, "work"), 90 * 60000)
  assert.equal(Model.durationFor(config, { sessionMode: "deep" }, "break"), 20 * 60000)
  assert.equal(Model.durationFor(config, { sessionMode: "short" }, "work"), 25 * 60000)
  assert.equal(Model.durationFor(config, { sessionMode: "short" }, "break"), 5 * 60000)
  assert.equal(Model.durationFor({ deepMinutes: 0 }, { sessionMode: "deep" }, "work"), 60000)
})

test("effectiveRemainingMs and progressOf read the right clock", () => {
  const now = at(2026, 0, 15, 12, 0, 0)
  const running = state({ running: true, endsAt: now + 30000, remainingMs: 999999, totalMs: 60000 })
  assert.equal(Model.effectiveRemainingMs(running, now), 30000)
  assert.equal(Model.effectiveRemainingMs(running, now + 60000), 0)
  assert.equal(Model.effectiveRemainingMs(state({ remainingMs: 15000 }), now), 15000)
  assert.equal(Model.progressOf(running, now), 0.5)
  assert.equal(Model.progressOf(state({ remainingMs: 0, totalMs: 0 }), now), 0)
  assert.equal(Model.progressOf(state({ remainingMs: 120000, totalMs: 60000 }), now), 0)
})

test("parseState rejects anything that is not a state object", () => {
  assert.equal(Model.parseState(""), null)
  assert.equal(Model.parseState("not json"), null)
  assert.equal(Model.parseState("null"), null)
  assert.equal(Model.parseState("[]"), null)
  assert.equal(Model.parseState('"string"'), null)
  assert.equal(Model.parseState("42"), null)
  assert.equal(Model.parseState("{}"), null)
})

test("parseState rejects a state file from the old vocabulary", () => {
  assert.equal(Model.parseState(JSON.stringify({ version: 1, mode: "pomodoro" })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: 0 })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: 3 })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: "2" })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: 2, mode: "pomodoro" })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: 2, sessionMode: "pomodoro" })), null)
})

test("parseState fills defaults for a version 2 state", () => {
  assert.deepEqual(Model.parseState(encoded({})), {
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
    sessionsDate: ""
  })
})

test("parseState normalizes modes, phase, booleans, and numbers", () => {
  const parsed = Model.parseState(encoded({
    mode: "short",
    sessionMode: "deep",
    phase: "break",
    running: true,
    paused: true,
    dndOwned: "true",
    endsAt: -5,
    remainingMs: "not a number",
    totalMs: null,
    sessionsToday: 12.6,
    sessionsDate: 42
  }))
  assert.equal(parsed.mode, "short")
  assert.equal(parsed.sessionMode, "deep")
  assert.equal(parsed.phase, "break")
  assert.equal(parsed.running, true)
  assert.equal(parsed.paused, true)
  assert.equal(parsed.dndOwned, false)
  assert.equal(parsed.endsAt, 0)
  assert.equal(parsed.remainingMs, 0)
  assert.equal(parsed.totalMs, 0)
  assert.equal(parsed.sessionsToday, 13)
  assert.equal(parsed.sessionsDate, "")
})

test("parseState clamps wildly out-of-range values", () => {
  const parsed = Model.parseState(encoded({
    endsAt: 1e30,
    remainingMs: 1e30,
    totalMs: 1e30,
    sessionsToday: 1e30
  }))
  assert.equal(parsed.endsAt, Model.MAX_STATE_MS)
  assert.equal(parsed.remainingMs, Model.MAX_STATE_MS)
  assert.equal(parsed.totalMs, Model.MAX_STATE_MS)
  assert.equal(parsed.sessionsToday, 9999)
})

test("parseState infers a paused session from a partial remaining time", () => {
  const paused = Model.parseState(encoded({ running: false, remainingMs: 1000, totalMs: 5000 }))
  assert.equal(paused.paused, true)

  const ready = Model.parseState(encoded({ running: false, remainingMs: 5000, totalMs: 5000 }))
  assert.equal(ready.paused, false)

  const nearDone = Model.parseState(encoded({ running: false, remainingMs: 4600, totalMs: 5000 }))
  assert.equal(nearDone.paused, false)
})

test("parseState lets an explicit paused flag win over inference", () => {
  assert.equal(Model.parseState(encoded({ running: false, paused: false, remainingMs: 1000, totalMs: 5000 })).paused, false)
  assert.equal(Model.parseState(encoded({ running: false, paused: true, remainingMs: 5000, totalMs: 5000 })).paused, true)
})

test("parseState only accepts strict running and DND booleans", () => {
  const parsed = Model.parseState(encoded({ running: "true", dndOwned: 1 }))
  assert.equal(parsed.running, false)
  assert.equal(parsed.dndOwned, false)
  assert.equal(parsed.paused, false)
})

test("serializeState writes the versioned state and rounds milliseconds", () => {
  const now = at(2026, 0, 15, 12, 0, 0)
  const running = state({
    mode: "short",
    sessionMode: "deep",
    phase: "break",
    running: true,
    paused: false,
    dndOwned: true,
    endsAt: now + 12345.6,
    remainingMs: 1,
    totalMs: 20000.4,
    sessionsToday: 3,
    sessionsDate: "2026-01-15"
  })
  assert.deepEqual(Model.serializeState(running, now), {
    version: 2,
    mode: "short",
    sessionMode: "deep",
    phase: "break",
    running: true,
    paused: false,
    dndOwned: true,
    endsAt: Math.round(now + 12345.6),
    remainingMs: 12346,
    totalMs: 20000,
    sessionsToday: 3,
    sessionsDate: "2026-01-15"
  })

  const idle = Model.serializeState(state({ running: false, endsAt: 999, remainingMs: 4321.2, totalMs: 5000 }), now)
  assert.equal(idle.endsAt, 0)
  assert.equal(idle.remainingMs, 4321)
})

test("serializeState and parseState round-trip a session", () => {
  const now = at(2026, 0, 15, 12, 0, 0)
  const original = state({
    mode: "short",
    sessionMode: "short",
    phase: "work",
    paused: true,
    remainingMs: 1250000,
    totalMs: 1500000,
    sessionsToday: 4,
    sessionsDate: "2026-01-15"
  })
  const roundTrip = Model.parseState(JSON.stringify(Model.serializeState(original, now)))
  assert.deepEqual(roundTrip, original)
})

test("statusSnapshot reports the same shape as the IPC status", () => {
  const now = at(2026, 0, 15, 12, 0, 0)
  const running = state({
    mode: "short",
    sessionMode: "short",
    running: true,
    endsAt: now + 7500,
    totalMs: 15000,
    sessionsToday: 2
  })
  assert.deepEqual(Model.statusSnapshot(running, now, "Short Focus"), {
    mode: "short",
    sessionMode: "short",
    phase: "work",
    running: true,
    paused: false,
    remainingMs: 7500,
    totalMs: 15000,
    progress: 50,
    sessionsToday: 2,
    label: "Short Focus"
  })
})
