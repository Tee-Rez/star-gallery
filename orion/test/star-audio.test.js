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

console.log('\n' + passed + ' passed')
