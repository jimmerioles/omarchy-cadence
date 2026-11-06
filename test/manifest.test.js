"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../FocusModel.js")

const ROOT = path.join(__dirname, "..")
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))

const KIND_ENTRY_POINTS = {
  "bar-widget": "barWidget",
  "service": "service"
}

function filesUnder(directory, relative) {
  const rows = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const full = path.join(directory, entry.name)
    const rel = path.join(relative || "", entry.name)
    const stat = fs.lstatSync(full)
    if (stat.isSymbolicLink()) {
      rows.push({ path: rel, link: true })
    } else if (stat.isDirectory()) {
      rows.push(...filesUnder(full, rel))
    } else {
      rows.push({ path: rel, link: false })
    }
  }
  return rows
}

test("manifest uses the current schema and a namespaced id", () => {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.id, "jimmerioles.focus")
  assert.match(manifest.id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  assert(!manifest.id.startsWith("omarchy."), "third-party ids may not use the reserved namespace")
  assert(!manifest.id.includes(".."), "plugin id must stay safe as a directory name")
})

test("manifest has the publishing metadata the marketplace requires", () => {
  for (const field of ["name", "version", "author", "license", "description"]) {
    assert.equal(typeof manifest[field], "string", `${field} must be a string`)
    assert(manifest[field].length > 0, `${field} must not be empty`)
  }
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.license, "MIT")
})

test("manifest kinds are unique and agree with the entry points", () => {
  assert(Array.isArray(manifest.kinds))
  assert(manifest.kinds.length > 0)
  assert.equal(new Set(manifest.kinds).size, manifest.kinds.length)
  assert.deepEqual([...manifest.kinds].sort(), ["bar-widget", "service"])

  assert.equal(typeof manifest.entryPoints, "object")
  assert.deepEqual(Object.keys(manifest.entryPoints).sort(), ["barWidget", "service"])

  for (const kind of manifest.kinds) {
    const key = KIND_ENTRY_POINTS[kind]
    assert(key, `unsupported plugin kind ${kind}`)
    assert.equal(typeof manifest.entryPoints[key], "string", `${kind} needs an entry point`)
  }
})

test("every entry point is a safe relative path that exists", () => {
  for (const [key, value] of Object.entries(manifest.entryPoints)) {
    assert.equal(typeof value, "string", `${key} must be a string`)
    assert(value.length > 0, `${key} must not be empty`)
    assert(!path.isAbsolute(value), `${key} must be relative`)
    assert(!value.split(/[\\/]+/).includes(".."), `${key} must stay inside the plugin`)
    assert(!value.includes("\n"), `${key} must not contain a newline`)
    assert.equal(fs.existsSync(path.join(ROOT, value)), true, `${key} file must exist: ${value}`)
    assert.equal(fs.statSync(path.join(ROOT, value)).isFile(), true, `${key} must point at a file`)
  }
})

test("the bar widget metadata is complete and valid", () => {
  const widget = manifest.barWidget
  assert.equal(typeof widget, "object")
  for (const field of ["displayName", "description", "category"]) {
    assert.equal(typeof widget[field], "string", `barWidget.${field} must be a string`)
    assert(widget[field].length > 0, `barWidget.${field} must not be empty`)
  }
  assert.equal(typeof widget.allowMultiple, "boolean")
  assert.equal(widget.allowMultiple, false)
  assert(
    ["left", "centerBegin", "center", "centerEnd", "tray", "right"].includes(widget.defaultSection),
    "barWidget.defaultSection must be a section the registry accepts"
  )
})

test("manifest defaults match the code's defaults", () => {
  assert.deepEqual(manifest.barWidget.defaults, Model.defaultConfig())
})

test("manifest schema keys match the default keys", () => {
  const schemaKeys = manifest.barWidget.schema.map((entry) => entry.key).sort()
  const defaultKeys = Object.keys(manifest.barWidget.defaults).sort()
  assert.deepEqual(schemaKeys, defaultKeys)
  assert.equal(new Set(schemaKeys).size, schemaKeys.length, "schema keys must be unique")
})

test("the settings vocabulary uses session types, not method names", () => {
  assert.equal("shortMinutes" in manifest.barWidget.defaults, true)
  assert.equal("pomodoroMinutes" in manifest.barWidget.defaults, false)
  assert.deepEqual(
    manifest.barWidget.schema.filter((entry) => entry.type === "integer").map((entry) => entry.key).sort(),
    ["deepBreakMinutes", "deepMinutes", "shortBreakMinutes", "shortMinutes"]
  )

  const deep = manifest.barWidget.schema.find((entry) => entry.key === "deepMinutes")
  const short = manifest.barWidget.schema.find((entry) => entry.key === "shortMinutes")
  assert.match(deep.label, /Deep Focus/)
  assert.match(deep.description, /Ultradian/)
  assert.match(short.label, /Short Focus/)
  assert.match(short.description, /Pomodoro/)
})

test("manifest schema bounds match the code's bounds", () => {
  const limits = Model.configLimits()
  for (const entry of manifest.barWidget.schema) {
    assert.equal(entry.defaultValue, manifest.barWidget.defaults[entry.key], `${entry.key} default must agree`)

    if (entry.type === "boolean") {
      assert.equal(typeof entry.defaultValue, "boolean", `${entry.key} default must be boolean`)
      continue
    }

    assert.equal(entry.type, "integer", `${entry.key} must be an integer setting`)
    const expected = limits[entry.key]
    assert(expected, `${entry.key} needs bounds in FocusModel.configLimits()`)
    assert.equal(entry.min, expected.min, `${entry.key} min must agree`)
    assert.equal(entry.max, expected.max, `${entry.key} max must agree`)
    assert.equal(entry.step, expected.step, `${entry.key} step must agree`)
    assert.equal(Number.isInteger(entry.defaultValue), true)
    assert(entry.defaultValue >= entry.min && entry.defaultValue <= entry.max, `${entry.key} default must be in range`)
    assert.equal(typeof entry.label, "string")
    assert(entry.label.length > 0)
    assert.equal(typeof entry.description, "string")
    assert(entry.description.length > 0)
  }
})

test("the plugin folder contains no symlinks", () => {
  const links = filesUnder(ROOT, "").filter((entry) => entry.link)
  assert.deepEqual(links.map((entry) => entry.path), [], "the plugin registry refuses symlinked files")
})

test("the package metadata stays in sync with the manifest", () => {
  assert.equal(pkg.private, true)
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.scripts.test, "node --test test/*.test.js")
  assert.equal(typeof pkg.scripts.validate, "string")
})

test("the repository keeps its license and README", () => {
  for (const file of ["LICENSE", "README.md", "BarWidget.qml", "Panel.qml", "Service.qml", "i18n/en.json"]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} must exist`)
  }
})
