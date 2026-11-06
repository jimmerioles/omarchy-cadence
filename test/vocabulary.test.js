"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../FocusModel.js")
const { state, config, NOW } = require("./support.js")

const ROOT = path.join(__dirname, "..")
const PRODUCTION_FILES = ["FocusModel.js", "Service.qml", "Panel.qml", "BarWidget.qml"]

test("the timer has exactly two canonical session types", () => {
  assert.deepEqual(Object.keys(Model.configLimits()).sort(), [
    "deepBreakMinutes",
    "deepMinutes",
    "shortBreakMinutes",
    "shortMinutes"
  ])
  assert.deepEqual(Object.keys(Model.defaultConfig()).sort(), [
    "autoStartBreak",
    "autoStartWork",
    "deepBreakMinutes",
    "deepMinutes",
    "notifications",
    "shortBreakMinutes",
    "shortMinutes"
  ])
  assert.equal(Model.STATE_VERSION, 2)
})

test("the old method names are not session identifiers", () => {
  assert.equal(Model.canonicalMode("deep"), "deep")
  assert.equal(Model.canonicalMode("short"), "short")
  assert.equal(Model.canonicalMode("ultradian"), null)
  assert.equal(Model.canonicalMode("pomodoro"), null)
  assert.equal(Model.normalizedMode("ultradian", "short"), "short")
  assert.equal(Model.normalizedMode("pomodoro", "deep"), "deep")
})

test("the old vocabulary is absent from production code", () => {
  const forbidden = [
    "pomodoroMinutes",
    "panel.shortWork",
    "panel.startShortWork",
    "panel.ultradianChip",
    "panel.pomodoroChip",
    "panel.ultradianHint",
    "panel.pomodoroHint",
    "notify.pomodoroDone"
  ]

  for (const file of PRODUCTION_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${file} still mentions ${token}`)
    }
  }
})

test("production QML and JS do not use method names as mode literals", () => {
  for (const file of ["FocusModel.js", "Service.qml", "Panel.qml"]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    assert.equal(source.includes('"pomodoro"'), false, `${file} still uses the pomodoro mode`)
    assert.equal(source.includes('"ultradian"'), false, `${file} still uses the ultradian mode`)
  }
})

test("the old settings key is ignored", () => {
  const result = Model.resolveConfig(Model.defaultConfig(), { pomodoroMinutes: 40 })
  assert.equal(result.changed, false)
  assert.equal(result.config.shortMinutes, 25)
})

test("mode selection only accepts deep and short", () => {
  const current = state()
  for (const value of ["pomodoro", "ultradian", "garbage"]) {
    const result = Model.selectMode(current, config(), value)
    assert.deepEqual(result.state, current)
    assert.equal(result.effects.save, false)
  }
  assert.equal(Model.selectMode(current, config(), "short").state.mode, "short")
})

test("state files are version 2 only", () => {
  const serialized = JSON.stringify(Model.serializeState(state(), NOW))
  assert.equal(JSON.parse(serialized).version, 2)
  assert.equal(Model.parseState(serialized).mode, "deep")
  assert.equal(Model.parseState(JSON.stringify({ version: 1, mode: "deep" })), null)
  assert.equal(Model.parseState(JSON.stringify({ version: 2, mode: "pomodoro" })), null)
})
