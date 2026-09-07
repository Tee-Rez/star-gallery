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
