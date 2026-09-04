# Star Audio (Starsong) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every star a voice synthesised from its physics — a Starsong tab in the info panel that plays a star's tone on demand, and tones that sound automatically at each Lore journey stop.

**Architecture:** Four new modules. Two are pure functions with no browser dependency (`star-tone`, `star-physics`) and are unit-tested with plain node. Two own the Web Audio graph (`star-voice` for one sounding voice, `star-audio` as the A-Frame component holding the context and voice pool). The maths is a transliteration of the Unity build's `StarTone.cs`; the synthesis uses `OscillatorNode`s rather than a hand-rolled sample loop, because Web Audio's `detune` is already in cents and the browser owns the audio thread.

**Tech Stack:** A-Frame 1.3 (8frame), Web Audio API, webpack, plain node for unit tests.

**Spec:** `orion/docs/superpowers/specs/2026-09-03-star-audio-design.md`

## Global Constraints

- Tapping a star must NOT play audio. Sound comes only from the Starsong tab or the journey.
- Musical rendering is the default: Compress mapping + Pentatonic quantize.
- True sonification (Fold mapping, Scale.True) must remain reachable from the Starsong tab.
- Settings ported verbatim: `baseHz 110`, `octaves 2`, `maxPartials 4`, `beatCents 6`, `voiceGain 0.18`, `attack 1.2`, `release 2.0`, `refDistance 1.5`, `maxDistance 40`.
- `maxVoices` 12 desktop / 6 coarse-pointer, overridable via the component schema.
- Journey envelope: swell 1.2 s, hold 2.5 s, fade to silence over 2.0 s.
- `physicsFor()` must ALWAYS return finite positive numbers — never NaN, never a silent voice.
- Sun calibration is the anchor: `nuMaxMicroHz(1, 1, 5777)` === `3090`.
- No new npm dependencies. Tests run with bare `node`.
- Verify with `npm run build` (exit 0, two webpack size warnings are normal), then load `?c=orion` and inspect in the browser.

---

## File Structure

| File | Responsibility |
|---|---|
| `orion/src/js/star-tone.js` | Pure maths: `nuMaxMicroHz`, `toPitchHz`, `quantize`, `heat`. No DOM, no audio. |
| `orion/src/js/star-physics.js` | `physicsFor(star)` → `{massSolar, radiusSolar, tempKelvin, source}`. |
| `orion/src/js/star-voice.js` | One voice: oscillator graph, envelope, panner. |
| `orion/src/js/star-audio.js` | A-Frame component: context, master gain, voice pool, `playStar`/`playChord`/`stopAll`. |
| `orion/test/star-audio.test.js` | Node unit tests for the two pure modules. |
| `orion/src/star-info-overlay.js` *(modify)* | Info \| Starsong tabs. |
| `orion/src/js/lore-journey.js` *(modify)* | Sound each stop's targets on arrival. |
| `orion/src/app.js` *(modify)* | Register `star-audio`, attach to scene. |

---

## Task 1: Star tone maths

**Files:**
- Create: `orion/src/js/star-tone.js`
- Create: `orion/test/star-audio.test.js`

**Interfaces:**
- Produces: `nuMaxMicroHz(massSolar, radiusSolar, tempKelvin) -> number`; `toPitchHz(nuMax, nuMinOfSet, nuMaxOfSet, mapping, baseHz, octaves) -> number` where `mapping` is `'compress'|'fold'`; `quantize(hz, baseHz, scale) -> number` where `scale` is `'pentatonic'|'just'|'true'`; `heat(tempKelvin) -> number` in 0..1; constants `SUN_NU_MAX_MICRO_HZ = 3090`, `SUN_TEFF_KELVIN = 5777`.

- [ ] **Step 1: Write the failing test**

Create `orion/test/star-audio.test.js`:

```javascript
// Plain-node tests. No framework: run with `node test/star-audio.test.js`.
const assert = require('assert')
const T = require('../src/js/star-tone.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1 }
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd orion && node test/star-audio.test.js`
Expected: FAIL — `Cannot find module '../src/js/star-tone.js'`

- [ ] **Step 3: Write the implementation**

Create `orion/src/js/star-tone.js`:

