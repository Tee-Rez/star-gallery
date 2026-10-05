#!/usr/bin/env node
// tools/draft-constellation.mjs - a new constellation's data file, drafted from what is already known.
//
// Reads the Constellation Brain import (figure, identity), the physics harvest, and the
// constellation's researched input - tools/input/<id>-research.json - and writes a draft in the
// shipped schema to tools/drafts/<id>.json, with a review sheet beside it.
//
// Every computed field comes from tools/lib/constellation-rules.mjs. Every RESEARCHED field - prose,
// the journey, deep-sky objects, pronunciations - comes from the research file or is left absent
// and listed in the draft's `_draft` block. Nothing is ever filled with placeholder text: an absent
// field cannot render in the app as if it were real; placeholder text can.
//
// The draft is reproducible: the same three inputs give a byte-identical file, so re-drafting after
// the Brain changes shows only what changed, and no prose is lost because none lives in the draft.
//
// Usage:
//   node tools/draft-constellation.mjs Lyr              # write tools/drafts/lyra.json + .html
//   node tools/draft-constellation.mjs Lyr --promote    # ship it, once no required gap is open
//
// Spec: docs/superpowers/specs/2026-10-05-constellation-authoring-pipeline-design.md, section 5.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import * as R from './lib/constellation-rules.mjs'
import {bbColor, rampForStar, rgbToHex} from '../orion/src/js/star-color.mjs'
import {renderReview} from './lib/review-sheet.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VAULT = process.env.CONSTELLATION_BRAIN
  || 'C:/Users/TearS/STAR-Arts/Consetellations/Constellation Brain'

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
// LF, no BOM, Greek letters unescaped - the same rules import-brain.mjs writes by.
const toJSON = v => JSON.stringify(v, null, 2) + '\n'

const brain = name => readJSON(path.join(ROOT, 'tools/brain', `${name}.json`))
const idOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

// A spectral class is shippable when it carries a luminosity class ("B7IIIe", "A1V") or is the
// Am-star notation ("kA5hF0mF2"). The harvest's raw XHIP strings - "A8. :V      COMP,SB" - and
// the Brain's bare letters are not: the panel prints this, and the star's colour falls back on it.
const FULL_CLASS = /^(?:[OBAFGKM]\d+(?:\.\d+)?(?:Iab|Ia|Ib|III|II|IV|VI|V)[a-z]*|k[A-F]\d+h[A-F]\d+m[A-F]\d+)$/
const MAX_UNDISTORTED_DEG = 45

