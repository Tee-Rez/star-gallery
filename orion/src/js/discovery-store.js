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
  const failedWrites = new Set()    // keys where setItem has thrown; memory-owned for this session

  const key = c => KEY_PREFIX + c

  function readRaw(c) {
    const k = key(c)
    // If this key's write has failed, it is memory-owned; do not consult stale storage data
    if (failedWrites.has(k)) {
      return memory.has(k) ? memory.get(k) : ''
    }
    try {
      const v = storage && storage.getItem(k)
      if (v !== null && v !== undefined) return v
    } catch (e) { /* fall through to memory */ }
    return memory.has(k) ? memory.get(k) : ''
  }

  function writeRaw(c, raw) {
    const k = key(c)
    memory.set(k, raw)
    try {
      if (storage) storage.setItem(k, raw)
    } catch (e) {
      // Mark this key as memory-owned; future reads will bypass stale storage data
      failedWrites.add(k)
    }
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
    const k = key(c)
    memory.delete(k)
    failedWrites.delete(k)
    try {
      if (storage) storage.removeItem(k)
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
