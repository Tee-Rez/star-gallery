# Deep-Sky Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a viewer tap a deep-sky object inside a constellation and go into it — a procedural nebula or galaxy that turns in place, or a star cluster that replaces the figure — with visits remembered and shown on the portal HUD.

**Architecture:** Four new modules (pure field generators, a visit store, a marker component, a mode controller) plus a particle-field component, layered on the existing loader. The pure maths is node-testable with no DOM, exactly like `star-tone.js`. The constellation is never destroyed on entry — it fades — and a cluster swap rebuilds only `rotatingContainer`, leaving `#portal` and `staticContainer` untouched.

**Tech Stack:** A-Frame 1.3 (8frame), THREE.js via `AFRAME.THREE`, webpack 5, plain-node assertions for tests.

**Spec:** `orion/docs/superpowers/specs/2026-09-07-deep-sky-layer-design.md`

## Global Constraints

- **All paths are relative to `orion/`** unless stated otherwise. Run every command from `orion/`.
- **Tests are plain node, no framework.** Run with `node test/<file>.test.js`. Follow the `test()` helper style in `test/star-audio.test.js`.
- **Pure modules dual-export**, so they load under webpack, bare node and the browser. Copy the tail of `src/js/star-tone.js` verbatim in shape:
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = Thing
  export {a, b}
  export default Thing
  ```
- **Pure modules must not import THREE or touch the DOM.** Colour is plain `{r, g, b}` in 0..1.
- **Components are registered in `src/app.js`** with `import {xComponent} from './js/x'` then `AFRAME.registerComponent('x', xComponent)`.
- **Data lives twice**: canonical in `src/data/constellations/<id>.json`, and an embedded copy inside `getEmbeddedConstellationData()` in `src/js/constellation-loader.js`. The embedded copy is what runs. **Always regenerate the embedded copy from the file** — never hand-edit it.
- **Build check:** `npm run build` must exit 0. Two webpack size warnings are normal; anything else is a failure.
- **Depth rule (from the spec, verbatim):** in 3D mode a deep-sky object's depth is clamped to the constellation's own box, and *the box is never extended to reach it*. Bounds are `gridBox.depth * zDepthScale`.
- **Shipping particle counts:** 5,000 nebula / 8,000 galaxy. These live in data.
- **Measure geometry in `#root`-local space, never world space.** `#root` moves when the constellation is placed.
- **No `esoteric` field** may be introduced anywhere.

---

### Task 1: Field generators (pure maths)

The visual core, with no THREE and no DOM so it can be tested in node. Ported from the approved prototype at `bench/deep-sky.html`.

**Files:**
- Create: `src/js/deep-sky-field.js`
- Test: `test/deep-sky.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hexToRgb(hex) -> {r, g, b}` — components 0..1
  - `parseColors(csv) -> [{r,g,b}, ...]`
  - `rampColor(stops, t) -> {r, g, b}` — `t` 0 = first stop (centre), 1 = last (edge); clamped
  - `nebulaField(count, params, stops) -> {positions: Float32Array, colors: Float32Array, used: number}`
  - `spiralField(count, params, stops) -> {positions, colors, used}`
  - `generatorFor(layer) -> function|null` — `'nebula'`→`nebulaField`, `'galaxy'`→`spiralField`
  - `FIELD_DEFAULTS` — `{nebula: {...}, galaxy: {...}}`

- [ ] **Step 1: Write the failing test**

Create `test/deep-sky.test.js`:

```js
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

console.log('\n' + passed + ' passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/deep-sky.test.js`
Expected: FAIL — `Cannot find module '../src/js/deep-sky-field.js'`

- [ ] **Step 3: Write the implementation**

Create `src/js/deep-sky-field.js`:

```js
// js/deep-sky-field.js - procedural geometry for deep-sky objects.
//
// Pure maths: no THREE, no DOM, so it can be tested in bare node like star-tone.js. The
// caller turns these typed arrays into a THREE.Points.
//
// Nebulae and galaxies need OPPOSITE particle treatments, which the prototype established:
// gas reads as gas only when large faint sprites accumulate, while a galaxy is genuinely made
// of stars and wants many small crisp points. That difference lives in the data, not here.

// ---- colour ----

function hexToRgb(hex) {
  const h = String(hex).trim().replace('#', '')
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return {r: 1, g: 1, b: 1}
  return {r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255}
}

function parseColors(csv) {
  return String(csv).split(',').map(s => s.trim()).filter(Boolean).map(hexToRgb)
}

// Sample a multi-stop ramp. t = 0 is the first stop (centre), t = 1 the last (edge).
function rampColor(stops, t) {
  if (!stops || stops.length === 0) return {r: 1, g: 1, b: 1}
  if (stops.length === 1) return stops[0]
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i], b = stops[i + 1]
  return {r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f}
}

// ---- noise ----

function vhash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  const c000 = vhash(xi, yi, zi), c100 = vhash(xi + 1, yi, zi)
  const c010 = vhash(xi, yi + 1, zi), c110 = vhash(xi + 1, yi + 1, zi)
  const c001 = vhash(xi, yi, zi + 1), c101 = vhash(xi + 1, yi, zi + 1)
  const c011 = vhash(xi, yi + 1, zi + 1), c111 = vhash(xi + 1, yi + 1, zi + 1)
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v
  return y0 + (y1 - y0) * w
}

// Stacked octaves: broad shapes plus fine detail.
function fbm(x, y, z, oct) {
  let f = 0, amp = 0.5, norm = 0
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise(x, y, z)
    norm += amp
    x *= 2.03; y *= 2.01; z *= 1.99
    amp *= 0.5
  }
  return f / norm
}

// Ridged noise makes stringy filaments rather than round blobs - the shape dust takes.
function ridged(x, y, z, oct) {
  let f = 0, amp = 0.5, norm = 0
  for (let i = 0; i < oct; i++) {
    f += amp * (1 - Math.abs(vnoise(x, y, z) * 2 - 1))
    norm += amp
    x *= 2.03; y *= 2.01; z *= 1.99
    amp *= 0.5
  }
  return f / norm
}

function gauss() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function onSphere() {
  const z = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return [r * Math.cos(a), r * Math.sin(a), z]
}

// ---- generators ----

// Gas and dust sampled against a turbulent density field:
//
//   envelope        overall ellipsoid, fading at the edge
//   x core gain     a few seeds the cloud gathers around
//   x fBm^contrast  turbulence; contrast decides clumps-versus-voids
//   x (1 - dust)    ridged filaments that absorb, cutting dark lanes
//
// The clumping is emergent - nothing places a clump. Brightness and colour follow the same
// density, so dense gas reads hot and ionised while the outskirts fall to deep H-alpha red.
function nebulaField(count, p, stops) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sx = p.spread, sy = p.spread * 0.72, sz = p.spread * 0.80

  const cores = []
  for (let ci = 0; ci < p.cores; ci++) {
    cores.push({
      x: gauss() * sx * 0.34, y: gauss() * sy * 0.34, z: gauss() * sz * 0.34,
      r: (0.16 + Math.random() * 0.22) * p.spread,
    })
  }

  const k = p.turbulence / p.spread
  const seed = Math.random() * 100
  let i = 0, guard = 0
  const maxGuard = count * 80

  while (i < count && guard < maxGuard) {
    guard++
    const x = (Math.random() * 2 - 1) * sx
    const y = (Math.random() * 2 - 1) * sy
    const z = (Math.random() * 2 - 1) * sz
    const e = (x * x) / (sx * sx) + (y * y) / (sy * sy) + (z * z) / (sz * sz)
    if (e > 1) continue

    let d = 1 - e
    let boost = 0
    for (let ci = 0; ci < cores.length; ci++) {
      const q = cores[ci]
      const dx = x - q.x, dy = y - q.y, dz = z - q.z
      boost += Math.exp(-(dx * dx + dy * dy + dz * dz) / (q.r * q.r))
    }
    d *= 1 + boost * p.coreGain
    d *= Math.pow(fbm(x * k + seed, y * k + 4.7, z * k + 19.1, 4), p.contrast)
    const du = ridged(x * k * 0.65 + 51.2, y * k * 0.65 + 8.4, z * k * 0.65 + 33.9, 3)
    d *= 1 - p.dust * Math.pow(du, 2.0)

    const dens = d * p.fill
    if (Math.random() > dens) continue

    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z
    const q = Math.min(1, dens)
    const c = rampColor(stops, 1 - q)          // densest gas takes the first stop
    const f = 0.5 + q * 1.15
    colors[i * 3] = c.r * f; colors[i * 3 + 1] = c.g * f; colors[i * 3 + 2] = c.b * f
    i++
  }

  // Young stars form in the densest gas, so seat them on the cores rather than at random.
  for (let s = 0; s < p.embedded && i < count; s++) {
    const q = cores[s % Math.max(1, cores.length)]
    if (!q) break
    positions[i * 3] = q.x + gauss() * q.r * 0.22
    positions[i * 3 + 1] = q.y + gauss() * q.r * 0.22
    positions[i * 3 + 2] = q.z + gauss() * q.r * 0.22
    colors[i * 3] = 2.6; colors[i * 3 + 1] = 2.6; colors[i * 3 + 2] = 2.9
    i++
  }

  return {positions, colors, used: i}
}

// Logarithmic spiral arms plus a dense central bulge, in a thin disc that flares outward.
function spiralField(count, p, stops) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const nBulge = Math.floor(count * p.bulge)
  const R = p.spread

  for (let i = 0; i < count; i++) {
    let x, y, z, t
    if (i < nBulge) {
      const d = onSphere(), r = Math.pow(Math.random(), 2.1) * R * 0.30
      x = d[0] * r; y = d[1] * r * 0.66; z = d[2] * r
      t = 0
    } else {
      const armIdx = (Math.random() * p.arms) | 0
      const f = Math.pow(Math.random(), 0.55)
      const r = 0.12 * R + f * R * 0.88
      const theta = (armIdx / p.arms) * Math.PI * 2 +
                    Math.log(r / (0.12 * R) + 1) * p.wind
      const scat = (0.035 + f * 0.10) * R * p.scatter
      x = Math.cos(theta) * r + gauss() * scat
      z = Math.sin(theta) * r + gauss() * scat
      y = gauss() * R * 0.030 * (1 + f)
      t = Math.min(1, f + 0.15)
    }
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z
    const c = rampColor(stops, t)
    const f2 = 0.65 + Math.random() * 0.6
    colors[i * 3] = c.r * f2; colors[i * 3 + 1] = c.g * f2; colors[i * 3 + 2] = c.b * f2
  }

  return {positions, colors, used: count}
}

// Tuned in bench/deep-sky.html and approved. Shipping counts are lower than the prototype's
// because the phone also runs the camera feed, SLAM tracking and the portal geometry.
const FIELD_DEFAULTS = {
  nebula: {
    count: 5000, spread: 3.4, sizeRatio: 0.13, opacity: 0.24, spin: 0.05,
    turbulence: 3.6, contrast: 3.2, cores: 4, coreGain: 0.9, dust: 0.8, fill: 1.9,
    embedded: 4,
  },
  galaxy: {
    count: 8000, spread: 4.0, sizeRatio: 0.020, opacity: 0.85, spin: 0.10,
    arms: 2, wind: 4.4, scatter: 0.55, bulge: 0.22,
  },
}

function generatorFor(layer) {
  if (layer === 'nebula') return nebulaField
  if (layer === 'galaxy') return spiralField
  return null
}

const DeepSkyField = {
  hexToRgb, parseColors, rampColor, nebulaField, spiralField, generatorFor, FIELD_DEFAULTS,
}

if (typeof module !== 'undefined' && module.exports) module.exports = DeepSkyField

export {hexToRgb, parseColors, rampColor, nebulaField, spiralField, generatorFor, FIELD_DEFAULTS}
export default DeepSkyField
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/deep-sky.test.js`
Expected: PASS — `16 passed`

