#!/usr/bin/env node
// tools/harvest-star-physics.mjs
//
// Harvests the stellar physics the Starsong tones need - mass, radius, effective
// temperature - plus distance, for every star the Constellation Brain's figures use.
//
// The vault has none of this (see tools/brain/manifest.json), and Stellarium's sky
// culture is a line list, not a physics catalogue. So we go to the catalogues:
//
//   XHIP   V/137D    HIP-indexed. Distance (pc), luminosity (Lsun), spectral type,
//                    Vmag, HD number, proper name. Covers essentially every figure star.
//   PASTEL B/pastel  Spectroscopic Teff and log g, keyed by HD. Best-quality temperature
//                    where a star has been observed; many bright stars have dozens of
//                    determinations, so we take the median.
//
// What cannot be measured is DERIVED by documented physics, never invented, and every
// value carries a source tag so the app can tell measurement from inference:
//
//   Teff   <- PASTEL median, else spectral-type calibration
//   Radius <- Stefan-Boltzmann from L and Teff:  R/Rsun = sqrt(L/Lsun) * (5772/Teff)^2
//   Mass   <- surface gravity and radius:        M/Msun = 10^(logg - 4.438) * (R/Rsun)^2
//             else a spectral-type mass table
//
// Responses are cached under tools/brain/.cache/ so re-runs do not hammer CDS.
//
// Usage:
//   node tools/harvest-star-physics.mjs            # harvest all figure stars
//   node tools/harvest-star-physics.mjs --fresh    # ignore the cache
//   node tools/harvest-star-physics.mjs --only Tau # just one constellation's stars

import fs from 'node:fs'
import path from 'node:path'

const OUT = 'tools/brain'
const CACHE = path.join(OUT, '.cache')
const TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync'
const CHUNK = 150
const FRESH = process.argv.includes('--fresh')

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''))
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

// The Sun, as the calibration point for every derived quantity.
const TEFF_SUN = 5772
const LOGG_SUN = 4.438

// ---------------------------------------------------------------- spectral calibration

// Effective temperature by spectral type. Main-sequence values from the standard
// Pecaut & Mamajek (2013) sequence; giants and supergiants run cooler at the same
// letter, so each luminosity class carries its own row. Used ONLY when no
// spectroscopic determination exists.
const TEFF_TABLE = {
  V: {O: 41000, B: 17000, A: 8500, F: 6700, G: 5600, K: 4400, M: 3200},
  III: {O: 38000, B: 16000, A: 8100, F: 6300, G: 4900, K: 4200, M: 3500},
  I: {O: 33000, B: 14000, A: 8000, F: 6000, G: 4700, K: 4000, M: 3400},
}
// Within a letter, subclass 0-9 interpolates toward the next letter down.
const NEXT_LETTER = {O: 'B', B: 'A', A: 'F', F: 'G', G: 'K', K: 'M', M: 'M'}

// Typical masses, same sources, same caveat.
const MASS_TABLE = {
  V: {O: 25, B: 5.4, A: 2.0, F: 1.3, G: 1.0, K: 0.75, M: 0.35},
  III: {O: 30, B: 7.0, A: 3.0, F: 2.0, G: 2.5, K: 1.5, M: 1.5},
  I: {O: 40, B: 20, A: 16, F: 12, G: 10, K: 12, M: 15},
}

function parseSpType(sp) {
  if (!sp) return null
  const m = String(sp).replace(/"/g, '').trim().match(/^([OBAFGKM])(\d(?:\.\d)?)?/)
  if (!m) return null
  const letter = m[1]
  const sub = m[2] === undefined ? 5 : Number(m[2])
  // Luminosity class: I and II read as supergiant, III/IV as giant, else dwarf.
  const rest = String(sp).slice(m[0].length)
  let lc = 'V'
  if (/I{1,2}(?![IV])/.test(rest) && !/III/.test(rest)) lc = 'I'
  if (/III|IV/.test(rest)) lc = 'III'
  if (/^I[ab]?(?![IV])/.test(rest.trim())) lc = 'I'
  return {letter, sub, lc}
}

function interp(table, letter, sub, lc) {
  const row = table[lc] || table.V
  const a = row[letter]
  const b = row[NEXT_LETTER[letter]]
  if (a === undefined) return null
  // Subclass 0 is the hot end of the letter, 9 the cool end.
  return a + (b - a) * (sub / 10)
}

// ---------------------------------------------------------------- TAP

async function tap(query, cacheKey) {
  const cacheFile = path.join(CACHE, `${cacheKey}.tsv`)
  if (!FRESH && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8')
  // TAP sync rejects long GET query strings with a 400; POST is the portable call.
  const body = new URLSearchParams({request: 'doQuery', lang: 'adql', format: 'tsv', query})
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(TAP, {method: 'POST', body, signal: AbortSignal.timeout(120000)})
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (text.includes('QUERY_STATUS" value="ERROR"')) {
        throw new Error(text.match(/<INFO name="QUERY_STATUS"[^>]*>([\s\S]*?)<\/INFO>/)?.[1] || 'ADQL error')
      }
      fs.mkdirSync(CACHE, {recursive: true})
      fs.writeFileSync(cacheFile, text, 'utf8')
      return text
    } catch (err) {
      if (attempt === 3) throw err
      process.stdout.write(` retry(${attempt})`)
      await sleep(3000 * attempt)
    }
  }
}

