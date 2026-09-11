#!/usr/bin/env node
// tools/import-brain.mjs
//
// Imports the Constellation Brain Obsidian vault into this project's shapes.
//
// The vault is authoritative for FIGURE and IDENTITY:
//   - which stars are in a constellation, and how they connect (Stellarium western sky culture)
//   - each star's HIP id, common name, J2000 RA/Dec, visual magnitude, spectral class
//
// The vault does NOT hold, and this importer cannot produce:
//   - physics (massSolar / radiusSolar / tempKelvin)  -> needed by the Starsong tones
//   - distance in light-years (only 3 of 244 notes carry it)
//   - the info.basic / info.scientific prose the star panel shows
// Those stay app-owned. See the coverage report in tools/brain/manifest.json.
//
// Usage:
//   node tools/import-brain.mjs                    # refresh tools/brain/*.json
//   node tools/import-brain.mjs --emit-input Tau   # also write tools/input/taurus-stars.json
//                                                  # in project-constellation.js's exact shape
//
// Vault location may be overridden with CONSTELLATION_BRAIN=<path>.

import fs from 'node:fs'
import path from 'node:path'

const VAULT = process.env.CONSTELLATION_BRAIN
  || 'C:/Users/TearS/OneDrive/Desktop/STAR Arts/Consetellations/Constellation Brain'
const OUT = 'tools/brain'

// PowerShell redirects leave a BOM that breaks JSON.parse - strip it on every read.
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const readText = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
// Always LF, never a BOM, so re-running never shows up as a whole-file diff.
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8')

// ---------------------------------------------------------------- frontmatter

// The vault's frontmatter is a small, regular YAML subset: scalars and flow
// sequences only. A real YAML parser would be a dependency for no gain.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    const val = raw.trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    } else if (val !== '' && !Number.isNaN(Number(val))) {
      out[key] = Number(val)
    } else {
      out[key] = val
    }
  }
  return out
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω'
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// ---------------------------------------------------------------- vault load

const wi = readJSON(path.join(VAULT, '_meta/data/western-index.json'))
const positions = readJSON(path.join(VAULT, '_meta/data/star-positions.json'))
const hipNames = readJSON(path.join(VAULT, '_meta/data/hip-names.json'))

// Star notes, keyed by HIP. Three early notes (Alcyone, Aldebaran, Elnath) predate the
// `hip:` property and are resolved by name instead.
const nameToHip = new Map(Object.entries(hipNames).map(([hip, n]) => [n.toLowerCase(), Number(hip)]))
const notes = new Map()
const orphanNotes = []
for (const file of fs.readdirSync(path.join(VAULT, 'stars')).filter(f => f.endsWith('.md'))) {
  const fm = frontmatter(readText(path.join(VAULT, 'stars', file)))
  const title = file.replace(/\.md$/, '')
  const hip = fm.hip !== undefined ? fm.hip : nameToHip.get(title.toLowerCase())
  const tags = fm.tags || []
  const note = {
    path: `stars/${file}`,
    title,
    aliases: fm.aliases || [],
    magnitude: fm.magnitude,
    spectralClass: fm.spectral_class,
    distanceLy: fm.distance_ly,
    cultures: tags.filter(t => t.startsWith('culture/')).map(t => t.slice(8)),
    threads: tags.filter(t => t.startsWith('thread/')).map(t => t.slice(7)),
    constellations: tags.filter(t => t.startsWith('constellation/')).map(t => t.slice(14)),
    harvested: fm.harvested,
    hipFromName: fm.hip === undefined,
  }
  if (hip === undefined) orphanNotes.push(title)
  else notes.set(Number(hip), note)
}

// Constellation notes, keyed by IAU abbreviation.
const conNotes = new Map()
for (const file of fs.readdirSync(path.join(VAULT, 'constellations')).filter(f => f.endsWith('.md'))) {
  const fm = frontmatter(readText(path.join(VAULT, 'constellations', file)))
  conNotes.set(fm.iau || file.replace(/\.md$/, ''), {
    path: `constellations/${file}`,
    title: file.replace(/\.md$/, ''),
    aliases: fm.aliases || [],
    tags: fm.tags || [],
    harvested: fm.harvested,
    hasIau: fm.iau !== undefined,
  })
}

// ---------------------------------------------------------------- build

const usedHips = new Set()
const constellations = {}

for (const c of wi.constellations) {
  const hips = [...new Set(c.lines.flat())]
  hips.forEach(h => usedHips.add(h))

  // Polylines expand to connection pairs, deduped and order-insensitive: the app draws
  // segments, not paths, and Stellarium's polylines can revisit a star.
  const seen = new Set()
  const connections = []
  for (const line of c.lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seen.has(key)) continue
      seen.add(key)
      connections.push([a, b])
    }
  }

  const note = conNotes.get(c.iau)
  constellations[c.iau] = {
    iau: c.iau,
    name: c.common_name.native,
    english: c.common_name.english,
    starCount: hips.length,
    connectionCount: connections.length,
    stars: hips,
    lines: c.lines,
    connections,
    image: c.image ? {file: c.image.file, size: c.image.size, anchors: c.image.anchors} : null,
    note: note || null,
  }
}

