"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { Model, CONFIG, NOW, at, state, config, effects } = require("./support.js")

test("initialState is a ready Deep Focus block", () => {
  const initial = Model.initialState(CONFIG, NOW)
  assert.equal(initial.mode, "deep")
  assert.equal(initial.sessionMode, "deep")
  assert.equal(initial.phase, "work")
  assert.equal(initial.running, false)
  assert.equal(initial.paused, false)
  assert.equal(initial.dndOwned, false)
  assert.equal(initial.endsAt, 0)
  assert.equal(initial.totalMs, 90 * 60000)
  assert.equal(initial.remainingMs, 90 * 60000)
  assert.equal(initial.sessionsToday, 0)
  assert.equal(initial.sessionsDate, Model.dateKey(new Date(NOW)))
})

test("start begins a fresh work session in the selected mode", () => {
  const result = Model.start(state({ mode: "short" }), CONFIG, NOW)
  assert.equal(result.state.running, true)
  assert.equal(result.state.paused, false)
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.remainingMs, 25 * 60000)
  assert.equal(result.state.endsAt, NOW + 25 * 60000)
  assert.deepEqual(result.effects, effects({ dnd: "query", save: true, stopHistoryReplay: true }))
})

test("start re-asserts DND when Focus already owns it", () => {
  const result = Model.start(state({ dndOwned: true }), CONFIG, NOW)
  assert.deepEqual(result.effects, effects({ dnd: "on", save: true, stopHistoryReplay: true }))
})

test("start resumes a paused work session without changing its length", () => {
  const paused = state({
    mode: "deep",
    sessionMode: "short",
    paused: true,
    totalMs: 25 * 60000,
    remainingMs: 10 * 60000
  })
  const result = Model.start(paused, CONFIG, NOW)
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.remainingMs, 10 * 60000)
  assert.equal(result.state.endsAt, NOW + 10 * 60000)
  assert.equal(result.state.running, true)
  assert.equal(result.state.paused, false)
})