```javascript
// js/star-tone.js
// A star's physics turned into a pitch. Pure maths, no DOM and no Web Audio, so it can be
// unit-tested directly and reasoned about on its own.
//
// This is a transliteration of the Unity build's StarTone.cs, which is itself grounded in
// Prof. Conny Aerts's asteroseismology (see Star-Map-Gallery/Docs/AudioDesign.md). Keeping the
// two implementations in step matters: what is tuned in one should transfer to the other.

// The Sun as calibrator: its oscillations peak at ~3090 microHz, a five-minute period.
const SUN_NU_MAX_MICRO_HZ = 3090
const SUN_TEFF_KELVIN = 5777

const PENTATONIC_SEMITONES = [0, 3, 5, 7, 10]
const JUST_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

// The asteroseismic scaling relation: nu_max is proportional to M / (R^2 sqrt(T_eff)).
// Returns 0 for unusable physics so callers can fall back rather than emit NaN.
function nuMaxMicroHz(massSolar, radiusSolar, tempKelvin) {
  if (!(massSolar > 0) || !(radiusSolar > 0) || !(tempKelvin > 0)) return 0
  return SUN_NU_MAX_MICRO_HZ * massSolar /
    (radiusSolar * radiusSolar * Math.sqrt(tempKelvin / SUN_TEFF_KELVIN))
}

// Maps a real oscillation frequency into an audible pitch.
//
// 'compress' squeezes the constellation's whole spread into the octave window while KEEPING
// THE ORDER, so a bigger star always sounds lower - which is how size is read by ear. It needs
// the set's own range to do that.
//
// 'fold' is the field's own practice: multiply by 1e5, then fold by octaves into range.
// Faithful to how Aerts sonifies stars on stage, but folding discards the size ordering.
function toPitchHz(nuMax, nuMinOfSet, nuMaxOfSet, mapping, baseHz, octaves) {
  if (!(nuMax > 0)) return baseHz
  const topHz = baseHz * Math.pow(2, octaves)

  if (mapping === 'fold') {
    let f = nuMax * 1e-6 * 1e5
    if (!(f > 0)) return baseHz
    while (f < baseHz) f *= 2
    while (f >= topHz) f *= 0.5
    return f
  }

  const lo = Math.log2(Math.max(nuMinOfSet, 1e-9))
  const hi = Math.log2(Math.max(nuMaxOfSet, 1e-9))
  const k = Math.abs(hi - lo) < 1e-9
    ? 0.5
    : Math.min(1, Math.max(0, (Math.log2(nuMax) - lo) / (hi - lo)))
  return baseHz * Math.pow(2, k * octaves)
}

// Snaps a pitch onto a scale. This is what keeps stars consonant when several sound at once -
// the journey's group stops play as a chord, and without this they would clash.
function quantize(hz, baseHz, scale) {
  if (scale === 'true' || !(hz > 0) || !(baseHz > 0)) return hz
  const set = scale === 'just' ? JUST_SEMITONES : PENTATONIC_SEMITONES

  const semis = 12 * Math.log2(hz / baseHz)
  const octave = Math.floor(semis / 12)
  const within = semis - octave * 12

  let best = set[0]
  let bestDist = Infinity
  set.forEach((s) => {
    const d = Math.abs(within - s)
    if (d < bestDist) { bestDist = d; best = s }
  })
  if (Math.abs(within - 12) < bestDist) best = 12

  return baseHz * Math.pow(2, (octave * 12 + best) / 12)
}

// How bright the overtones should be, 0..1, from surface temperature. Cool red stars stay
// near-sine; hot blue ones gain harmonics.
function heat(tempKelvin) {
  return Math.min(1, Math.max(0, (tempKelvin - 3000) / 32000))
}

const StarTone = {SUN_NU_MAX_MICRO_HZ, SUN_TEFF_KELVIN, nuMaxMicroHz, toPitchHz, quantize, heat}

// Usable from both the webpack bundle and bare node, so the maths can be tested without a browser.
if (typeof module !== 'undefined' && module.exports) module.exports = StarTone

export {SUN_NU_MAX_MICRO_HZ, SUN_TEFF_KELVIN, nuMaxMicroHz, toPitchHz, quantize, heat}
export default StarTone
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd orion && node test/star-audio.test.js`
Expected: PASS — `9 passed`

If node rejects the `export` statements, the file is being loaded as CommonJS; confirm the
`module.exports` line above it is present, which is what the test consumes.

- [ ] **Step 5: Commit**

```bash
git add orion/src/js/star-tone.js orion/test/star-audio.test.js
git commit -m "feat: star tone maths ported from the Unity build"
```

---

## Task 2: Physics from spectral class

**Files:**
- Create: `orion/src/js/star-physics.js`
- Modify: `orion/test/star-audio.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `physicsFor(star) -> {massSolar, radiusSolar, tempKelvin, source}` where `source` is `'data'` or `'spectral'`; `parseSpectralClass(str) -> {letter, subclass, luminosity} | null`.

- [ ] **Step 1: Write the failing test**

Append to `orion/test/star-audio.test.js`, before the final `console.log`:

```javascript
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

