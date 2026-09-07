// js/discovery-store.js - which stars and deep-sky objects have been visited.
//
// A direct port of the Unity build's DiscoveryStore.cs, swapping PlayerPrefs for
// localStorage. Same shape: one comma-separated id set per constellation.
//
// Storage is injected so this is testable without a browser, and so a hostile store - private
// browsing, a full quota - degrades to memory rather than throwing. Losing the record is a
// small disappointment; a crash inside the portal is not.

const KEY_PREFIX = 'discovered:'

function createStore(storage) {
  const memory = new Map()          // fallback, and the mirror when storage refuses

  const key = c => KEY_PREFIX + c

  function readRaw(c) {
    try {
      const v = storage && storage.getItem(key(c))
      if (v !== null && v !== undefined) return v
    } catch (e) { /* fall through to memory */ }
    return memory.has(key(c)) ? memory.get(key(c)) : ''
  }

  function writeRaw(c, raw) {
    memory.set(key(c), raw)
    try {
      if (storage) storage.setItem(key(c), raw)
    } catch (e) { /* memory already holds it */ }
  }

  function load(c) {
    return String(readRaw(c)).split(',').map(s => s.trim()).filter(Boolean)
  }

  function isVisited(c, id) {
    return !!id && load(c).indexOf(String(id)) !== -1
  }

  // Returns true only when this id was not already recorded, so callers can react to a
  // genuinely new discovery without re-reading.
  function mark(c, id) {
    if (!id) return false
    const ids = load(c)
    if (ids.indexOf(String(id)) !== -1) return false
    ids.push(String(id))
    writeRaw(c, ids.join(','))
    return true
  }

  function countVisited(c, ids) {
    const seen = load(c)
    const asked = Array.from(new Set((ids || []).map(String)))
    return asked.filter(id => seen.indexOf(id) !== -1).length
  }

  function clear(c) {
    memory.delete(key(c))
    try {
      if (storage) storage.removeItem(key(c))
    } catch (e) { /* memory is already clear */ }
  }

  return {load, isVisited, mark, countVisited, clear}
}

function browserStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch (e) { /* blocked entirely */ }
  return null
}

const defaultStore = createStore(browserStorage())

const DiscoveryStore = {KEY_PREFIX, createStore, defaultStore}

if (typeof module !== 'undefined' && module.exports) module.exports = DiscoveryStore

export {KEY_PREFIX, createStore, defaultStore}
export default DiscoveryStore
