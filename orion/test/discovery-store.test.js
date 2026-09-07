// Plain-node tests. No framework: run with `node test/discovery-store.test.js`.
const assert = require('assert')
const D = require('../src/js/discovery-store.js')

let passed = 0
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1
  }
}

// A stand-in for localStorage, so the store can be tested with no browser.
function fakeStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

test('an unseen constellation starts empty', () => {
  const s = D.createStore(fakeStorage())
  assert.deepStrictEqual(s.load('orion'), [])
})

test('mark records an id and reports it as new', () => {
  const s = D.createStore(fakeStorage())
  assert.strictEqual(s.mark('orion', 'rigel'), true)
  assert.strictEqual(s.isVisited('orion', 'rigel'), true)
})

test('marking the same id twice reports it as not new', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.mark('orion', 'rigel'), false)
  assert.deepStrictEqual(s.load('orion'), ['rigel'])
})

test('constellations do not share their records', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.isVisited('andromeda', 'rigel'), false)
})

test('the key is namespaced', () => {
  const store = fakeStorage()
  const s = D.createStore(store)
  s.mark('orion', 'rigel')
  assert.ok(store._map.has(D.KEY_PREFIX + 'orion'), [...store._map.keys()].join(','))
})

test('countVisited counts only ids that are present', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  s.mark('orion', 'betelgeuse')
  assert.strictEqual(s.countVisited('orion', ['rigel', 'betelgeuse', 'saiph']), 2)
})

test('countVisited ignores duplicates in the query', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  assert.strictEqual(s.countVisited('orion', ['rigel', 'rigel']), 1)
})

test('clear forgets one constellation only', () => {
  const s = D.createStore(fakeStorage())
  s.mark('orion', 'rigel')
  s.mark('andromeda', 'mirach')
  s.clear('orion')
  assert.deepStrictEqual(s.load('orion'), [])
  assert.deepStrictEqual(s.load('andromeda'), ['mirach'])
})

test('empty and blank ids are refused', () => {
  const s = D.createStore(fakeStorage())
  assert.strictEqual(s.mark('orion', ''), false)
  assert.strictEqual(s.mark('orion', null), false)
  assert.deepStrictEqual(s.load('orion'), [])
})

test('a stored blank entry does not become a phantom id', () => {
  const store = fakeStorage()
  store.setItem(D.KEY_PREFIX + 'orion', 'rigel,,saiph,')
  const s = D.createStore(store)
  assert.deepStrictEqual(s.load('orion'), ['rigel', 'saiph'])
})

// Quota exceeded: getItem returns real (stale) data, but setItem always fails.
// mark() must return true only once even when write persistence fails.
test('quota failure (write-only) degrades to memory while maintaining mark contract', () => {
  const quotaLimited = {
    getItem: k => (k === D.KEY_PREFIX + 'orion' ? '' : null),   // returns real but stale data
    setItem: () => { throw new Error('QuotaExceededError') },    // write always fails
    removeItem: () => { throw new Error('QuotaExceededError') },
  }
  const s = D.createStore(quotaLimited)
  assert.strictEqual(s.mark('orion', 'rigel'), true)            // first time: true
  assert.strictEqual(s.isVisited('orion', 'rigel'), true)       // held in memory
  assert.strictEqual(s.mark('orion', 'rigel'), false)           // second time: false (contract)
})

// Private browsing throws on write. The layer has to work with no persistence at all.
test('a storage that throws degrades to memory instead of raising', () => {
  const hostile = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('quota') },
    removeItem: () => { throw new Error('denied') },
  }
  const s = D.createStore(hostile)
  assert.strictEqual(s.mark('orion', 'rigel'), true)
  assert.strictEqual(s.isVisited('orion', 'rigel'), true)   // held in memory
  assert.deepStrictEqual(s.load('andromeda'), [])
})

console.log('\n' + passed + ' passed')
