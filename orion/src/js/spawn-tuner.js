// js/spawn-tuner.js - preview-only slider for how far ahead the portal spawns.
//
// app.js attaches this only on app-preview and on a local dev server; the live app never gets
// it. The slider sets tap-place-cursor's spawnDistance, which the first placement and every
// Recenter read, and the readout under it shows how far away the portal actually is right now,
// so after a Recenter you can see where it landed. "Reset" goes back to the built-in default.
//
// It sits in the HUD's top-left slot (empty while the Gallery button is switched off), so a
// touch on it counts as a HUD touch and never places the portal.
import {HUD} from './hud-shell'

// v2: the default became a fixed 4.5 m, so values tried against the old screen fit are dropped.
const STORAGE_KEY = 'preview:spawnDistance:v2'
const OLD_KEYS = ['preview:spawnDistance']

function readStored() {
  try {
    OLD_KEYS.forEach(k => window.localStorage.removeItem(k))
    const v = parseFloat(window.localStorage.getItem(STORAGE_KEY))
    return v > 0 ? v : null
  } catch (e) { return null }
}

function writeStored(v) {
  try {
    if (v > 0) window.localStorage.setItem(STORAGE_KEY, String(v))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch (e) { /* the slider still works for this visit */ }
}

const spawnTunerComponent = {
  schema: {
    min: {type: 'number', default: 1.5},
    max: {type: 'number', default: 8},
    step: {type: 'number', default: 0.1},
    accent: {type: 'color', default: '#4287f5'},
  },

  init() {
    this.chosen = readStored()   // null = the cursor's own default
    this.build()
    this.timer = setInterval(() => this.refresh(), 250)
    this.refresh()
  },

  cursor() {
    const el = document.querySelector('[tap-place-cursor]')
    return el && el.components && el.components['tap-place-cursor']
  },

  // The distance the next placement should use: this phone's choice, else the built-in default.
  target(cursor) {
    if (this.chosen > 0) return this.chosen
    return cursor ? cursor.schema.spawnDistance.default : null
  },

  build() {
    const d = this.data
    const panel = document.createElement('div')
    panel.id = 'spawn-tuner'
    panel.style.cssText = [
      'pointer-events:auto', 'display:flex', 'flex-direction:column', 'gap:4px',
      'padding:8px 10px', 'border-radius:12px', `border:1px solid ${d.accent}`,
      'background:rgba(0,0,0,.6)', '-webkit-backdrop-filter:blur(8px)', 'backdrop-filter:blur(8px)',
      'color:#fff', 'font:12px/1.3 system-ui,-apple-system,sans-serif',
      'font-variant-numeric:tabular-nums', 'width:min(190px,44vw)', 'box-sizing:border-box',
    ].join(';')

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Spawn distance</span>
        <button type="button" data-reset style="font:inherit;font-size:11px;color:#fff;background:transparent;
          border:1px solid ${d.accent};border-radius:8px;padding:1px 7px">Reset</button>
      </div>
      <input type="range" id="spawn-tuner-range" min="${d.min}" max="${d.max}" step="${d.step}"
        aria-label="Portal spawn distance in metres"
        style="width:100%;margin:2px 0;touch-action:none;accent-color:${d.accent}">
      <div data-set style="font-weight:600"></div>
      <div data-now style="opacity:.8"></div>
    `

    this.panel = panel
    this.range = panel.querySelector('input')
    this.setLabel = panel.querySelector('[data-set]')
    this.nowLabel = panel.querySelector('[data-now]')

    this.range.addEventListener('input', () => {
      this.chosen = parseFloat(this.range.value)
      writeStored(this.chosen)
      this.refresh()
    })
    panel.querySelector('[data-reset]').addEventListener('click', () => {
      this.chosen = null
      writeStored(0)
      this.refresh()
    })

    HUD.mount(panel, 'top-start', 'spawn-tuner')
  },

  refresh() {
    if (!this.panel) return   // not built yet: the scene has not finished loading
    const cursor = this.cursor()
    const want = this.target(cursor)
    // The cursor may initialise after this component; push the value as soon as it does.
    if (cursor && want > 0 && cursor.data.spawnDistance !== want) {
      cursor.el.setAttribute('tap-place-cursor', 'spawnDistance', want)
    }

    this.setLabel.textContent = want > 0
      ? `Next spawn: ${want.toFixed(1)} m${this.chosen > 0 ? '' : ' (default)'}`
      : 'Next spawn: -'
    if (want > 0 && document.activeElement !== this.range) this.range.value = want

    this.nowLabel.textContent = this.portalDistanceText(cursor)
  },

  // Flat distance from the phone to the portal's origin - the same quantity the spawn distance
  // sets, so straight after a Recenter the two read the same.
  portalDistanceText(cursor) {
    const root = document.getElementById('root')
    const cam = document.getElementById('camera')
    if (!root || !cam || !cursor || !cursor.hasPlaced) return 'Portal: not placed yet'
    const a = root.object3D.getWorldPosition(new THREE.Vector3())
    const b = cam.object3D.getWorldPosition(new THREE.Vector3())
    return `Portal now: ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(2)} m away`
  },

  remove() {
    clearInterval(this.timer)
    if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel)
  },
}

export {spawnTunerComponent}
