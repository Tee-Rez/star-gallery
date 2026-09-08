// Plain-node tests. No framework: run with `node test/deep-sky.test.js`.
const assert = require('assert')
const F = require('../src/js/deep-sky-field.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

test('hexToRgb reads six-digit hex', () => {
  const c = F.hexToRgb('#ff8000')
  assert.strictEqual(c.r, 1)
  assert.ok(Math.abs(c.g - 128 / 255) < 1e-6)
  assert.strictEqual(c.b, 0)
})

test('hexToRgb expands three-digit hex', () => {
  assert.deepStrictEqual(F.hexToRgb('#fff'), {r: 1, g: 1, b: 1})
})

test('parseColors splits a csv ramp', () => {
  const stops = F.parseColors('#000000, #ffffff')
  assert.strictEqual(stops.length, 2)
  assert.strictEqual(stops[0].r, 0)
  assert.strictEqual(stops[1].r, 1)
})

test('rampColor hits its endpoints exactly', () => {
  const stops = F.parseColors('#000000,#ffffff')
  assert.strictEqual(F.rampColor(stops, 0).r, 0)
  assert.strictEqual(F.rampColor(stops, 1).r, 1)
})

test('rampColor interpolates the middle', () => {
  const stops = F.parseColors('#000000,#ffffff')
  assert.ok(Math.abs(F.rampColor(stops, 0.5).r - 0.5) < 1e-6)
})

test('rampColor clamps outside 0..1', () => {
  const stops = F.parseColors('#000000,#ffffff')
  assert.strictEqual(F.rampColor(stops, -5).r, 0)
  assert.strictEqual(F.rampColor(stops, 5).r, 1)
})

test('rampColor handles a single stop', () => {
  const stops = F.parseColors('#336699')
  assert.deepStrictEqual(F.rampColor(stops, 0.7), stops[0])
})

// The nebula samples against a density field, so it may return fewer points than asked.
test('nebulaField never returns more points than requested', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.nebula)
  const out = F.nebulaField(500, p, F.parseColors('#ffffff,#ff0000'))
  assert.ok(out.used <= 500, 'used ' + out.used)
  assert.ok(out.used > 0, 'produced nothing')
})

test('nebulaField produces only finite coordinates', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.nebula)
  const out = F.nebulaField(400, p, F.parseColors('#ffffff,#ff0000'))
  for (let i = 0; i < out.used * 3; i++) {
    assert.ok(Number.isFinite(out.positions[i]), 'non-finite at ' + i)
    assert.ok(Number.isFinite(out.colors[i]), 'non-finite colour at ' + i)
  }
})

test('nebulaField keeps every point inside its envelope', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.nebula, {embedded: 0})
  const out = F.nebulaField(400, p, F.parseColors('#ffffff,#ff0000'))
  const sx = p.spread, sy = p.spread * 0.72, sz = p.spread * 0.80
  for (let i = 0; i < out.used; i++) {
    const x = out.positions[i * 3], y = out.positions[i * 3 + 1], z = out.positions[i * 3 + 2]
    const e = (x * x) / (sx * sx) + (y * y) / (sy * sy) + (z * z) / (sz * sz)
    assert.ok(e <= 1.0001, 'point outside envelope, e=' + e)
  }
})

// fill scales the acceptance probability, so zero fill accepts nothing at all.
test('nebulaField with zero fill and no embedded stars is empty', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.nebula, {fill: 0, embedded: 0})
  const out = F.nebulaField(300, p, F.parseColors('#ffffff,#ff0000'))
  assert.strictEqual(out.used, 0)
})

test('nebulaField still seats embedded stars when the gas is empty', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.nebula, {fill: 0, embedded: 3, cores: 2})
  const out = F.nebulaField(300, p, F.parseColors('#ffffff,#ff0000'))
  assert.strictEqual(out.used, 3)
})

// The spiral places every point it is asked for - there is no rejection step.
test('spiralField returns exactly the requested count', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.galaxy)
  const out = F.spiralField(600, p, F.parseColors('#ffffff,#0000ff'))
  assert.strictEqual(out.used, 600)
})

test('spiralField makes a thin disc', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.galaxy, {bulge: 0})
  const out = F.spiralField(800, p, F.parseColors('#ffffff,#0000ff'))
  let maxY = 0, maxR = 0
  for (let i = 0; i < out.used; i++) {
    maxY = Math.max(maxY, Math.abs(out.positions[i * 3 + 1]))
    const x = out.positions[i * 3], z = out.positions[i * 3 + 2]
    maxR = Math.max(maxR, Math.sqrt(x * x + z * z))
  }
  assert.ok(maxY < maxR * 0.5, 'disc is not thin: maxY ' + maxY + ' maxR ' + maxR)
})

test('spiralField with an all-bulge mix stays near the centre', () => {
  const p = Object.assign({}, F.FIELD_DEFAULTS.galaxy, {bulge: 1})
  const out = F.spiralField(400, p, F.parseColors('#ffffff,#0000ff'))
  for (let i = 0; i < out.used; i++) {
    const x = out.positions[i * 3], y = out.positions[i * 3 + 1], z = out.positions[i * 3 + 2]
    const r = Math.sqrt(x * x + y * y + z * z)
    assert.ok(r <= p.spread * 0.31, 'bulge point too far out: ' + r)
  }
})

test('generatorFor maps the two shipping layers', () => {
  assert.strictEqual(F.generatorFor('nebula'), F.nebulaField)
  assert.strictEqual(F.generatorFor('galaxy'), F.spiralField)
  assert.strictEqual(F.generatorFor('cluster'), null)
  assert.strictEqual(F.generatorFor('none'), null)
  assert.strictEqual(F.generatorFor('nonsense'), null)
})

// resolveLayer: shared by createDeepSkyMarkers and enter() so a marker exists exactly when
// entry works. Spec: layer missing -> derive from type; unrecognised (either field) -> none.
test('resolveLayer accepts an explicit valid layer', () => {
  assert.strictEqual(F.resolveLayer({layer: 'nebula'}), 'nebula')
  assert.strictEqual(F.resolveLayer({layer: 'galaxy'}), 'galaxy')
  assert.strictEqual(F.resolveLayer({layer: 'cluster'}), 'cluster')
})

test('resolveLayer keeps an explicit none as none, even with a matching type', () => {
  assert.strictEqual(F.resolveLayer({layer: 'none', type: 'emission_nebula'}), 'none')
})

test('resolveLayer derives from type by substring when layer is missing', () => {
  assert.strictEqual(F.resolveLayer({type: 'emission_nebula'}), 'nebula')
  assert.strictEqual(F.resolveLayer({type: 'spiral_galaxy'}), 'galaxy')
  assert.strictEqual(F.resolveLayer({type: 'open_cluster'}), 'cluster')
})

test('resolveLayer treats an unrecognised layer string as none when type does not resolve it', () => {
  assert.strictEqual(F.resolveLayer({layer: 'quasar'}), 'none')
  assert.strictEqual(F.resolveLayer({layer: 'quasar', type: 'quasar'}), 'none')
})

// An explicit-but-invalid layer is not whitelisted, so it falls through to the same
// type-derivation as a missing layer - it is only "none" when type doesn't resolve it either.
test('resolveLayer falls through an unrecognised layer to type derivation', () => {
  assert.strictEqual(F.resolveLayer({layer: 'quasar', type: 'emission_nebula'}), 'nebula')
})

test('resolveLayer is none when both layer and type are missing', () => {
  assert.strictEqual(F.resolveLayer({}), 'none')
  assert.strictEqual(F.resolveLayer(null), 'none')
})

console.log('\n' + passed + ' passed')
