#!/usr/bin/env node
// tools/sync-loader-data.mjs
//
// Copies a constellation's data from orion/src/data/constellations/<name>.json into the
// embedded CONSTELLATIONS literal inside orion/src/js/constellation-loader.js, which is
// what the app actually reads at runtime. The JSON files are the source of truth; this
// keeps the embedded copy honest.
//
// constellation-loader.js has MIXED line endings and is ~3,400 lines long. Rewriting it
// with any tool that normalises newlines produces a two-thousand-line phantom diff that
// buries the real change - this has happened repeatedly on this project. So the splice
// here is byte-precise: lines are split with their terminators attached, only the lines
// between the block's braces are replaced, and the replacement copies the terminator the
// block already used.
//
// Usage:
//   node tools/sync-loader-data.mjs taurus orion andromeda
//   node tools/sync-loader-data.mjs --all
//   node tools/sync-loader-data.mjs taurus --check   # verify in sync, write nothing
//   node tools/sync-loader-data.mjs --check          # every constellation the loader embeds
//   node tools/sync-loader-data.mjs lyra --add       # one the loader has never held
//
// --add inserts an empty `'<name>': {` / `},` pair just before the brace that closes the
// literal, then fills it exactly as a plain sync would. Without it an unknown name stays an
// error, so a typo can never quietly create a constellation. LOADER=<path> and
// CONSTELLATION_DATA=<dir> point it at other copies, for tests.

import fs from 'node:fs'

const LOADER = process.env.LOADER || 'orion/src/js/constellation-loader.js'
const DATA = process.env.CONSTELLATION_DATA || 'orion/src/data/constellations'
const CHECK = process.argv.includes('--check')
const ADD = process.argv.includes('--add')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))

const raw = fs.readFileSync(LOADER, 'utf8')
// Keep each line's own terminator attached, so nothing is normalised.
let lines = raw.split(/(?<=\n)/)

const LITERAL_OPEN = /^    const constellations = \{\r?\n$/
const LITERAL_CLOSE = /^    \}\r?\n$/
const embedded = lines.map(l => l.match(/^      '([a-z0-9_]+)': \{/)).filter(Boolean).map(m => m[1])

// --all, and --check with no names, mean every constellation the loader already embeds.
const names = process.argv.includes('--all') || (CHECK && !args.length) ? embedded : args
if (!names.length) { console.error('usage: node tools/sync-loader-data.mjs <name>... | --all [--check] [--add]'); process.exit(1) }

let changed = false
for (const name of names) {
  const startRe = new RegExp(`^      '${name}': \\{`)
  let start = lines.findIndex(l => startRe.test(l))
  if (start === -1 && ADD && !CHECK) {
    const open = lines.findIndex(l => LITERAL_OPEN.test(l))
    const close = open === -1 ? -1 : lines.findIndex((l, i) => i > open && LITERAL_CLOSE.test(l))
    if (close === -1) { console.error(`  ${name}: cannot find the constellations literal in ${LOADER}`); process.exitCode = 1; continue }
    // The terminator the literal's own closing line uses, so the insert matches its surroundings.
    const eol = lines[close].endsWith('\r\n') ? '\r\n' : '\n'
    lines = [...lines.slice(0, close), `      '${name}': {${eol}`, `      },${eol}`, ...lines.slice(close)]
    start = close
    changed = true
    console.log(`  ${name}: added to ${LOADER}`)
  }
  if (start === -1) {
    console.error(`  ${name}: not found in ${LOADER}${ADD ? '' : ' - a new constellation needs --add'}`)
    process.exitCode = 1
    continue
  }

  // The block ends at the next line that closes it at the same indent.
  let end = -1
  for (let i = start + 1; i < lines.length; i++) {
    if (/^      \},?\r?\n?$/.test(lines[i])) { end = i; break }
  }
  if (end === -1) { console.error(`  ${name}: no closing brace found`); process.exitCode = 1; continue }

  const data = JSON.parse(fs.readFileSync(`${DATA}/${name}.json`, 'utf8').replace(/^﻿/, ''))
  if (data._draft) {
    console.error(`  ${name}: still carries its _draft block - ship it with draft-constellation.mjs --promote`)
    process.exitCode = 1
    continue
  }

  // Reproduce the embedded style: contents indented to 8 spaces, outer braces supplied
  // by the key line and the closing line that are already there.
  const eol = lines[start].endsWith('\r\n') ? '\r\n' : '\n'
  const body = JSON.stringify(data, null, 2).split('\n').slice(1, -1)
    .map(l => `      ${l}${eol}`)

  const before = lines.slice(start + 1, end).join('')
  const after = body.join('')
  if (before === after) { console.log(`  ${name}: already in sync`); continue }
  if (CHECK) { console.error(`  ${name}: OUT OF SYNC`); process.exitCode = 1; continue }

  lines = [...lines.slice(0, start + 1), ...body, ...lines.slice(end)]
  changed = true
  console.log(`  ${name}: ${data.stars.length} stars, ${data.connections.length} connections -> embedded`)
}

if (CHECK) { if (!process.exitCode) console.log('all checked constellations in sync'); process.exit(process.exitCode || 0) }
if (!changed) process.exit(process.exitCode || 0)

fs.writeFileSync(LOADER, lines.join(''), 'utf8')
console.log(`wrote ${LOADER}`)
