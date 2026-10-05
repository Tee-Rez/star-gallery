import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {presetFor} from '../lib/constellation-rules.mjs'

const ship = id => JSON.parse(fs.readFileSync(`orion/src/data/constellations/${id}.json`, 'utf8'))

test('supported presets are seeded from the shipped objects', () => {
  const m42 = ship('orion').deepSkyObjects.find(o => o.id === 'm42')
  const m31 = ship('andromeda').deepSkyObjects.find(o => o.id === 'm31')
  const neb = presetFor('emission_nebula', false)
  assert.equal(neb.layer, 'nebula')
  assert.deepEqual(neb.field, m42.field)
  assert.deepEqual(neb.render, m42.render)
  const gal = presetFor('spiral_galaxy', false)
  assert.equal(gal.layer, 'galaxy')
  assert.deepEqual(gal.field, m31.field)
  assert.deepEqual(gal.render, m31.render)
})

test('an open cluster is enterable only with named members', () => {
  assert.equal(presetFor('open_cluster', true).layer, 'cluster')
  const unnamed = presetFor('open_cluster', false)
  assert.equal(unnamed.layer, 'none')
  assert.match(unnamed.rendererGap.startingPoint, /sparse/)
})

test('a type with no renderer is a marker carrying the reason', () => {
  for (const t of ['planetary_nebula', 'globular_cluster', 'supernova_remnant',
    'reflection_nebula', 'elliptical_galaxy', 'dwarf_elliptical_galaxy']) {
    const p = presetFor(t, false)
    assert.equal(p.layer, 'none', t)
    assert.equal(p.rendererGap.type, t)
    assert.ok(p.rendererGap.startingPoint.length > 10, t)
  }
})

test('an unknown type is a renderer gap, not a crash', () => {
  const p = presetFor('quasar', false)
  assert.equal(p.layer, 'none')
  assert.equal(p.rendererGap.type, 'quasar')
})

test('presets are copies - tuning one object cannot change the registry', () => {
  const a = presetFor('emission_nebula', false)
  a.field.count = -1
  assert.notEqual(presetFor('emission_nebula', false).field.count, -1)
})