test('a missing spectralClass never produces NaN', () => {
  const r = P.physicsFor({})
  assert.ok(Number.isFinite(r.massSolar) && Number.isFinite(r.radiusSolar) && Number.isFinite(r.tempKelvin))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd orion && node test/star-audio.test.js`
Expected: FAIL — `Cannot find module '../src/js/star-physics.js'`

- [ ] **Step 3: Write the implementation**

Create `orion/src/js/star-physics.js`:

```javascript
// js/star-physics.js
// The numbers the tone maths needs - mass, radius and effective temperature - for a star whose
// data only carries prose ("Roughly 3.8 times the Sun's mass").
//
// A star may declare a `physics` block and that always wins. Otherwise the values are derived
// from `spectralClass`, which every star already has. Derived values are characteristic of the
// TYPE rather than the individual star, so the result is tagged with its provenance and the UI
// says so rather than overclaiming.

// Main-sequence anchors: temperature, mass and radius by spectral letter at subclass 0.
// Interpolated across subclass 0..9 towards the next letter.
const MAIN_SEQUENCE = [
  {letter: 'O', tempK: 42000, massSolar: 40, radiusSolar: 12},
  {letter: 'B', tempK: 30000, massSolar: 17, radiusSolar: 7.4},
  {letter: 'A', tempK: 9600, massSolar: 2.9, radiusSolar: 2.4},
  {letter: 'F', tempK: 7200, massSolar: 1.6, radiusSolar: 1.5},
  {letter: 'G', tempK: 6000, massSolar: 1.05, radiusSolar: 1.1},
  {letter: 'K', tempK: 5300, massSolar: 0.79, radiusSolar: 0.85},
  {letter: 'M', tempK: 3800, massSolar: 0.51, radiusSolar: 0.60},
]
const COOLEST = {tempK: 2600, massSolar: 0.15, radiusSolar: 0.20}  // past M9

// Luminosity class scales the main-sequence figures. Giants and supergiants are hugely larger
// for a given temperature, which is exactly what makes them sound low.
const LUMINOSITY = {
  I:   {mass: 6.0, radius: 60},
  II:  {mass: 3.5, radius: 25},
  III: {mass: 2.0, radius: 12},
  IV:  {mass: 1.3, radius: 2.5},
  V:   {mass: 1.0, radius: 1.0},
  VI:  {mass: 0.8, radius: 0.8},
}

const SOLAR = {massSolar: 1, radiusSolar: 1, tempKelvin: 5777}

// "B8IVpMnHg" -> {letter:'B', subclass:8, luminosity:'IV'}. Peculiarity suffixes are ignored.
function parseSpectralClass(str) {
  if (typeof str !== 'string') return null
  const m = str.trim().match(/^([OBAFGKM])\s*(\d(?:\.\d)?)?\s*(I{1,3}V?|IV|V|VI)?/i)
  if (!m) return null
  return {
    letter: m[1].toUpperCase(),
    subclass: m[2] === undefined ? 5 : parseFloat(m[2]),
    luminosity: m[3] ? m[3].toUpperCase() : 'V',
  }
}

// Interpolate between this letter's anchor and the next, using the subclass as the fraction.
function mainSequenceFor(letter, subclass) {
  const i = MAIN_SEQUENCE.findIndex(e => e.letter === letter)
  if (i < 0) return {tempK: SOLAR.tempKelvin, massSolar: SOLAR.massSolar, radiusSolar: SOLAR.radiusSolar}
  const a = MAIN_SEQUENCE[i]
  const b = MAIN_SEQUENCE[i + 1] || COOLEST
  const t = Math.min(1, Math.max(0, subclass / 10))
  return {
    tempK: a.tempK + (b.tempK - a.tempK) * t,
    massSolar: a.massSolar + (b.massSolar - a.massSolar) * t,
    radiusSolar: a.radiusSolar + (b.radiusSolar - a.radiusSolar) * t,
  }
}

function physicsFor(star) {
  const p = star && star.physics
  if (p && p.massSolar > 0 && p.radiusSolar > 0 && p.tempKelvin > 0) {
    return {
      massSolar: p.massSolar,
      radiusSolar: p.radiusSolar,
      tempKelvin: p.tempKelvin,
      source: 'data',
    }
  }

  const parsed = parseSpectralClass(star && star.spectralClass)
  if (!parsed) return Object.assign({}, SOLAR, {source: 'spectral'})

  const ms = mainSequenceFor(parsed.letter, parsed.subclass)
  const lum = LUMINOSITY[parsed.luminosity] || LUMINOSITY.V
  return {
    massSolar: ms.massSolar * lum.mass,
    radiusSolar: ms.radiusSolar * lum.radius,
    tempKelvin: ms.tempK,
    source: 'spectral',
  }
}

const StarPhysics = {physicsFor, parseSpectralClass}
if (typeof module !== 'undefined' && module.exports) module.exports = StarPhysics

export {physicsFor, parseSpectralClass}
export default StarPhysics
```

- [ ] **Step 2b: Note on the giant test**

`K3III` interpolates towards M and is then multiplied by the III radius factor of 12, so it
comes out far larger than `K3V`. If that assertion fails, the luminosity table was not applied.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd orion && node test/star-audio.test.js`
Expected: PASS — `16 passed`

- [ ] **Step 5: Sanity-check every shipped star**

Run:

```bash
cd orion && node -e "
const P=require('./src/js/star-physics.js'); const T=require('./src/js/star-tone.js');
for (const f of ['orion','andromeda']) {
  const d=require('./src/data/constellations/'+f+'.json');
  const rows=d.stars.map(s=>{const p=P.physicsFor(s);
    return {name:s.name, cls:s.spectralClass, src:p.source, nu:+T.nuMaxMicroHz(p.massSolar,p.radiusSolar,p.tempKelvin).toFixed(1)};});
  const bad=rows.filter(r=>!(r.nu>0));
  console.log(f, '- stars', rows.length, '| non-positive nu_max:', bad.length?bad:'none');
  console.table(rows);
}"
```

Expected: every star has a finite positive `nu_max`, and none report `non-positive`.

- [ ] **Step 6: Commit**

```bash
git add orion/src/js/star-physics.js orion/test/star-audio.test.js
git commit -m "feat: derive stellar physics from spectral class with data override"
```

---

## Task 3: One sounding voice

**Files:**
- Create: `orion/src/js/star-voice.js`

**Interfaces:**
- Consumes: `heat` from `./star-tone`.
- Produces: class `StarVoice` with `constructor(ctx, destination)`, `configure({pitchHz, tempKelvin, maxPartials, beatCents})`, `setPosition(x, y, z)`, `fadeIn(gain, seconds)`, `fadeOut(seconds)`, `stop()`, and properties `starId`, `pitchHz`, `isFree`.

- [ ] **Step 1: Write the implementation**

There is no unit test for this task: it needs a real `AudioContext`, so it is verified in the
browser in Task 4. Create `orion/src/js/star-voice.js`:

```javascript
// js/star-voice.js
// One star's voice. Additive synthesis: a handful of sine partials, with the fundamental split
// into a detuned triplet whose interference is the shimmer.
//
// The Unity build hand-rolls a sample loop with its own sine table because Unity makes you own
// the audio thread. The browser already owns it, so this is an OscillatorNode graph instead -
// and `detune` is natively in cents, so the rotation-splitting parameter transfers literally.
import {heat} from './star-tone'

class StarVoice {
  constructor(ctx, destination) {
    this.ctx = ctx
    this.starId = null
    this.pitchHz = 0
    this.oscillators = []

    // Per-voice gain, then a panner so the tone comes from where the star is.
    this.gain = ctx.createGain()
    this.gain.gain.value = 0

    this.panner = ctx.createPanner()
    this.panner.panningModel = 'equalpower'
    this.panner.distanceModel = 'inverse'
    this.panner.refDistance = 1.5
    this.panner.maxDistance = 40

    this.gain.connect(this.panner)
    this.panner.connect(destination)
  }

  get isFree() { return this.starId === null }

  // Builds the partial stack. Hotter stars carry more overtones; cool red ones stay close to a
  // pure sine. Amplitudes are normalised so a bright star is not simply louder than a dim one.
  configure(opts) {
    this.stopOscillators()

    const {pitchHz, tempKelvin, maxPartials, beatCents} = opts
    this.pitchHz = pitchHz

    const h = heat(tempKelvin)
    const partials = Math.max(1, Math.min(maxPartials,
      Math.round(1 + (maxPartials - 1) * (0.3 + h * 0.7))))

    const specs = []
    let total = 0
    for (let p = 1; p <= partials; p++) {
      const a = 1 / Math.pow(p, 1.7)
      const f = pitchHz * p
      if (p === 1 && beatCents > 0.01) {
        // Rotation splits the fundamental: prograde waves shift up, retrograde down.
        specs.push({f, a: a / 3, detune: 0})
        specs.push({f, a: a / 3, detune: beatCents})
        specs.push({f, a: a / 3, detune: -beatCents})
      } else {
        specs.push({f, a, detune: 0})
      }
      total += a
    }

    specs.forEach((s) => {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = s.f
      osc.detune.value = s.detune
      const g = this.ctx.createGain()
      g.gain.value = total > 0 ? s.a / total : 0
      osc.connect(g)
      g.connect(this.gain)
      osc.start()
      this.oscillators.push(osc)
    })
  }

  setPosition(x, y, z) {
    // positionX/Y/Z are AudioParams in current browsers; older ones only have setPosition.
    if (this.panner.positionX) {
      this.panner.positionX.value = x
      this.panner.positionY.value = y
      this.panner.positionZ.value = z
    } else {
      this.panner.setPosition(x, y, z)
    }
  }

  // setTargetAtTime is an exponential approach; a time constant of seconds/3 lands within a few
  // percent of the target after `seconds`, which matches Unity's per-sample glide closely enough.
  fadeIn(gain, seconds) {
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setTargetAtTime(gain, now, Math.max(0.01, seconds) / 3)
  }

  fadeOut(seconds) {
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setTargetAtTime(0, now, Math.max(0.01, seconds) / 3)
  }

  stopOscillators() {
    this.oscillators.forEach((o) => { try { o.stop() } catch (e) { /* already stopped */ } o.disconnect() })
    this.oscillators = []
  }

  stop() {
    this.stopOscillators()
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    this.gain.gain.value = 0
    this.starId = null
    this.pitchHz = 0
  }
}

export {StarVoice}
export default StarVoice
```

- [ ] **Step 2: Confirm it compiles**

Run: `cd orion && npm run build`
Expected: exit 0. The module is not imported by anything yet, so webpack may tree-shake it;
that is fine — Task 4 imports it.

- [ ] **Step 3: Commit**

```bash
git add orion/src/js/star-voice.js
git commit -m "feat: star voice as a Web Audio oscillator graph"
```

---

## Task 4: The star-audio component

**Files:**
- Create: `orion/src/js/star-audio.js`
- Modify: `orion/src/app.js`

**Interfaces:**
- Consumes: `StarVoice` from `./star-voice`; `physicsFor` from `./star-physics`; `nuMaxMicroHz`, `toPitchHz`, `quantize` from `./star-tone`.
- Produces: A-Frame component `star-audio` with methods `unlock()`, `pitchFor(star, {mapping, scale}) -> number`, `playStar(star, opts) -> void`, `playChord(stars, opts) -> void`, `stopAll()`, `isAvailable() -> boolean`, and `describe(star) -> {pitchHz, truePitchHz, physics}`.

- [ ] **Step 1: Write the implementation**

Create `orion/src/js/star-audio.js`:

```javascript
// js/star-audio.js
// Owns the AudioContext, the master gain and a pool of voices, and turns a star's data into a
// sounding tone. Attached to the scene; the info panel and the lore journey call into it.
//
// Nothing here plays on its own. Audio happens because the Starsong tab asked for it, or
// because a journey stop arrived.
import {StarVoice} from './star-voice'
import {physicsFor} from './star-physics'
import {nuMaxMicroHz, toPitchHz, quantize} from './star-tone'

const starAudioComponent = {
  schema: {
    baseHz: {type: 'number', default: 110},
    octaves: {type: 'int', default: 2},
    maxPartials: {type: 'int', default: 4},
    beatCents: {type: 'number', default: 6},
    voiceGain: {type: 'number', default: 0.18},
    attack: {type: 'number', default: 1.2},
    release: {type: 'number', default: 2.0},
    // Phones are already running SLAM, camera and bloom, so they get a smaller budget.
    maxVoices: {type: 'int', default: 0},  // 0 = choose from the device
  },

  init() {
    this.ctx = null
    this.master = null
    this.voices = []
    this.playing = new Map()   // starId -> voice
    this.range = null          // {min, max} nu_max across the loaded constellation

    const coarse = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    this.voiceBudget = this.data.maxVoices > 0 ? this.data.maxVoices : (coarse ? 6 : 12)

    // Browsers refuse to start audio without a gesture. The tap that places the portal is one,
    // and the Starsong buttons call unlock() too as a backstop.
    this.onGesture = this.unlock.bind(this)
    window.addEventListener('touchend', this.onGesture, {once: true})
    window.addEventListener('mousedown', this.onGesture, {once: true})
  },

  isAvailable() {
    return typeof (window.AudioContext || window.webkitAudioContext) === 'function'
  },

  // Safe to call repeatedly; creates the context on first use and resumes it if suspended.
  unlock() {
    if (!this.isAvailable()) return false
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx.state !== 'suspended'
  },

  // Compress needs the constellation's own nu_max span so its stars keep their relative order.
  computeRange(stars) {
    let min = Infinity
    let max = -Infinity
    stars.forEach((s) => {
      const p = physicsFor(s)
      const nu = nuMaxMicroHz(p.massSolar, p.radiusSolar, p.tempKelvin)
      if (nu > 0) { min = Math.min(min, nu); max = Math.max(max, nu) }
    })
    this.range = (min < max) ? {min, max} : {min: 1, max: 1e4}
    return this.range
  },

  pitchFor(star, opts) {
    const o = opts || {}
    const mapping = o.mapping || 'compress'
    const scale = o.scale || 'pentatonic'
    if (!this.range) {
      const loaderEl = document.querySelector('[constellation-loader]')
      const loader = loaderEl && loaderEl.components['constellation-loader']
      const stars = (loader && loader.constellationData && loader.constellationData.stars) || [star]
      this.computeRange(stars)
    }
    const p = physicsFor(star)
    const nu = nuMaxMicroHz(p.massSolar, p.radiusSolar, p.tempKelvin)
    const hz = toPitchHz(nu, this.range.min, this.range.max, mapping, this.data.baseHz, this.data.octaves)
    return quantize(hz, this.data.baseHz, scale)
  },

  // What the Starsong tab shows: both renderings and the physics they came from.
  describe(star) {
    return {
      physics: physicsFor(star),
      pitchHz: this.pitchFor(star, {mapping: 'compress', scale: 'pentatonic'}),
      truePitchHz: this.pitchFor(star, {mapping: 'fold', scale: 'true'}),
    }
  },

  acquireVoice() {
    const free = this.voices.find(v => v.isFree)
    if (free) return free
    if (this.voices.length < this.voiceBudget) {
      const v = new StarVoice(this.ctx, this.master)
      this.voices.push(v)
      return v
    }
    // Pool exhausted: steal the oldest sounding voice, as the Unity build does.
    const oldestId = this.playing.keys().next().value
    const stolen = this.playing.get(oldestId)
    this.playing.delete(oldestId)
    stolen.stop()
    return stolen
  },

  playStar(star, opts) {
    if (!this.unlock()) return
    const o = opts || {}
    const gain = (o.gainScale === undefined ? 1 : o.gainScale) * this.data.voiceGain

    this.stopStar(star.id)
    const voice = this.acquireVoice()
    const p = physicsFor(star)
    voice.starId = star.id
    voice.configure({
      pitchHz: this.pitchFor(star, o),
      tempKelvin: p.tempKelvin,
      maxPartials: this.data.maxPartials,
      beatCents: o.scale === 'true' ? this.data.beatCents : this.data.beatCents,
    })

    const el = document.querySelector('[data-name="' + star.name + '"]')
    if (el && el.object3D) {
      const v = new THREE.Vector3()
      el.object3D.getWorldPosition(v)
      voice.setPosition(v.x, v.y, v.z)
    }

    this.playing.set(star.id, voice)
    voice.fadeIn(gain, this.data.attack)

    // hold, then fade to silence; omit `hold` to leave it sounding until stopped.
    if (o.hold > 0) {
      setTimeout(() => {
        if (this.playing.get(star.id) === voice) this.stopStar(star.id)
      }, (this.data.attack + o.hold) * 1000)
    }
  },

  // Group stops sound together. Quantizing to a scale is what stops this clashing.
  playChord(stars, opts) {
    const o = Object.assign({gainScale: 0.7}, opts || {})
    stars.forEach(s => this.playStar(s, o))
  },

  stopStar(id) {
    const voice = this.playing.get(id)
    if (!voice) return
    this.playing.delete(id)
    voice.fadeOut(this.data.release)
    const v = voice
    setTimeout(() => { if (v.isFree === false && !this.playing.has(v.starId)) v.stop() },
      this.data.release * 1000 + 100)
  },

  stopAll() {
    Array.from(this.playing.keys()).forEach(id => this.stopStar(id))
  },

  remove() {
    window.removeEventListener('touchend', this.onGesture)
    window.removeEventListener('mousedown', this.onGesture)
    this.stopAll()
    this.voices.forEach(v => v.stop())
    this.voices = []
    if (this.ctx) this.ctx.close()
  },
}

export {starAudioComponent}
```

- [ ] **Step 2: Register and attach it**

In `orion/src/app.js`, after the `gallery-back-button` registration, add:

```javascript
import {starAudioComponent} from './js/star-audio'
AFRAME.registerComponent('star-audio', starAudioComponent)
```

and inside the existing `DOMContentLoaded` handler, alongside the back-button attach, add:

```javascript
  if (scene && !scene.hasAttribute('star-audio')) {
    scene.setAttribute('star-audio', '')
  }
```

- [ ] **Step 3: Build**

Run: `cd orion && npm run build`
Expected: exit 0.

- [ ] **Step 4: Verify in the browser**

Serve `orion/dist`, load `?c=orion`, and run in the console:

```javascript
(() => {
  const A = document.querySelector('a-scene').components['star-audio'];
  const L = document.querySelector('[constellation-loader]').components['constellation-loader'];
  const stars = L.constellationData.stars;
  A.unlock();
  const rows = stars.map(s => { const d = A.describe(s);
    return {name: s.name, src: d.physics.source, T: Math.round(d.physics.tempKelvin),
            musical: +d.pitchHz.toFixed(1), true: +d.truePitchHz.toFixed(1)}; });
  console.table(rows);
  return { ctxState: A.ctx && A.ctx.state, budget: A.voiceBudget,
           allFinite: rows.every(r => r.musical > 0 && isFinite(r.true)),
           range: A.range };
})();
```

Expected: `allFinite: true`; every musical pitch between 110 and 440; `ctxState` is `running`
after the call (a real click may be needed first); `budget` is 12 on desktop.

- [ ] **Step 5: Verify a tone actually sounds**

With the page focused, run `document.querySelector('a-scene').components['star-audio'].playStar(
document.querySelector('[constellation-loader]').components['constellation-loader'].constellationData.stars[0], {hold: 3})`
and confirm audio is heard, then silence after roughly 4 seconds.

- [ ] **Step 6: Commit**

```bash
git add orion/src/js/star-audio.js orion/src/app.js
git commit -m "feat: star-audio component with voice pool and autoplay unlock"
```

---

## Task 5: Starsong tab in the info panel

**Files:**
- Modify: `orion/src/star-info-overlay.js`

**Interfaces:**
- Consumes: `star-audio` component methods `describe(star)`, `playStar(star, opts)`, `isAvailable()`, `unlock()`.
- Produces: no new exports; the panel gains a tab strip and a Starsong pane.

- [ ] **Step 1: Read the current panel structure**

Run: `cd orion && grep -n "showInfo\|this.content\|innerHTML" src/star-info-overlay.js | head -20`

The panel builds its body by assigning `this.content.innerHTML` inside `showInfo`. The tabs wrap
that existing markup rather than replacing it: the Info pane keeps today's content untouched.

- [ ] **Step 2: Add the tab strip and Starsong pane**

In `showInfo`, wrap the existing generated body in an Info pane and add a Starsong pane beside
it, plus a two-button tab strip. Insert this structure (adapt the surrounding template literal
to the file's existing variables — the star's `name`, `designation` and formatted info):

```javascript
    // Tabs mirror the Unity build's Info / Sound split. Starsong is opt-in: the tone only
    // sounds when its button is pressed, so exploring stays quiet.
    const audioEl = document.querySelector('a-scene')
    const audio = audioEl && audioEl.components['star-audio']
    const available = audio && audio.isAvailable()
    const d = available ? audio.describe(starData) : null

    const starsongPane = !available
      ? '<p style="opacity:.7;font-size:12px;">Audio is not available in this browser.</p>'
      : `
        <p style="margin:0 0 10px 0;font-size:12px;line-height:1.5;">
          This tone is built from the star's own physics: its oscillations peak near
          <b>${Math.round(d.physics.tempKelvin)} K</b>, and its size sets the pitch.
        </p>
        <div style="font-size:12px;margin-bottom:10px;">
          <div>Musical pitch: <b>${d.pitchHz.toFixed(1)} Hz</b></div>
          <div>True frequency: <b>${d.truePitchHz.toFixed(1)} Hz</b></div>
          <div style="opacity:.65;margin-top:6px;">
            ${d.physics.source === 'data'
              ? 'From measured values for this star.'
              : 'Estimated from its spectral class, so the tone is characteristic of the type.'}
          </div>
        </div>
        <button data-starsong="musical" style="width:100%;margin-bottom:8px;padding:10px;
          background:rgba(66,135,245,.25);border:1px solid #4287f5;border-radius:8px;
          color:#eaf3ff;font-size:14px;cursor:pointer;">Play</button>
        <button data-starsong="true" style="width:100%;padding:10px;
          background:rgba(0,0,0,.3);border:1px solid #4287f5;border-radius:8px;
          color:#eaf3ff;font-size:14px;cursor:pointer;">True sound</button>`
```

Render the two panes with a tab strip above them, defaulting to Info:

```javascript
    this.content.innerHTML = `
      <div class="sip-tabs" style="display:flex;gap:6px;margin-bottom:10px;">
        <button data-tab="info" style="flex:1;padding:6px;font-size:13px;cursor:pointer;
          border:1px solid #4287f5;border-radius:6px;background:rgba(66,135,245,.25);color:#eaf3ff;">Info</button>
        <button data-tab="starsong" style="flex:1;padding:6px;font-size:13px;cursor:pointer;
          border:1px solid #4287f5;border-radius:6px;background:rgba(0,0,0,.3);color:#eaf3ff;">Starsong</button>
      </div>
      <div data-pane="info">${existingBodyMarkup}</div>
      <div data-pane="starsong" style="display:none;">${starsongPane}</div>`
```

- [ ] **Step 3: Wire the tab and button handlers**

Immediately after assigning `innerHTML` in `showInfo`, add:

```javascript
    // Delegated once per render; the panel rebuilds its body for each star.
    this.content.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const want = btn.dataset.tab
        this.content.querySelectorAll('[data-pane]').forEach((pane) => {
          pane.style.display = pane.dataset.pane === want ? '' : 'none'
        })
        this.content.querySelectorAll('[data-tab]').forEach((b) => {
          b.style.background = b.dataset.tab === want ? 'rgba(66,135,245,.25)' : 'rgba(0,0,0,.3)'
        })
      })
    })

    this.content.querySelectorAll('[data-starsong]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const sceneEl = document.querySelector('a-scene')
        const a = sceneEl && sceneEl.components['star-audio']
        if (!a) return
        a.unlock()
        const trueMode = btn.dataset.starsong === 'true'
        a.playStar(starData, trueMode
          ? {mapping: 'fold', scale: 'true', hold: 3}
          : {mapping: 'compress', scale: 'pentatonic', hold: 3})
      })
    })
