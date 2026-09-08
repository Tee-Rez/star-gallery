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
import {resolveLayer, FIELD_DEFAULTS} from './deep-sky-field'

const deepSkyLayerComponent = {
  schema: {
    growDur: {type: 'number', default: 900},      // ms for the object to scale in
    // RESERVED, not yet consumed: the spec's step 3 swings #root so the object sits this far
    // in front of the camera, the way lore-journey.frameStar() does. That framing is
    // deliberately deferred - it needs visual judgement on a real device - so this field is
    // kept as the knob it will use rather than removed and re-added later. Not dead config.
    completeDelay: {type: 'number', default: 900},  // beat before an automatic return
  },

  init() {
    this.stack = []           // depth is 2 today; a stack costs nothing and avoids a rewrite
    this.active = null        // the object currently entered
    this.activeLayer = null   // its RESOLVED layer, never the raw data field
    this.host = null          // the entity holding the field + orb
    this.faded = []           // entities we hid, so we restore exactly these
    this.awaitingClose = false
    this.onPanelClosed = null
    this.onStarVisited = null
    this.completionTimer = null
    this.prevResetVisible = false
    this.lossCanvas = null

    this.onRequest = this.onRequest.bind(this)
    this.onOrbClick = this.onOrbClick.bind(this)
    this.onContextLost = this.onContextLost.bind(this)
    this.bindContextLoss = this.bindContextLoss.bind(this)
    this.el.sceneEl.addEventListener('deepSkyRequested', this.onRequest)
    this.el.sceneEl.addEventListener('deepSkyDetailRequested', this.onOrbClick)
    this.bindContextLoss()

    this.createBackButton()
  },

  remove() {
    this.el.sceneEl.removeEventListener('deepSkyRequested', this.onRequest)
    this.el.sceneEl.removeEventListener('deepSkyDetailRequested', this.onOrbClick)
    this.el.sceneEl.removeEventListener('renderstart', this.bindContextLoss)
    if (this.lossCanvas) {
      this.lossCanvas.removeEventListener('webglcontextlost', this.onContextLost)
      this.lossCanvas = null
    }
    this.unwatchClusterStars()
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

  // True only while the CONSTELLATION'S OWN stars are hidden behind a field.
  //
  // three.js r137's Raycaster does not skip invisible objects and A-Frame 1.3.0 adds no
  // visibility filter, so hideConstellation() leaves every star's .cantap sphere in the
  // raycaster. Without this, a tap inside M42 would mark and open a star nobody can see.
  // A cluster is the exception and must stay tappable: it REPLACES the figure, so its stars
  // are the current ones - and its own completion check depends on them being markable.
  suppressesStarTaps() {
    return !!this.active && this.activeLayer !== 'cluster'
  },

  loreRunning() {
    const el = document.querySelector('[lore-journey]')
    const c = el && el.components['lore-journey']
    return !!(c && c.active)
  },

  // ---- WebGL context loss ----

  // Losing the context inside the layer leaves a dead field and a hidden constellation, so
  // back out to the state that can be rebuilt. The canvas does not exist until the renderer
  // starts, so bind late if it is not there yet.
  bindContextLoss() {
    const canvas = this.el.sceneEl && this.el.sceneEl.canvas
    if (!canvas) {
      this.el.sceneEl.addEventListener('renderstart', this.bindContextLoss, {once: true})
      return
    }
    if (this.lossCanvas === canvas) return
    this.lossCanvas = canvas
    canvas.addEventListener('webglcontextlost', this.onContextLost)
  },

  onContextLost() {
    if (!this.active) return
    console.warn('[deep-sky-layer] WebGL context lost inside the layer; returning')
    this.exit()
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

  resetButton() {
    const el = document.querySelector('[reset-view-button]')
    return (el && el.components['reset-view-button']) || null
  },

  // reset-view-button shows itself from a 500 ms timeout after constellationPlaced. Entering
  // inside that window used to re-reveal Recenter mid-layer; showButton now defers to us and
  // calls this instead, so the button stays hidden and comes back on the way out.
  noteResetWanted() {
    this.prevResetVisible = true
  },

  enterMode() {
    const l = this.loader()
    this.prevShowReal = l ? l.data.showRealPositions : false
    this.rotatingContainer = l ? l.rotatingContainer : null
    if (this.rotatingContainer && this.rotatingContainer.hasAttribute('xrextras-one-finger-rotate')) {
      this.rotatingContainer.removeAttribute('xrextras-one-finger-rotate')
      this.rotateWasEnabled = true
    }
    // Remember what we found rather than assuming Recenter was up: it is hidden before the
    // constellation is placed, and restoring it unconditionally would reveal it too early.
    const reset = this.resetButton()
    this.prevResetVisible = !!(reset && reset.isVisible)
    if (reset) reset.hideButton()
    this.el.sceneEl.emit('starInfoClosed')
    this.showBack(true)
  },

  exitMode() {
    // Leaving with the object's panel still open would restore the constellation underneath
    // a card that still reads "Orion Nebula". Safe against re-entry: exit() has already
    // nulled this.active and torn down its starInfoClosed listener before calling us, and
    // exit() bails on a null active, so neither this emit nor the overlay's own echo of it
    // can start a second exit.
    this.el.sceneEl.emit('starInfoClosed')
    this.showBack(false)
    this.restoreFaded()
    if (this.rotatingContainer && this.rotateWasEnabled) {
      this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
      this.rotateWasEnabled = false
    }
    const l = this.loader()
    if (l) { l.data.showRealPositions = this.prevShowReal; l.updatePositions(true) }
    const reset = this.resetButton()
    if (reset && this.prevResetVisible) reset.showButton()
    this.prevResetVisible = false
  },

  // Hide rather than remove: nothing is destroyed, so restoring is exact and cheap.
  //
  // This is a visibility switch, not a cross-fade. Star cores, labels and connection lines are
  // separate entities with separate materials, and animating opacity across all of them is
  // both fiddly and easy to leave half-applied on an interrupted exit. The object growing in
  // over growDur carries the transition instead.
  //
  // Hidden is NOT untappable - see suppressesStarTaps().
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
    // resolveLayer is the SAME call createDeepSkyMarkers makes, so anything with a marker can
    // be entered and anything without one cannot - no blank object with no generator.
    const layer = resolveLayer(obj)
    if (!obj || layer === 'none') {
      console.warn('[deep-sky-layer] refused: no such layer object', objectId)
      return false
    }

    if (layer === 'cluster') {
      if (!obj.stars || !obj.stars.length) {
        console.warn('[deep-sky-layer] cluster has no stars:', objectId)
        return false
      }
      this.enterMode()
      this.active = obj
      this.activeLayer = layer
      this.stack.push(objectId)
      l.swapFigure({stars: obj.stars, connections: obj.connections || []})
      this.retitle(obj.name)
      this.watchClusterStars()
      // Deliberately NOT checked here: a cluster whose stars were all visited in an earlier
      // session would otherwise bounce you straight back out on arrival. Completion is a
      // thing that HAPPENS while you are inside, so only a new discovery triggers it.
      this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
      return true
    }

    this.enterMode()
    this.active = obj
    this.activeLayer = layer
    this.stack.push(objectId)
    this.hideConstellation()
    this.spawnField(obj, layer)
    this.retitle(obj.name)
    this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
    return true
  },

  markerFor(id) {
    const l = this.loader()
    const markers = (l && l.deepSkyMarkers) || []
    return markers.find(m => m.dataset && m.dataset.deepSkyId === id) || null
  },

  // The object grows at the CENTRE of the grid, not where its marker sat. The marker is a
  // signpost, not the thing itself; once you are inside the object the constellation is gone
  // and an off-centre object would just sit lopsided in the frame with nothing to relate to.
  spawnField(obj, layer) {
    const l = this.loader()
    this.host = document.createElement('a-entity')

    const field = Object.assign({layer}, obj.field || {})
    this.host.setAttribute('deep-sky-field', field)
    this.host.setAttribute('position', {x: 0, y: 0, z: 0})

    const fit = this.fitScale(field)
    this.host.setAttribute('scale', '0.01 0.01 0.01')
    l.rotatingContainer.appendChild(this.host)
    this.host.setAttribute('animation__grow', {
      property: 'scale', to: `${fit} ${fit} ${fit}`, dur: this.data.growDur,
      easing: 'easeOutCubic',
    })

    // The object's own explorable part is the SAME dashed ring you tapped to get here, in its
    // 'detail' role. It hangs outside the host so the host's fit scale cannot shrink it out of
    // reach, and it carries the object's id so the component can name it when tapped.
    this.orb = document.createElement('a-entity')
    this.orb.dataset.deepSkyId = obj.id
    this.orb.setAttribute('deep-sky-marker', {
      radius: 0.45,
      role: 'detail',
      visited: defaultStore.isVisited(this.constellationId(), obj.id),
    })
    this.orb.setAttribute('position', {x: 0, y: 0, z: 0})
    l.rotatingContainer.appendChild(this.orb)
  },

  // Keep the object inside the portal's shaft, which is the same reason depth is clamped: an
  // object poking through the grid walls breaks the AR anchoring the frame is selling.
  //
  // The field's own half-extent is `spread` (both generators bound every axis by it), and the
  // sprites hang past the outermost points by their own size, so allow for that too. Only
  // ever shrink - a small object should stay small rather than be inflated to fill the box.
  fitScale(field) {
    const l = this.loader()
    const box = l && l.gridBox
    if (!box) return 1
    const p = Object.assign({}, FIELD_DEFAULTS[field.layer] || {}, field)
    const spread = Number(p.spread)
    if (!Number.isFinite(spread) || spread <= 0) return 1
    const ratio = Number(p.sizeRatio)
    const reach = spread * (1 + (Number.isFinite(ratio) && ratio > 0 ? ratio : 0))
    if (reach <= 0) return 1
    let fit = 1
    if (Number.isFinite(box.width) && box.width > 0) fit = Math.min(fit, (box.width / 2) / reach)
    if (Number.isFinite(box.height) && box.height > 0) fit = Math.min(fit, (box.height / 2) / reach)
    return fit > 0 ? fit : 1
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
    if (!defaultStore.mark(c, id)) return
    this.dimMarker(id)
    this.el.sceneEl.emit('deepSkyVisited', {constellation: c, id})
  },

  // "Once visited, the ring dims." The marker is hidden behind the field at this instant, but
  // it is restored on the way out, and createDeepSkyMarkers seeds the same flag from storage
  // on the next load so the dimming survives a reload.
  // Dim both rings for this object: the signpost out in the constellation, and the detail ring
  // standing in front of you right now. The second is the one you just tapped, so leaving it
  // bright would make the tap look like it had not registered.
  dimMarker(id) {
    const marker = this.markerFor(id)
    const c = marker && marker.components && marker.components['deep-sky-marker']
    if (c) c.setVisited(true)
    const oc = this.orb && this.orb.components && this.orb.components['deep-sky-marker']
    if (oc) oc.setVisited(true)
  },

  // ---- cluster completion ----
  //
  // A cluster has no orb, so it cannot complete the way a nebula does - the spec says it
  // completes when every one of its stars is visited. Only the loader knows a star was newly
  // marked, and it says so with `starVisited` {constellation, id}; that is the only moment
  // the answer can change, so it is the only thing worth listening to.
  watchClusterStars() {
    if (this.onStarVisited) return
    this.onStarVisited = () => this.checkClusterComplete()
    this.el.sceneEl.addEventListener('starVisited', this.onStarVisited)
  },

  unwatchClusterStars() {
    if (!this.onStarVisited) return
    this.el.sceneEl.removeEventListener('starVisited', this.onStarVisited)
    this.onStarVisited = null
  },

  checkClusterComplete() {
    if (!this.active || this.activeLayer !== 'cluster') return
    const c = this.constellationId()
    const stars = this.active.stars || []
    if (!stars.length) return
    if (!stars.every(s => defaultStore.isVisited(c, s.id))) return
    this.unwatchClusterStars()
    this.markVisited(this.active.id)
    // The cluster has no panel to wait on, so the beat runs straight from here.
    if (this.completionTimer) clearTimeout(this.completionTimer)
    this.completionTimer = setTimeout(() => this.exit(), this.data.completeDelay)
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
    const wasCluster = this.activeLayer === 'cluster'
    if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null }
    if (this.onPanelClosed) {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.onPanelClosed = null
    }
    this.awaitingClose = false
    this.unwatchClusterStars()

    // The detail ring is a sibling of the host, not a child, so it has to be removed on its
    // own - the host going away would otherwise leave a tappable ring floating in the figure.
    if (this.orb) {
      if (this.orb.parentNode) this.orb.parentNode.removeChild(this.orb)
      this.orb = null
    }
    if (this.host) {
      if (this.host.parentNode) this.host.parentNode.removeChild(this.host)
      this.host = null
    }

    const l = this.loader()
    if (wasCluster && l) l.restoreFigure()

    this.active = null
    this.activeLayer = null
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
