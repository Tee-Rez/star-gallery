// js/deep-sky-layer.js - the second layer inside the portal.
//
// Tapping a marker takes you into the object. A nebula or galaxy fades the constellation and
// grows in its place, turning slowly, with one orb that opens its story. A cluster is a star
// figure, so it REPLACES the constellation and behaves exactly like one.
//
// The mode discipline is lifted from lore-journey.js, which already proves it: close the info
// panel, remember the 2D/3D state, and put it back on the way out. The two modes are mutually
// exclusive.
//
// One difference: Recenter stays available here. The lore journey hides it because the tour
// swings #root to frame each star itself, and a recenter would fight that. Nothing in this
// layer moves #root, so Recenter does exactly what it does outside - brings the portal, and
// the object inside it, back in front of you.
//
// One piece of that discipline does NOT carry over. lore-journey strips one-finger rotation
// because a guided tour drives the view itself. A cluster has no tour: it is a star figure in
// the same rotatingContainer, so locking it would contradict "behaves exactly like one" above.
// Only the generated fields strip rotation - see enterMode().
import {defaultStore} from './discovery-store'
import {resolveLayer, FIELD_DEFAULTS} from './deep-sky-field'

const deepSkyLayerComponent = {
  schema: {
    growDur: {type: 'number', default: 900},      // ms for the object to scale in
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
    this.blackoutSky(false)
    if (this.blackMat) { this.blackMat.dispose(); this.blackMat = null }
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

  // A cluster keeps the drag-to-rotate the constellation had: swapFigure rebuilds it as stars
  // and connection lines in the SAME rotatingContainer, so it is a constellation figure in
  // every respect and should handle like one. Only the generated fields lock rotation, where
  // the flat detail orb shares that container and reads badly edge-on.
  enterMode(layer) {
    const l = this.loader()
    this.prevShowReal = l ? l.data.showRealPositions : false
    this.rotatingContainer = l ? l.rotatingContainer : null
    if (layer !== 'cluster' &&
        this.rotatingContainer && this.rotatingContainer.hasAttribute('xrextras-one-finger-rotate')) {
      this.rotatingContainer.removeAttribute('xrextras-one-finger-rotate')
      this.rotateWasEnabled = true
    }
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

  // A generated nebula or galaxy brings its own star field, and that reads far better
  // against plain black than over the photographic skybox, whose stars compete with it.
  //
  // The skybox is NOT hidden. In AR it is also what stands between the portal's interior and
  // the camera feed, so hiding it would show the room through the opening. Its meshes keep
  // their geometry and simply wear a black material, and the originals are put back exactly.
  blackoutSky(on) {
    if (!on) {
      if (!this.skySaved) return
      this.skySaved.forEach((s) => { s.mesh.material = s.material })
      this.skySaved = null
      return
    }
    if (this.skySaved) return
    const sky = document.querySelector('#galaxy-skybox')
    const root = sky && sky.getObject3D('mesh')
    // Not loaded yet: the object still works, it just keeps the stars behind it.
    if (!root) return
    const T = window.THREE || AFRAME.THREE
    if (!this.blackMat) this.blackMat = new T.MeshBasicMaterial({color: 0x000000, side: T.DoubleSide})
    this.skySaved = []
    root.traverse((o) => {
      if (!o.isMesh) return
      this.skySaved.push({mesh: o, material: o.material})
      o.material = this.blackMat
    })
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
      this.enterMode(layer)
      this.active = obj
      this.activeLayer = layer
      this.stack.push(objectId)
      l.swapFigure({stars: obj.stars, connections: obj.connections || []})
      this.retitle(obj.name, this.kindOf(layer))
      this.watchClusterStars()
      // Deliberately NOT checked here: a cluster whose stars were all visited in an earlier
      // session would otherwise bounce you straight back out on arrival. Completion is a
      // thing that HAPPENS while you are inside, so only a new discovery triggers it.
      this.el.sceneEl.emit('deepSkyEntered', {id: objectId})
      return true
    }

    this.enterMode(layer)
    this.active = obj
    this.activeLayer = layer
    this.stack.push(objectId)
    this.hideConstellation()
    this.spawnField(obj, layer)
    this.blackoutSky(true)
    this.retitle(obj.name, this.kindOf(layer), this.exploredFlag(obj, layer))
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
    // A tuned preset rides on the dataset rather than the component schema: it carries ~45
    // keys and nested JSON, which the A-Frame attribute parser is the wrong tool for. Set it
    // BEFORE the component attaches, so its first build already sees it.
    if (obj.render) this.host.dataset.nebulaPreset = JSON.stringify(obj.render)
    this.host.setAttribute('deep-sky-field', field)
    this.host.setAttribute('position', {x: 0, y: 0, z: 0})

    const fit = this.fitScale(field)
    this.fieldFit = fit
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
    // Bottom-left of the portal frame rather than over the object it describes. It goes in
    // the STATIC container: the field turns, this must not turn with it.
    const orbR = 0.45
    const inset = orbR + 0.35
    this.orb.setAttribute('position', {
      x: -((Number(l.portalWidth) || 6) / 2) + inset,
      y: -((Number(l.portalHeight) || 6) / 2) + inset,
      z: 0,
    })
    ;(l.staticContainer || l.rotatingContainer).appendChild(this.orb)
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
    // Inside a generated field the subject of the panel is the thing you are standing in, so
    // zoom THAT rather than flying a star in to stand for it. A cluster never gets here - it
    // has real stars to select, and they keep the star zoom.
    const generated = this.activeLayer !== 'cluster' && !!this.host
    this.el.sceneEl.emit('deepSkyInfoRequested', {
      name: obj.name,
      designation: obj.designation || '',
      info: obj.info || {},
      sources: obj.sources || '',
      suppressStar: generated,
    })
    if (generated) this.zoomField(true)
    this.markVisited(obj.id)
    this.scheduleCompletion()
  },

  // Scale the field that is already there. No rebuild, no second object.
  zoomField(on) {
    if (!this.host || this.activeLayer === 'cluster') return
    const fit = Number(this.fieldFit) > 0 ? Number(this.fieldFit) : 1
    const to = on ? fit * 1.6 : fit
    this.host.setAttribute('animation__zoom', {
      property: 'scale', to: `${to} ${to} ${to}`, dur: 700, easing: 'easeOutCubic',
    })
  },

  markVisited(id) {
    const c = this.constellationId()
    if (!defaultStore.mark(c, id)) return
    this.dimMarker(id)
    // You are still inside it, so the band has to flip to Explored now rather than on the way
    // out. refreshExploredCounts answers the same event, but it only writes the counts.
    if (this.active && this.active.id === id) {
      this.retitle(this.active.name, this.kindOf(this.activeLayer),
        this.exploredFlag(this.active, this.activeLayer))
    }
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
  },

  // Closing the panel puts the object back to its resting size and leaves you inside it.
  //
  // It used to return to the constellation on a timer. Exploring a thing is not a
  // reason to be taken out of it - you may well want to keep looking at what you just read
  // about - so leaving is now only ever the back control's job.
  scheduleCompletion() {
    if (this.awaitingClose) return
    this.awaitingClose = true
    this.onPanelClosed = () => {
      this.el.sceneEl.removeEventListener('starInfoClosed', this.onPanelClosed)
      this.onPanelClosed = null
      this.awaitingClose = false
      this.zoomField(false)
    }
    this.el.sceneEl.addEventListener('starInfoClosed', this.onPanelClosed)
  },

  // The label, what kind of thing it is, and - for an object with no stars to count - whether
  // it has been explored. The star counts still belong to refreshExploredCounts, which reads
  // the CURRENT star set (already swapped to the cluster's by the time it runs), so a cluster
  // needs no special case here.
  retitle(label, kind, explored) {
    const header = document.querySelector('#portal-header')
    if (!header) return
    header.setAttribute('portal-header', {label, kind: kind || '', explored: explored || ''})
  },

  // nebula -> Nebula. The HUD names the thing you are standing in.
  kindOf(layer) {
    return layer ? layer.charAt(0).toUpperCase() + layer.slice(1) : ''
  },

  // Only a generated field carries this: a cluster's tracker is its star count.
  exploredFlag(obj, layer) {
    if (!obj || layer === 'cluster') return ''
    return defaultStore.isVisited(this.constellationId(), obj.id) ? 'yes' : 'no'
  },

  // ---- leaving ----

  exit() {
    if (!this.active) return false
    const id = this.active.id
    const wasCluster = this.activeLayer === 'cluster'
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
    this.blackoutSky(false)

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
