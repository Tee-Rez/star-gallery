// Plain-node tests. No framework: run with `node test/constellation-data.test.js`.
//
// Guards the seams the Stellarium migration exposed: journey stops bind to stars BY NAME, so a
// renamed or removed star silently strands a stop (the camera stays put while the new text
// shows), and the app runs from an embedded copy of this data that can drift from the JSON.
const assert = require('assert')
const fs = require('fs')
const path = require('path')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

const IDS = ['orion', 'andromeda', 'taurus']
const DATA = {}
IDS.forEach((id) => { DATA[id] = require('../src/data/constellations/' + id + '.json') })

test('every journey stop centres on a star that is in the figure', () => {
  const bad = []
  IDS.forEach((id) => {
    const names = new Set(DATA[id].stars.map(s => s.name));
    (DATA[id].journey || []).forEach((stop) => {
      if (!names.has(stop.centerStarName)) bad.push(id + '/' + stop.id + ' -> ' + stop.centerStarName)
    })
  })
  assert.deepStrictEqual(bad, [], 'stranded centres: ' + bad.join('; '))
})

test('every journey target star is in the figure', () => {
  const bad = []
  IDS.forEach((id) => {
    const names = new Set(DATA[id].stars.map(s => s.name));
    (DATA[id].journey || []).forEach((stop) => {
      (stop.targetStarNames || []).forEach((n) => { if (!names.has(n)) bad.push(id + '/' + stop.id + ' -> ' + n) })
    })
  })
  assert.deepStrictEqual(bad, [], 'missing targets: ' + bad.join('; '))
})

test('every star carries a HIP id, and no id is used twice', () => {
  IDS.forEach((id) => {
    const hips = DATA[id].stars.map(s => s.hip)
    hips.forEach((h, i) => assert.ok(Number.isInteger(h), id + '/' + DATA[id].stars[i].id + ' has no hip'))
    assert.strictEqual(new Set(hips).size, hips.length, id + ' repeats a HIP id')
  })
})

test('every connection joins two stars that exist', () => {
  IDS.forEach((id) => {
    const ids = new Set(DATA[id].stars.map(s => s.id))
    DATA[id].connections.forEach((c) => {
      assert.ok(ids.has(c.from) && ids.has(c.to), id + ' connection ' + c.from + '-' + c.to)
    })
  })
})

test('the embedded loader copy matches the JSON for every constellation', () => {
  // The app reads the literal inside constellation-loader.js, not these JSON files.
  const src = fs.readFileSync(path.join(__dirname, '../src/js/constellation-loader.js'), 'utf8')
  IDS.forEach((id) => {
    const start = src.search(new RegExp("\\n      '" + id + "': \\{"))
    assert.ok(start !== -1, id + ' block not found in constellation-loader.js')
    const hipsInLoader = (src.slice(start).match(/"hip": \d+/g) || []).length
    // Blocks are contiguous, so count only up to this block's end: the next sibling key.
    const rest = src.slice(start + 1)
    const next = rest.search(/\n      '[a-z0-9_]+': \{|\n    \}/)
    const block = rest.slice(0, next)
    const hips = (block.match(/"hip": (\d+)/g) || []).map(m => Number(m.split(': ')[1]))
    assert.deepStrictEqual(hips, DATA[id].stars.map(s => s.hip),
      id + ' embedded star set differs from JSON (run node tools/sync-loader-data.mjs ' + id + ')')
    assert.ok(hipsInLoader >= hips.length)
  })
})

console.log('\n' + passed + ' passed')
