// js/deep-sky-layer.js - the second layer inside the portal.
//
// Tapping a marker takes you into the object. A nebula or galaxy fades the constellation and
// grows in its place, turning slowly, with one orb that opens its story. A cluster is a star
// figure, so it REPLACES the constellation and behaves exactly like one.
//
// The mode discipline is lifted from lore-journey.js, which already proves it: strip
// one-finger rotation, hide Recenter, close the info panel, remember the 2D/3D state, and put
// every one of those back on the way out. The two modes are mutually exclusive.
import {defaultStore} from './discovery-store'

const deepSkyLayerComponent = {
  schema: {
    growDur: {type: 'number', default: 900},      // ms for the object to scale in
    focusDistance: {type: 'number', default: 2.4},  // units in front of the camera
    completeDelay: {type: 'number', default: 900},  // beat before an automatic return
  },

  init() {
    this.stack = []           // depth is 2 today; a stack costs nothing and avoids a rewrite
    this.active = null        // the object currently entered
    this.host = null          // the entity holding the field + orb
    this.faded = []           // entities we hid, so we restore exactly these
    this.awaitingClose = false
    this.onPanelClosed = null
    this.completionTimer = null

    this.onRequest = this.onRequest.bind(this)
    this.onOrbClick = this.onOrbClick.bind(this)
    this.el.sceneEl.addEventListener('deepSkyRequested', this.onRequest)

    this.createBackButton()
  },

  remove() {
    this.el.sceneEl.removeEventListener('deepSkyRequested', this.onRequest)
    if (this.backBtn && this.backBtn.parentNode) this.backBtn.parentNode.removeChild(this.backBtn)
  },

  loader() {
    const el = document.querySelector('[constellation-loader]')
    return el ? el.components['constellation-loader'] : null
  },

  constellationId() {
    const l = this.loader()
    return (l && l.data && l.data.constellationFile) || 'unknown'
  },

  isActive() {
    return !!this.active
  },

  loreRunning() {
    const el = document.querySelector('[lore-journey]')
    const c = el && el.components['lore-journey']
    return !!(c && c.active)
  },

  // ---- screen-locked back control ----

  createBackButton() {
    this.backBtn = document.createElement('div')
    this.backBtn.textContent = 'Back to the constellation'
    this.backBtn.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: #fff; padding: 12px 22px;
      border: 1px solid #4287f5; border-radius: 20px;
      font-family: Arial, sans-serif; font-size: 15px; z-index: 1001;
      cursor: pointer; opacity: 0; pointer-events: none;
      transition: opacity 300ms ease; user-select: none;
      -webkit-tap-highlight-color: transparent;`
    this.backBtn.addEventListener('click', () => this.exit())
    document.body.appendChild(this.backBtn)
  },

  showBack(show) {
    if (!this.backBtn) return
    this.backBtn.style.opacity = show ? '1' : '0'
    this.backBtn.style.pointerEvents = show ? 'auto' : 'none'
  },

  // ---- mode ----

  enterMode() {
    const l = this.loader()
    this.prevShowReal = l ? l.data.showRealPositions : false
    this.rotatingContainer = l ? l.rotatingContainer : null
    if (this.rotatingContainer && this.rotatingContainer.hasAttribute('xrextras-one-finger-rotate')) {
      this.rotatingContainer.removeAttribute('xrextras-one-finger-rotate')
      this.rotateWasEnabled = true
    }
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      reset.components['reset-view-button'].hideButton()
    }
    this.el.sceneEl.emit('starInfoClosed')
    this.showBack(true)
  },

  exitMode() {
    this.showBack(false)
    this.restoreFaded()
    if (this.rotatingContainer && this.rotateWasEnabled) {
      this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
      this.rotateWasEnabled = false
    }
    const l = this.loader()
    if (l) { l.data.showRealPositions = this.prevShowReal; l.updatePositions(true) }
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      reset.components['reset-view-button'].showButton()
    }
  },

  // Hide rather than remove: nothing is destroyed, so restoring is exact and cheap.
  //
  // This is a visibility switch, not a cross-fade. Star cores, labels and connection lines are
  // separate entities with separate materials, and animating opacity across all of them is
  // both fiddly and easy to leave half-applied on an interrupted exit. The object growing in
  // over growDur carries the transition instead.
  hideConstellation() {
    const l = this.loader()
    if (!l) return
    this.faded = [].concat(l.stars, l.connections, l.deepSkyMarkers || [])
    this.faded.forEach(el => el.setAttribute('visible', false))
  },

  restoreFaded() {
    this.faded.forEach(el => el.setAttribute('visible', true))
    this.faded = []
  },

  // ---- entering ----

  onRequest(e) {
    const id = e && e.detail && e.detail.id
    if (id) this.enter(id)
  },

  enter(objectId) {
    if (this.active) return false
    if (this.loreRunning()) {
      console.warn('[deep-sky-layer] refused: the lore journey is running')
      return false
    }
    const l = this.loader()
    const obj = l && l.getDeepSkyById(objectId)
    if (!obj || !obj.layer || obj.layer === 'none') {
      console.warn('[deep-sky-layer] refused: no such layer object', objectId)
      return false
    }

    if (obj.layer === 'cluster') {
      if (!obj.stars || !obj.stars.length) {
        console.warn('[deep-sky-layer] cluster has no stars:', objectId)
        return false
      }
      this.enterMode()
      this.active = obj
      this.stack.push(objectId)
      l.swapFigure({stars: obj.stars, connections: obj.connections || []})
      this.retitle(obj.name)
      this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
      return true
    }

    this.enterMode()
    this.active = obj
    this.stack.push(objectId)
    this.hideConstellation()
    this.spawnField(obj)
    this.retitle(obj.name)
    this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
    return true
  },

  spawnField(obj) {
    const l = this.loader()
    this.host = document.createElement('a-entity')

    const field = Object.assign({layer: obj.layer}, obj.field || {})
    this.host.setAttribute('deep-sky-field', field)
    this.host.setAttribute('position', '0 0 0')
    this.host.setAttribute('scale', '0.01 0.01 0.01')
    l.rotatingContainer.appendChild(this.host)
    this.host.setAttribute('animation__grow', {
      property: 'scale', to: '1 1 1', dur: this.data.growDur, easing: 'easeOutCubic',
    })

    // One orb: the object's own explorable part.
    this.orb = document.createElement('a-sphere')
    this.orb.setAttribute('radius', 0.28)
    this.orb.setAttribute('class', 'cantap')
    this.orb.setAttribute('material', {
      color: '#ffffff', opacity: 0.55, transparent: true,
      emissive: '#9fd0ff', emissiveIntensity: 0.6, depthWrite: false,
    })
    this.orb.setAttribute('position', '0 0 0')
    this.orb.addEventListener('click', this.onOrbClick)
    this.host.appendChild(this.orb)
  },

  onOrbClick() {
    if (!this.active) return
    const obj = this.active
    this.el.sceneEl.emit('deepSkyInfoRequested', {
      name: obj.name,
      designation: obj.designation || '',
      info: obj.info || {},
      sources: obj.sources || '',
    })
    this.markVisited(obj.id)
    this.scheduleCompletion()
  },

  markVisited(id) {
    const c = this.constellationId()
    if (defaultStore.mark(c, id)) {
      this.el.sceneEl.emit('deepSkyVisited', {constellation: c, id})
    }
  },

  // Finishing an object returns you on its own; the back control is always there too.
  //
  // The trigger is the panel CLOSING, not a timer started when it opened - a blind timer
  // would pull the constellation back while the reader is still mid-paragraph.
  scheduleCompletion() {
    if (this.awaitingClose) return
    this.awaitingClose = true
    this.onPanelClosed = () => {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.awaitingClose = false
      if (!this.active) return
      this.completionTimer = setTimeout(() => this.exit(), this.data.completeDelay)
    }
    this.el.sceneEl.addEventListener('starInfoClosed', this.onPanelClosed)
  },

  // Only the label. The explored counts belong to refreshExploredCounts, which reads the
  // CURRENT star set - already swapped to the cluster's by the time it runs - so it stays
  // correct for both a constellation and a cluster without special-casing either.
  retitle(label) {
    const header = document.querySelector('#portal-header')
    if (!header) return
    header.setAttribute('portal-header', {label})
  },

  // ---- leaving ----

  exit() {
    if (!this.active) return false
    const id = this.active.id
    const wasCluster = this.active.layer === 'cluster'
    if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null }
    if (this.onPanelClosed) {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.onPanelClosed = null
    }
    this.awaitingClose = false

    if (this.host) {
      if (this.orb) this.orb.removeEventListener('click', this.onOrbClick)
      if (this.host.parentNode) this.host.parentNode.removeChild(this.host)
      this.host = null
      this.orb = null
    }

    const l = this.loader()
    if (wasCluster && l) l.restoreFigure()

    this.active = null
    this.stack.pop()
    this.exitMode()

    if (l && l.constellationData) {
      this.retitle(l.constellationData.metadata ? l.constellationData.metadata.name
        : this.constellationId())
    }
    this.el.sceneEl.emit('deepSkyExited', {id})
    return true
  },
}

export {deepSkyLayerComponent}
export default deepSkyLayerComponent
