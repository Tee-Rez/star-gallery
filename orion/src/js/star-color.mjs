// js/star-color.mjs - the blackbody ramp a star's colour is read from.
//
// One copy, imported by both star-visual.js (in the browser, through webpack) and the
// constellation tools (in Node). It used to live inside star-visual.js, where the tools could
// not reach it; a second copy in the tools would have let the colour a new star is drafted with
// drift from the colour it is drawn with. `.mjs` because the app's package.json declares no
// module type, so Node reads a plain `.js` file as CommonJS and the `export` below would fail.
//
// Dependency-free: no THREE, no DOM, so it loads in Node unchanged.

// The ramp nebula-core.js keys its star colours off, copied rather than imported: nebula-core
// does not export bbColor, and the constellation draws with or without a deep-sky object - and
// so without window.NebulaCore - in the scene.
export const BB = [[1, 0.52, 0.22], [1, 0.70, 0.43], [1, 0.86, 0.70], [1, 0.95, 0.89],
  [0.96, 0.96, 1], [0.82, 0.88, 1], [0.70, 0.80, 1]]

export function bbColor(t) {
  const f = Math.max(0, Math.min(1, t)) * (BB.length - 1)
  const i = Math.min(BB.length - 2, Math.floor(f)), k = f - i, a = BB[i], b = BB[i + 1]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

// Temperature to ramp position, in LOG T. Linear in kelvin spends most of the ramp between
// 20,000K and 30,000K, where the colour barely changes, and crushes the 3,000-6,000K range
// where it changes fastest - which is where most of a constellation's stars actually sit.
export function tempToRamp(k) {
  if (!(k > 0)) return -1
  const lo = Math.log(2500), hi = Math.log(30000)
  return Math.max(0, Math.min(1, (Math.log(k) - lo) / (hi - lo)))
}

// Spectral class is the fallback when physics.tempKelvin is absent: the letter alone fixes the
// temperature to within a class, which is far closer than an authored hex, and unlike the hex
// it lands on the same ramp as everything else.
export const CLASS_K = {O: 30000, B: 15000, A: 8500, F: 6800, G: 5600, K: 4400, M: 3200}

// Ramp position for a star, or -1 when there is nothing astrophysical to go on. Exactly the
// order star-visual has always used - temperature, then the spectral letter - so moving it here
// changes no star's colour.
export function rampForStar(data) {
  let t = tempToRamp(data.tempKelvin)
  if (t < 0 && data.spectralClass) {
    const m = /^\s*([OBAFGKM])/.exec(data.spectralClass.toUpperCase())
    if (m) t = tempToRamp(CLASS_K[m[1]])
  }
  return t
}

export function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16).padStart(2, '0')).join('')
}