- [ ] **Step 5: Commit**

```bash
git add test/deep-sky.test.js src/js/deep-sky-field.js
git commit -m "feat: procedural field generators for nebulae and galaxies"
```

---

### Task 2: Discovery store

The web port of Unity's `DiscoveryStore.cs`. Storage is injected so it can be tested without a browser, and so a quota failure degrades instead of throwing.

**Files:**
- Create: `src/js/discovery-store.js`
- Test: `test/discovery-store.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createStore(storage) -> store` — `storage` is any `{getItem, setItem, removeItem}`
  - `store.load(constellationId) -> string[]`
  - `store.isVisited(constellationId, id) -> boolean`
  - `store.mark(constellationId, id) -> boolean` — true only when newly added
  - `store.countVisited(constellationId, ids) -> number`
  - `store.clear(constellationId)`
  - `defaultStore` — bound to `window.localStorage` when present, in-memory otherwise
  - `KEY_PREFIX` — `'discovered:'`

- [ ] **Step 1: Write the failing test**

Create `test/discovery-store.test.js`:

```js
// Plain-node tests. No framework: run with `node test/discovery-store.test.js`.
const assert = require('assert')
const D = require('../src/js/discovery-store.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

// A stand-in for localStorage, so the store can be tested with no browser.
function fakeStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

test('an unseen constellation starts empty', () => {
  const s = D.createStore(fakeStorage())
  assert.deepStrictEqual(s.load('orion'), [])
})

test('mark records an id and reports it as new', () => {
  const s = D.createStore(fakeStorage())
  assert.strictEqual(s.mark('orion', 'rigel'), true)
  assert.strictEqual(s.isVisited('orion', 'rigel'), true)
})

test('marking the same id twice reports it as not new', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.mark('orion', 'rigel'), false)
  assert.deepStrictEqual(s.load('orion'), ['rigel'])
})

test('constellations do not share their records', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.isVisited('andromeda', 'rigel'), false)
})

test('the key is namespaced', () => {
  const store = fakeStorage()
  const s = D.createStore(store)
  s.mark('orion', 'rigel')
  assert.ok(store._map.has(D.KEY_PREFIX + 'orion'), [...store._map.keys()].join(','))
})

test('countVisited counts only ids that are present', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  s.mark('orion', 'betelgeuse')
  assert.strictEqual(s.countVisited('orion', ['rigel', 'betelgeuse', 'saiph']), 2)
})

test('countVisited ignores duplicates in the query', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.countVisited('orion', ['rigel', 'rigel']), 1)
})

test('clear forgets one constellation only', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  s.mark('andromeda', 'mirach')
  s.clear('orion')
  assert.deepStrictEqual(s.load('orion'), [])
  assert.deepStrictEqual(s.load('andromeda'), ['mirach'])
})

test('empty and blank ids are refused', () => {
  const s = D.createStore(fakeStorage())
  assert.strictEqual(s.mark('orion', ''), false)
  assert.strictEqual(s.mark('orion', null), false)
  assert.deepStrictEqual(s.load('orion'), [])
})

test('a stored blank entry does not become a phantom id', () => {
  const store = fakeStorage()
  store.setItem(D.KEY_PREFIX + 'orion', 'rigel,,saiph,')
  const s = D.createStore(store)
  assert.deepStrictEqual(s.load('orion'), ['rigel', 'saiph'])
})

// Private browsing throws on write. The layer has to work with no persistence at all.
test('a storage that throws degrades to memory instead of raising', () => {
  const hostile = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('quota') },
    removeItem: () => { throw new Error('denied') },
  }
  const s = D.createStore(hostile)
  assert.strictEqual(s.mark('orion', 'rigel'), true)
  assert.strictEqual(s.isVisited('orion', 'rigel'), true)   // held in memory
  assert.deepStrictEqual(s.load('andromeda'), [])
})

console.log('\n' + passed + ' passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/discovery-store.test.js`
Expected: FAIL — `Cannot find module '../src/js/discovery-store.js'`

- [ ] **Step 3: Write the implementation**

Create `src/js/discovery-store.js`:

```js
// js/discovery-store.js - which stars and deep-sky objects have been visited.
//
// A direct port of the Unity build's DiscoveryStore.cs, swapping PlayerPrefs for
// localStorage. Same shape: one comma-separated id set per constellation.
//
// Storage is injected so this is testable without a browser, and so a hostile store - private
// browsing, a full quota - degrades to memory rather than throwing. Losing the record is a
// small disappointment; a crash inside the portal is not.

const KEY_PREFIX = 'discovered:'

function createStore(storage) {
  const memory = new Map()          // fallback, and the mirror when storage refuses

  const key = c => KEY_PREFIX + c

  function readRaw(c) {
    try {
      const v = storage && storage.getItem(key(c))
      if (v !== null && v !== undefined) return v
    } catch (e) { /* fall through to memory */ }
    return memory.has(key(c)) ? memory.get(key(c)) : ''
  }

  function writeRaw(c, raw) {
    memory.set(key(c), raw)
    try {
      if (storage) storage.setItem(key(c), raw)
    } catch (e) { /* memory already holds it */ }
  }

  function load(c) {
    return String(readRaw(c)).split(',').map(s => s.trim()).filter(Boolean)
  }

  function isVisited(c, id) {
    return !!id && load(c).indexOf(String(id)) !== -1
  }

  // Returns true only when this id was not already recorded, so callers can react to a
  // genuinely new discovery without re-reading.
  function mark(c, id) {
    if (!id) return false
    const ids = load(c)
    if (ids.indexOf(String(id)) !== -1) return false
    ids.push(String(id))
    writeRaw(c, ids.join(','))
    return true
  }

  function countVisited(c, ids) {
    const seen = load(c)
    const asked = Array.from(new Set((ids || []).map(String)))
    return asked.filter(id => seen.indexOf(id) !== -1).length
  }

  function clear(c) {
    memory.delete(key(c))
    try {
      if (storage) storage.removeItem(key(c))
    } catch (e) { /* memory is already clear */ }
  }

  return {load, isVisited, mark, countVisited, clear}
}

function browserStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch (e) { /* blocked entirely */ }
  return null
}

const defaultStore = createStore(browserStorage())

const DiscoveryStore = {KEY_PREFIX, createStore, defaultStore}

if (typeof module !== 'undefined' && module.exports) module.exports = DiscoveryStore

export {KEY_PREFIX, createStore, defaultStore}
export default DiscoveryStore
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/discovery-store.test.js`
Expected: PASS — `11 passed`

