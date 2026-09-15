// js/deep-sky-field-component.js - renders a deep-sky object as a THREE.Points cloud.
//
// The maths lives in deep-sky-field.js, which knows nothing about THREE so it can be tested
// in node. This file is the thin A-Frame wrapper: build the geometry once, spin it, clean up.
//
// The sprite is drawn on a canvas at runtime rather than loaded, so this adds nothing to the
// bundle - which matters, the build was already trimmed from 76 MB to 38 MB.
import {generatorFor, parseColors, FIELD_DEFAULTS} from './deep-sky-field'

// One shared sprite for every field: a soft radial falloff. Additive blending does the rest.
let sharedSprite = null
function sprite(THREE) {
  if (sharedSprite) return sharedSprite
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.00, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.52)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.13)')
  g.addColorStop(1.00, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedSprite = new THREE.CanvasTexture(c)
  sharedSprite.needsUpdate = true
  return sharedSprite
}

const deepSkyFieldComponent = {
  schema: {
    layer: {type: 'string', default: 'nebula'},
    count: {type: 'int', default: 5000},
    spread: {type: 'number', default: 3.4},
    sizeRatio: {type: 'number', default: 0.13},   // sprite size as a FRACTION of spread, so
    opacity: {type: 'number', default: 0.24},     // density holds at any object scale
    spin: {type: 'number', default: 0.05},        // radians per second
    colors: {type: 'string', default: '#eaf2ff,#ffe0c4,#ff4d6a,#8e1e46'},
    // nebula
    turbulence: {type: 'number', default: 3.6},
    contrast: {type: 'number', default: 3.2},
    cores: {type: 'int', default: 4},
    coreGain: {type: 'number', default: 0.9},
    dust: {type: 'number', default: 0.8},
    fill: {type: 'number', default: 1.9},
    embedded: {type: 'int', default: 4},
    // galaxy
    arms: {type: 'int', default: 2},
    wind: {type: 'number', default: 4.4},
    scatter: {type: 'number', default: 0.55},
    bulge: {type: 'number', default: 0.22},
  },

  init() {
    this.coreObject = null
    this.coreMarch = null
    this.coreState = null
    this.points = null
    this.pointCount = 0
    this.params = null
    this.build()
  },

  update(oldData) {
    if (oldData && Object.keys(oldData).length) this.build()
  },

  build() {
    const THREE = window.THREE || AFRAME.THREE
    this.dispose()

    // A tuned preset from the nebula lab wins when one is attached. It runs the SAME engine
    // the lab does (nebula-shared/nebula-core.js, loaded as a plain script), so a look found
    // there renders identically here. Without the preset or the engine, nothing changes.
    const preset = this.presetFromDataset()
    if (preset && window.NebulaCore) {
      this.buildFromCore(THREE, preset)
      return
    }

    const gen = generatorFor(this.data.layer)
    if (!gen) {
      console.warn('[deep-sky-field] no generator for layer:', this.data.layer)
      return
    }

    // Fall back per key, so a data block missing one number still renders.
    // getDOMAttribute returns only explicitly-set keys, unlike this.data which is pre-filled
    // with schema defaults. Coerce string values from HTML markup to proper numeric types.
    const raw = this.el.getDOMAttribute(this.attrName) || {}
    const p = Object.assign({}, FIELD_DEFAULTS[this.data.layer] || {}, raw)
    p.layer = this.data.layer
    // Coerce numeric keys from HTML strings (e.g., from attribute="0.13").
    const numericKeys = ['count', 'spread', 'sizeRatio', 'opacity', 'spin',
                         'turbulence', 'contrast', 'cores', 'coreGain', 'dust',
                         'fill', 'embedded', 'arms', 'wind', 'scatter', 'bulge']
    for (const k of numericKeys) {
      if (typeof p[k] === 'string') p[k] = parseFloat(p[k])
    }
    // colors is not in FIELD_DEFAULTS, so fall back to schema default if not set
    if (!('colors' in raw)) p.colors = this.data.colors
    this.params = p
    const stops = parseColors(p.colors)
    const out = gen(p.count, p, stops)
    if (!out.used) {
      console.warn('[deep-sky-field] generator produced no points for', this.data.layer)
      return
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(out.positions.subarray(0, out.used * 3), 3))
    geometry.setAttribute('color',
      new THREE.BufferAttribute(out.colors.subarray(0, out.used * 3), 3))

    const material = new THREE.PointsMaterial({
      size: p.spread * p.sizeRatio,
      map: sprite(THREE),
      vertexColors: true,
      transparent: true,
      opacity: p.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,          // additive gas must not occlude what is behind it
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(geometry, material)
    this.pointCount = out.used
    this.el.setObject3D('field', this.points)
  },

  presetFromDataset() {
    const raw = this.el.dataset.nebulaPreset
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (e) {
      console.warn('[deep-sky-field] preset is not valid JSON, falling back to points:', e.message)
      return null
    }
  },

  buildFromCore(THREE, preset) {
    const core = window.NebulaCore
    const P = Object.assign(core.params(), preset)
    const mode = preset.mode || (this.data.layer === 'galaxy' ? 'galaxy' : 'particles')
    const renderer = this.el.sceneEl && this.el.sceneEl.renderer
    const isGL2 = !!(renderer && renderer.capabilities && renderer.capabilities.isWebGL2)

    this.coreState = {}
    const out = core.build(P, mode, this.coreState, isGL2)
    if (!out.object3D) {
      console.warn('[deep-sky-field] preset built nothing (' + out.note + '), falling back to points')
      this.coreState = null
      this.build()
      return
    }

    // The engine's object is one unit across. deep-sky-layer.fitScale sizes the host assuming
    // a half-extent of spread * (1 + sizeRatio), so match that exactly and the existing fit
    // logic keeps working untouched. The preset's own `scale` is deliberately ignored: in the
    // lab it meant metres in the room, but here the portal's grid box governs the size.
    const spread = Number(this.data.spread) > 0 ? Number(this.data.spread) : 3.4
    const ratio = Number(this.data.sizeRatio) > 0 ? Number(this.data.sizeRatio) : 0
    out.object3D.scale.setScalar(2 * spread * (1 + ratio))

    this.coreObject = out.object3D
    this.coreMarch = out.march
    this.params = P
    this.el.setObject3D('field', out.object3D)
  },

  tick(time, delta) {
    if (this.coreObject) {
      this.coreObject.rotation.y += (delta / 1000) * (Number(this.data.spin) || 0)
      const THREE = window.THREE || AFRAME.THREE
      const st = this.coreState || {}
      const renderer = this.el.sceneEl && this.el.sceneEl.renderer
      if (st.partMat) {
        st.partMat.uniforms.uTime.value = time / 1000
        if (renderer) {
          st.partMat.uniforms.uPixH.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5
        }
      }
      const cam = this.el.sceneEl && this.el.sceneEl.camera
      if (this.coreMarch && cam) {
        const u = this.coreMarch.material.uniforms
        this.coreMarch.updateWorldMatrix(true, false)
        u.uCamLocal.value.copy(this.coreMarch.worldToLocal(cam.getWorldPosition(new THREE.Vector3())))
        u.uFrame.value = (u.uFrame.value + 1) % 64
      }
      return
    }
    if (this.points && this.params) this.points.rotation.y += (delta / 1000) * this.params.spin
  },

  dispose() {
    if (this.coreObject) {
      this.el.removeObject3D('field')
      if (window.NebulaCore) window.NebulaCore.dispose(this.coreObject)
      this.coreObject = null
      this.coreMarch = null
      this.coreState = null
      this.params = null
      return
    }
    if (!this.points) return
    this.el.removeObject3D('field')
    this.points.geometry.dispose()
    this.points.material.dispose()
    this.points = null
    this.pointCount = 0
    this.params = null
  },

  remove() {
    this.dispose()
  },
}

export {deepSkyFieldComponent}
export default deepSkyFieldComponent
