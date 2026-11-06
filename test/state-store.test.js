"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Model = require("../FocusModel.js")

function run(command) {
  return spawnSync(command[0], command.slice(1), { encoding: "utf8" })
}

function mode(file) {
  return fs.statSync(file).mode & 0o777
}

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omarchy-cadence-store-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test("prepareStoreCommand passes the paths as argv, never as shell text", () => {
  const command = Model.prepareStoreCommand("/tmp/state dir", "/tmp/state dir/state.json")
  assert.equal(command[0], "bash")
  assert.equal(command[1], "-c")
  assert.equal(command[3], "omarchy-cadence")
  assert.equal(command[4], "/tmp/state dir")
  assert.equal(command[5], "/tmp/state dir/state.json")
  assert.equal(command[2].includes("/tmp/state dir"), false)
})

test("the state directory is private and the state file is owner-only", (t) => {
  const root = scratch(t)
  const dir = path.join(root, "cadence")
  const file = path.join(dir, "state.json")

  const result = run(Model.prepareStoreCommand(dir, file))
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(mode(dir), 0o700)
  assert.equal(fs.statSync(file).isFile(), true)
  assert.equal(mode(file), 0o600)
  assert.equal(fs.readFileSync(file, "utf8"), "")
})

test("an existing state file keeps its contents but is tightened", (t) => {
  const root = scratch(t)
  const dir = path.join(root, "cadence")
  const file = path.join(dir, "state.json")
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
  fs.writeFileSync(file, '{"mode":"deep"}')
  fs.chmodSync(dir, 0o755)
  fs.chmodSync(file, 0o644)

  const result = run(Model.prepareStoreCommand(dir, file))
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(mode(dir), 0o700)
  assert.equal(mode(file), 0o600)
  assert.equal(fs.readFileSync(file, "utf8"), '{"mode":"deep"}')
})

test("a symlinked state file is replaced without touching its target", (t) => {
  const root = scratch(t)
  const dir = path.join(root, "cadence")
  const file = path.join(dir, "state.json")
  const victim = path.join(root, "victim.txt")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(victim, "do not touch")
  fs.symlinkSync(victim, file)

  const result = run(Model.prepareStoreCommand(dir, file))
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(fs.lstatSync(file).isSymbolicLink(), false)
  assert.equal(fs.statSync(file).isFile(), true)
  assert.equal(mode(file), 0o600)
  assert.equal(fs.readFileSync(victim, "utf8"), "do not touch")
})

test("paths with spaces and shell metacharacters stay literal", (t) => {
  const root = scratch(t)
  const dir = path.join(root, "state $(id)")
  const file = path.join(dir, "state.json $(id)")

  const result = run(Model.prepareStoreCommand(dir, file))
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(fs.statSync(dir).isDirectory(), true)
  assert.equal(fs.statSync(file).isFile(), true)
  assert.equal(fs.readdirSync(root).includes("state $(id)"), true)
})
