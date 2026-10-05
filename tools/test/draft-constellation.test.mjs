import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDraft} from '../draft-constellation.mjs'

// A minimal researched input: one deep-sky object, so pointer candidates have something to
// point at. Kept here so these tests do not depend on Lyra's real research being finished.
const WITH_M57 = {
  deepSky: [{id: 'm57', name: 'Ring Nebula', designation: 'M57', type: 'planetary_nebula',
    raH: 18.893082, dec: 33.029111, distance: 2570, magnitude: 8.8, size: 0.4,
    description: 'x', info: {basic: 'x', scientific: {}}, sources: 'x'}],
}

test('Lyra drafts the five figure stars, with ids from their designations', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  assert.deepEqual(draft.stars.map(s => s.id).sort(),
    ['alpha_lyrae', 'beta_lyrae', 'delta2_lyrae', 'gamma_lyrae', 'zeta1_lyrae'])
  assert.equal(draft.connections.length, 5)
  for (const c of draft.connections) {
    assert.ok(draft.stars.some(s => s.id === c.from), c.from)
    assert.ok(draft.stars.some(s => s.id === c.to), c.to)
  }
  assert.equal(draft.metadata.season, 'summer')
  assert.equal(draft.metadata.hemisphere, 'northern')
  assert.equal(draft.metadata.abbreviation, 'Lyr')
})

test('unnamed stars get a designation and a Bayer name from the harvest', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  const zeta = draft.stars.find(s => s.id === 'zeta1_lyrae')
  assert.equal(zeta.designation, 'ζ¹ Lyrae')
  assert.equal(zeta.name, 'Zeta1 Lyrae')
  assert.equal(zeta.pronunciation, undefined)
})

test('estimated physics is absent and recorded, never shipped', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  const vega = draft.stars.find(s => s.id === 'alpha_lyrae')
  assert.equal(vega.physics.tempKelvin, 9330)
  const absent = draft._draft.absences.map(a => a.path)
  const noPhysics = draft.stars.filter(s => !s.physics)
  assert.ok(noPhysics.length > 0, 'Lyra has stars whose harvest is only an estimate')
  for (const s of noPhysics) assert.ok(absent.includes(`stars.${s.id}.physics`), s.id)
})

test('values are typed like the shipped files', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  const s = draft.stars[0]
  assert.equal(typeof s.hip, 'number')
  assert.equal(typeof s.isMajor, 'boolean')
  assert.equal(typeof s.size, 'number')
  assert.equal(typeof s.distance, 'number')
  assert.ok(Number.isInteger(s.distance))
  assert.ok(Number.isInteger(draft.portal.width))
  assert.match(s.color, /^#[0-9a-f]{6}$/)
})

test('drafting twice is byte-identical', () => {
  const a = JSON.stringify(buildDraft('Lyr', {research: WITH_M57}).draft)
  const b = JSON.stringify(buildDraft('Lyr', {research: WITH_M57}).draft)
  assert.equal(a, b)
})

test('researched fields missing from the input are required gaps', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  const req = draft._draft.required.map(g => g.path)
  for (const p of ['journey', 'deepSkyObjects', 'metadata.displayName', 'metadata.description',
    'metadata.mythology', 'stars.alpha_lyrae.info', 'stars.alpha_lyrae.pronunciation']) {
    assert.ok(req.includes(p), p)
  }
  // Only named stars owe a pronunciation.
  assert.ok(!req.includes('stars.zeta1_lyrae.pronunciation'))
})

test('a deep-sky object with no renderer ships as layer none and records the gap', () => {
  const {draft} = buildDraft('Lyr', {research: WITH_M57})
  const m57 = draft.deepSkyObjects.find(o => o.id === 'm57')
  assert.equal(m57.layer, 'none')
  assert.equal(m57.field, undefined)
  assert.ok(m57.position2D && typeof m57.position2D.x === 'number')
  assert.ok(draft._draft.rendererGaps.some(g => g.object === 'm57' && g.type === 'planetary_nebula'))
})

test('journey candidates rank named stars and point at deep-sky objects', () => {
  const {draft} = buildDraft('Lyr', {research: WITH_M57})
  const singles = draft._draft.journeyCandidates.filter(c => c.kind === 'single').map(c => c.star)
  assert.equal(singles[0], 'Vega')
  assert.ok(!singles.includes('Zeta1 Lyrae'), 'unnamed stars are not single-star candidates')
  const ptr = draft._draft.journeyCandidates.find(c => c.kind === 'pointer')
  assert.equal(ptr.object, 'Ring Nebula')
  assert.equal(ptr.stars.length, 2)
})

test('the research file fills gaps and overrides physics', () => {
  const {draft} = buildDraft('Lyr', {research: {
    metadata: {displayName: 'Lyra the Lyre', description: 'd', mythology: 'm'},
    stars: {beta_lyrae: {physics: {massSolar: 3, radiusSolar: 6, tempKelvin: 13300, note: 'n'}}},
  }})
  assert.equal(draft.metadata.displayName, 'Lyra the Lyre')
  assert.equal(draft.stars.find(s => s.id === 'beta_lyrae').physics.tempKelvin, 13300)
  assert.ok(!draft._draft.required.some(g => g.path === 'metadata.displayName'))
})

test('the review sheet shows the figure, open gaps and the candidates not chosen', () => {
  const {review} = buildDraft('Lyr', {research: WITH_M57})
  assert.match(review, /<svg class="figure"/)
  assert.match(review, /required gaps? open/)
  assert.match(review, /stars\.alpha_lyrae\.info/)
  assert.match(review, /Candidates not chosen[\s\S]*Vega/)
  assert.match(review, /Renderer gap\./)
  assert.doesNotMatch(review, /undefined/)
})