- [ ] **Step 5: Commit**

```bash
git add test/discovery-store.test.js src/js/discovery-store.js
git commit -m "feat: per-constellation visit record, ported from DiscoveryStore.cs"
```

---

### Task 3: Layer fields in the data

Give M42 and M31 their `layer`, `field`, `info` and `sources`; take the five companions and deferred objects out of the layer. Then regenerate the embedded copies.

**Files:**
- Modify: `src/data/constellations/orion.json` (deepSkyObjects)
- Modify: `src/data/constellations/andromeda.json` (deepSkyObjects)
- Modify: `src/js/constellation-loader.js` (embedded copies — generated, never hand-edited)
- Test: `test/deep-sky-data.test.js`

**Interfaces:**
- Consumes: `generatorFor` from Task 1.
- Produces: every `deepSkyObjects` entry carries `layer`; the two in scope carry a `field` block whose keys match `FIELD_DEFAULTS`.

- [ ] **Step 1: Write the failing test**

Create `test/deep-sky-data.test.js`:

```js
// Plain-node tests. No framework: run with `node test/deep-sky-data.test.js`.
const assert = require('assert')
const F = require('../src/js/deep-sky-field.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

const IDS = ['orion', 'andromeda']
const DATA = {}
IDS.forEach((id) => { DATA[id] = require('../src/data/constellations/' + id + '.json') })

const VALID = ['nebula', 'galaxy', 'cluster', 'none']

test('every deep-sky object declares a layer', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      assert.ok(VALID.indexOf(o.layer) !== -1, id + '/' + o.id + ' has layer ' + o.layer)
    })
  })
})

test('exactly the two in-scope objects are in the layer', () => {
  const inLayer = []
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer !== 'none') inLayer.push(id + '/' + o.id)
    })
  })
  assert.deepStrictEqual(inLayer.sort(), ['andromeda/m31', 'orion/m42'])
})

test('M42 is a nebula and M31 a galaxy', () => {
  const m42 = DATA.orion.deepSkyObjects.find(o => o.id === 'm42')
  const m31 = DATA.andromeda.deepSkyObjects.find(o => o.id === 'm31')
  assert.strictEqual(m42.layer, 'nebula')
  assert.strictEqual(m31.layer, 'galaxy')
})

test('every layer object has a usable generator', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none' || o.layer === 'cluster') return
      assert.ok(F.generatorFor(o.layer), id + '/' + o.id + ' has no generator')
    })
  })
})

test('every layer object carries a field block with the right keys', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none' || o.layer === 'cluster') return
      assert.ok(o.field, id + '/' + o.id + ' has no field block')
      Object.keys(F.FIELD_DEFAULTS[o.layer]).forEach((k) => {
        assert.strictEqual(typeof o.field[k], 'number', o.id + '.field.' + k + ' is not a number')
      })
      assert.ok(typeof o.field.colors === 'string', o.id + '.field.colors must be a csv string')
      assert.ok(F.parseColors(o.field.colors).length >= 2, o.id + ' needs 2+ colour stops')
    })
  })
})

test('every layer object has sourced info', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none') return
      assert.ok(o.info && o.info.basic, id + '/' + o.id + ' has no info.basic')
      assert.ok(o.info.scientific, id + '/' + o.id + ' has no info.scientific')
      assert.ok(o.sources, id + '/' + o.id + ' has no sources')
    })
  })
})

// The real distance must survive somewhere, because the geometry no longer carries it.
test('the scientific note states the real distance', () => {
  const m31 = DATA.andromeda.deepSkyObjects.find(o => o.id === 'm31')
  assert.ok(/light-year/i.test(m31.info.scientific), 'M31 must state its distance in words')
})

test('no esoteric fields anywhere', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      assert.ok(!('esoteric' in (o.info || {})), id + '/' + o.id + ' has an esoteric field')
    })
  })
})

test('markers sit inside the portal bounds', () => {
  IDS.forEach((id) => {
    const hw = DATA[id].portal.width / 2, hh = DATA[id].portal.height / 2;
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none') return
      assert.ok(Math.abs(o.position2D.x) <= hw, o.id + ' x out of portal')
      assert.ok(Math.abs(o.position2D.y) <= hh, o.id + ' y out of portal')
    })
  })
})

console.log('\n' + passed + ' passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/deep-sky-data.test.js`
Expected: FAIL — the first test fails, `orion/m42 has layer undefined`

- [ ] **Step 3: Edit the two data files**

Write and run this script (save as `scripts/add-deep-sky-layers.js`, run `node scripts/add-deep-sky-layers.js`, then delete it):

```js
// One-shot: give each deep-sky object its layer, and the two in scope their field and info.
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'src', 'data', 'constellations')

const M42_FIELD = {
  count: 5000, spread: 3.4, sizeRatio: 0.13, opacity: 0.24, spin: 0.05,
  turbulence: 3.6, contrast: 3.2, cores: 4, coreGain: 0.9, dust: 0.8, fill: 1.9,
  embedded: 4,
  colors: '#eaf2ff,#ffe0c4,#ff4d6a,#8e1e46',
}
const M31_FIELD = {
  count: 8000, spread: 4.0, sizeRatio: 0.020, opacity: 0.85, spin: 0.10,
  arms: 2, wind: 4.4, scatter: 0.55, bulge: 0.22,
  colors: '#fff3d2,#ffdca0,#cfd8ff,#8fa8e0',
}

const PATCH = {
  orion: {
    m42: {
      layer: 'nebula',
      field: M42_FIELD,
      info: {
        basic: 'The Great Orion Nebula, the middle "star" of Orion\'s sword and the nearest ' +
          'region of massive star formation to the Sun. It is bright enough to see with the ' +
          'unaided eye as a fuzzy patch, and the only nebula most people ever see that way.',
        scientific: 'An emission nebula about 1,344 light-years away and some 24 light-years ' +
          'across, lit by the Trapezium - a knot of hot young stars whose ultraviolet light ' +
          'ionises the surrounding hydrogen and makes it glow. Depth here is expressive, not ' +
          'measured: the object is placed at the back of the constellation box rather than at ' +
          'its true distance.',
      },
      sources: 'Wikipedia, Orion Nebula; Messier catalogue',
    },
    m43: {layer: 'none'},
  },
  andromeda: {
    m31: {
      layer: 'galaxy',
      field: M31_FIELD,
      info: {
        basic: 'The Andromeda Galaxy - the faint smudge the Persian astronomer al-Sufi wrote ' +
          'down in about 964 CE as a "little cloud". It is the most distant thing the unaided ' +
          'eye can see, and it spans about six times the width of the full Moon on the sky.',
        scientific: 'A barred spiral galaxy roughly 2,537,000 light-years away, approaching ' +
          'the Milky Way at about 110 km/s. Edwin Hubble identified Cepheid variables in it in ' +
          '1925 and settled the question of whether such objects lay inside our own galaxy - ' +
          'they did not. Depth here is expressive, not measured: at its true distance it would ' +
          'flatten the whole constellation, so it sits at the back of the box instead.',
      },
      sources: 'al-Sufi, Book of Fixed Stars (c. 964); Wikipedia, Andromeda Galaxy',
    },
    m32: {layer: 'none'},
    m110: {layer: 'none'},
    ngc7662: {layer: 'none'},
    ngc752: {layer: 'none'},
  },
}

// layer sits before info so the behavioural fields read together.
const ORDER = ['id', 'name', 'designation', 'type', 'layer', 'position2D', 'distance',
  'magnitude', 'size', 'description', 'field', 'info', 'sources']

Object.keys(PATCH).forEach((cid) => {
  const file = path.join(DIR, cid + '.json')
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  d.deepSkyObjects = (d.deepSkyObjects || []).map((o) => {
    const patch = PATCH[cid][o.id]
    if (!patch) throw new Error('No patch for ' + cid + '/' + o.id)
    const merged = Object.assign({}, o, patch)
    const out = {}
    ORDER.forEach((k) => { if (merged[k] !== undefined) out[k] = merged[k] })
    Object.keys(merged).forEach((k) => { if (!(k in out)) out[k] = merged[k] })
    return out
  })
  fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf8')
  console.log(cid + ': ' + d.deepSkyObjects.length + ' objects patched')
})
```

- [ ] **Step 4: Regenerate the embedded copies from the files**

The embedded copy is what actually runs, and hand-editing it is how Orion drifted before. Save as `scripts/sync-embedded.js`, run `node scripts/sync-embedded.js orion andromeda`, then delete it:

```js
// Replace each constellation's embedded object in constellation-loader.js with the file's
// contents, so the two cannot drift.
const fs = require('fs')
const path = require('path')

const LOADER = path.join(__dirname, '..', 'src', 'js', 'constellation-loader.js')
const DIR = path.join(__dirname, '..', 'src', 'data', 'constellations')

process.argv.slice(2).forEach((cid) => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, cid + '.json'), 'utf8'))
  const src = fs.readFileSync(LOADER, 'utf8')
  const start = src.indexOf("'" + cid + "': ")
  if (start === -1) throw new Error('No embedded entry for ' + cid)
  const open = src.indexOf('{', start)

  let depth = 0, inStr = false, quote = null, i = open
  for (; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (ch === String.fromCharCode(92)) { i++; continue }
      if (ch === quote) inStr = false
      continue
    }
    if (ch === "'" || ch === '"') { inStr = true; quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) break }
  }

  const body = JSON.stringify(d, null, 2).split('\n')
    .map((ln, idx) => (idx === 0 ? ln : '      ' + ln)).join('\n')
  fs.writeFileSync(LOADER, src.slice(0, open) + body + src.slice(i + 1), 'utf8')
  console.log(cid + ': embedded copy regenerated')
})
```

