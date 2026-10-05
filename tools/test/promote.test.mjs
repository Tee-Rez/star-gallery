// Promotion into COPIES of the loader and the data folder: the real ones are never touched here.
// The draft is Lyra's, promoted under the id 'probe' - a name no real constellation will ever hold,
// so the test stays valid once Lyra itself has shipped.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {buildDraft, promote} from '../draft-constellation.mjs'

const LOADER = 'orion/src/js/constellation-loader.js'
const DATA = 'orion/src/data/constellations'
const SYNC = 'tools/sync-loader-data.mjs'

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'))
  const data = path.join(dir, 'data')
  fs.mkdirSync(data)
  for (const f of fs.readdirSync(DATA)) fs.copyFileSync(path.join(DATA, f), path.join(data, f))
  const loader = path.join(dir, 'constellation-loader.js')
  fs.copyFileSync(LOADER, loader)
  return {dir, data, loader}
}

// A draft with every required gap closed, built from a minimal complete research input.
function completeDraft() {
  const {draft} = buildDraft('Lyr', {research: {}})
  const research = {
    metadata: {displayName: 'Test Lyre', description: 'd', mythology: 'm'},
    deepSky: [],
    journey: [{id: 'a', title: 'A', centerStarName: 'Vega', targetStarNames: ['Vega'], story: 's', sources: 'x'}],
    stars: Object.fromEntries(draft.stars.map(s => [s.id, {
      info: {basic: 'b', scientific: {}}, pronunciation: 'p', spectralClass: 'B7Ve',
    }])),
  }
  return buildDraft('Lyr', {research}).draft
}

test('promotion refuses while a required gap is open, and writes nothing', () => {
  const box = sandbox()
  const before = fs.readFileSync(box.loader)
  const {draft} = buildDraft('Lyr', {research: {}})
  assert.throws(() => promote(draft, 'probe', {dataDir: box.data, loader: box.loader}), /required gap/)
  assert.ok(!fs.existsSync(path.join(box.data, 'probe.json')))
  assert.deepEqual(fs.readFileSync(box.loader), before)
})

test('promotion ships the data without _draft and adds it to the loader, touching nothing else', () => {
  const box = sandbox()
  const before = fs.readFileSync(box.loader, 'utf8')
  promote(completeDraft(), 'probe', {dataDir: box.data, loader: box.loader})

  const shipped = JSON.parse(fs.readFileSync(path.join(box.data, 'probe.json'), 'utf8'))
  assert.equal(shipped._draft, undefined)
  assert.equal(shipped.metadata.displayName, 'Test Lyre')

  const after = fs.readFileSync(box.loader, 'utf8')
  assert.match(after, /^      'probe': \{$/m)
  // Everything outside the inserted block is byte-identical: the insert landed in one place,
  // between the last constellation and the brace that closes the literal.
  const start = after.indexOf("      'probe': {")
  const tail = after.slice(after.indexOf('\n    }', start))
  assert.equal(after.slice(0, start), before.slice(0, start))
  assert.ok(before.endsWith(tail))

  // A second sync is a no-op, and --check agrees.
  const env = {...process.env, LOADER: box.loader, CONSTELLATION_DATA: box.data}
  const out = execFileSync(process.execPath, [SYNC, 'probe'], {env, encoding: 'utf8'})
  assert.match(out, /already in sync/)
  execFileSync(process.execPath, [SYNC, '--check'], {env})
})

test('a plain sync of an unknown constellation still fails without --add', () => {
  const box = sandbox()
  const shipped = completeDraft()
  delete shipped._draft
  fs.writeFileSync(path.join(box.data, 'probe.json'), JSON.stringify(shipped))
  const env = {...process.env, LOADER: box.loader, CONSTELLATION_DATA: box.data}
  assert.throws(() => execFileSync(process.execPath, [SYNC, 'probe'], {env, stdio: 'pipe'}),
    e => /needs --add/.test(e.stderr.toString()))
})
