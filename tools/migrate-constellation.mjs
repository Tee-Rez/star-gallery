#!/usr/bin/env node
// tools/migrate-constellation.mjs
//
// Rewrites an existing constellation's star set and figure lines to match the
// Constellation Brain vault (Stellarium western sky culture), which is authoritative
// for WHICH stars are in the figure, how they connect, and what they are called.
//
// What the vault does NOT own is preserved from the file already on disk:
//   physics, info prose, colour, size, stellarType, portal, display, gridBox,
//   deepSkyObjects and journey.
//
// The guiding rule is that hand-researched data beats catalogue data. A star that
// survives the migration keeps every value it already had; only genuinely new stars
// are filled from tools/brain/physics.json, and those are reported so they can be
// researched properly later.
//
// Positions are ALWAYS recomputed for the whole final set, because the gnomonic
// projection centres on the star set's own centroid - change the set and every
// coordinate moves.
//
// Usage:
//   node tools/migrate-constellation.mjs Tau            # write the migrated file
//   node tools/migrate-constellation.mjs Tau --dry      # report only, touch nothing

import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'

const IAU = process.argv[2]
const DRY = process.argv.includes('--dry')
if (!IAU) { console.error('usage: node tools/migrate-constellation.mjs <IAU> [--dry]'); process.exit(1) }

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''))
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8')

const brainC = readJSON('tools/brain/constellations.json')
const brainS = readJSON('tools/brain/stars.json')
const physics = readJSON('tools/brain/physics.json')

const vault = brainC[IAU]
if (!vault) { console.error(`unknown constellation "${IAU}"`); process.exit(1) }

const fileName = vault.name.toLowerCase()
const appPath = `orion/src/data/constellations/${fileName}.json`
if (!fs.existsSync(appPath)) { console.error(`no existing app data at ${appPath}`); process.exit(1) }
const app = readJSON(appPath)

// ---------------------------------------------------------------- naming

