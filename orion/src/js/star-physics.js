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
  I: {mass: 6.0, radius: 60},
  II: {mass: 3.5, radius: 25},
  III: {mass: 2.0, radius: 12},
  IV: {mass: 1.3, radius: 2.5},
  V: {mass: 1.0, radius: 1.0},
  VI: {mass: 0.8, radius: 0.8},
}

const SOLAR = {massSolar: 1, radiusSolar: 1, tempKelvin: 5777}

// "B8IVpMnHg" -> {letter:'B', subclass:8, luminosity:'IV'}.
//
// Catalogue strings are messier than a single tidy token, and the difference matters: a red
// SUPERGIANT read as a main-sequence dwarf comes out ~1000x too small and sounds an octave
// stack too high. So the luminosity class is searched for anywhere after the spectral type
// rather than required to follow it immediately. These all have to work:
//
//   "B8IVpMnHg"    peculiarity suffix glued on   -> IV
//   "M1-M2 Ia-ab"  a RANGE, then a spaced class  -> I
//   "O9.5 Ib"      fractional subclass           -> I
//   "G8III-IV"     a range of classes, take first -> III
//
// Alternatives are ordered longest-first so "III" is never truncated to "II", and the a/ab/b
// supergiant subdivisions are consumed but not distinguished.
const LUMINOSITY_TOKEN = /(VIII|VII|VI|IV|III|II|I|V)(ab|a|b)?/

function parseSpectralClass(str) {
  if (typeof str !== 'string') return null
  const head = str.trim().match(/^([OBAFGKM])\s*(\d(?:\.\d)?)?/i)
  if (!head) return null

  const rest = str.trim().slice(head[0].length)
  const lum = rest.match(LUMINOSITY_TOKEN)

  return {
    letter: head[1].toUpperCase(),
    subclass: head[2] === undefined ? 5 : parseFloat(head[2]),
    luminosity: lum ? lum[1].toUpperCase() : 'V',
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
