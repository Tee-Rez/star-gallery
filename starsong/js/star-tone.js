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
