// Plain-node tests. No framework: run with `node test/star-audio.test.js`.
const assert = require('assert')
const T = require('../src/js/star-tone.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

// The Sun is the calibrator for the whole system.
test('sun calibrates to 3090 microHz', () => {
  assert.strictEqual(Math.round(T.nuMaxMicroHz(1, 1, 5777)), 3090)
})

test('bigger radius lowers nu_max', () => {
  assert.ok(T.nuMaxMicroHz(1, 10, 5777) < T.nuMaxMicroHz(1, 1, 5777))
})

test('invalid physics returns 0', () => {
  assert.strictEqual(T.nuMaxMicroHz(0, 1, 5777), 0)
  assert.strictEqual(T.nuMaxMicroHz(1, -1, 5777), 0)
})

test('compress keeps pitch inside the octave window', () => {
  const hz = T.toPitchHz(500, 10, 3000, 'compress', 110, 2)
  assert.ok(hz >= 110 && hz <= 110 * 4, 'got ' + hz)
})

test('compress preserves ordering: lower nu_max sounds lower', () => {
  const low = T.toPitchHz(50, 10, 3000, 'compress', 110, 2)
  const high = T.toPitchHz(2000, 10, 3000, 'compress', 110, 2)
  assert.ok(low < high, low + ' should be below ' + high)
})

test('fold brings a real frequency into the window', () => {
  const hz = T.toPitchHz(3090, 10, 3000, 'fold', 110, 2)
  assert.ok(hz >= 110 && hz < 440, 'got ' + hz)
})

test('quantize snaps onto a pentatonic degree', () => {
  const hz = T.quantize(130, 110, 'pentatonic')
  const semis = 12 * Math.log2(hz / 110)
  const within = ((Math.round(semis) % 12) + 12) % 12
  assert.ok([0, 3, 5, 7, 10].includes(within), 'semitone ' + within + ' not pentatonic')
})

test('scale "true" leaves the pitch alone', () => {
  assert.strictEqual(T.quantize(137.3, 110, 'true'), 137.3)
})

test('heat rises with temperature and stays in 0..1', () => {
  assert.ok(T.heat(3000) <= T.heat(15000))
  assert.ok(T.heat(100) >= 0 && T.heat(99999) <= 1)
})

const P = require('../src/js/star-physics.js')

test('parses a spectral class into letter, subclass and luminosity', () => {
  const p = P.parseSpectralClass('B8IVpMnHg')
  assert.strictEqual(p.letter, 'B')
  assert.strictEqual(p.subclass, 8)
  assert.strictEqual(p.luminosity, 'IV')
})

test('parses a giant', () => {
  const p = P.parseSpectralClass('M0III')
  assert.strictEqual(p.letter, 'M')
  assert.strictEqual(p.luminosity, 'III')
})

test('a stars own physics block wins over the spectral fallback', () => {
  const r = P.physicsFor({spectralClass: 'M0III', physics: {massSolar: 2, radiusSolar: 5, tempKelvin: 4000}})
  assert.strictEqual(r.massSolar, 2)
  assert.strictEqual(r.source, 'data')
})

test('spectral fallback is used when no physics block exists', () => {
  const r = P.physicsFor({spectralClass: 'G2V'})
  assert.strictEqual(r.source, 'spectral')
  assert.ok(Math.abs(r.tempKelvin - 5777) < 400, 'got ' + r.tempKelvin)
})

test('a giant is larger and cooler than a main-sequence star of the same letter', () => {
  const giant = P.physicsFor({spectralClass: 'K3III'})
  const dwarf = P.physicsFor({spectralClass: 'K3V'})
  assert.ok(giant.radiusSolar > dwarf.radiusSolar)
})

test('unparseable class still yields usable solar values', () => {
  const r = P.physicsFor({spectralClass: 'not-a-class'})
  assert.ok(r.massSolar > 0 && r.radiusSolar > 0 && r.tempKelvin > 0)
})

// Catalogue strings are messy, and misreading a supergiant as a dwarf is the worst failure
// available: it makes the largest star sound like the smallest.
test('reads the luminosity class out of a range notation', () => {
  const p = P.parseSpectralClass('M1-M2 Ia-ab')   // Betelgeuse, a red supergiant
  assert.strictEqual(p.letter, 'M')
  assert.strictEqual(p.luminosity, 'I', 'a supergiant must not be read as luminosity V')
})

test('handles spaced and fractional classes', () => {
  assert.strictEqual(P.parseSpectralClass('O9.5 Ib').luminosity, 'I')
  assert.strictEqual(P.parseSpectralClass('O9.5 Ib').subclass, 9.5)
  assert.strictEqual(P.parseSpectralClass('B8 Ia').luminosity, 'I')
  assert.strictEqual(P.parseSpectralClass('G8III-IV').luminosity, 'III')
})

test('a supergiant is vastly larger than a dwarf of the same type', () => {
  const sup = P.physicsFor({spectralClass: 'M1-M2 Ia-ab'})
  const dwarf = P.physicsFor({spectralClass: 'M1V'})
  assert.ok(sup.radiusSolar > dwarf.radiusSolar * 50,
    'supergiant R=' + sup.radiusSolar + ' vs dwarf R=' + dwarf.radiusSolar)
})

// Radius is squared in nu_max, so getting its ordering wrong is the loudest possible error.
// A red supergiant must dwarf a blue one: Betelgeuse is ~750 solar radii, Alnitak ~20.
test('a cool supergiant is far larger than a hot one', () => {
  const betelgeuse = P.physicsFor({spectralClass: 'M1-M2 Ia-ab'})
  const alnitak = P.physicsFor({spectralClass: 'O9.5 Ib'})
  assert.ok(betelgeuse.radiusSolar > alnitak.radiusSolar * 10,
    'M supergiant R=' + betelgeuse.radiusSolar + ' vs O supergiant R=' + alnitak.radiusSolar)
})

test('the largest star also has the lowest nu_max', () => {
  const b = P.physicsFor({spectralClass: 'M1-M2 Ia-ab'})
  const a = P.physicsFor({spectralClass: 'O9.5 Ib'})
  const nuB = T.nuMaxMicroHz(b.massSolar, b.radiusSolar, b.tempKelvin)
  const nuA = T.nuMaxMicroHz(a.massSolar, a.radiusSolar, a.tempKelvin)
  assert.ok(nuB < nuA, 'the bigger star must sound lower: ' + nuB + ' vs ' + nuA)
})

test('a missing spectralClass never produces NaN', () => {
  const r = P.physicsFor({})
  assert.ok(Number.isFinite(r.massSolar) && Number.isFinite(r.radiusSolar) && Number.isFinite(r.tempKelvin))
})

console.log('\n' + passed + ' passed')