// VizieR TSV: comment lines start with #, then a header row, a units/dashes row, then data.
function parseTSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l && !l.startsWith('#') && !l.startsWith('<'))
  if (!lines.length) return []
  const head = lines[0].split('\t').map(h => h.trim())
  const rows = []
  for (const line of lines.slice(1)) {
    if (/^-+(\t-+)*$/.test(line)) continue
    const cells = line.split('\t')
    if (cells.length !== head.length) continue
    const row = {}
    head.forEach((h, i) => { row[h] = cells[i] === undefined ? '' : cells[i].trim().replace(/^"|"$/g, '') })
    rows.push(row)
  }
  return rows
}

const num = v => {
  if (v === undefined || v === null || v === '' || v === '~') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const chunks = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// ---------------------------------------------------------------- harvest

const stars = readJSON(path.join(OUT, 'stars.json'))
const constellations = readJSON(path.join(OUT, 'constellations.json'))

const onlyFlag = process.argv.indexOf('--only')
let hips = Object.keys(stars).map(Number)
if (onlyFlag !== -1) {
  const iau = process.argv[onlyFlag + 1]
  if (!constellations[iau]) { console.error(`unknown constellation "${iau}"`); process.exit(1) }
  hips = constellations[iau].stars
}

console.log(`harvesting physics for ${hips.length} stars`)

// --- XHIP: distance, luminosity, spectral type, HD, proper name
const xhip = new Map()
const xhipChunks = chunks(hips, CHUNK)
for (const [i, group] of xhipChunks.entries()) {
  process.stdout.write(`\r  XHIP  chunk ${i + 1}/${xhipChunks.length}`)
  const q = `SELECT HIP, Dist, Lum, SpType, HD, Name FROM "V/137D/XHIP" WHERE HIP IN (${group.join(',')})`
  const rows = parseTSV(await tap(q, `xhip-${group[0]}-${group[group.length - 1]}`))
  for (const r of rows) xhip.set(num(r.HIP), r)
  await sleep(500)
}
console.log(`\r  XHIP  ${xhip.size}/${hips.length} matched`.padEnd(40))

// --- Allende Prieto & Lambert (1999): mass, radius and Teff fitted against evolutionary
// tracks, HIP-indexed. The best source we have - validated within a few percent of the
// hand-researched values already in the app - but it thins out for the very brightest
// stars, which is why the layers below exist.
const apl = new Map()
const aplChunks = chunks(hips, CHUNK)
for (const [i, group] of aplChunks.entries()) {
  process.stdout.write(`\r  APL   chunk ${i + 1}/${aplChunks.length}`)
  const q = `SELECT HIP, Mass, logRad, logTeff, logg FROM "J/A+A/352/555/table1" WHERE HIP IN (${group.join(',')})`
  let rows = []
  try { rows = parseTSV(await tap(q, `apl-${group[0]}-${group[group.length - 1]}`)) } catch { /* fall through to the layers below */ }
  for (const r of rows) {
    const hip = num(r.HIP)
    if (hip) apl.set(hip, {mass: num(r.Mass), logRad: num(r.logRad), logTeff: num(r.logTeff)})
  }
  await sleep(500)
}
console.log(`\r  APL   ${apl.size}/${hips.length} matched`.padEnd(40))

// --- PASTEL: spectroscopic Teff and log g, keyed by HD
const hdList = [...xhip.values()].map(r => num(r.HD)).filter(Boolean)
const pastel = new Map()
const pastelChunks = chunks([...new Set(hdList)], CHUNK)
for (const [i, group] of pastelChunks.entries()) {
  process.stdout.write(`\r  PASTEL chunk ${i + 1}/${pastelChunks.length}`)
  const ids = group.map(hd => `'HD${String(hd).padStart(7)}'`).join(',')
  const q = `SELECT ID, Teff, logg FROM "B/pastel/pastel" WHERE ID IN (${ids})`
  let rows = []
  try { rows = parseTSV(await tap(q, `pastel-${group[0]}-${group[group.length - 1]}`)) } catch { /* leave to derivation */ }
  for (const r of rows) {
    const hd = num(String(r.ID).replace(/^HD\s*/, ''))
    const teff = num(r.Teff)
    const logg = num(r.logg)
    if (!hd || (!teff && !logg)) continue
    if (!pastel.has(hd)) pastel.set(hd, {teff: [], logg: []})
    if (teff) pastel.get(hd).teff.push(teff)
    if (logg) pastel.get(hd).logg.push(logg)
  }
  await sleep(500)
}
console.log(`\r  PASTEL ${pastel.size} stars with spectroscopy`.padEnd(40))

const median = a => {
  if (!a || !a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------- derive

const physics = {}
const stats = {teffMeasured: 0, teffDerived: 0, radiusMeasured: 0, radiusDerived: 0, massFromGravity: 0, massFromType: 0, distance: 0, incomplete: []}

for (const hip of hips) {
  const x = xhip.get(hip)
  const vaultStar = stars[hip]
  const spRaw = x ? x.SpType : (vaultStar ? vaultStar.spectralClass : null)
  const sp = parseSpType(spRaw) || parseSpType(vaultStar ? vaultStar.spectralLetter + 'V' : null)
  const hd = x ? num(x.HD) : null
  const spec = hd ? pastel.get(hd) : null

  const distPc = x ? num(x.Dist) : null
  const lum = x ? num(x.Lum) : null

  const a = apl.get(hip)

  // --- effective temperature
  let tempKelvin = a && a.logTeff ? Math.pow(10, a.logTeff) : null
  let tempSource = tempKelvin ? 'Allende Prieto & Lambert 1999' : null
  if (!tempKelvin) {
    tempKelvin = median(spec ? spec.teff : null)
    tempSource = tempKelvin ? 'PASTEL spectroscopy (median)' : null
  }
  if (!tempKelvin && sp) {
    tempKelvin = interp(TEFF_TABLE, sp.letter, sp.sub, sp.lc)
    tempSource = `derived from spectral type ${spRaw}`
  }
  if (tempKelvin) tempKelvin = Math.round(tempKelvin / 10) * 10

  // --- radius, Stefan-Boltzmann
  let radiusSolar = a && a.logRad !== null && a.logRad !== undefined ? Math.pow(10, a.logRad) : null
  let radiusSource = radiusSolar ? 'Allende Prieto & Lambert 1999' : null
  if (!radiusSolar && lum && tempKelvin) {
    radiusSolar = Math.sqrt(lum) * Math.pow(TEFF_SUN / tempKelvin, 2)
    radiusSource = 'Stefan-Boltzmann from XHIP luminosity and Teff'
  }

  // --- mass, from surface gravity where spectroscopy gives log g
  let massSolar = a && a.mass ? a.mass : null
  let massSource = massSolar ? 'Allende Prieto & Lambert 1999' : null
  const logg = median(spec ? spec.logg : null)
  if (!massSolar && logg && radiusSolar) {
    massSolar = Math.pow(10, logg - LOGG_SUN) * radiusSolar * radiusSolar
    massSource = 'from PASTEL log g and derived radius'
  } else if (!massSolar && sp) {
    massSolar = interp(MASS_TABLE, sp.letter, sp.sub, sp.lc)
    massSource = `typical for spectral type ${spRaw}`
  }

  const round = (v, d) => v === null ? null : Number(v.toFixed(d))
  const entry = {
    hip,
    distanceLy: distPc ? round(distPc * 3.26156, 1) : null,
    luminositySolar: lum ? round(lum, 2) : null,
    spectralClass: spRaw || null,
    massSolar: round(massSolar, 2),
    radiusSolar: round(radiusSolar, 2),
    tempKelvin: tempKelvin || null,
    sources: {temp: tempSource, radius: radiusSource, mass: massSource, distance: distPc ? 'XHIP (Hipparcos parallax)' : null},
    xhipName: x && x.Name ? x.Name : null,
  }
  physics[hip] = entry

  const measured = s => s && (s.startsWith('Allende') || s.startsWith('PASTEL'))
  if (measured(tempSource)) stats.teffMeasured++
  else if (tempSource) stats.teffDerived++
  if (measured(radiusSource)) stats.radiusMeasured++
  else if (radiusSource) stats.radiusDerived++
  if (measured(massSource) || (massSource && massSource.startsWith('from PASTEL'))) stats.massFromGravity++
  else if (massSource) stats.massFromType++
  if (entry.distanceLy) stats.distance++
  if (!entry.massSolar || !entry.radiusSolar || !entry.tempKelvin) stats.incomplete.push(hip)
}

writeJSON(path.join(OUT, 'physics.json'), physics)

console.log('')
console.log(`  distance          ${stats.distance}/${hips.length}`)
console.log(`  Teff measured     ${stats.teffMeasured}`)
console.log(`  Teff derived      ${stats.teffDerived}`)
console.log(`  radius measured   ${stats.radiusMeasured}`)
console.log(`  radius derived    ${stats.radiusDerived}`)
console.log(`  mass from log g   ${stats.massFromGravity}`)
console.log(`  mass from type    ${stats.massFromType}`)
console.log(`  INCOMPLETE        ${stats.incomplete.length}${stats.incomplete.length ? ' -> ' + stats.incomplete.slice(0, 20).join(', ') : ''}`)
console.log(`\nwrote ${path.join(OUT, 'physics.json')}`)