const GREEK = {alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω'}

// XHIP names look like "74 Epsilon Tauri (Ain)" or "112 Beta Tauri (Alnath)":
// an optional Flamsteed number, a Bayer designation, and an optional proper name.
function parseXhipName(raw) {
  if (!raw) return {bayer: null, proper: null}
  const m = raw.match(/^(?:(\d+)\s+)?([^(]+?)(?:\s*\(([^)]+)\))?$/)
  if (!m) return {bayer: null, proper: null}
  let bayer = m[2] ? m[2].trim() : null
  // A star with no Greek letter is known by its Flamsteed number - "68 Tauri", not "Tauri".
  // XHIP writes components as "Theta-2 Tauri", so strip the suffix before the lookup.
  const head = bayer ? bayer.split(/\s+/)[0].toLowerCase().replace(/-\d$/, '') : ''
  if (bayer && m[1] && !GREEK[head]) bayer = `${m[1]} ${bayer}`
  let proper = m[3] ? m[3].trim() : null
  // Parentheses sometimes hold a catalogue id rather than a name - not a proper name.
  if (proper && /^(HR|HD|HIP|NGC)\s*\d+$/i.test(proper)) proper = null
  return {bayer, proper}
}

// "Epsilon Tauri" -> "ε Tauri", the form the app shows as a designation.
function toGreekDesignation(bayer) {
  if (!bayer) return null
  const m = bayer.match(/^([A-Za-z]+)(?:-(\d))?\s+(.+)$/)
  if (!m) return null
  const letter = GREEK[m[1].toLowerCase()]
  if (!letter) return null
  const sup = m[2] ? {1: '¹', 2: '²', 3: '³'}[m[2]] || m[2] : ''
  return `${letter}${sup} ${m[3]}`
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Normalised key for matching an app star to a vault star across naming schemes.
const norm = (s) => {
  if (!s) return ''
  let t = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  t = t.replace(/[¹²³]/g, c => ({'¹': '1', '²': '2', '³': '3'}[c]))
  for (const [word, ch] of Object.entries(GREEK)) t = t.replace(new RegExp(ch, 'g'), word)
  return t.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---------------------------------------------------------------- appearance

const COLOR_WORD = {O: 'blue', B: 'blue_white', A: 'white', F: 'yellow_white', G: 'yellow', K: 'orange', M: 'red'}
const COLOR_HEX = {O: '#9db4ff', B: '#a8bcff', A: '#ffffff', F: '#ffffff', G: '#fff4e8', K: '#ffb066', M: '#ff7744'}
const LC_WORD = {I: 'supergiant', II: 'bright_giant', III: 'giant', IV: 'subgiant', V: 'main_sequence'}

function appearance(spectralClass, magnitude) {
  const m = String(spectralClass || '').match(/^([OBAFGKM])/)
  const letter = m ? m[1] : 'A'
  const rest = String(spectralClass || '').slice(m ? m[0].length : 0)
  let lc = 'V'
  if (/III|IV/.test(rest)) lc = /IV/.test(rest) && !/III/.test(rest) ? 'IV' : 'III'
  else if (/\bI{1,2}\b|Ia|Ib/.test(rest)) lc = /II(?!I)/.test(rest) ? 'II' : 'I'
  // Brighter stars are drawn larger; the range matches the hand-tuned values already
  // in the built constellations.
  const size = Number(Math.max(0.06, Math.min(0.17, 0.175 - 0.025 * Number(magnitude || 4))).toFixed(3))
  return {
    color: COLOR_HEX[letter],
    stellarType: `${COLOR_WORD[letter]}_${LC_WORD[lc]}`,
    size,
    isMajor: Number(magnitude || 9) < 4.0,
  }
}

// ---------------------------------------------------------------- build the star set

// Index the app's current stars by every name they might be known by.
const appByKey = new Map()
for (const s of app.stars) {
  for (const k of [s.name, s.designation].filter(Boolean).map(norm)) if (k) appByKey.set(k, s)
}

// The projection input written by a previous build carries J2000 coordinates for the
// stars currently in the app. Sky position is the only unambiguous join - names differ
// between catalogues, and Bayer components like chi-1 / chi-2 cannot be told apart by
// name alone. Read it BEFORE anything overwrites it.
const oldInputPath = `tools/input/${fileName}-stars.json`
const oldCoords = new Map()
if (fs.existsSync(oldInputPath)) {
  for (const s of readJSON(oldInputPath).stars || []) {
    if (s.raH !== undefined && s.dec !== undefined) oldCoords.set(s.id, s)
  }
}
const D2R = Math.PI / 180
const arcsecBetween = (a, b) => {
  const d1 = a.dec * D2R
  const d2 = b.dec * D2R
  const dra = (a.raH - b.raH) * 15 * D2R
  return Math.acos(Math.min(1, Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra))) / D2R * 3600
}

const claimed = new Set()
const kept = []
const added = []
const removedIds = new Set(app.stars.map(s => s.id))

const stars = vault.stars.map((hip) => {
  const v = brainS[hip]
  const ph = physics[hip] || {}
  const {bayer, proper} = parseXhipName(ph.xhipName)

  const designation = toGreekDesignation(bayer) || v.designation || bayer || null

  // Match against what is already in the app, under any of its names.
  const candidates = [v.name, proper, bayer, designation, toGreekDesignation(bayer)]
    .filter(Boolean).map(norm)
  let prev = null

  // Position first, where we have it: same point on the sky means same star.
  let bestId = null
  let bestSep = Infinity
  for (const [id, c] of oldCoords) {
    const sep = arcsecBetween(c, {raH: v.raH, dec: v.dec})
    if (sep < bestSep) { bestSep = sep; bestId = id }
  }
  if (bestId && bestSep < 60) {
    const hit = app.stars.find(s => s.id === bestId)
    if (hit && !claimed.has(hit.id)) prev = hit
  }

  if (!prev) for (const k of candidates) { if (appByKey.has(k)) { prev = appByKey.get(k); break } }
  // Catalogues disagree about component digits: the app writes δ¹ Tauri where XHIP writes
  // plain "Delta Tauri". Fall back to a digit-insensitive match, but only when it is
  // unambiguous, so θ¹/θ² can never collapse into one star.
  // Only Bayer designations qualify: "delta tauri" may match "delta1 tauri", but Flamsteed
  // numbers all reduce to the bare genitive ("5 Tauri" and "68 Tauri" both become "tauri"),
  // which would let unrelated stars claim each other.
  const isBayer = k => Object.keys(GREEK).some(w => k.startsWith(w))
  if (!prev) {
    const loose = candidates.filter(isBayer).map(k => k.replace(/\d/g, ''))
    for (const k of loose) {
      const hits = [...appByKey.entries()]
        .filter(([key]) => isBayer(key) && key.replace(/\d/g, '') === k && !claimed.has(appByKey.get(key).id))
      if (hits.length === 1) { prev = hits[0][1]; break }
    }
  }
  if (prev && claimed.has(prev.id)) prev = null
  if (prev) claimed.add(prev.id)

  // Name policy: a real proper name from Stellarium wins, then XHIP's. Failing both, a
  // star that is already in the app keeps the name it has - the app's "Chi1 Orionis" is
  // better than the catalogue's bare "chi Orionis", which has lost the component number.
  const tidyBayer = b => b && b.replace(/-(\d)/, '$1').replace(/^([a-z])/, c => c.toUpperCase())
  const name = v.name || proper || (prev && prev.name) || tidyBayer(bayer) || `HIP ${hip}`

  if (prev) { kept.push({prev, hip, name}); removedIds.delete(prev.id) }
  else added.push({hip, name})

  const spectralClass = (prev && prev.spectralClass) || ph.spectralClass || v.spectralClass || null
  const magnitude = (prev && prev.magnitude !== undefined) ? prev.magnitude : v.magnitude
  const look = appearance(spectralClass, magnitude)

  const star = {
    id: prev ? prev.id : slug(name),
    hip,
    name,
    designation,
    isMajor: prev ? prev.isMajor : look.isMajor,
    position2D: {x: 0, y: 0},                       // filled by the projection below
    distance: (prev && prev.distance) || ph.distanceLy || null,
    magnitude,
    spectralClass,
    color: (prev && prev.color) || look.color,
    size: (prev && prev.size) || look.size,
    stellarType: (prev && prev.stellarType) || look.stellarType,
  }

  // Hand-researched physics and prose always beat the catalogue.
  if (prev && prev.physics) star.physics = prev.physics
  else if (ph.massSolar || ph.radiusSolar || ph.tempKelvin) {
    star.physics = {
      massSolar: ph.massSolar, radiusSolar: ph.radiusSolar, tempKelvin: ph.tempKelvin,
      note: `Catalogue values: ${ph.sources.mass || 'unknown'}. Not hand-checked.`,
    }
  }
  if (prev && prev.info) star.info = prev.info
  return star
})

const byHip = new Map(stars.map(s => [s.hip, s]))

// ---------------------------------------------------------------- projection

const deepSkyCoords = new Map()
const inputPath = `tools/input/${fileName}-stars.json`
if (fs.existsSync(inputPath)) {
  const old = readJSON(inputPath)
  for (const o of old.deepSky || []) deepSkyCoords.set(o.id, {raH: o.raH, dec: o.dec})
}
const missingCoords = (app.deepSkyObjects || []).filter(o => !deepSkyCoords.has(o.id)).map(o => o.id)

const projInput = {
  stars: stars.map(s => ({
    id: s.id,
    raH: Number((brainS[s.hip].raH).toFixed(6)),
    dec: Number((brainS[s.hip].dec).toFixed(6)),
    dist: s.distance,
    mag: s.magnitude,
  })),
  deepSky: (app.deepSkyObjects || []).filter(o => deepSkyCoords.has(o.id))
    .map(o => ({id: o.id, ...deepSkyCoords.get(o.id)})),
}
const tmp = path.join('tools/input', `${fileName}-stars.json`)
if (!DRY) writeJSON(tmp, projInput)
const scratch = DRY ? path.join(process.env.TEMP || '.', `${fileName}-proj.json`) : tmp
if (DRY) writeJSON(scratch, projInput)

const proj = JSON.parse(execFileSync('node',
  ['tools/project-constellation.js', scratch, String(app.portal.width), String(app.portal.height)],
  {encoding: 'utf8'}))

for (const p of proj.stars) {
  const s = stars.find(x => x.id === p.id)
  if (s) s.position2D = p.position2D
}
const deepSkyPos = new Map((proj.deepSky || []).map(o => [o.id, o.position2D]))

// ---------------------------------------------------------------- connections

const connections = vault.connections.map(([a, b]) => {
  const from = byHip.get(a)
  const to = byHip.get(b)
  // Reuse the old segment's semantic type where the same pair existed before.
  const old = (app.connections || []).find(c =>
    (c.from === from.id && c.to === to.id) || (c.from === to.id && c.to === from.id))
  return {from: from.id, to: to.id, type: old ? old.type : 'figure'}
})

// ---------------------------------------------------------------- assemble

const out = {
  ...app,
  stars,
  connections,
  deepSkyObjects: (app.deepSkyObjects || []).map(o =>
    deepSkyPos.has(o.id) ? {...o, position2D: deepSkyPos.get(o.id)} : o),
}

// ---------------------------------------------------------------- journey references

// Journey stops bind to stars BY NAME. A kept star that was renamed (Epsilon Tauri -> Ain)
// must take its references with it; otherwise the stop is stranded - the camera stays on the
// previous star while the new stop's text shows, and nothing errors to say so.
const renames = new Map(kept.filter(k => k.prev.name !== k.name).map(k => [k.prev.name, k.name]))
const rename = n => renames.get(n) || n
out.journey = (app.journey || []).map(stop => ({
  ...stop,
  centerStarName: rename(stop.centerStarName),
  targetStarNames: (stop.targetStarNames || []).map(rename),
}))

// ---------------------------------------------------------------- journey audit

// Whatever is still unresolved after the renames refers to a star that left the figure.
// That is a content decision (cut the stop, or rewrite it), so it is reported, not guessed.
const nameSet = new Set(stars.map(s => norm(s.name)))
const journeyBreaks = []
for (const stop of out.journey) {
  const refs = [stop.centerStarName, ...(stop.targetStarNames || [])].filter(Boolean)
  const lost = refs.filter(r => !nameSet.has(norm(r)))
  if (lost.length) journeyBreaks.push({stop: stop.id, title: stop.title, lost, of: refs.length})
}

// ---------------------------------------------------------------- report

console.log(`\n${vault.name} (${IAU})  ${app.stars.length}/${app.connections.length}  ->  ${stars.length}/${connections.length}`)
console.log(`\n  KEPT ${kept.length}:`)
for (const k of kept) {
  const renamed = k.prev.name !== k.name ? `  ${k.prev.name} -> ${k.name}` : `  ${k.name}`
  console.log(`   ${renamed}`)
}
console.log(`\n  REMOVED ${removedIds.size}: ${[...removedIds].join(', ') || 'none'}`)
console.log(`\n  NEW ${added.length} (catalogue physics, not hand-checked):`)
for (const a of added) console.log(`    ${a.name}  (HIP ${a.hip})`)
if (proj.projectionWarning) console.log(`\n  PROJECTION: ${proj.projectionWarning}`)
console.log(`\n  portal ${app.portal.width}x${app.portal.height}, scale ${proj.scale}, inside=${proj.insidePortal}`)
if (missingCoords.length) console.log(`  DEEP-SKY without coordinates (position kept as-is): ${missingCoords.join(', ')}`)
if (journeyBreaks.length) {
  console.log(`\n  JOURNEY STOPS BROKEN BY THIS MIGRATION:`)
  for (const b of journeyBreaks) console.log(`    ${b.stop} "${b.title}" - lost ${b.lost.length}/${b.of}: ${b.lost.join(', ')}`)
}

if (DRY) { console.log('\n  --dry: nothing written'); process.exit(0) }

// The constellation data files are CRLF on disk. Writing LF would show up as a
// whole-file diff and bury the real change, so match whatever the file already uses.
const original = fs.readFileSync(appPath, 'utf8')
const eol = original.includes('\r\n') ? '\r\n' : '\n'
fs.writeFileSync(appPath, JSON.stringify(out, null, 2).replace(/\r?\n/g, eol) + eol, 'utf8')
console.log(`\n  wrote ${appPath}`)