- [ ] **Step 5: Verify the file and the embedded copy agree**

Run:

```bash
node -e "
const fs=require('fs');
const loader=fs.readFileSync('src/js/constellation-loader.js','utf8');
['orion','andromeda'].forEach(id=>{
  const file=JSON.parse(fs.readFileSync('src/data/constellations/'+id+'.json','utf8'));
  const start=loader.indexOf(chr(39)+id+chr(39)+': ');
  console.log(id, 'embedded present:', start!==-1);
  const objs=file.deepSkyObjects.map(o=>o.id+'='+o.layer).join(' ');
  console.log('   ', objs);
  console.log('   embedded mentions layer:', loader.slice(start, start+40000).includes('\"layer\"'));
});
function chr(n){return String.fromCharCode(n)}
"
```

Expected: both constellations present, `m42=nebula m43=none`, `m31=galaxy m32=none m110=none ngc7662=none ngc752=none`, and `embedded mentions layer: true` for both.

- [ ] **Step 6: Run the data test and the build**

Run: `node test/deep-sky-data.test.js`
Expected: PASS — `9 passed`

Run: `npm run build`
Expected: exit 0, two size warnings only.

- [ ] **Step 7: Commit**

```bash
rm -f scripts/add-deep-sky-layers.js scripts/sync-embedded.js
git add test/deep-sky-data.test.js src/data/constellations/orion.json src/data/constellations/andromeda.json src/js/constellation-loader.js
git commit -m "feat: layer, field and sourced info for M42 and M31"
```

---

### Task 4: The particle-field component

Turns a generator's typed arrays into a `THREE.Points`, with a sprite drawn at runtime so no image asset is added.

**Files:**
- Create: `src/js/deep-sky-field-component.js`
- Modify: `src/app.js` (register)

**Interfaces:**
- Consumes: `generatorFor`, `parseColors`, `FIELD_DEFAULTS` from Task 1.
- Produces: component `deep-sky-field`, with a flat schema covering both generators:
  `layer, count, spread, sizeRatio, opacity, spin, colors, turbulence, contrast, cores, coreGain, dust, fill, embedded, arms, wind, scatter, bulge`.
  Exposes `el.components['deep-sky-field'].pointCount` after build.

- [ ] **Step 1: Write the component**

Create `src/js/deep-sky-field-component.js`:

```js
// js/deep-sky-field-component.js - renders a deep-sky object as a THREE.Points cloud.
//
// The maths lives in deep-sky-field.js, which knows nothing about THREE so it can be tested
// in node. This file is the thin A-Frame wrapper: build the geometry once, spin it, clean up.
//
// The sprite is drawn on a canvas at runtime rather than loaded, so this adds nothing to the
// bundle - which matters, the build was already trimmed from 76 MB to 38 MB.
import {generatorFor, parseColors, FIELD_DEFAULTS} from './deep-sky-field'

// One shared sprite for every field: a soft radial falloff. Additive blending does the rest.
let sharedSprite = null
function sprite(THREE) {
  if (sharedSprite) return sharedSprite
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.00, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.52)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.13)')
  g.addColorStop(1.00, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedSprite = new THREE.CanvasTexture(c)
  sharedSprite.needsUpdate = true
  return sharedSprite
}

const deepSkyFieldComponent = {
  schema: {
    layer: {type: 'string', default: 'nebula'},
    count: {type: 'int', default: 5000},
    spread: {type: 'number', default: 3.4},
    sizeRatio: {type: 'number', default: 0.13},   // sprite size as a FRACTION of spread, so
    opacity: {type: 'number', default: 0.24},     // density holds at any object scale
    spin: {type: 'number', default: 0.05},        // radians per second
    colors: {type: 'string', default: '#eaf2ff,#ffe0c4,#ff4d6a,#8e1e46'},
    // nebula
    turbulence: {type: 'number', default: 3.6},
    contrast: {type: 'number', default: 3.2},
    cores: {type: 'int', default: 4},
    coreGain: {type: 'number', default: 0.9},
    dust: {type: 'number', default: 0.8},
    fill: {type: 'number', default: 1.9},
    embedded: {type: 'int', default: 4},
    // galaxy
    arms: {type: 'int', default: 2},
    wind: {type: 'number', default: 4.4},
    scatter: {type: 'number', default: 0.55},
    bulge: {type: 'number', default: 0.22},
  },

  init() {
    this.points = null
    this.pointCount = 0
    this.build()
  },

  update(oldData) {
    if (oldData && Object.keys(oldData).length) this.build()
  },

  build() {
    const THREE = window.THREE || AFRAME.THREE
    this.dispose()

    const gen = generatorFor(this.data.layer)
    if (!gen) {
      console.warn('[deep-sky-field] no generator for layer:', this.data.layer)
      return
    }

    // Fall back per key, so a data block missing one number still renders.
    const defaults = FIELD_DEFAULTS[this.data.layer] || {}
    const p = Object.assign({}, defaults, this.data)
    const stops = parseColors(this.data.colors)
    const out = gen(this.data.count, p, stops)
    if (!out.used) {
      console.warn('[deep-sky-field] generator produced no points for', this.data.layer)
      return
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(out.positions.subarray(0, out.used * 3), 3))
    geometry.setAttribute('color',
      new THREE.BufferAttribute(out.colors.subarray(0, out.used * 3), 3))

    const material = new THREE.PointsMaterial({
      size: this.data.spread * this.data.sizeRatio,
      map: sprite(THREE),
      vertexColors: true,
      transparent: true,
      opacity: this.data.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,          // additive gas must not occlude what is behind it
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(geometry, material)
    this.pointCount = out.used
    this.el.setObject3D('field', this.points)
  },

  tick(time, delta) {
    if (this.points) this.points.rotation.y += (delta / 1000) * this.data.spin
  },

  dispose() {
    if (!this.points) return
    this.el.removeObject3D('field')
    this.points.geometry.dispose()
    this.points.material.dispose()
    this.points = null
    this.pointCount = 0
  },

  remove() {
    this.dispose()
  },
}

export {deepSkyFieldComponent}
export default deepSkyFieldComponent
```

- [ ] **Step 2: Register it**

In `src/app.js`, after the `star-audio` registration (around line 20), add:

```js
import {deepSkyFieldComponent} from './js/deep-sky-field-component'
AFRAME.registerComponent('deep-sky-field', deepSkyFieldComponent)
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Verify it renders in a browser**

Serve and open a scratch page:

```bash
python -m http.server 5077 --bind 127.0.0.1
```

Load `http://127.0.0.1:5077/dist/index.html?c=orion`, wait for the constellation, then in the console:

```javascript
(() => {
  const e = document.createElement('a-entity')
  e.setAttribute('deep-sky-field', {layer: 'nebula'})
  e.setAttribute('position', '0 0 -1')
  document.querySelector('#root').appendChild(e)
  return new Promise(r => setTimeout(() =>
    r(e.components['deep-sky-field'].pointCount), 500))
})()
```

Expected: a number between 1 and 5000, and a visible nebula. Then `layer: 'galaxy'` gives 8000.

- [ ] **Step 5: Commit**

```bash
git add src/js/deep-sky-field-component.js src/app.js
git commit -m "feat: deep-sky-field component rendering generator output"
```

---

### Task 5: The marker

A rotating dashed ring where the object sits, with the `.cantap` collision sphere the existing raycaster needs.

**Files:**
- Create: `src/js/deep-sky-marker.js`
- Modify: `src/app.js` (register)

**Interfaces:**
- Consumes: nothing.
- Produces: component `deep-sky-marker`, schema `{radius, color, segments, dashRatio, spin, visited}`; method `setVisited(bool)`. The entity it is placed on receives a child `a-sphere.cantap`, so a `click` listener on that sphere fires exactly as it does for stars.

- [ ] **Step 1: Write the component**

Create `src/js/deep-sky-marker.js`:

