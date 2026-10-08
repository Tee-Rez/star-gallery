// js/discovery-store.js - which stars and deep-sky objects have been visited.
//
// A direct port of the Unity build's DiscoveryStore.cs, swapping PlayerPrefs for web storage.
// Same shape: one comma-separated id set per constellation.
//
// Each visit starts with nothing explored. Every scan of a QR code is a new visit, so the record
// lives in sessionStorage and is wiped when the page is opened afresh. A reload in the same tab
// (or the browser bringing the page back) is the same visit continuing, and keeps it.
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

// Removes every discovery record from a storage, leaving anything else in it alone.
function clearAll(storage) {
  if (!storage) return
  try {
    const keys = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.indexOf(KEY_PREFIX) === 0) keys.push(k)
    }
    keys.forEach(k => storage.removeItem(k))
  } catch (e) { /* nothing to clear, or nothing we may touch */ }
}

// 'reload' and 'back_forward' continue the visit already in this tab; anything else - a QR scan,
// a typed or tapped link - begins a new one.
function isContinuedVisit(navigationType) {
  return navigationType === 'reload' || navigationType === 'back_forward'
}

function navigationType() {
  try {
    const entry = performance.getEntriesByType('navigation')[0]
    if (entry && entry.type) return entry.type
    const legacy = performance.navigation && performance.navigation.type
    if (legacy === 1) return 'reload'
    if (legacy === 2) return 'back_forward'
  } catch (e) { /* no timing API: treat as a new visit */ }
  return 'navigate'
}

function browserStorage(name) {
  try {
    if (typeof window !== 'undefined' && window[name]) return window[name]
  } catch (e) { /* blocked entirely */ }
  return null
}

function openDefaultStore() {
  if (typeof window === 'undefined') return createStore(null)
  // Earlier builds kept the record in localStorage, where it outlived the visit.
  clearAll(browserStorage('localStorage'))
  const session = browserStorage('sessionStorage')
  if (!isContinuedVisit(navigationType())) clearAll(session)
  return createStore(session)
}

const defaultStore = openDefaultStore()

const DiscoveryStore = {KEY_PREFIX, createStore, clearAll, isContinuedVisit, defaultStore}

if (typeof module !== 'undefined' && module.exports) module.exports = DiscoveryStore

export {KEY_PREFIX, createStore, clearAll, isContinuedVisit, defaultStore}
export default DiscoveryStore
