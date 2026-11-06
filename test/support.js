"use strict"

const Model = require("../FocusModel.js")

const CONFIG = Model.defaultConfig()
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime()

function at(year, month, day, hour, minute, second) {
  return new Date(year, month, day, hour || 0, minute || 0, second || 0).getTime()
}

function state(overrides) {
  return Object.assign(Model.initialState(CONFIG, NOW), overrides || {})
}

function config(overrides) {
  return Object.assign(Model.defaultConfig(), overrides || {})
}

function effects(overrides) {
  return Object.assign(Model.noEffects(), overrides || {})
}

module.exports = {
  Model: Model,
  CONFIG: CONFIG,
  NOW: NOW,
  at: at,
  state: state,
  config: config,
  effects: effects
}