```js
// js/deep-sky-marker.js - "something is here" for a deep-sky object.
//
// A dashed ring that turns slowly. It is deliberately NOT a star: it carries no label sphere
// and never appears in the connection graph, because connections are built from the
// connections array and reference star ids only.
//
// Tapping uses the same convention as stars - an invisible .cantap sphere - so the existing
// raycaster needs no changes.
const deepSkyMarkerComponent = {
  schema: {
    radius: {type: 'number', default: 0.45},
    color: {type: 'color', default: '#8fd8ff'},
    segments: {type: 'int', default: 64},      // dashes are drawn as gaps in a line loop
    dashRatio: {type: 'number', default: 0.55},  // fraction of each segment that is drawn
    spin: {type: 'number', default: 0.6},      // radians per second
    visited: {type: 'boolean', default: false},
  },

  init() {
    this.ring = null
    this.build()
  },

  update(oldData) {
    if (!oldData || !Object.keys(oldData).length) return
    // Visits only change opacity, so avoid rebuilding the geometry for them.
    if (Object.keys(oldData).length === 1 && 'visited' in oldData) {
      this.applyVisited()
      return
    }
    this.build()
  },

  build() {
    const THREE = window.THREE || AFRAME.THREE
    this.dispose()

    // Dashes as explicit segment pairs: LineDashedMaterial needs computeLineDistances and
    // behaves inconsistently across A-Frame's renderer settings, so draw the gaps instead.
    const pts = []
    const step = (Math.PI * 2) / this.data.segments
    for (let i = 0; i < this.data.segments; i++) {
      const a0 = i * step
      const a1 = a0 + step * this.data.dashRatio
      pts.push(
        new THREE.Vector3(Math.cos(a0) * this.data.radius, Math.sin(a0) * this.data.radius, 0),
        new THREE.Vector3(Math.cos(a1) * this.data.radius, Math.sin(a1) * this.data.radius, 0)
      )
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(this.data.color),
      transparent: true,
      opacity: this.data.visited ? 0.30 : 0.85,
      depthWrite: false,
    })
    this.ring = new THREE.LineSegments(geometry, material)
    this.el.setObject3D('ring', this.ring)

    this.ensureTapTarget()
  },

  // Stars use a .cantap sphere for selection; matching that keeps the raycaster untouched.
  ensureTapTarget() {
    let hit = this.el.querySelector('a-sphere.cantap')
    if (!hit) {
      hit = document.createElement('a-sphere')
      hit.setAttribute('class', 'cantap')
      hit.setAttribute('material', {
        color: this.data.color,
        opacity: 0.12,
        transparent: true,
        side: 'double',
        depthTest: true,
        depthWrite: false,
      })
      this.el.appendChild(hit)
    }
    hit.setAttribute('radius', Math.max(this.data.radius, 0.35))
  },

  applyVisited() {
    if (this.ring) this.ring.material.opacity = this.data.visited ? 0.30 : 0.85
  },

  setVisited(v) {
    this.el.setAttribute('deep-sky-marker', 'visited', !!v)
  },

  tick(time, delta) {
    if (this.ring) this.ring.rotation.z += (delta / 1000) * this.data.spin
  },

  dispose() {
    if (!this.ring) return
    this.el.removeObject3D('ring')
    this.ring.geometry.dispose()
    this.ring.material.dispose()
    this.ring = null
  },

  remove() {
    this.dispose()
  },
}

export {deepSkyMarkerComponent}
export default deepSkyMarkerComponent
```

- [ ] **Step 2: Register it**

In `src/app.js`, after the `deep-sky-field` registration:

```js
import {deepSkyMarkerComponent} from './js/deep-sky-marker'
AFRAME.registerComponent('deep-sky-marker', deepSkyMarkerComponent)
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Verify in the browser**

Load `http://127.0.0.1:5077/dist/index.html?c=orion`, then in the console:

```javascript
(() => {
  const e = document.createElement('a-entity')
  e.setAttribute('deep-sky-marker', {radius: 0.5})
  e.setAttribute('position', '0 0 0')
  document.querySelector('#root').appendChild(e)
  return new Promise(r => setTimeout(() => r({
    hasRing: !!e.object3DMap.ring,
    tapTarget: !!e.querySelector('a-sphere.cantap'),
  }), 400))
})()
```

Expected: `{hasRing: true, tapTarget: true}` and a visibly rotating dashed ring.

- [ ] **Step 5: Commit**

```bash
git add src/js/deep-sky-marker.js src/app.js
git commit -m "feat: rotating dashed marker for deep-sky objects"
```

---

### Task 6: Markers in the constellation, with clamped depth

The loader creates a marker per in-layer object, keeps them out of the star arrays, and clamps their depth to the box.

**Files:**
- Modify: `src/js/constellation-loader.js` — `initConstellation`, `updatePositions`, `showSelectionState`, `clearConstellation`
- Test: manual, in the browser

**Interfaces:**
- Consumes: `deep-sky-marker` from Task 5.
- Produces:
  - `this.deepSkyMarkers` — array of marker entities, **not** included in `this.stars`
  - `createDeepSkyMarkers()`
  - `getDeepSkyById(id)`
  - marker `dataset`: `deepSkyId`, `name`, `realX`, `realY`, `realZ`

- [ ] **Step 1: Add marker creation**

In `src/js/constellation-loader.js`, immediately after the `createStarEntity` method, add:

```js
  // Deep-sky objects that are in the layer get a marker. Objects with layer 'none' - the
  // companions of a marked primary, and anything deferred - are skipped: two dashed rings
  // 0.03 units apart, which is what M42 and M43 are, would be untappable.
  createDeepSkyMarkers() {
    this.deepSkyMarkers = []
    const objects = this.constellationData.deepSkyObjects || []

    objects.forEach((obj) => {
      const layer = obj.layer || 'none'
      if (layer === 'none') return

      const entity = document.createElement('a-entity')
      // Angular size varies hugely; floor it so a small object stays tappable.
      const radius = Math.max(0.28, Math.min(0.9, (obj.size || 1) * 0.32))
      entity.setAttribute('deep-sky-marker', {radius})

      const label = document.createElement('a-entity')
      label.setAttribute('billboard', '')
      const text = document.createElement('a-text')
      text.setAttribute('value', obj.name)
      text.setAttribute('align', 'center')
      text.setAttribute('position', `0 ${radius + 0.22} 0.02`)
      text.setAttribute('scale', '1.5 1.5 1.5')
      text.setAttribute('color', '#bfe4ff')
      text.setAttribute('width', '3')
      text.setAttribute('font', 'exo2bold')
      label.appendChild(text)
      entity.appendChild(label)

      entity.setAttribute('position', {x: obj.position2D.x, y: obj.position2D.y, z: 0})
      entity.dataset.deepSkyId = obj.id
      entity.dataset.name = obj.name
      entity.dataset.realX = obj.position2D.x
      entity.dataset.realY = obj.position2D.y
      entity.dataset.realZ = obj.distance ? -obj.distance : 0

      this.rotatingContainer.appendChild(entity)
      this.deepSkyMarkers.push(entity)
    })

    console.log('Deep-sky markers created:', this.deepSkyMarkers.length)
  },

  getDeepSkyById(id) {
    return (this.constellationData.deepSkyObjects || []).find(o => o.id === id) || null
  },
```

- [ ] **Step 2: Call it during initialisation**

In `initConstellation`, immediately after `await this.createConnectionsAsync()` and its log line, add:

```js
      this.createDeepSkyMarkers()
```

Also initialise the array beside the others. Find:

```js
      this.stars = []
      this.connections = []
      this.isAnimating = false
```

and make it:

```js
      this.stars = []
      this.connections = []
      this.deepSkyMarkers = []
      this.isAnimating = false
```

- [ ] **Step 3: Clamp marker depth in `updatePositions`**

`maxAbsZ` and `depthMid` are computed over `this.stars` only, and markers must stay out of that — M31 at 2.54 Mly would otherwise set the scale for the whole figure.

In `updatePositions`, find the end of the star loop:

```js
      positionUpdates.push({
        star,
        position,
      })
    })
```

and insert immediately after it:

```js
    // Deep-sky objects are clamped INTO the box; the box is never extended to reach them.
    // M31 sits 2.54 million light-years away against Andromeda's 44-700 ly stars, so honest
    // scaling would flatten the figure to a plane. Depth here is expressive, not measured -
    // the real distance is stated in the object's info instead.
    const halfBox = depthExtent / 2
    ;(this.deepSkyMarkers || []).forEach((marker) => {
      let position
      if (this.data.showRealPositions) {
        const realZ = parseFloat(marker.dataset.realZ)
        const raw = (maxAbsZ > 0 ? (realZ / maxAbsZ) * depthExtent : 0) - depthMid
        position = {
          x: parseFloat(marker.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(marker.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: Math.max(-halfBox, Math.min(halfBox, raw)),
        }
      } else {
        position = {
          x: parseFloat(marker.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(marker.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: 0,
        }
      }
      positionUpdates.push({star: marker, position})
    })
```

(The apply loop below reads `update.star`, so markers ride the same animation path.)

- [ ] **Step 4: Keep markers tappable at range**

In `showSelectionState`, after the existing `this.stars.forEach(...)` block, add:

```js
    // Markers get the same camera-distance growth as stars, or they become impossible to
    // hit once the constellation is placed across the room.
    ;(this.deepSkyMarkers || []).forEach((marker) => {
      const p = marker.getAttribute('position')
      const dx = cameraPosition.x - p.x, dy = cameraPosition.y - p.y, dz = cameraPosition.z - p.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const hit = marker.querySelector('a-sphere.cantap')
      const comp = marker.components['deep-sky-marker']
      if (!hit || !comp) return
      const base = Math.max(comp.data.radius, 0.35)
      hit.setAttribute('radius', base * Math.min(Math.max(distance / 10, 1), 2))
    })
```

- [ ] **Step 5: Clear them with the rest**

In `clearConstellation`, change:

```js
    // Reset arrays
    this.stars = []
    this.connections = []
```

to:

