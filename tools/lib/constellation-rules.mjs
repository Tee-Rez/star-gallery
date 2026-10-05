// tools/lib/constellation-rules.mjs - every computed field a new constellation is drafted with.
//
// Pure functions, no I/O. Each rule that claims to describe the three shipped constellations
// is tested against them in tools/test/constellation-rules.test.mjs; a rule that stops matching
// them is wrong, and the fix is to the rule, never to the shipped data.
//
// These apply to NEW constellations only. Orion, Andromeda and Taurus keep the hand-tuned values
// they shipped with - including ids, which visited-star progress is saved against.

import PRESETS from '../deep-sky-presets.json' with {type: 'json'}

const GREEK = {
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta',
  'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'mu', 'ν': 'nu',
  'ξ': 'xi', 'ο': 'omicron', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon',
  'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
}
const LETTER_FOR = Object.fromEntries(Object.entries(GREEK).map(([l, n]) => [n, l]))
const SUP = {'⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'}
const SUP_FOR = Object.fromEntries(Object.entries(SUP).map(([s, d]) => [d, s]))

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------------------------- identity

// From the DESIGNATION, never the proper name: a star's id is what discovery-store saves the
// user's visited progress against, so it must not move. Proper names do get reassigned (the
// IAU has been naming stars like Chamukuy and Tianguan only recently); Bayer and Flamsteed
// designations never are.
export function starId(designation, hip) {
  if (!designation) return `hip_${hip}`
  const spelled = [...designation.replace(/\(.*?\)/g, '')]
    .map(ch => (GREEK[ch] ? ` ${GREEK[ch]}` : SUP[ch] ?? ch)).join('')
  return spelled.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// The harvest names an unnamed star the way the XHIP catalogue does - "6 Zeta-1 Lyrae (HR 7056)"
// - while the Brain leaves both its name and designation empty. Recover the Bayer designation
// from it, or the Flamsteed one when there is no Bayer letter.
export function designationFromXhip(xhipName) {
  if (!xhipName) return null
  const bare = xhipName.replace(/\(.*?\)/g, '').trim()
  const bayer = bare.replace(/^\d+\s+/, '').match(/^([A-Za-z]+)(?:-(\d))?\s+([A-Z][a-z]+)$/)
  if (bayer) {
    const letter = LETTER_FOR[bayer[1].toLowerCase()]
    if (letter) return `${letter}${bayer[2] ? SUP_FOR[bayer[2]] : ''} ${bayer[3]}`
  }
  const flamsteed = bare.match(/^(\d+)\s+([A-Z][a-z]+)$/)
  return flamsteed ? `${flamsteed[1]} ${flamsteed[2]}` : null
}

// The display name of a star with no proper name, in the shipped style: "Chi1 Orionis".
export function bayerName(designation) {
  return [...designation].map(ch => {
    if (GREEK[ch]) return GREEK[ch][0].toUpperCase() + GREEK[ch].slice(1)
    return SUP[ch] ?? ch
  }).join('')
}

// ------------------------------------------------------------------------------- appearance

export function isMajor(magnitude) {
  return magnitude < 4.0
}

// A least-squares fit to the 46 shipped stars, clamped to the range they use; within 0.008 of
// the hand-tuned values on average.
export function starSize(magnitude) {
  return round(clamp(0.1538 - 0.0205 * magnitude, 0.05, 0.17), 3)
}

const COLOUR = {O: 'blue', B: 'blue_white', A: 'white', F: 'yellow_white', G: 'yellow', K: 'orange', M: 'red'}
const LUMINOSITY = [
  [/Iab|Ia|Ib/, 'supergiant'], [/IV/, 'subgiant'], [/III/, 'giant'],
  [/II/, 'bright_giant'], [/V/, 'main_sequence'], [/I/, 'supergiant'],
]

// Informational: no app code reads stellarType. The class letter is the first CAPITAL of
// OBAFGKM, so the Am-star notation "kA5hF0mF2" reads as the A star it is.
export function stellarType(spectralClass) {
  const sc = spectralClass || ''
  const letter = (sc.match(/[OBAFGKM]/) || ['A'])[0]
  const lum = (LUMINOSITY.find(([re]) => re.test(sc)) || [null, 'main_sequence'])[1]
  return `${COLOUR[letter]}_${lum}`
}

// ------------------------------------------------------------------------------- geometry

export function portalDerived(width, height) {
  return {
    portal: {
      width, height, borderColor: '#00ff00', doorHeight: Math.min(height, 7),
      doorDuration: 4000, lineDrawDuration: 1000, lineDelay: 100,
      position: {x: 0, y: 0, z: 0.1},
    },
    display: {
      gridWidth: width, gridHeight: height, gridSize: 0.5, gridColor: '#00ff00',
      distanceScale: 0.0009, zDepthScale: 0.7,
      scale: {x: 0.5, y: 0.5, z: 0.5}, position: {x: 0, y: 0, z: -1.5},
    },
    gridBox: {
      width, height, depth: Math.min(width, height), cellSize: 0.5,
      color: '#00ff00', opacity: 0.6, wallZ: -1.6,
    },
  }
}

// Right ascension is circular - a figure straddling 0h would otherwise average to 12h, the
// opposite side of the sky - so it is averaged as an angle.
export function centroid(stars) {
  let x = 0, y = 0, dec = 0
  for (const s of stars) {
    const a = (s.raH / 24) * 2 * Math.PI
    x += Math.cos(a); y += Math.sin(a); dec += s.dec
  }
  const raH = ((Math.atan2(y, x) / (2 * Math.PI)) * 24 + 24) % 24
  return {raH, dec: dec / stars.length}
}

// The season of evening visibility, from the figure's centroid RA.
export function season(raH) {
  const r = ((raH % 24) + 24) % 24
  if (r >= 20 || r < 4) return 'autumn'
  if (r < 8) return 'winter'
  if (r < 14) return 'spring'
  return 'summer'
}

export function hemisphere(dec) {
  if (dec >= 10) return 'northern'
  if (dec <= -10) return 'southern'
  return 'both'
}

// --------------------------------------------------------------------------------- physics

const ESTIMATE = /derived from spectral|typical for spectral/i

// Mass, radius and temperature, but only when all three are genuinely MEASURED. The harvest
// records where each value came from, and for roughly 290 of 691 stars that is a spectral-type
// estimate - exactly what the pipeline's failure #8 forbids: each star's tone is computed from
// these, and estimates gave three Orion stars an identical note. A Stefan-Boltzmann radius is
// derived from luminosity and temperature, so it is only as good as the temperature beneath it.
// A value with no recorded source cannot be called measured either.
export function measuredPhysics(rec) {
  if (!rec) return null
  const S = rec.sources || {}
  const known = s => typeof s === 'string' && s.length > 0 && !ESTIMATE.test(s)
  const tempOk = rec.tempKelvin != null && known(S.temp)
  const massOk = rec.massSolar != null && known(S.mass)
  const radiusOk = rec.radiusSolar != null && known(S.radius) &&
    (!/Stefan-Boltzmann/i.test(S.radius) || tempOk)
  if (!(tempOk && massOk && radiusOk)) return null
  return {
    massSolar: round(rec.massSolar, 2),
    radiusSolar: round(rec.radiusSolar, 2),
    tempKelvin: Math.round(rec.tempKelvin),
    note: [...new Set([S.mass, S.radius, S.temp])].join('; '),
  }
}

const TYPE_WORDS = {
  main_sequence: 'main-sequence star', subgiant: 'subgiant', giant: 'giant',
  bright_giant: 'bright giant', supergiant: 'supergiant',
}

function multiple(n) {
  return n < 10 ? n.toFixed(1) : String(Math.round(n))
}

// A first draft of the star panel's science lines, in one consistent format. Drafted, not
// final: the shipped lines carry ranges and caveats a single value loses - Betelgeuse's radius
// reads "640-764 times the Sun's radius" while its physics stores 700 - so the prose stage
// revises these wherever a source gives a range.
export function scientificLines(physics, spectralClass) {
  const type = stellarType(spectralClass)
  const [colour, ...rest] = type.split('_')
  const colourWords = type.startsWith('blue_white') || type.startsWith('yellow_white')
    ? type.split('_').slice(0, 2).join('-') : colour
  const lum = type.startsWith('blue_white') || type.startsWith('yellow_white')
    ? type.split('_').slice(2).join('_') : rest.join('_')
  const lines = {class: `${spectralClass} ${colourWords} ${TYPE_WORDS[lum]}`}
  if (!physics) return lines
  lines.temperature = `About ${(Math.round(physics.tempKelvin / 10) * 10).toLocaleString('en-US')} K`
  lines.mass = `About ${multiple(physics.massSolar)} times the Sun's mass`
  lines.radius = `About ${multiple(physics.radiusSolar)} times the Sun's radius`
  return lines
}

// ------------------------------------------------------------------------------ deep sky

// What a deep-sky object becomes, from its astronomical type. A supported type gets a copy of
// its renderer's seed values - a copy, so tuning one object's colours cannot reach back into the
// registry and change the next constellation's. Anything else is layer none carrying the reason:
// the object stays in the data but the loader draws no marker for it (createDeepSkyMarkers skips
// layer none), as with M1 and M32 today. A constellation never waits on renderer work - the gap
// is designed separately, and the object becomes visible once its renderer exists.
export function presetFor(type, hasNamedMembers) {
  const sup = PRESETS.supported[type]
  if (sup && !(sup.requiresNamedMembers && !hasNamedMembers)) {
    const out = {layer: sup.layer}
    if (sup.field) out.field = structuredClone(sup.field)
    if (sup.render) out.render = structuredClone(sup.render)
    return out
  }
  const key = type === 'open_cluster' ? 'open_cluster_unnamed' : type
  return {
    layer: 'none',
    rendererGap: {
      type,
      startingPoint: PRESETS.needsRenderer[key] ||
        'No renderer and no suggested starting point yet - design one before this can be entered.',
    },
  }
}