test("start begins a break without touching DND", () => {
  const result = Model.start(state({ phase: "break", sessionMode: "short", totalMs: 5 * 60000, remainingMs: 5 * 60000 }), CONFIG, NOW)
  assert.equal(result.state.running, true)
  assert.equal(result.state.totalMs, 5 * 60000)
  assert.equal(result.state.endsAt, NOW + 5 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("start repairs a nonsensical remaining time", () => {
  const result = Model.start(state({ totalMs: 60000, remainingMs: 120000 }), CONFIG, NOW)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.remainingMs, 90 * 60000)
  assert.equal(result.state.endsAt, NOW + 90 * 60000)
})

test("start rolls the session count over on a new day", () => {
  const result = Model.start(state({ sessionsDate: "2020-01-01", sessionsToday: 7 }), CONFIG, NOW)
  assert.equal(result.state.sessionsDate, Model.dateKey(new Date(NOW)))
  assert.equal(result.state.sessionsToday, 0)
  assert.equal(result.effects.save, true)
})

test("start is a no-op while already running", () => {
  const running = state({ running: true, endsAt: NOW + 1000, totalMs: 5000, remainingMs: 5000 })
  const result = Model.start(running, CONFIG, NOW)
  assert.equal(result.state, running)
  assert.deepEqual(result.effects, effects())
})

test("pause stores the wall-clock remainder and stops the clock", () => {
  const running = state({ running: true, endsAt: NOW + 30000, totalMs: 60000, remainingMs: 60000 })
  const result = Model.pause(running, CONFIG, NOW)
  assert.equal(result.state.running, false)
  assert.equal(result.state.paused, true)
  assert.equal(result.state.remainingMs, 30000)
  assert.equal(result.state.endsAt, 0)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("pause at the deadline finishes the phase instead", () => {
  const running = state({ running: true, endsAt: NOW, totalMs: 60000, remainingMs: 60000 })
  const result = Model.pause(running, config({ autoStartBreak: false }), NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.sessionsToday, 1)
  assert.equal(result.state.running, false)
})

test("pause is a no-op when the timer is not running", () => {
  const idle = state({ paused: true, remainingMs: 1000 })
  const result = Model.pause(idle, CONFIG, NOW)
  assert.equal(result.state, idle)
  assert.deepEqual(result.effects, effects())
})

test("reset returns a work session to the queued mode and releases DND", () => {
  const running = state({
    mode: "short",
    sessionMode: "deep",
    running: true,
    dndOwned: true,
    endsAt: NOW + 10000,
    totalMs: 90 * 60000,
    remainingMs: 90 * 60000
  })
  const result = Model.reset(running, CONFIG)
  assert.equal(result.state.running, false)
  assert.equal(result.state.paused, false)
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.remainingMs, 25 * 60000)
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects({ dnd: "off", save: true }))
})

test("reset leaves a user-owned DND alone when Focus never owned it", () => {
  const result = Model.reset(state({ phase: "work", dndOwned: false }), CONFIG)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("reset restarts the break without changing the break type", () => {
  const result = Model.reset(state({ phase: "break", sessionMode: "short", totalMs: 5 * 60000, remainingMs: 1000 }), CONFIG)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 5 * 60000)
  assert.equal(result.state.remainingMs, 5 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("skipBreak returns to a ready work block in the queued mode", () => {
  const result = Model.skipBreak(state({ phase: "break", mode: "short", sessionMode: "deep" }), CONFIG)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.running, false)
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.remainingMs, 25 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("skipBreak is a no-op during work", () => {
  const work = state()
  const result = Model.skipBreak(work, CONFIG)
  assert.equal(result.state, work)
  assert.deepEqual(result.effects, effects())
})

test("selectMode applies a new mode to an idle work session", () => {
  const result = Model.selectMode(state(), CONFIG, "short")
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.remainingMs, 25 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("selectMode queues a mode while work is running", () => {
  const running = state({ running: true, endsAt: NOW + 10000, totalMs: 90 * 60000, remainingMs: 90 * 60000 })
  const result = Model.selectMode(running, CONFIG, "short")
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.running, true)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("selectMode queues a mode while work is paused", () => {
  const paused = state({ paused: true, totalMs: 90 * 60000, remainingMs: 10 * 60000 })
  const result = Model.selectMode(paused, CONFIG, "short")
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.paused, true)
})

test("selectMode queues a mode during a break without changing the break", () => {
  const breakState = state({ phase: "break", sessionMode: "deep", totalMs: 20 * 60000, remainingMs: 20 * 60000 })
  const result = Model.selectMode(breakState, CONFIG, "short")
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.totalMs, 20 * 60000)
  assert.equal(result.state.phase, "break")
})

test("selectMode repairs an idle work session whose sessionMode drifted", () => {
  const drifted = state({ mode: "deep", sessionMode: "short", phase: "work" })
  const result = Model.selectMode(drifted, CONFIG, "deep")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("selectMode ignores the same mode when there is nothing to repair", () => {
  const current = state()
  const result = Model.selectMode(current, CONFIG, "deep")
  assert.deepEqual(result.state, current)
  assert.deepEqual(result.effects, effects())
})

test("selectMode rejects unknown modes", () => {
  const current = state()
  const result = Model.selectMode(current, CONFIG, "garbage")
  assert.equal(result.state, current)
  assert.deepEqual(result.effects, effects())
})

test("selectMode rejects the old method names", () => {
  const current = state()
  for (const value of ["pomodoro", "ultradian"]) {
    const result = Model.selectMode(current, CONFIG, value)
    assert.equal(result.state, current)
    assert.deepEqual(result.effects, effects())
  }
})

test("startMode starts a fresh work block when idle", () => {
  const result = Model.startMode(state(), CONFIG, "short", NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.running, true)
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.equal(result.state.endsAt, NOW + 25 * 60000)
})

test("startMode queues instead of destroying a running work block", () => {
  const running = state({ running: true, mode: "deep", sessionMode: "deep", endsAt: NOW + 10000, totalMs: 90 * 60000, remainingMs: 90 * 60000 })
  const result = Model.startMode(running, CONFIG, "short", NOW)
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.running, true)
  assert.equal(result.state.totalMs, 90 * 60000)
})

test("startMode queues instead of destroying a paused work block", () => {
  const paused = state({ paused: true, mode: "deep", sessionMode: "deep", totalMs: 90 * 60000, remainingMs: 10 * 60000 })
  const result = Model.startMode(paused, CONFIG, "short", NOW)
  assert.equal(result.state.mode, "short")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.paused, true)
  assert.equal(result.state.remainingMs, 10 * 60000)
})

test("startMode gives way to a requested work block during a break", () => {
  const breakState = state({ phase: "break", sessionMode: "short", totalMs: 5 * 60000, remainingMs: 5 * 60000 })
  const result = Model.startMode(breakState, CONFIG, "deep", NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.running, true)
  assert.equal(result.state.totalMs, 90 * 60000)
})

test("startMode rejects unknown modes", () => {
  const current = state()
  const result = Model.startMode(current, CONFIG, "garbage", NOW)
  assert.equal(result.state, current)
  assert.deepEqual(result.effects, effects())
})

test("startMode rejects the old method names", () => {
  const current = state()
  for (const value of ["pomodoro", "ultradian"]) {
    const result = Model.startMode(current, CONFIG, value, NOW)
    assert.equal(result.state, current)
    assert.deepEqual(result.effects, effects())
  }
})

test("finishPhase turns a work block into a ready break", () => {
  const running = state({
    running: true,
    dndOwned: true,
    endsAt: NOW,
    totalMs: 90 * 60000,
    remainingMs: 0,
    sessionsToday: 2
  })
  const result = Model.finishPhase(running, config({ autoStartBreak: false }), NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.running, false)
  assert.equal(result.state.paused, false)
  assert.equal(result.state.totalMs, 20 * 60000)
  assert.equal(result.state.remainingMs, 20 * 60000)
  assert.equal(result.state.sessionsToday, 3)
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects({
    dnd: "off",
    replayHistory: true,
    notify: "workDone",
    save: true
  }))
})

test("finishPhase does not touch a DND it never owned", () => {
  const running = state({ running: true, dndOwned: false, endsAt: NOW })
  const result = Model.finishPhase(running, config({ autoStartBreak: false }), NOW)
  assert.deepEqual(result.effects, effects({ notify: "workDone", save: true }))
})

test("finishPhase auto-starts the break when configured", () => {
  const running = state({ running: true, endsAt: NOW, totalMs: 90 * 60000, remainingMs: 0 })
  const result = Model.finishPhase(running, CONFIG, NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.running, true)
  assert.equal(result.state.endsAt, NOW + 20 * 60000)
  assert.equal(result.state.totalMs, 20 * 60000)
  assert.deepEqual(result.effects, effects({ notify: "workDone", save: true }))
})

test("finishPhase turns a break into a ready work block", () => {
  const running = state({ phase: "break", sessionMode: "deep", running: true, endsAt: NOW, totalMs: 20 * 60000 })
  const result = Model.finishPhase(running, config({ autoStartWork: false }), NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.running, false)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.remainingMs, 90 * 60000)
  assert.deepEqual(result.effects, effects({ notify: "breakDone", save: true }))
})

test("finishPhase auto-starts the next work block when configured", () => {
  const running = state({ phase: "break", sessionMode: "short", running: true, endsAt: NOW, totalMs: 5 * 60000 })
  const result = Model.finishPhase(running, config({ autoStartWork: true }), NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.running, true)
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.endsAt, NOW + 90 * 60000)
  assert.deepEqual(result.effects, effects({ dnd: "query", notify: "breakDone", save: true, stopHistoryReplay: true }))
})

test("finishPhase rolls the session count over before counting the completed work", () => {
  const running = state({
    running: true,
    endsAt: NOW,
    sessionsToday: 8,
    sessionsDate: "2020-01-01"
  })
  const result = Model.finishPhase(running, config({ autoStartBreak: false }), NOW)
  assert.equal(result.state.sessionsToday, 1)
  assert.equal(result.state.sessionsDate, Model.dateKey(new Date(NOW)))
})

test("finishPhase is a no-op when the timer is not running", () => {
  const idle = state({ phase: "work" })
  const result = Model.finishPhase(idle, CONFIG, NOW)
  assert.equal(result.state, idle)
  assert.deepEqual(result.effects, effects())
})

test("finishPast completes a work block silently", () => {
  const past = state({ running: true, dndOwned: true, endsAt: NOW - 1, totalMs: 90 * 60000, sessionsToday: 2 })
  const result = Model.finishPast(past, CONFIG, NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.running, false)
  assert.equal(result.state.sessionsToday, 3)
  assert.equal(result.state.dndOwned, false)
  assert.equal(result.state.totalMs, 20 * 60000)
  assert.deepEqual(result.effects, effects({ dnd: "off", save: true }))
})

test("finishPast turns a past break into a ready work block", () => {
  const past = state({ phase: "break", sessionMode: "short", running: true, dndOwned: true, endsAt: NOW - 1 })
  const result = Model.finishPast(past, CONFIG, NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.running, false)
  assert.equal(result.state.dndOwned, true)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("finishPast never sends a notification", () => {
  const result = Model.finishPast(state({ running: true, endsAt: NOW - 1 }), CONFIG, NOW)
  assert.equal(result.effects.notify, null)
  assert.equal(result.effects.replayHistory, false)
})

test("tick only finishes a running session at or past its deadline", () => {
  const idle = state()
  assert.equal(Model.tick(idle, CONFIG, NOW).effects.save, false)

  const running = state({ running: true, endsAt: NOW + 1 })
  assert.equal(Model.tick(running, CONFIG, NOW).effects.save, false)

  const due = state({ running: true, endsAt: NOW })
  const result = Model.tick(due, config({ autoStartBreak: false }), NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.effects.notify, "workDone")
})

test("applyConfigToState follows a new duration for an idle session", () => {
  const result = Model.applyConfigToState(state({ mode: "short", sessionMode: "deep" }), config({ shortMinutes: 30 }))
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 30 * 60000)
  assert.equal(result.state.remainingMs, 30 * 60000)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("applyConfigToState updates a ready break without changing its type", () => {
  const result = Model.applyConfigToState(state({ phase: "break", sessionMode: "short", totalMs: 5 * 60000 }), config({ shortBreakMinutes: 7 }))
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.sessionMode, "short")
  assert.equal(result.state.totalMs, 7 * 60000)
  assert.equal(result.state.remainingMs, 7 * 60000)
})

test("applyConfigToState leaves a running or paused session alone", () => {
  const running = state({ running: true, endsAt: NOW + 10000, totalMs: 90 * 60000, remainingMs: 90 * 60000 })
  const runningResult = Model.applyConfigToState(running, config({ deepMinutes: 45 }))
  assert.equal(runningResult.state.totalMs, 90 * 60000)
  assert.deepEqual(runningResult.effects, effects())

  const paused = state({ paused: true, totalMs: 90 * 60000, remainingMs: 10000 })
  const pausedResult = Model.applyConfigToState(paused, config({ deepMinutes: 45 }))
  assert.equal(pausedResult.state.totalMs, 90 * 60000)
  assert.deepEqual(pausedResult.effects, effects())
})

test("resolveLoadedState resets a missing or corrupt state", () => {
  const result = Model.resolveLoadedState(null, CONFIG, NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.running, false)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.sessionsDate, Model.dateKey(new Date(NOW)))
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("resolveLoadedState resumes a session from its wall-clock deadline", () => {
  const parsed = {
    mode: "short",
    sessionMode: "short",
    phase: "work",
    running: true,
    dndOwned: false,
    endsAt: NOW + 10 * 60000,
    remainingMs: 1500000,
    totalMs: 25 * 60000,
    sessionsToday: 2,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.running, true)
  assert.equal(result.state.paused, false)
  assert.equal(result.state.remainingMs, 10 * 60000)
  assert.equal(result.state.endsAt, NOW + 10 * 60000)
  assert.equal(result.state.totalMs, 25 * 60000)
  assert.deepEqual(result.effects, effects({ dnd: "query", save: true }))
})

test("resolveLoadedState re-asserts owned DND for a resumed work session", () => {
  const parsed = {
    phase: "work",
    running: true,
    dndOwned: true,
    endsAt: NOW + 1000,
    totalMs: 60000,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.dndOwned, true)
  assert.deepEqual(result.effects, effects({ dnd: "on", save: true }))
})

test("resolveLoadedState grows the total when the remaining time outlived it", () => {
  const parsed = {
    phase: "work",
    sessionMode: "deep",
    running: true,
    endsAt: NOW + 2 * 60 * 60 * 1000,
    totalMs: 60000,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.totalMs, 2 * 60 * 60 * 1000)
  assert.equal(result.state.remainingMs, 2 * 60 * 60 * 1000)
})

test("resolveLoadedState silently finishes a work session that ended while the shell was down", () => {
  const parsed = {
    phase: "work",
    running: true,
    dndOwned: true,
    endsAt: NOW - 1,
    totalMs: 90 * 60000,
    sessionsToday: 1,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, config({ autoStartBreak: false }), NOW)
  assert.equal(result.state.phase, "break")
  assert.equal(result.state.running, false)
  assert.equal(result.state.sessionsToday, 2)
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects({ dnd: "off", save: true }))
})

test("resolveLoadedState silently finishes a break that ended while the shell was down", () => {
  const parsed = {
    phase: "break",
    sessionMode: "short",
    running: true,
    dndOwned: true,
    endsAt: NOW - 1,
    totalMs: 5 * 60000,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.phase, "work")
  assert.equal(result.state.running, false)
  assert.equal(result.state.sessionMode, "deep")
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects({ dnd: "off", save: true }))
})

test("resolveLoadedState keeps a paused session's remaining time", () => {
  const parsed = {
    phase: "work",
    sessionMode: "deep",
    running: false,
    paused: true,
    remainingMs: 10 * 60000,
    totalMs: 90 * 60000,
    dndOwned: true,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, config({ deepMinutes: 45 }), NOW)
  assert.equal(result.state.paused, true)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.remainingMs, 10 * 60000)
  assert.deepEqual(result.effects, effects({ dnd: "on", save: true }))
})

test("resolveLoadedState adopts changed durations for a ready session", () => {
  const parsed = {
    phase: "work",
    sessionMode: "deep",
    running: false,
    paused: false,
    remainingMs: 90 * 60000,
    totalMs: 90 * 60000,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, config({ deepMinutes: 45 }), NOW)
  assert.equal(result.state.totalMs, 45 * 60000)
  assert.equal(result.state.remainingMs, 45 * 60000)
})

test("resolveLoadedState repairs a zero remaining time", () => {
  const parsed = {
    phase: "work",
    running: false,
    paused: false,
    remainingMs: 0,
    totalMs: 90 * 60000,
    sessionsDate: Model.dateKey(new Date(NOW))
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.paused, false)
  assert.equal(result.state.totalMs, 90 * 60000)
  assert.equal(result.state.remainingMs, 90 * 60000)
})

test("resolveLoadedState rolls the session count over on a new day", () => {
  const parsed = {
    phase: "work",
    running: false,
    remainingMs: 90 * 60000,
    totalMs: 90 * 60000,
    sessionsToday: 6,
    sessionsDate: "2020-01-01"
  }
  const result = Model.resolveLoadedState(parsed, CONFIG, NOW)
  assert.equal(result.state.sessionsToday, 0)
  assert.equal(result.state.sessionsDate, Model.dateKey(new Date(NOW)))
})

test("applyDndQuery claims DND when Omarchy reports it off", () => {
  const running = state({ running: true, dndOwned: false, endsAt: NOW + 1000 })
  const result = Model.applyDndQuery(running, "off\n")
  assert.equal(result.state.dndOwned, true)
  assert.deepEqual(result.effects, effects({ dnd: "on", save: true }))
})

test("applyDndQuery leaves a user-owned DND alone", () => {
  const running = state({ running: true, dndOwned: false, endsAt: NOW + 1000 })
  const result = Model.applyDndQuery(running, "on")
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects())
})

test("applyDndQuery clears stale ownership when Omarchy reports DND on", () => {
  const running = state({ running: true, dndOwned: true, endsAt: NOW + 1000 })
  const result = Model.applyDndQuery(running, "on")
  assert.equal(result.state.dndOwned, false)
  assert.deepEqual(result.effects, effects({ save: true }))
})

test("applyDndQuery ignores unknown answers and inactive sessions", () => {
  const idle = state({ running: false, dndOwned: false })
  assert.deepEqual(Model.applyDndQuery(idle, "off").effects, effects())
  assert.deepEqual(Model.applyDndQuery(idle, "on").effects, effects())
  assert.deepEqual(Model.applyDndQuery(state({ running: true, endsAt: NOW + 1000 }), "maybe").effects, effects())
  assert.deepEqual(Model.applyDndQuery(state({ phase: "break", running: true, endsAt: NOW + 1000 }), "off").effects, effects())
})

test("syncDndAfterLoad keeps DND on for a running or paused work session", () => {
  const running = Model.syncDndAfterLoad(state({ running: true, dndOwned: true, endsAt: NOW + 1000 }))
  assert.equal(running.state.dndOwned, true)
  assert.deepEqual(running.effects, effects({ dnd: "on" }))

  const paused = Model.syncDndAfterLoad(state({ paused: true, dndOwned: true }))
  assert.equal(paused.state.dndOwned, true)
  assert.deepEqual(paused.effects, effects({ dnd: "on" }))
})

test("syncDndAfterLoad releases DND for an inactive work or break session", () => {
  const idle = Model.syncDndAfterLoad(state({ dndOwned: true }))
  assert.equal(idle.state.dndOwned, false)
  assert.deepEqual(idle.effects, effects({ dnd: "off", save: true }))

  const breakState = Model.syncDndAfterLoad(state({ phase: "break", dndOwned: true }))
  assert.equal(breakState.state.dndOwned, false)
  assert.deepEqual(breakState.effects, effects({ dnd: "off", save: true }))
})

test("syncDndAfterLoad queries an unowned running work session", () => {
  const result = Model.syncDndAfterLoad(state({ running: true, dndOwned: false, endsAt: NOW + 1000 }))
  assert.deepEqual(result.effects, effects({ dnd: "query" }))

  const breakState = Model.syncDndAfterLoad(state({ phase: "break", running: true, dndOwned: false, endsAt: NOW + 1000 }))
  assert.deepEqual(breakState.effects, effects())
})

test("transitions do not mutate their input state", () => {
  const original = state({
    mode: "short",
    sessionMode: "deep",
    running: true,
    dndOwned: true,
    endsAt: NOW + 5000,
    totalMs: 90 * 60000,
    remainingMs: 90 * 60000,
    sessionsToday: 2
  })
  const snapshot = JSON.parse(JSON.stringify(original))
  Model.start(original, CONFIG, NOW)
  Model.pause(original, CONFIG, NOW)
  Model.reset(original, CONFIG)
  Model.selectMode(original, CONFIG, "deep")
  Model.finishPhase(original, CONFIG, NOW)
  Model.applyDndQuery(original, "off")
  assert.deepEqual(original, snapshot)
})