```js
    // Reset arrays
    this.stars = []
    this.connections = []
    this.deepSkyMarkers = []
```

- [ ] **Step 6: Build and verify the clamp**

Run: `npm run build`
Expected: exit 0.

Load `http://127.0.0.1:5077/dist/index.html?c=andromeda`, place the constellation, switch to 3D View, then in the console:

```javascript
(() => {
  const l = document.querySelector('[constellation-loader]').components['constellation-loader']
  const half = ((l.gridBox && l.gridBox.depth) || 6) * (l.zDepthScale || 0.7) / 2
  const starZ = l.stars.map(s => s.getAttribute('position').z)
  return {
    markers: l.deepSkyMarkers.length,
    halfBox: +half.toFixed(3),
    markerZ: l.deepSkyMarkers.map(m => +m.getAttribute('position').z.toFixed(3)),
    starZRange: [+Math.min(...starZ).toFixed(3), +Math.max(...starZ).toFixed(3)],
    is3D: l.data.showRealPositions,
  }
})()
```

Expected: `markers: 1`; every `markerZ` within `±halfBox`; M31 parked at (or extremely near) `-halfBox`; `starZRange` unchanged from before the markers existed — the box did **not** grow. Repeat with `?c=orion`, expecting `markers: 1`.

- [ ] **Step 7: Commit**

```bash
git add src/js/constellation-loader.js
git commit -m "feat: deep-sky markers in the figure, depth clamped to the box"
```

---

### Task 7: `swapFigure` for clusters

Rebuild only `rotatingContainer`, so the portal, header and grid walls never move.

**Files:**
- Modify: `src/js/constellation-loader.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `swapFigure(figure)` — `figure` is `{stars, connections, deepSkyObjects?}`; returns `true` on success, `false` when refused
  - `restoreFigure()` — puts the constellation's own figure back
  - `this.baseFigure` — the constellation's original arrays, captured on first swap

- [ ] **Step 1: Add the methods**

In `src/js/constellation-loader.js`, immediately after `clearConstellation`, add:

```js
  // Swap the figure inside the portal without disturbing the frame.
  //
  // #portal is a markup element and the grid walls live in staticContainer, so only
  // rotatingContainer holds stars and connection lines. Rebuilding just that container is
  // what lets a star cluster stand in for the constellation without making this whole
  // component re-entrant.
  swapFigure(figure) {
    if (!figure || !Array.isArray(figure.stars) || !figure.stars.length) {
      console.warn('[constellation-loader] swapFigure refused: no stars')
      return false
    }

    // Remember the real figure the first time we leave it.
    if (!this.baseFigure) {
      this.baseFigure = {
        stars: this.constellationData.stars,
        connections: this.constellationData.connections,
        deepSkyObjects: this.constellationData.deepSkyObjects,
      }
    }

    while (this.rotatingContainer.firstChild) {
      this.rotatingContainer.removeChild(this.rotatingContainer.firstChild)
    }
    this.stars = []
    this.connections = []
    this.deepSkyMarkers = []

    this.constellationData.stars = figure.stars
    this.constellationData.connections = figure.connections || []
    this.constellationData.deepSkyObjects = figure.deepSkyObjects || []

    this.createStars()
    this.createConnections()
    this.createDeepSkyMarkers()
    this.setupInteractions()
    this.updatePositions(true)

    // Tones are ranged across the set on screen, so a new set needs a new range.
    const audioEl = document.querySelector('[star-audio]')
    const audio = audioEl && audioEl.components['star-audio']
    if (audio && audio.computeRange) audio.computeRange(figure.stars)

    return true
  },

  restoreFigure() {
    if (!this.baseFigure) return false
    const base = this.baseFigure
    this.baseFigure = null
    return this.swapFigure(base) || true
  },
```

Note `restoreFigure` clears `baseFigure` *before* swapping, so the restore does not capture the cluster as the base.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Verify a round trip leaves the frame untouched**

Load `http://127.0.0.1:5077/dist/index.html?c=orion` and place it. In the console, measure the frame in **`#root`-local space** (world space is invalid — `#root` moves), swap to a throwaway two-star figure, swap back, and compare:

```javascript
(() => {
  const T = window.THREE || AFRAME.THREE
  const root = document.querySelector('#root').object3D
  const measure = () => {
    root.updateMatrixWorld(true)
    const inv = new T.Matrix4().copy(root.matrixWorld).invert()
    const b = new T.Box3()
    const el = document.querySelector('#portal')
    el.object3D.updateMatrixWorld(true)
    el.object3D.traverse(o => {
      if (!o.geometry) return
      o.geometry.computeBoundingBox()
      const g = o.geometry.boundingBox.clone()
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))
      b.union(g)
    })
    return [b.min.x, b.min.y, b.max.x, b.max.y].map(v => +v.toFixed(3))
  }
  const l = document.querySelector('[constellation-loader]').components['constellation-loader']
  const before = measure()
  const starCountBefore = l.stars.length
  const fake = {
    stars: [
      {id: 'a', name: 'Test A', position2D: {x: -1, y: 0}, distance: 100, magnitude: 2,
       color: '#ffffff', size: 0.12, info: {basic: 'test'}},
      {id: 'b', name: 'Test B', position2D: {x: 1, y: 0}, distance: 150, magnitude: 3,
       color: '#ffcc88', size: 0.10, info: {basic: 'test'}},
    ],
    connections: [{from: 'a', to: 'b', type: 'body'}],
  }
  const ok = l.swapFigure(fake)
  const during = measure()
  const swapped = l.stars.length
  l.restoreFigure()
  return new Promise(r => setTimeout(() => r({
    ok, before, during, after: measure(),
    starCountBefore, swapped, restored: l.stars.length,
    frameUnchanged: JSON.stringify(before) === JSON.stringify(during) &&
                    JSON.stringify(before) === JSON.stringify(measure()),
  }), 600))
})()
```

Expected: `ok: true`, `swapped: 2`, `restored: 15`, `frameUnchanged: true`.

Also confirm a refusal is safe:

```javascript
document.querySelector('[constellation-loader]').components['constellation-loader']
  .swapFigure({stars: []})
```

Expected: `false`, a console warning, and the constellation still on screen.

- [ ] **Step 4: Commit**

```bash
git add src/js/constellation-loader.js
git commit -m "feat: swapFigure rebuilds only the figure, leaving the frame in place"
```

---

### Task 8: The layer mode controller

Entering, framing, the orb, both exits, and the navigation stack.

**Files:**
- Create: `src/js/deep-sky-layer.js`
- Modify: `src/app.js` (register)
- Modify: `src/index.html` or `src/body.html` — add `deep-sky-layer` to the scene entity that already carries `lore-journey` (grep for `lore-journey` to find it)

**Interfaces:**
- Consumes: `defaultStore` (Task 2), `deep-sky-field` (Task 4), `deep-sky-marker` (Task 5), `createDeepSkyMarkers`/`getDeepSkyById` (Task 6), `swapFigure`/`restoreFigure` (Task 7).
- Produces:
  - component `deep-sky-layer`; `enter(objectId)`, `exit()`, `isActive()`
  - scene events emitted: `deepSkyEntered` `{id}`, `deepSkyExited` `{id}`, `deepSkyVisited` `{constellation, id}`
  - scene event consumed: `deepSkyRequested` `{id}`

- [ ] **Step 1: Write the component**

Create `src/js/deep-sky-layer.js`:

