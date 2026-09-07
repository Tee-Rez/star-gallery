// Plain-node tests. No framework: run with `node test/deep-sky-data.test.js`.
const assert = require('assert')
const F = require('../src/js/deep-sky-field.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

const IDS = ['orion', 'andromeda']
const DATA = {}
IDS.forEach((id) => { DATA[id] = require('../src/data/constellations/' + id + '.json') })

const VALID = ['nebula', 'galaxy', 'cluster', 'none']

test('every deep-sky object declares a layer', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      assert.ok(VALID.indexOf(o.layer) !== -1, id + '/' + o.id + ' has layer ' + o.layer)
    })
  })
})

test('exactly the two in-scope objects are in the layer', () => {
  const inLayer = []
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer !== 'none') inLayer.push(id + '/' + o.id)
    })
  })
  assert.deepStrictEqual(inLayer.sort(), ['andromeda/m31', 'orion/m42'])
})

test('M42 is a nebula and M31 a galaxy', () => {
  const m42 = DATA.orion.deepSkyObjects.find(o => o.id === 'm42')
  const m31 = DATA.andromeda.deepSkyObjects.find(o => o.id === 'm31')
  assert.strictEqual(m42.layer, 'nebula')
  assert.strictEqual(m31.layer, 'galaxy')
})

test('every layer object has a usable generator', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none' || o.layer === 'cluster') return
      assert.ok(F.generatorFor(o.layer), id + '/' + o.id + ' has no generator')
    })
  })
})

test('every layer object carries a field block with the right keys', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none' || o.layer === 'cluster') return
      assert.ok(o.field, id + '/' + o.id + ' has no field block')
      Object.keys(F.FIELD_DEFAULTS[o.layer]).forEach((k) => {
        assert.strictEqual(typeof o.field[k], 'number', o.id + '.field.' + k + ' is not a number')
      })
      assert.ok(typeof o.field.colors === 'string', o.id + '.field.colors must be a csv string')
      assert.ok(F.parseColors(o.field.colors).length >= 2, o.id + ' needs 2+ colour stops')
    })
  })
})

test('every layer object has sourced info', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none') return
      assert.ok(o.info && o.info.basic, id + '/' + o.id + ' has no info.basic')
      assert.ok(o.info.scientific, id + '/' + o.id + ' has no info.scientific')
      assert.ok(o.sources, id + '/' + o.id + ' has no sources')
    })
  })
})

// The real distance must survive somewhere, because the geometry no longer carries it.
test('the scientific note states the real distance', () => {
  const m31 = DATA.andromeda.deepSkyObjects.find(o => o.id === 'm31')
  assert.ok(/light-year/i.test(m31.info.scientific), 'M31 must state its distance in words')
})

test('no esoteric fields anywhere', () => {
  IDS.forEach((id) => {
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      assert.ok(!('esoteric' in (o.info || {})), id + '/' + o.id + ' has an esoteric field')
    })
  })
})

test('markers sit inside the portal bounds', () => {
  IDS.forEach((id) => {
    const hw = DATA[id].portal.width / 2, hh = DATA[id].portal.height / 2;
    (DATA[id].deepSkyObjects || []).forEach((o) => {
      if (o.layer === 'none') return
      assert.ok(Math.abs(o.position2D.x) <= hw, o.id + ' x out of portal')
      assert.ok(Math.abs(o.position2D.y) <= hh, o.id + ' y out of portal')
    })
  })
})

console.log('\n' + passed + ' passed')