```

`starData` must be the full star object (with `id`, `name`, `spectralClass` and any `physics`),
not just the formatted text. If `showInfo` currently receives only strings, pass the star object
through from `handleStarClick` as an extra argument.

- [ ] **Step 4: Build and verify**

Run: `cd orion && npm run build`, serve, load `?c=orion`, then in the console:

```javascript
(() => {
  const L = document.querySelector('[constellation-loader]').components['constellation-loader'];
  const overlay = document.querySelector('a-scene').components['star-info-overlay'];
  const star = L.constellationData.stars.find(s => s.name === 'Betelgeuse');
  overlay.showInfo(star.name, star.dataset ? star.dataset.info : star.info.basic, '#ff5a3c', 0.17, 'red', star);
  const c = document.getElementById('star-info-overlay');
  return {
    tabs: Array.from(c.querySelectorAll('[data-tab]')).map(b => b.dataset.tab),
    panes: Array.from(c.querySelectorAll('[data-pane]')).map(p => p.dataset.pane),
    starsongButtons: Array.from(c.querySelectorAll('[data-starsong]')).map(b => b.dataset.starsong),
    infoVisibleByDefault: c.querySelector('[data-pane="info"]').style.display !== 'none',
  };
})();
```

Expected: `tabs: ['info','starsong']`, `panes: ['info','starsong']`,
`starsongButtons: ['musical','true']`, `infoVisibleByDefault: true`.
Adapt the `showInfo` call above to the signature the file actually has.

- [ ] **Step 5: Confirm tapping a star is still silent**

Tap a star in the browser and confirm no tone plays — only the panel opens.

- [ ] **Step 6: Commit**

```bash
git add orion/src/star-info-overlay.js
git commit -m "feat: Starsong tab with musical and true-sound playback"
```

---

## Task 6: Journey stops sound their stars

**Files:**
- Modify: `orion/src/js/lore-journey.js`

**Interfaces:**
- Consumes: `star-audio` methods `playChord(stars, opts)`, `stopAll()`.
- Produces: no new exports.

- [ ] **Step 1: Add an audio helper to the component**

In `orion/src/js/lore-journey.js`, add these methods to the component object:

```javascript
  audio() {
    const scene = this.el.sceneEl || document.querySelector('a-scene')
    return scene && scene.components['star-audio']
  },

  // Each stop announces itself: the targets swell in, hold, then fade to silence so the story
  // reads in quiet. Group stops (the Belt, the Chains) therefore arrive as a chord.
  soundStop(stop) {
    const a = this.audio()
    if (!a) return
    const loaderEl = document.querySelector('[constellation-loader]')
    const loader = loaderEl && loaderEl.components['constellation-loader']
    const all = (loader && loader.constellationData && loader.constellationData.stars) || []
    const targets = stop.targetStarNames
      .map(n => all.find(s => s.name === n))
      .filter(Boolean)
    if (targets.length) a.playChord(targets, {hold: 2.5})
  },
