"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../FocusModel.js")

const ROOT = path.join(__dirname, "..")
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"))
const MARKDOWN_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "ROADMAP.md",
  "docs/usage.md",
  "docs/reference.md",
  "docs/architecture.md"
]

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8")
}

function section(source, heading) {
  const start = source.indexOf(heading)
  assert.notEqual(start, -1, `missing heading: ${heading}`)
  const rest = source.slice(start + heading.length)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
}

function anchorsOf(source) {
  const anchors = new Set()
  for (const match of source.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    anchors.add(slugify(match[1]))
  }
  return anchors
}

test("markdown links and images resolve", () => {
  const sources = new Map(MARKDOWN_FILES.map((file) => [file, read(file)]))
  const anchors = new Map([...sources].map(([file, source]) => [file, anchorsOf(source)]))

  for (const [file, source] of sources) {
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(?:https?:|mailto:|tel:)/i.test(target)) continue

      const [targetPath, targetAnchor] = target.split("#")
      const resolved = targetPath === ""
        ? file
        : path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, file)), targetPath))

      assert.equal(
        fs.existsSync(path.join(ROOT, resolved)),
        true,
        `${file}: link target does not exist: ${target}`
      )

      if (targetAnchor) {
        const targetFile = resolved || file
        const targetAnchors = anchors.get(targetFile)
        assert(targetAnchors, `${file}: anchor points at a non-Markdown file: ${target}`)
        assert.equal(
          targetAnchors.has(targetAnchor),
          true,
          `${file}: missing anchor #${targetAnchor} in ${targetFile}`
        )
      }
    }
  }
})

test("the README links to the documentation set", () => {
  const readme = read("README.md")
  for (const target of [
    "docs/usage.md",
    "docs/reference.md",
    "docs/architecture.md",
    "CONTRIBUTING.md",
    "ROADMAP.md"
  ]) {
    assert(readme.includes(`](${target}`), `README must link to ${target}`)
  }
})

test("the settings reference matches the manifest and model", () => {
  const reference = read("docs/reference.md")
  const rows = section(reference, "## Settings")
    .split("\n")
    .filter((line) => /^\| `[A-Za-z]/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))

  const keys = rows.map((row) => row[0].replace(/`/g, ""))
  assert.deepEqual(keys.sort(), Object.keys(MANIFEST.barWidget.defaults).sort())
  assert.equal(new Set(keys).size, keys.length, "settings table has duplicate keys")

  const limits = Model.configLimits()
  for (const row of rows) {
    const key = row[0].replace(/`/g, "")
    const defaultText = row[1].replace(/`/g, "")
    const range = row[2]
    const expected = MANIFEST.barWidget.defaults[key]
    assert.ok(row[3] && row[3].length > 0, `${key} needs a description`)

    if (typeof expected === "boolean") {
      assert.equal(defaultText, String(expected), `${key} default must match the manifest`)
      assert.equal(range, "boolean", `${key} range must say boolean`)
      continue
    }

    assert.equal(Number(defaultText), expected, `${key} default must match the manifest`)
    const match = range.match(/^(\d+)[–-](\d+), step (\d+)$/)
    assert(match, `${key} range must look like "min–max, step n"`)
    assert.equal(Number(match[1]), limits[key].min, `${key} min must match FocusModel`)
    assert.equal(Number(match[2]), limits[key].max, `${key} max must match FocusModel`)
    assert.equal(Number(match[3]), limits[key].step, `${key} step must match FocusModel`)
  }
})

test("the IPC reference matches the ShellIpc handlers", () => {
  const widget = read("BarWidget.qml")
  const block = widget.match(/Commons\.ShellIpc\s*\{([\s\S]*?)\n  \}/)
  assert(block, "BarWidget.qml must contain a Commons.ShellIpc block")

  const handlers = new Set()
  for (const match of block[1].matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)) {
    handlers.add(match[1])
  }
  assert(handlers.size > 0, "ShellIpc block must expose handlers")

  const reference = read("docs/reference.md")
  const ipc = section(reference, "## IPC").split("### `status` response")[0]
  const documented = new Set()
  for (const match of ipc.matchAll(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/gm)) {
    documented.add(match[1])
  }

  assert.deepEqual([...documented].sort(), [...handlers].sort())
})

test("every documented IPC example uses a real handler", () => {
  const widget = read("BarWidget.qml")
  const block = widget.match(/Commons\.ShellIpc\s*\{([\s\S]*?)\n  \}/)
  const handlers = new Set(
    [...block[1].matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1])
  )

  for (const file of MARKDOWN_FILES) {
    const source = read(file)
    for (const match of source.matchAll(/omarchy-shell jimmerioles\.focus ([A-Za-z0-9_]+)/g)) {
      assert(
        handlers.has(match[1]),
        `${file}: documented IPC method does not exist: ${match[1]}`
      )
    }
  }
})

test("the status sample matches statusSnapshot", () => {
  const reference = read("docs/reference.md")
  const status = section(reference, "### `status` response")
  const block = status.match(/```json\n([\s\S]*?)\n```/)
  assert(block, "status reference needs a JSON sample")

  const sample = JSON.parse(block[1])
  const state = Model.initialState(Model.defaultConfig(), new Date(2026, 0, 15, 12, 0, 0).getTime())
  const expected = Model.statusSnapshot(state, new Date(2026, 0, 15, 12, 0, 0).getTime(), "Deep Focus")

  assert.deepEqual(Object.keys(sample).sort(), Object.keys(expected).sort())
  assert.deepEqual(sample, expected)
})

test("the documented state path and version match the implementation", () => {
  const service = read("Service.qml")
  const reference = read("docs/reference.md")

  const stateDir = service.match(/stateDir:\s*\(Quickshell\.env\("HOME"\) \|\| ""\)\s*\+\s*"([^"]+)"/)
  const statePath = service.match(/statePath:\s*stateDir\s*\+\s*"([^"]+)"/)
  assert(stateDir, "Service.qml must define stateDir")
  assert(statePath, "Service.qml must define statePath")

  const expectedPath = `~${stateDir[1]}${statePath[1]}`
  assert(
    reference.includes(expectedPath),
    `docs/reference.md must name the state path ${expectedPath}`
  )
  assert(
    reference.includes(`version: ${Model.STATE_VERSION}`),
    `docs/reference.md must name state version ${Model.STATE_VERSION}`
  )
})

test("the roadmap current release matches the manifest", () => {
  const roadmap = read("ROADMAP.md")
  const match = roadmap.match(/Current release:\s*`([^`]+)`/)
  assert(match, "ROADMAP.md must declare a current release")
  assert.equal(match[1], MANIFEST.version)
})

test("the documented Omarchy test version matches CI", () => {
  const workflow = read(".github/workflows/test.yml")
  const pin = workflow.match(/OMARCHY_REF:\s*v?([0-9.]+)/)
  assert(pin, "CI must pin an Omarchy release")
  assert(
    read("docs/reference.md").includes(pin[1]),
    `docs/reference.md must mention the CI Omarchy version ${pin[1]}`
  )
})