const stars = {}
for (const hip of [...usedHips].sort((a, b) => a - b)) {
  const p = positions[hip]
  const name = hipNames[hip] || null
  const note = notes.get(hip) || null
  // The full spectral class (K5III) only exists in a harvested note; the cached
  // positions file carries just the leading letter.
  const spectralClass = note && note.spectralClass ? note.spectralClass : null
  const designation = note
    ? note.aliases.find(a => [...a].some(ch => GREEK.includes(ch))) || null
    : null
  stars[hip] = {
    hip,
    name,
    designation,
    suggestedId: name ? slug(name) : `hip${hip}`,
    ra: p.ra,
    dec: p.dec,
    raH: p.ra / 15,
    magnitude: note && note.magnitude !== undefined ? note.magnitude : p.vmag,
    spectralLetter: p.sp,
    spectralClass,
    distanceLy: note && note.distanceLy !== undefined ? note.distanceLy : null,
    note,
  }
}

// ---------------------------------------------------------------- coverage

const all = Object.values(stars)
const coverage = {
  figureStars: all.length,
  withCommonName: all.filter(s => s.name).length,
  withHarvestedNote: all.filter(s => s.note).length,
  withFullSpectralClass: all.filter(s => s.spectralClass).length,
  withDistanceLy: all.filter(s => s.distanceLy !== null).length,
  withPhysics: 0,
  missingPositions: all.filter(s => s.ra === undefined).map(s => s.hip),
  orphanStarNotes: orphanNotes,
  constellationNotesMissingIau: [...conNotes.values()].filter(n => !n.hasIau).map(n => n.title),
}

fs.mkdirSync(OUT, {recursive: true})
writeJSON(path.join(OUT, 'stars.json'), stars)
writeJSON(path.join(OUT, 'constellations.json'), constellations)
writeJSON(path.join(OUT, 'manifest.json'), {
  importedAt: new Date().toISOString().slice(0, 10),
  vault: VAULT,
  skyCulture: wi.id,
  sources: ['_meta/data/western-index.json', '_meta/data/star-positions.json', '_meta/data/hip-names.json']
    .map((rel) => {
      const st = fs.statSync(path.join(VAULT, rel))
      return {file: rel, bytes: st.size, modified: st.mtime.toISOString().slice(0, 10)}
    }),
  constellations: Object.keys(constellations).length,
  coverage,
  appOwnedFields: {
    note: 'The vault cannot supply these. Preserve them from the existing constellation JSON on migration, or research them separately.',
    fields: ['physics.massSolar', 'physics.radiusSolar', 'physics.tempKelvin', 'distance', 'info.basic', 'info.scientific'],
  },
})

console.log(`imported ${Object.keys(constellations).length} constellations, ${all.length} figure stars`)
console.log(`  common name        ${coverage.withCommonName}/${all.length}`)
console.log(`  harvested note     ${coverage.withHarvestedNote}/${all.length}`)
console.log(`  full spectral cls  ${coverage.withFullSpectralClass}/${all.length}`)
console.log(`  distance (ly)      ${coverage.withDistanceLy}/${all.length}`)
console.log(`  physics            0/${all.length}  <- app-owned, never in the vault`)

// ---------------------------------------------------------------- --emit-input

const flag = process.argv.indexOf('--emit-input')
if (flag !== -1) {
  const iau = process.argv[flag + 1]
  const c = constellations[iau]
  if (!c) {
    console.error(`unknown constellation "${iau}" - use an IAU abbreviation like Tau, Ori, And`)
    process.exit(1)
  }
  // Exactly the shape project-constellation.js reads: raH in HOURS, dec in DEGREES.
  const payload = {
    stars: c.stars.map((h) => {
      const s = stars[h]
      const row = {id: s.suggestedId, raH: Number(s.raH.toFixed(6)), dec: Number(s.dec.toFixed(6)), mag: s.magnitude}
      if (s.distanceLy !== null) row.dist = s.distanceLy
      return row
    }),
  }
  const file = `tools/input/${slug(c.name)}-stars.json`
  writeJSON(file, payload)
  const noDist = payload.stars.filter(s => s.dist === undefined).length
  console.log(`\nwrote ${file} - ${payload.stars.length} stars, ${c.connectionCount} connections`)
  if (noDist) console.log(`  ${noDist} of ${payload.stars.length} have no distance; 3D depth needs those researched`)
  console.log(`  next: node tools/project-constellation.js ${file}`)
}