```

- [ ] **Step 2: Call it when a stop opens**

In `goToStop(i)`, immediately after `this.showLore(stop)`, add:

```javascript
    this.soundStop(stop)
```

In `transitionTo(i)`, inside the completion branch immediately after its `this.showLore(stop)`,
add the same line.

- [ ] **Step 3: Silence on exit**

In `endJourney()`, immediately after `this.clearDetailed()`, add:

```javascript
    const a = this.audio()
    if (a) a.stopAll()
```

- [ ] **Step 4: Build and verify**

Run: `cd orion && npm run build`, serve, load `?c=andromeda`, then in the console:

```javascript
(() => {
  const J = document.querySelector('a-scene').components['lore-journey'];
  const A = document.querySelector('a-scene').components['star-audio'];
  A.unlock();
  J.stops = J.getStops(); J.active = true;
  J.goToStop(3);                              // "The Chains" - four target stars
  const chordVoices = A.playing.size;
  J.endJourney();
  return { chordVoices, afterEnd: A.playing.size,
           expectedChord: J.stops[3].targetStarNames.length };
})();
```

Expected: `chordVoices` equals `expectedChord` (4), and `afterEnd` is 0.

- [ ] **Step 5: Listen to a full journey**

Run the journey on `?c=orion` and confirm each stop swells and fades, and that Orion's Belt
sounds as a chord rather than three clashing tones.

- [ ] **Step 6: Commit**

```bash
git add orion/src/js/lore-journey.js
git commit -m "feat: sound each lore journey stop"
```

---

## Task 7: Reset audio on constellation change

**Files:**
- Modify: `orion/src/js/constellation-loader.js`

**Interfaces:**
- Consumes: `star-audio` methods `stopAll()`, `computeRange(stars)`.
- Produces: no new exports.

- [ ] **Step 1: Add the reset**

The Compress mapping is relative to the loaded constellation's own nu_max span, so switching
constellations must recompute it or Andromeda's stars would be pitched against Orion's range.

In `loadConstellationData()`, immediately after `this.applyConstellationSettings()`, add:

```javascript
        // Pitches are relative to THIS constellation's nu_max span, so the range is recomputed
        // on every load; any tone still sounding belongs to the previous figure.
        const sceneEl = this.el.sceneEl
        const audio = sceneEl && sceneEl.components['star-audio']
        if (audio) {
          audio.stopAll()
          audio.computeRange(this.constellationData.stars)
        }