function vaultCommit() {
  try {
    return execFileSync('git', ['-C', VAULT, 'rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim()
  } catch {
    return null
  }
}

function project(input, size) {
  const file = path.join(os.tmpdir(), `draft-projection-${process.pid}.json`)
  fs.writeFileSync(file, JSON.stringify(input))
  try {
    const args = [path.join(ROOT, 'tools/project-constellation.js'), file]
    if (size) args.push(String(size.width), String(size.height))
    return JSON.parse(execFileSync(process.execPath, args, {encoding: 'utf8'}))
  } finally {
    fs.rmSync(file, {force: true})
  }
}

// What the harvest had, put plainly, for a star whose physics is not shipped.
function absenceReason(rec) {
  if (!rec) return 'not in the physics harvest'
  const S = rec.sources || {}
  const said = ['temp', 'mass', 'radius'].map(k => `${k}: ${S[k] || 'no source'}`).join('; ')
  return `harvest holds estimates, not measurements (${said})`
}

function buildStars(con, research, gaps) {
  const S = brain('stars')
  const P = brain('physics')
  const rs = research.stars || {}

  return con.stars.map((hip) => {
    const b = S[hip]
    const p = P[hip] || null
    const designation = b.designation || R.designationFromXhip(p && p.xhipName)
    const id = R.starId(designation, hip)
    const r = rs[id] || {}
    const name = b.name || (designation ? R.bayerName(designation) : `HIP ${hip}`)

    const classes = [r.spectralClass, p && p.spectralClass && p.spectralClass.trim(), b.spectralClass]
    const spectralClass = classes.find(c => c && FULL_CLASS.test(c)) || b.spectralClass || b.spectralLetter
    if (!FULL_CLASS.test(spectralClass)) {
      gaps.required.push({path: `stars.${id}.spectralClass`,
        fill: `research: only "${spectralClass}" is known; the harvest says "${p ? p.spectralClass.trim() : '-'}"`})
    }

    const physics = r.physics || R.measuredPhysics(p)
    if (!physics) gaps.absences.push({path: `stars.${id}.physics`, reason: absenceReason(p)})

    const pronunciation = r.pronunciation || (b.note && b.note.pronunciation) || undefined
    if (b.name && !pronunciation) {
      gaps.required.push({path: `stars.${id}.pronunciation`, fill: 'vault: `pronunciation:` in the star note'})
    }

    const distance = r.distance ?? (p && p.distanceLy != null ? Math.round(p.distanceLy) : undefined)
    if (distance === undefined) gaps.required.push({path: `stars.${id}.distance`, fill: 'research'})

    if (!r.info || !r.info.basic) gaps.required.push({path: `stars.${id}.info`, fill: 'research: info.basic and info.scientific'})
    gaps.scientificDrafts[id] = R.scientificLines(physics, spectralClass)

    const star = {
      id, hip, name, pronunciation, designation,
      isMajor: R.isMajor(b.magnitude),
      position2D: null,
      distance,
      magnitude: b.magnitude,
      spectralClass,
      color: rgbToHex(bbColor(rampForStar({tempKelvin: physics && physics.tempKelvin, spectralClass}))),
      size: R.starSize(b.magnitude),
      stellarType: R.stellarType(spectralClass),
      physics: physics || undefined,
      info: r.info,
    }
    // Kept alongside, not in the shipped object: what projection and the review sheet need.
    Object.defineProperty(star, '_sky', {value: {raH: b.raH, dec: b.dec, proper: Boolean(b.name)}, enumerable: false})
    return star
  })
}

function buildDeepSky(research, gaps) {
  if (research.deepSky === undefined) {
    gaps.required.push({path: 'deepSkyObjects', fill: 'research: the objects to include, or [] for none'})
    return []
  }
  return research.deepSky.map((o) => {
    const hasNamedMembers = Array.isArray(o.stars) && o.stars.length > 0
    const preset = R.presetFor(o.type, hasNamedMembers)
    if (preset.rendererGap) gaps.rendererGaps.push({object: o.id, name: o.name, ...preset.rendererGap})
    const layer = o.layer || preset.layer
    if (!o.description) gaps.required.push({path: `deepSkyObjects.${o.id}.description`, fill: 'research'})
    // A layer-none object draws nothing and opens nothing, so the shipped ones carry a description
    // only. An object the viewer can enter shows a panel, which needs prose and its sources.
    if (layer !== 'none') {
      if (!o.info) gaps.required.push({path: `deepSkyObjects.${o.id}.info`, fill: 'research'})
      if (!o.sources) gaps.required.push({path: `deepSkyObjects.${o.id}.sources`, fill: 'research'})
    }
    const obj = {
      id: o.id, name: o.name, designation: o.designation, type: o.type, layer,
      position2D: null,
      distance: o.distance, magnitude: o.magnitude, size: o.size,
      description: o.description,
      stars: o.stars, connections: o.connections,
      field: o.field || preset.field,
      info: o.info, sources: o.sources,
      render: o.render || preset.render,
    }
    Object.defineProperty(obj, '_sky', {value: {raH: o.raH, dec: o.dec}, enumerable: false})
    return obj
  })
}

function buildJourney(research, stars, gaps) {
  if (!research.journey) {
    gaps.required.push({path: 'journey', fill: 'lore stage: 4-5 sourced stops (spec section 6)'})
    return undefined
  }
  const names = new Set(stars.map(s => s.name))
  return research.journey.map((stop, i) => {
    for (const n of [stop.centerStarName, ...(stop.targetStarNames || [])]) {
      if (!names.has(n)) gaps.required.push({path: `journey.${i}.${stop.id}`, fill: `"${n}" is not a star in this figure`})
    }
    if (!stop.story || !stop.sources) gaps.required.push({path: `journey.${i}.${stop.id}`, fill: 'story and sources'})
    const {id, title, view, ...rest} = stop
    return {id, title, view: view || '2d', ...rest}
  })
}

function journeyCandidates(stars, deepSky) {
  // Only a star with a proper name has a story to tell on its own; popularity orders them.
  const named = stars.filter(s => s._sky.proper).sort((a, b) => a.magnitude - b.magnitude)
  const out = named.map(s => ({kind: 'single', star: s.name, magnitude: s.magnitude}))
  for (const o of deepSky) {
    const d = s => Math.hypot(s.position2D.x - o.position2D.x, s.position2D.y - o.position2D.y)
    const near = [...stars].sort((a, b) => d(a) - d(b)).slice(0, 2)
    out.push({kind: 'pointer', object: o.name, stars: near.map(s => s.name)})
  }
  return out
}

export function buildDraft(abbr, opts = {}) {
  const con = brain('constellations')[abbr]
  if (!con) throw new Error(`unknown constellation "${abbr}" - use an IAU abbreviation like Lyr, Tau, Ori`)
  const cid = idOf(con.name)
  const researchFile = path.join(ROOT, 'tools/input', `${cid}-research.json`)
  const research = opts.research ?? (fs.existsSync(researchFile) ? readJSON(researchFile) : {})

  const gaps = {required: [], absences: [], rendererGaps: [], warnings: [], scientificDrafts: {}}
  const stars = buildStars(con, research, gaps)
  const deepSky = buildDeepSky(research, gaps)

  // One projection over the final star set, so every position shares one scale.
  const input = {
    stars: stars.map(s => ({id: s.id, raH: s._sky.raH, dec: s._sky.dec, dist: s.distance, mag: s.magnitude})),
    deepSky: deepSky.map(o => ({id: o.id, raH: o._sky.raH, dec: o._sky.dec})),
  }
  if (!input.deepSky.length) delete input.deepSky
  const size = research.portal || project(input).suggestedPortal
  const proj = project(input, size)
  if (!proj.insidePortal) throw new Error(`projected stars fall outside a ${size.width}x${size.height} portal`)
  if (proj.maxSeparationDeg > MAX_UNDISTORTED_DEG) {
    gaps.warnings.push(`spans ${proj.maxSeparationDeg} degrees; the flat projection distorts past ${MAX_UNDISTORTED_DEG}`)
  }
  for (const s of stars) s.position2D = proj.stars.find(p => p.id === s.id).position2D
  for (const o of deepSky) o.position2D = proj.deepSky.find(p => p.id === o.id).position2D

  const rm = research.metadata || {}
  for (const k of ['displayName', 'description', 'mythology']) {
    if (!rm[k]) gaps.required.push({path: `metadata.${k}`, fill: 'research'})
  }
  const c = R.centroid(stars.map(s => s._sky))
  const metadata = {
    name: con.name,
    displayName: rm.displayName,
    description: rm.description,
    mythology: rm.mythology,
    season: rm.season || R.season(c.raH),
    hemisphere: rm.hemisphere || R.hemisphere(c.dec),
    abbreviation: con.iau,
  }

  const byId = new Map(stars.map(s => [s.hip, s.id]))
  const connections = con.connections.map(([a, b]) => ({from: byId.get(a), to: byId.get(b), type: 'figure'}))

  const journey = buildJourney(research, stars, gaps)
  const draft = {
    metadata,
    ...R.portalDerived(size.width, size.height),
    stars,
    connections,
    deepSkyObjects: deepSky,
    journey,
    _draft: {
      builtFrom: {vaultCommit: opts.vaultCommit !== undefined ? opts.vaultCommit : vaultCommit(),
        research: path.relative(ROOT, researchFile).replace(/\\/g, '/')},
      required: gaps.required,
      absences: gaps.absences,
      rendererGaps: gaps.rendererGaps,
      warnings: gaps.warnings,
      journeyCandidates: journeyCandidates(stars, deepSky),
      scientificDrafts: gaps.scientificDrafts,
    },
  }
  // A round trip drops every undefined field, so the draft holds exactly what JSON will.
  const clean = JSON.parse(JSON.stringify(draft))
  return {draft: clean, id: cid, review: renderReview(clean, {id: cid, projection: proj})}
}

// ------------------------------------------------------------------------------------- CLI

function main(argv) {
  const abbr = argv[0]
  if (!abbr) {
    console.error('usage: node tools/draft-constellation.mjs <IAU abbreviation> [--promote]')
    process.exit(1)
  }
  const {draft, id, review} = buildDraft(abbr)
  fs.mkdirSync(path.join(ROOT, 'tools/drafts'), {recursive: true})
  fs.writeFileSync(path.join(ROOT, 'tools/drafts', `${id}.json`), toJSON(draft))
  fs.writeFileSync(path.join(ROOT, 'tools/drafts', `${id}.html`), review)
  const d = draft._draft
  console.log(`wrote tools/drafts/${id}.json and ${id}.html - ${draft.stars.length} stars, ` +
    `${draft.connections.length} connections, ${draft.deepSkyObjects.length} deep-sky objects`)
  console.log(`  required gaps   ${d.required.length}`)
  for (const g of d.required) console.log(`    ${g.path}  <- ${g.fill}`)
  console.log(`  absences        ${d.absences.length}${d.absences.length ? '  (' + d.absences.map(a => a.path).join(', ') + ')' : ''}`)
  console.log(`  renderer gaps   ${d.rendererGaps.length}${d.rendererGaps.length ? '  (' + d.rendererGaps.map(g => `${g.object}: ${g.type}`).join(', ') + ')' : ''}`)
  for (const w of d.warnings) console.log(`  warning: ${w}`)

  if (argv.includes('--promote')) promote(draft, id)
}

function promote(draft, id) {
  if (draft._draft.required.length) {
    console.error(`\nrefusing to promote ${id}: ${draft._draft.required.length} required gap(s) open`)
    process.exit(1)
  }
  const shipped = {...draft}
  delete shipped._draft
  const out = path.join(ROOT, 'orion/src/data/constellations', `${id}.json`)
  fs.writeFileSync(out, toJSON(shipped))
  console.log(`\nwrote ${path.relative(ROOT, out)}`)
  const sync = path.join(ROOT, 'tools/sync-loader-data.mjs')
  execFileSync(process.execPath, [sync, id, '--add'], {stdio: 'inherit', cwd: ROOT})
  execFileSync(process.execPath, [sync, '--check'], {stdio: 'inherit', cwd: ROOT})
  console.log('next: the catalogue entry waits for live promotion (spec section 5.4)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
