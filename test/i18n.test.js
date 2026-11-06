"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const QML_FILES = ["BarWidget.qml", "Panel.qml", "Service.qml"]
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/en.json"), "utf8"))

function usedKeys() {
  const keys = new Set()
  for (const file of QML_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    for (const match of source.matchAll(/strings\.(?:t|tn)\(\s*"([^"]+)"/g)) keys.add(match[1])
  }
  return keys
}

test("the English catalog parses as an object", () => {
  assert.equal(catalog !== null && typeof catalog === "object" && !Array.isArray(catalog), true)
  assert(Object.keys(catalog).length > 0)
})

test("every string used by the QML has a catalog entry", () => {
  const missing = [...usedKeys()].filter((key) => !(key in catalog)).sort()
  assert.deepEqual(missing, [], "add the missing keys to i18n/en.json")
})

test("the catalog has no unused keys", () => {
  const used = usedKeys()
  const dead = Object.keys(catalog).filter((key) => !used.has(key)).sort()
  assert.deepEqual(dead, [], "remove unused keys or use them in the QML")
})

test("catalog keys follow the plugin's namespace pattern", () => {
  for (const key of Object.keys(catalog)) {
    assert.match(key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/, `${key} is not a namespaced key`)
  }
})

test("catalog values are non-empty strings or complete plural objects", () => {
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "string") {
      assert(value.length > 0, `${key} must not be empty`)
      continue
    }

    assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, `${key} must be a string or plural object`)
    for (const form of ["one", "other"]) {
      assert.equal(typeof value[form], "string", `${key}.${form} must be a string`)
      assert(value[form].length > 0, `${key}.${form} must not be empty`)
    }
    assert.deepEqual(Object.keys(value).sort(), ["one", "other"], `${key} must only define the forms the plugin uses`)
  }
})

test("the catalog has no legacy session-type keys", () => {
  for (const key of [
    "panel.shortWork",
    "panel.startShortWork",
    "panel.ultradianChip",
    "panel.pomodoroChip",
    "panel.ultradianHint",
    "panel.pomodoroHint",
    "notify.pomodoroDone"
  ]) {
    assert.equal(key in catalog, false, `${key} must not survive the vocabulary refactor`)
  }
})

test("session types label the UI while methods explain the choice", () => {
  assert.match(catalog["panel.deep"], /^Deep Focus$/)
  assert.match(catalog["panel.short"], /^Short Focus$/)
  assert.match(catalog["panel.deepChip"], /^Deep Focus · %1 min$/)
  assert.match(catalog["panel.shortChip"], /^Short Focus · %1 min$/)
  assert.match(catalog["panel.startDeep"], /^Start deep focus$/)
  assert.match(catalog["panel.startShort"], /^Start short focus$/)
  assert.match(catalog["notify.deepDone"], /^Deep Focus complete/)
  assert.match(catalog["notify.shortDone"], /^Short Focus complete/)

  assert.match(catalog["panel.deepHint"], /^Ultradian/)
  assert.match(catalog["panel.shortHint"], /^Pomodoro/)
  assert.doesNotMatch(catalog["panel.deep"], /Ultradian|Pomodoro/)
  assert.doesNotMatch(catalog["panel.short"], /Ultradian|Pomodoro/)
})

test("the session count is pluralized", () => {
  assert.equal(typeof catalog["panel.sessionCount"], "object")
  assert.equal(catalog["panel.sessionCount"].one, "%1 session")
  assert.equal(catalog["panel.sessionCount"].other, "%1 sessions")
})