```

- [ ] **Step 2: Build and verify**

Run: `cd orion && npm run build`, serve, load `?c=orion`, then in the console:

```javascript
(async () => {
  const A = document.querySelector('a-scene').components['star-audio'];
  const L = document.querySelector('[constellation-loader]').components['constellation-loader'];
  A.unlock();
  const orionRange = Object.assign({}, A.range || A.computeRange(L.constellationData.stars));
  await L.loadConstellation('andromeda');
  await new Promise(r => setTimeout(r, 500));
  return { orionRange, andromedaRange: A.range,
           rangesDiffer: JSON.stringify(orionRange) !== JSON.stringify(A.range),
           playingAfterSwitch: A.playing.size };
})();
```

Expected: `rangesDiffer: true` and `playingAfterSwitch: 0`.

- [ ] **Step 3: Commit**

```bash
git add orion/src/js/constellation-loader.js
git commit -m "feat: recompute the tone range when a constellation loads"
```

---

## Task 8: Document the physics field and run the full check

**Files:**
- Modify: `docs/constellation-data-schema.md`
- Modify: `.claude/agents/star-data-researcher.md`

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Document the optional physics block**

In `docs/constellation-data-schema.md`, in the `stars` section after the field list, add:

```markdown
- `physics` *(optional)* — `{"massSolar": 3.8, "radiusSolar": 2.7, "tempKelvin": 13800}`.
  Feeds the Starsong tone, which needs numbers rather than the prose in `info.scientific`.
  When absent the values are derived from `spectralClass`, giving a tone characteristic of the
  star's type rather than that individual star; the Starsong tab says which it used.