```js
// js/deep-sky-layer.js - the second layer inside the portal.
//
// Tapping a marker takes you into the object. A nebula or galaxy fades the constellation and
// grows in its place, turning slowly, with one orb that opens its story. A cluster is a star
// figure, so it REPLACES the constellation and behaves exactly like one.
//
// The mode discipline is lifted from lore-journey.js, which already proves it: strip
// one-finger rotation, hide Recenter, close the info panel, remember the 2D/3D state, and put
// every one of those back on the way out. The two modes are mutually exclusive.
import {defaultStore} from './discovery-store'

const deepSkyLayerComponent = {
  schema: {
    growDur: {type: 'number', default: 900},      // ms for the object to scale in
    focusDistance: {type: 'number', default: 2.4},  // units in front of the camera
    completeDelay: {type: 'number', default: 900},  // beat before an automatic return
  },

  init() {
    this.stack = []           // depth is 2 today; a stack costs nothing and avoids a rewrite
    this.active = null        // the object currently entered
    this.host = null          // the entity holding the field + orb
    this.faded = []           // entities we hid, so we restore exactly these
    this.awaitingClose = false
    this.onPanelClosed = null
    this.completionTimer = null

    this.onRequest = this.onRequest.bind(this)
    this.onOrbClick = this.onOrbClick.bind(this)
    this.el.sceneEl.addEventListener('deepSkyRequested', this.onRequest)

    this.createBackButton()
  },

  remove() {
    this.el.sceneEl.removeEventListener('deepSkyRequested', this.onRequest)
    if (this.backBtn && this.backBtn.parentNode) this.backBtn.parentNode.removeChild(this.backBtn)
  },

  loader() {
    const el = document.querySelector('[constellation-loader]')
    return el ? el.components['constellation-loader'] : null
  },

  constellationId() {
    const l = this.loader()
    return (l && l.data && l.data.constellationFile) || 'unknown'
  },

  isActive() {
    return !!this.active
  },

  loreRunning() {
    const el = document.querySelector('[lore-journey]')
    const c = el && el.components['lore-journey']
    return !!(c && c.active)
  },

  // ---- screen-locked back control ----

  createBackButton() {
    this.backBtn = document.createElement('div')
    this.backBtn.textContent = 'Back to the constellation'
    this.backBtn.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: #fff; padding: 12px 22px;
      border: 1px solid #4287f5; border-radius: 20px;
      font-family: Arial, sans-serif; font-size: 15px; z-index: 1001;
      cursor: pointer; opacity: 0; pointer-events: none;
      transition: opacity 300ms ease; user-select: none;
      -webkit-tap-highlight-color: transparent;`
    this.backBtn.addEventListener('click', () => this.exit())
    document.body.appendChild(this.backBtn)
  },

  showBack(show) {
    if (!this.backBtn) return
    this.backBtn.style.opacity = show ? '1' : '0'
    this.backBtn.style.pointerEvents = show ? 'auto' : 'none'
  },

  // ---- mode ----

  enterMode() {
    const l = this.loader()
    this.prevShowReal = l ? l.data.showRealPositions : false
    this.rotatingContainer = l ? l.rotatingContainer : null
    if (this.rotatingContainer && this.rotatingContainer.hasAttribute('xrextras-one-finger-rotate')) {
      this.rotatingContainer.removeAttribute('xrextras-one-finger-rotate')
      this.rotateWasEnabled = true
    }
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      reset.components['reset-view-button'].hideButton()
    }
    this.el.sceneEl.emit('starInfoClosed')
    this.showBack(true)
  },

  exitMode() {
    this.showBack(false)
    this.restoreFaded()
    if (this.rotatingContainer && this.rotateWasEnabled) {
      this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
      this.rotateWasEnabled = false
    }
    const l = this.loader()
    if (l) { l.data.showRealPositions = this.prevShowReal; l.updatePositions(true) }
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      reset.components['reset-view-button'].showButton()
    }
  },

  // Hide rather than remove: nothing is destroyed, so restoring is exact and cheap.
  //
  // This is a visibility switch, not a cross-fade. Star cores, labels and connection lines are
  // separate entities with separate materials, and animating opacity across all of them is
  // both fiddly and easy to leave half-applied on an interrupted exit. The object growing in
  // over growDur carries the transition instead.
  hideConstellation() {
    const l = this.loader()
    if (!l) return
    this.faded = [].concat(l.stars, l.connections, l.deepSkyMarkers || [])
    this.faded.forEach(el => el.setAttribute('visible', false))
  },

  restoreFaded() {
    this.faded.forEach(el => el.setAttribute('visible', true))
    this.faded = []
  },

  // ---- entering ----

  onRequest(e) {
    const id = e && e.detail && e.detail.id
    if (id) this.enter(id)
  },

  enter(objectId) {
    if (this.active) return false
    if (this.loreRunning()) {
      console.warn('[deep-sky-layer] refused: the lore journey is running')
      return false
    }
    const l = this.loader()
    const obj = l && l.getDeepSkyById(objectId)
    if (!obj || !obj.layer || obj.layer === 'none') {
      console.warn('[deep-sky-layer] refused: no such layer object', objectId)
      return false
    }

    if (obj.layer === 'cluster') {
      if (!obj.stars || !obj.stars.length) {
        console.warn('[deep-sky-layer] cluster has no stars:', objectId)
        return false
      }
      this.enterMode()
      this.active = obj
      this.stack.push(objectId)
      l.swapFigure({stars: obj.stars, connections: obj.connections || []})
      this.retitle(obj.name, obj.stars.length)
      this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
      return true
    }

    this.enterMode()
    this.active = obj
    this.stack.push(objectId)
    this.hideConstellation()
    this.spawnField(obj)
    this.retitle(obj.name, 0)
    this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
    return true
  },

  spawnField(obj) {
    const l = this.loader()
    this.host = document.createElement('a-entity')

    const field = Object.assign({layer: obj.layer}, obj.field || {})
    this.host.setAttribute('deep-sky-field', field)
    this.host.setAttribute('position', '0 0 0')
    this.host.setAttribute('scale', '0.01 0.01 0.01')
    l.rotatingContainer.appendChild(this.host)
    this.host.setAttribute('animation__grow', {
      property: 'scale', to: '1 1 1', dur: this.data.growDur, easing: 'easeOutCubic',
    })

    // One orb: the object's own explorable part.
    this.orb = document.createElement('a-sphere')
    this.orb.setAttribute('radius', 0.28)
    this.orb.setAttribute('class', 'cantap')
    this.orb.setAttribute('material', {
      color: '#ffffff', opacity: 0.55, transparent: true,
      emissive: '#9fd0ff', emissiveIntensity: 0.6, depthWrite: false,
    })
    this.orb.setAttribute('position', '0 0 0')
    this.orb.addEventListener('click', this.onOrbClick)
    this.host.appendChild(this.orb)
  },

  onOrbClick() {
    if (!this.active) return
    const obj = this.active
    this.el.sceneEl.emit('deepSkyInfoRequested', {
      name: obj.name,
      designation: obj.designation || '',
      info: obj.info || {},
      sources: obj.sources || '',
    })
    this.markVisited(obj.id)
    this.scheduleCompletion()
  },

  markVisited(id) {
    const c = this.constellationId()
    if (defaultStore.mark(c, id)) {
      this.el.sceneEl.emit('deepSkyVisited', {constellation: c, id})
    }
  },

  // Finishing an object returns you on its own; the back control is always there too.
  //
  // The trigger is the panel CLOSING, not a timer started when it opened - a blind timer
  // would pull the constellation back while the reader is still mid-paragraph.
  scheduleCompletion() {
    if (this.awaitingClose) return
    this.awaitingClose = true
    this.onPanelClosed = () => {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.awaitingClose = false
      if (!this.active) return
      this.completionTimer = setTimeout(() => this.exit(), this.data.completeDelay)
    }
    this.el.sceneEl.addEventListener('starInfoClosed', this.onPanelClosed)
  },

  retitle(label, starCount) {
    const header = document.querySelector('#portal-header')
    if (!header) return
    const attrs = {label}
    if (starCount) attrs.starCount = starCount
    header.setAttribute('portal-header', attrs)
  },

  // ---- leaving ----

  exit() {
    if (!this.active) return false
    const id = this.active.id
    const wasCluster = this.active.layer === 'cluster'
    if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null }
    if (this.onPanelClosed) {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.onPanelClosed = null
    }
    this.awaitingClose = false

    if (this.host) {
      if (this.orb) this.orb.removeEventListener('click', this.onOrbClick)
      if (this.host.parentNode) this.host.parentNode.removeChild(this.host)
      this.host = null
      this.orb = null
    }

    const l = this.loader()
    if (wasCluster && l) l.restoreFigure()

    this.active = null
    this.stack.pop()
    this.exitMode()

    if (l && l.constellationData) {
      this.retitle(l.constellationData.metadata ? l.constellationData.metadata.name :
        this.constellationId(), (l.constellationData.stars || []).length)
    }
    this.el.sceneEl.emit('deepSkyExited', {id})
    return true
  },
}

