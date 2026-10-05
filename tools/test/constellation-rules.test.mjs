// The rules a new constellation is drafted with. The shipped-data tests are the point: every
// rule that claims to describe the shipped three is held to reproducing them.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as R from '../lib/constellation-rules.mjs'

const load = id => JSON.parse(fs.readFileSync(`orion/src/data/constellations/${id}.json`, 'utf8'))
const SHIPPED = ['orion', 'andromeda', 'taurus'].map(load)
const stage1 = id => JSON.parse(
  fs.readFileSync(`tools/input/${id}-stars.json`, 'utf8').replace(/^﻿/, '')).stars

test('portal, grid and box derive from the portal for every shipped constellation', () => {
  for (const c of SHIPPED) {
    const d = R.portalDerived(c.portal.width, c.portal.height)
    assert.deepEqual(d.portal, c.portal, c.metadata.name + ' portal')
    assert.deepEqual(d.display, c.display, c.metadata.name + ' display')
    assert.deepEqual(d.gridBox, c.gridBox, c.metadata.name + ' gridBox')
  }
})

test('isMajor is magnitude < 4.0, with Merope the one documented exception', () => {
  const misses = []
  for (const c of SHIPPED) {
    const all = [...c.stars, ...(c.deepSkyObjects || []).flatMap(o => o.stars || [])]
    for (const s of all) if (R.isMajor(s.magnitude) !== s.isMajor) misses.push(s.name)
  }
  assert.deepEqual(misses, ['Merope'])
})

test('season and hemisphere fit every shipped constellation', () => {
  // Shipped files carry no RA/Dec, so the stage-1 inputs supply the coordinates.
  const want = {orion: 'winter/both', andromeda: 'autumn/northern', taurus: 'winter/northern'}
  for (const [id, expected] of Object.entries(want)) {
    const ctr = R.centroid(stage1(id))
    assert.equal(`${R.season(ctr.raH)}/${R.hemisphere(ctr.dec)}`, expected, id)
  }
})

test('centroid handles a figure that straddles 0h of right ascension', () => {
  const ctr = R.centroid([{raH: 23.5, dec: 0}, {raH: 0.5, dec: 0}])
  assert.ok(ctr.raH < 0.01 || ctr.raH > 23.99, `got ${ctr.raH}`)
})

test('star ids come from the designation', () => {
  assert.equal(R.starId('θ² Tauri', 1), 'theta2_tauri')
  assert.equal(R.starId('64 Orionis', 1), '64_orionis')
  assert.equal(R.starId('η Tauri (25 Tau)', 1), 'eta_tauri')
  assert.equal(R.starId('γ¹ Andromedae', 1), 'gamma1_andromedae')
  assert.equal(R.starId(null, 91971), 'hip_91971')
})

test('size curve is the least-squares fit, clamped to the shipped range', () => {
  assert.equal(R.starSize(0), 0.154)
  assert.equal(R.starSize(-2), 0.17)
  assert.equal(R.starSize(9), 0.05)
})

test('physics with any spectral-type estimate is absent', () => {
  const measured = {massSolar: 2.51, radiusSolar: 2.69, tempKelvin: 9330,
    sources: {mass: 'Allende Prieto & Lambert 1999', radius: 'Allende Prieto & Lambert 1999',
      temp: 'Allende Prieto & Lambert 1999'}}
  assert.deepEqual(R.measuredPhysics(measured),
    {massSolar: 2.51, radiusSolar: 2.69, tempKelvin: 9330, note: 'Allende Prieto & Lambert 1999'})

  const mass = {...measured, sources: {...measured.sources, mass: 'typical for spectral type A8V'}}
  assert.equal(R.measuredPhysics(mass), null)

  // A Stefan-Boltzmann radius is only as good as the temperature under it.
  const sb = {...measured, sources: {...measured.sources,
    temp: 'derived from spectral type A1III', radius: 'Stefan-Boltzmann from XHIP luminosity and Teff'}}
  assert.equal(R.measuredPhysics(sb), null)
  const sbOk = {...measured, sources: {...measured.sources,
    radius: 'Stefan-Boltzmann from XHIP luminosity and Teff'}}
  assert.ok(R.measuredPhysics(sbOk))

  assert.equal(R.measuredPhysics({...measured, tempKelvin: null}), null)
  assert.equal(R.measuredPhysics(null), null)
})

test('designations recover from the harvest name, and spell out as names', () => {
  assert.equal(R.designationFromXhip('6 Zeta-1 Lyrae (HR 7056)'), 'ζ¹ Lyrae')
  assert.equal(R.designationFromXhip('12 Delta-2 Lyrae (HR 7139)'), 'δ² Lyrae')
  assert.equal(R.designationFromXhip('3 Alpha Lyrae (Vega)'), 'α Lyrae')
  assert.equal(R.designationFromXhip('HR 1234'), null)
  assert.equal(R.bayerName('ζ¹ Lyrae'), 'Zeta1 Lyrae')
  assert.equal(R.bayerName('δ² Lyrae'), 'Delta2 Lyrae')
})

test('stellar type reads the letter and the luminosity class', () => {
  assert.equal(R.stellarType('A1V'), 'white_main_sequence')
  assert.equal(R.stellarType('M4II'), 'red_bright_giant')
  assert.equal(R.stellarType('B7IIIe'), 'blue_white_giant')
  assert.equal(R.stellarType('O9.5Ib'), 'blue_supergiant')
  assert.equal(R.stellarType('A1III'), 'white_giant')
  assert.equal(R.stellarType('kA5hF0mF2'), 'white_main_sequence')
})

test('scientific lines are drafted in one format', () => {
  const l = R.scientificLines({massSolar: 2.51, radiusSolar: 2.69, tempKelvin: 9330}, 'A1V')
  assert.equal(l.temperature, 'About 9,330 K')
  assert.equal(l.mass, "About 2.5 times the Sun's mass")
  assert.equal(l.radius, "About 2.7 times the Sun's radius")
  assert.equal(l.class, 'A1V white main-sequence star')
  const big = R.scientificLines({massSolar: 15, radiusSolar: 189.76, tempKelvin: 3400}, 'M4II')
  assert.equal(big.radius, "About 190 times the Sun's radius")
  assert.equal(big.class, 'M4II red bright giant')
  assert.equal(R.scientificLines(null, 'A1V').temperature, undefined)
})