```

- [ ] **Step 2: Ask the researcher agent to collect it**

In `.claude/agents/star-data-researcher.md`, in the "What you produce" JSON example, add
`"physics": {"massSolar": 2.5, "radiusSolar": 15, "tempKelvin": 4400}` to the star entry, and
add this line beneath that section:

```markdown
Include a `physics` block when the source gives mass, radius and temperature as numbers - it
feeds the star's Starsong tone. It is optional: without it the tone is derived from the
spectral class instead, so never guess these values to fill the field.
```

- [ ] **Step 3: Run every check**

```bash
cd orion && node test/star-audio.test.js && npm run build
```

Expected: all unit tests pass; build exits 0.

Then serve and confirm in the browser, for both `?c=orion` and `?c=andromeda`: the Starsong tab
appears with two buttons, tapping a star is silent, a journey stop sounds and fades, and the
console is free of errors.

- [ ] **Step 4: Commit**

```bash
git add docs/constellation-data-schema.md .claude/agents/star-data-researcher.md
git commit -m "docs: physics field for star tones"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** musical default + true mode (Tasks 1, 5); spectral fallback with data
override (Task 2); Starsong tab with two buttons (Task 5); journey swell/hold/fade (Task 6);
autoplay unlock (Task 4); voice pool with oldest-stolen and the mobile cap (Task 4); spatial
panner (Task 3); constellation range reset (Task 7); physics field documented (Task 8); the
verification list in the spec is covered by Task 1/2 unit tests plus the Task 4-7 browser checks.

**Type consistency:** `physicsFor` returns `{massSolar, radiusSolar, tempKelvin, source}`
throughout; `pitchFor(star, {mapping, scale})` and `playStar(star, {mapping, scale, hold,
gainScale})` keep the same option names in Tasks 4, 5 and 6; `mapping` is always
`'compress'|'fold'` and `scale` always `'pentatonic'|'just'|'true'`.

**Known adaptation:** Task 5 depends on `showInfo` receiving the full star object. If the
current signature passes only strings, thread the object through from `handleStarClick` — the
task says so explicitly rather than assuming.

## Not in this plan

- The Quest WebXR POC gets no audio; it is a separate build.
- No ambient/drone bed — considered and dropped in the spec.
- Researched `physics` values for the existing 30 stars; the spectral fallback covers them, and
  a research pass can be run later per the note in Task 8.