export {deepSkyLayerComponent}
export default deepSkyLayerComponent
```

- [ ] **Step 2: Register and attach it**

In `src/app.js`, after the `deep-sky-marker` registration:

```js
import {deepSkyLayerComponent} from './js/deep-sky-layer'
AFRAME.registerComponent('deep-sky-layer', deepSkyLayerComponent)
```

Find the markup element carrying `lore-journey`:

```bash
grep -rn "lore-journey" src/*.html
```

Add `deep-sky-layer` to that same element, e.g. `<a-entity lore-journey deep-sky-layer>`.

- [ ] **Step 3: Make markers fire the request**

In `src/js/constellation-loader.js`, in `setupInteractions`, after the existing `this.stars.forEach(...)` block, add:

```js
    // Markers open the deep-sky layer rather than the star info panel.
    ;(this.deepSkyMarkers || []).forEach((marker) => {
      const hit = marker.querySelector('a-sphere.cantap')
      if (!hit) return
      hit.addEventListener('click', () => {
        if (this.isAnimating) return
        this.el.sceneEl.emit('deepSkyRequested', {id: marker.dataset.deepSkyId})
      })
    })
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Verify entering and leaving**

Load `http://127.0.0.1:5077/dist/index.html?c=orion`, place it, then in the console:

```javascript
(() => {
  const layer = document.querySelector('[deep-sky-layer]').components['deep-sky-layer']
  const l = document.querySelector('[constellation-loader]').components['constellation-loader']
  const entered = layer.enter('m42')
  return new Promise(r => setTimeout(() => {
    const state = {
      entered,
      active: layer.isActive(),
      starsHidden: l.stars.every(s => s.getAttribute('visible') === false),
      fieldPresent: !!document.querySelector('[deep-sky-field]'),
      rotationOff: !l.rotatingContainer.hasAttribute('xrextras-one-finger-rotate'),
    }
    layer.exit()
    setTimeout(() => r(Object.assign(state, {
      afterActive: layer.isActive(),
      starsBack: l.stars.every(s => s.getAttribute('visible') !== false),
      fieldGone: !document.querySelector('[deep-sky-field]'),
      rotationBack: l.rotatingContainer.hasAttribute('xrextras-one-finger-rotate'),
    })), 800)
  }, 1400))
})()
```

Expected: `entered: true`, `active: true`, `starsHidden: true`, `fieldPresent: true`, `rotationOff: true`, then `afterActive: false`, `starsBack: true`, `fieldGone: true`, `rotationBack: true`.

Then tap the marker in Orion's sword by hand and confirm the nebula appears, the orb is tappable, and the back control returns you.

- [ ] **Step 6: Commit**

```bash
git add src/js/deep-sky-layer.js src/app.js src/js/constellation-loader.js src/index.html src/body.html
git commit -m "feat: deep-sky layer mode with orb, cluster swap and both exits"
```

---

### Task 9: The object's info panel

The orb's story goes through the existing panel rather than a new one.

**Files:**
- Modify: `src/star-info-overlay.js`

**Interfaces:**
- Consumes: `deepSkyInfoRequested` `{name, designation, info, sources}` from Task 8.
- Produces: the panel renders a deep-sky object; the Starsong tab is omitted, since an object with no mass, radius or temperature has no tone.

- [ ] **Step 1: Listen for the event**

In `src/star-info-overlay.js`, in `init()`, beside the existing listeners (near `this.el.sceneEl.addEventListener('starInfoClosed', this.handleInfoClosed)`), add:

```js
    this.handleDeepSkyInfo = this.handleDeepSkyInfo.bind(this)
    this.el.sceneEl.addEventListener('deepSkyInfoRequested', this.handleDeepSkyInfo)
```

- [ ] **Step 2: Add the handler**

Add this method beside `showInfo`:

```js
  // A deep-sky object reuses the star panel, minus Starsong: with no mass, radius or
  // temperature there is no nu_max, so there is no tone to offer.
  handleDeepSkyInfo(e) {
    const d = (e && e.detail) || {}
    const info = d.info || {}
    let body = ''
    if (info.basic) body += info.basic
    if (info.scientific) body += (body ? '\n\n' : '') + info.scientific
    if (d.sources) body += (body ? '\n\n' : '') + 'Sources: ' + d.sources
    this.showInfo(d.name, body, '#8fd8ff', 0.3, 'deep_sky', d.designation || '')
  },
```

- [ ] **Step 3: Suppress the Starsong tab for deep-sky subjects**

`starRecord(name)` looks a name up among the constellation's stars and returns nothing for a deep-sky object. Confirm `buildStarsongPane` and `wireTabs` already tolerate that:

```bash
grep -n "starRecord\|buildStarsongPane\|wireTabs" src/star-info-overlay.js
```

Read those methods. If `buildStarsongPane(name)` assumes a record exists, guard its entry point:

```js
    const rec = this.starRecord(name)
    if (!rec) return ''       // deep-sky objects have no tone
```

and make `wireTabs` skip wiring when the pane came back empty.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: exit 0.

Load `?c=andromeda`, enter M31 and tap the orb. Expected: the panel opens with M31's name, both info paragraphs and its sources; no Starsong tab; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/star-info-overlay.js
git commit -m "feat: deep-sky objects reuse the info panel, without Starsong"
```

---

### Task 10: The HUD tracker

Unity's third info line, and line 2 becomes explored-of-total.

**Files:**
- Modify: `src/js/portal-header.js`
- Modify: `src/js/constellation-loader.js` (mark stars visited; push counts)

**Interfaces:**
- Consumes: `defaultStore` (Task 2), `deepSkyVisited` (Task 8).
- Produces: `portal-header` schema gains `starsExplored`, `deepSkyExplored`, `deepSkyTotal`; the third line is omitted entirely when `deepSkyTotal` is 0.

- [ ] **Step 1: Make room for a third line**

In `src/js/portal-header.js`, in the `U` layout table, change:

```js
  textY: [-50, -320],  // top edge of each info line, from the group's top
```

to:

```js
  textY: [-50, -320, -590],  // top edge of each info line, from the group's top
```

(Line 2 runs -590 to -830 inside a 900-tall group, so it fits.)

- [ ] **Step 2: Extend the schema**

Add to the `portal-header` schema, after `starCount`:

```js
    starsExplored: {type: 'int', default: 0},        // stars visited, of starCount
    deepSkyExplored: {type: 'int', default: 0},      // deep-sky objects visited
    deepSkyTotal: {type: 'int', default: 0},         // 0 hides the line entirely
```

- [ ] **Step 3: Render the lines**

Replace:

```js
    this.addLine(info, `# of Stars: ${d.starCount}`, 1, infoW)
```

with:

```js
    this.addLine(info, `# of Stars Explored: ${d.starsExplored} / ${d.starCount}`, 1, infoW)

    // Unity carries this line too. Constellations with nothing in the layer omit it rather
    // than advertising "0 / 0".
    if (d.deepSkyTotal > 0) {
      this.addLine(info, `Deep Sky Explored: ${d.deepSkyExplored} / ${d.deepSkyTotal}`, 2, infoW)
    }
```

- [ ] **Step 4: Feed it from the loader**

In `src/js/constellation-loader.js`, add the import at the top of the file, beside the other imports:

```js
import {defaultStore} from './discovery-store'
```

Add this method next to `createPortalHeader`:

```js
  // Push the visit counts onto the HUD. Called after the header exists, whenever a star or
  // deep-sky object is discovered.
  refreshExploredCounts() {
    const header = document.querySelector('#portal-header')
    if (!header || !this.constellationData) return
    const cid = this.data.constellationFile
    const stars = this.constellationData.stars || []
    const objects = (this.constellationData.deepSkyObjects || [])
      .filter(o => o.layer && o.layer !== 'none')

    header.setAttribute('portal-header', {
      starsExplored: defaultStore.countVisited(cid, stars.map(s => s.id)),
      starCount: stars.length,
      deepSkyExplored: defaultStore.countVisited(cid, objects.map(o => o.id)),
      deepSkyTotal: objects.length,
    })
  },
```

- [ ] **Step 5: Mark a star visited when it is selected**

In `setupInteractions`, inside the existing star click handler, alongside `this.pulseStarOnSelect(...)`, add:

```js
          const record = this.getStarDataById(starEntity.dataset.name) ||
            (this.constellationData.stars || [])
              .find(s => s.name === starEntity.dataset.name)
          if (record && defaultStore.mark(this.data.constellationFile, record.id)) {
            this.refreshExploredCounts()
          }
```

- [ ] **Step 6: Refresh on load and on a deep-sky visit**

In `initConstellation`, after `this.createDeepSkyMarkers()`, add:

```js
      this.refreshExploredCounts()
```

And in `init()`, after the URL parsing block, add:

```js
    this.onDeepSkyVisited = () => this.refreshExploredCounts()
    this.el.sceneEl.addEventListener('deepSkyVisited', this.onDeepSkyVisited)
```

with the matching teardown in `remove()`:

```js
    this.el.sceneEl.removeEventListener('deepSkyVisited', this.onDeepSkyVisited)
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: exit 0.

Load `?c=orion` with a clean slate, then in the console:

```javascript
(() => {
  const l = document.querySelector('[constellation-loader]').components['constellation-loader']
  localStorage.removeItem('discovered:orion')
  l.refreshExploredCounts()
  const header = document.querySelector('#portal-header')
  const before = header.getAttribute('portal-header')
  return {
    starsExplored: before.starsExplored,
    starCount: before.starCount,
    deepSkyExplored: before.deepSkyExplored,
    deepSkyTotal: before.deepSkyTotal,
  }
})()
```

Expected: `{starsExplored: 0, starCount: 15, deepSkyExplored: 0, deepSkyTotal: 1}`.

Then tap three stars and the M42 marker's orb, and confirm the HUD reads `# of Stars Explored: 3 / 15` and `Deep Sky Explored: 1 / 1`. Reload and confirm both survive.

Finally load `?c=andromeda` and confirm its own counts are independent, and that the third line reads `0 / 1`.

- [ ] **Step 8: Run everything and commit**

```bash
node test/star-audio.test.js
node test/deep-sky.test.js
node test/discovery-store.test.js
node test/deep-sky-data.test.js
npm run build
```

Expected: all four suites pass; build exits 0.

```bash
git add src/js/portal-header.js src/js/constellation-loader.js
git commit -m "feat: explored counts on the portal HUD"
```

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task: data model → 3; rendering → 1, 4; marker → 5, 6; depth clamp → 6; cluster swap → 7; navigation and both exits → 8; info panel → 9; tracker → 2, 10; error handling → spread across 1 (defaults), 2 (hostile storage), 7 (refusal), 8 (refusals and lore exclusion).

**Deliberately deferred to execution, not placeholders.** Task 9 Step 3 asks the implementer to read `buildStarsongPane`/`wireTabs` before guarding them, because the exact guard depends on code not quoted in this plan. That is a read-then-edit instruction with a stated condition and a concrete patch, not a "handle edge cases".

**Known gap.** Nothing exercises the cluster path — accepted in the spec, and Task 7 Step 3 tests `swapFigure` with a synthetic two-star figure so the mechanism is still proven.
