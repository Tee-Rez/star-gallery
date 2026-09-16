// js/lore-journey.js - Guided "Lore" story journey through Orion's major stars.
//
// The AR camera IS the phone and cannot be moved, so each stop transforms #root so the
// focused star swings to a point in front of the current camera and scales up to fill the
// view. While parked, #root slowly orbits around that focal point. A screen-locked HUD
// button advances through the stops; the last stop recenters and restores normal mode.
import {HUD} from './hud-shell'

const loreJourneyComponent = {
  schema: {
    focusDistance: {type: 'number', default: 2.0},   // units in front of camera for the focused star
    zoomScale: {type: 'number', default: 2.5},        // how much #root scales up during the journey
    transitionDur: {type: 'number', default: 3000},   // ms to glide between stops
  },

  init() {
    this.active = false
    this.index = 0
    this.stops = []
    this.detailedStars = []
    this.animating = false
    this.focal = null

    this.onRequest = this.startJourney.bind(this)
    this.el.sceneEl.addEventListener('loreJourneyRequested', this.onRequest)

    this.createHudButton()
    this.createPanel()
  },

  loader() {
    const el = document.querySelector('[constellation-loader]')
    return el ? el.components['constellation-loader'] : null
  },

  getStops() {
    const l = this.loader()
    return (l && l.constellationData && l.constellationData.journey) || []
  },

  getStarEntity(name) {
    return document.querySelector(`[data-name="${name}"]`)
  },

  // ---- HUD "Next Star" button, in the layer's actions row ----
  // Its own row, below the story card, so the card can no longer cover it - it used to, on any
  // phone narrower than about 450px.
  createHudButton() {
    this.hud = document.createElement('div')
    this.hud.className = 'hud-pill'
    this.hud.setAttribute('role', 'button')
    this.hud.style.opacity = '0'
    this.hud.style.pointerEvents = 'none'
    this.hud.textContent = 'Next Star'
    this.onHud = (e) => { e.preventDefault(); e.stopPropagation(); this.next() }
    this.hud.addEventListener('click', this.onHud)
    this.hud.addEventListener('touchend', this.onHud)
    HUD.mount(this.hud, 'actions', 'lore-next')
  },

  showHud(show) {
    this.hud.style.opacity = show ? '1' : '0'
    this.hud.style.pointerEvents = show ? 'auto' : 'none'
  },

  // ---- Lore panel, in the layer's card row (same place and size as the star info card) ----
  // It shares that row with the star card and the layer shows one at a time: a star tapped
  // mid-journey takes this card's place, and the story comes back when that card closes.
  createPanel() {
    this.panel = document.createElement('div')
    this.panel.id = 'lore-panel'
    this.panel.className = 'hud-card'
    this.panel.style.cssText = `
      background: rgba(0,0,0,0.8); border: 2px solid #4287f5; border-radius: 10px;
      padding: 15px; color: #fff; font-family: Arial, sans-serif;
      backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
      overflow-y: auto; pointer-events: auto;
      transform: translateX(calc(-100% - 60px)); transition: transform 500ms ease-out;`
    HUD.mount(this.panel, 'sheet', 'lore-card')
  },

  showLore(stop) {
    this.panel.innerHTML = `
      <h2 style="margin:0 0 10px 0;color:#4287f5;font-size:18px;">${stop.title}</h2>
      <p style="margin:0 0 12px 0;line-height:1.5;font-size:var(--fs-body);">${stop.story}</p>
      <div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:8px;font-size:var(--fs-caption);font-style:italic;opacity:0.8;">
        Sources: ${stop.sources}
      </div>`
    this.panel.scrollTop = 0
    this.panel.style.transform = 'translateX(0)'
  },

  // Slides out to the left, as it always has. It keeps its row while it is out, which only
  // leaves empty AR view above the actions row during the glide.
  hideLore() {
    this.panel.style.transform = 'translateX(calc(-100% - 60px))'
  },

  // ---- Mode enter/exit ----
  enterMode() {
    this.active = true
    // Disable user (one-finger) rotation while in lore mode so the tour controls the view.
    const l = this.loader()
    this.prevShowReal = l ? l.data.showRealPositions : false // remember view to restore on exit
    this.rotatingContainer = l ? l.rotatingContainer : null
    if (this.rotatingContainer && this.rotatingContainer.hasAttribute('xrextras-one-finger-rotate')) {
      this.rotatingContainer.removeAttribute('xrextras-one-finger-rotate')
      this.rotateWasEnabled = true
    }
    // Hide the Recenter button and suppress normal clicks.
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) reset.components['reset-view-button'].hideButton()
    this.el.sceneEl.emit('starInfoClosed') // close any open info panel
    HUD.setMode('lore')
    this.showHud(true)
  },

  exitMode() {
    this.active = false
    HUD.setMode('constellation')
    this.showHud(false)
    this.hideLore()
    this.clearDetailed()
    // Restore all basic spheres.
    document.querySelectorAll('[data-name]').forEach((s) => {
      const core = s.querySelector('a-sphere:not(.cantap)')
      if (core) core.setAttribute('visible', true)
    })
    // Restore user rotation.
    if (this.rotatingContainer && this.rotateWasEnabled) {
      this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
      this.rotateWasEnabled = false
    }
    // Restore the pre-journey view mode (2D/3D).
    const l = this.loader()
    if (l) { l.data.showRealPositions = this.prevShowReal; l.updatePositions(true) }
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) reset.components['reset-view-button'].showButton()
  },

  // Set the constellation to this stop's view (belt = flat 2D so all three are coplanar and
  // easy to center; every other stop = 3D depth). Instant so framing reads settled positions.
  setViewForStop() {
    const l = this.loader()
    if (!l) return
    // The whole lore journey is shown in flat 2D so every star is coplanar and easy to center.
    l.data.showRealPositions = false
    l.updatePositions(true)
  },

  // Mirrors deep-sky-layer.js's loreRunning() check: the two modes are mutually exclusive, and
  // each side needs to refuse the other so tapping "Lore" from inside a nebula/cluster can't
  // put both mode managers in charge of rotatingContainer, showRealPositions and Recenter.
  deepSkyActive() {
    const el = document.querySelector('[deep-sky-layer]')
    const c = el && el.components['deep-sky-layer']
    return !!(c && c.isActive())
  },

  startJourney() {
    if (this.active) return
    if (this.deepSkyActive()) {
      console.warn('[lore-journey] refused: the deep-sky layer is active')
      return
    }
    this.stops = this.getStops()
    if (!this.stops.length) return
    this.index = 0
    this.enterMode()
    // Glide from the current constellation view into the first star (no instant pop-in).
    this.transitionTo(0)
  },

  // ---- Audio ----
  audio() {
    const scene = this.el.sceneEl || document.querySelector('a-scene')
    return scene && scene.components['star-audio']
  },

  // Each stop announces itself: the targets swell in, hold, then fade to silence so the story
  // reads in quiet. Group stops (the Belt, the Chains) therefore arrive as a chord, which is
  // what quantizing the pitches to a scale exists to make possible.
  soundStop(stop) {
    const a = this.audio()
    if (!a) return
    const loaderEl = document.querySelector('[constellation-loader]')
    const loader = loaderEl && loaderEl.components['constellation-loader']
    const all = (loader && loader.constellationData && loader.constellationData.stars) || []
    const targets = stop.targetStarNames
      .map(n => all.find(s => s.name === n))
      .filter(Boolean)
    if (targets.length) a.playChord(targets, {hold: 2.5})
  },

  // ---- Staging + detailed stars ----
  goToStop(i) {
    const stop = this.stops[i]
    if (!stop) return
    this.index = i
    this.setViewForStop(stop)
    this.clearDetailed()
    const factor = stop.detailScale || 4
    stop.targetStarNames.forEach((name) => this.spawnDetailed(name, factor))
    this.frameStar(this.getStarEntity(stop.centerStarName))
    this.showLore(stop)
    this.soundStop(stop)
    this.hud.textContent = (i === this.stops.length - 1) ? 'End the Journey' : 'Next Star'
  },

  spawnDetailed(name, factor) {
    const starEntity = this.getStarEntity(name)
    if (!starEntity) return
    const core = starEntity.querySelector('a-sphere:not(.cantap)')
    const color = core ? core.getAttribute('material').color : '#ffffff'
    const size = core ? parseFloat(core.getAttribute('radius') || 0.1) : 0.1
    if (core) core.setAttribute('visible', false) // hide basic sphere

    const detailed = document.createElement('a-entity')
    detailed.setAttribute('dynamic-star', {type: this.typeFromColor(color), size: size * (factor || 4)})
    detailed.setAttribute('scale', '0 0 0')
    starEntity.appendChild(detailed)
    detailed.setAttribute('animation', {property: 'scale', to: '1 1 1', dur: 800, easing: 'easeOutElastic'})
    this.detailedStars.push({entity: detailed, core})
  },

  clearDetailed() {
    this.detailedStars.forEach(({entity, core}) => {
      if (core) core.setAttribute('visible', true)
      if (entity && entity.parentNode) entity.parentNode.removeChild(entity)
    })
    this.detailedStars = []
  },

  typeFromColor(color) {
    if (!color) return 'white'
    if (color.includes('ff5') || color.includes('ff4') || color.includes('ff0')) return 'red'
    if (color.includes('44') || color.includes('7a') || color.includes('aa') || color.includes('bb') || color.includes('99')) return 'blue'
    return 'white'
  },

  // Position #root so `starEntity` sits `focusDistance` in front of the camera, scaled up.
  frameStar(starEntity) {
    if (!starEntity) return
    const root = document.querySelector('#root').object3D
    const cam = (document.querySelector('a-camera') || document.querySelector('[camera]')).object3D
    const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).normalize()
    const focal = camPos.clone().addScaledVector(fwd, this.data.focusDistance)

    // Upright, yaw-only orientation: turn the constellation's face toward the camera around the
    // vertical axis only (no pitch/roll). Combined with the tick() spin around the vertical axis
    // through the focused star, this reads as a clean turntable with the star staying front-on.
    const toCam = camPos.clone().sub(focal); toCam.y = 0
    const yaw = Math.atan2(toCam.x, toCam.z)

    root.scale.set(this.data.zoomScale, this.data.zoomScale, this.data.zoomScale)
    root.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0))
    root.updateMatrixWorld(true)
    const starWorld = new THREE.Vector3(); starEntity.object3D.getWorldPosition(starWorld)
    root.position.add(focal.clone().sub(starWorld))

    this.focal = focal
  },

  // ---- Advance / transition ----
  next() {
    if (!this.active || this.animating) return
    if (this.index >= this.stops.length - 1) { this.endJourney(); return }
    this.transitionTo(this.index + 1)
  },

  transitionTo(i) {
    this.animating = true
    this.hideLore()
    this.clearDetailed()
    const stop = this.stops[i]
    this.setViewForStop(stop)
    const starEntity = this.getStarEntity(stop.centerStarName)
    const root = document.querySelector('#root').object3D

    const start = {p: root.position.clone(), q: root.quaternion.clone(), s: root.scale.clone()}
    this.frameStar(starEntity) // sets root to the TARGET transform, stores this.focal
    const end = {p: root.position.clone(), q: root.quaternion.clone(), s: root.scale.clone()}
    root.position.copy(start.p); root.quaternion.copy(start.q); root.scale.copy(start.s)

    const t0 = performance.now()
    const dur = this.data.transitionDur
    const step = () => {
      const k = Math.min((performance.now() - t0) / dur, 1)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2 // easeInOutQuad
      root.position.lerpVectors(start.p, end.p, e)
      root.scale.lerpVectors(start.s, end.s, e)
      root.quaternion.copy(start.q).slerp(end.q, e)
      if (k < 1) {
        requestAnimationFrame(step)
      } else {
        this.animating = false
        this.index = i
        const factor = stop.detailScale || 4
        stop.targetStarNames.forEach((n) => this.spawnDetailed(n, factor))
        this.showLore(stop)
        this.soundStop(stop)
        this.hud.textContent = (i === this.stops.length - 1) ? 'End the Journey' : 'Next Star'
      }
    }
    requestAnimationFrame(step)
  },

  endJourney() {
    this.animating = true
    this.hideLore()
    this.clearDetailed()
    const a = this.audio()
    if (a) a.stopAll()
    this.focal = null
    // Reuse the existing recenter to restore the front view.
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      const rc = reset.components['reset-view-button']
      rc.isVisible = true
      rc.recenterConstellation()
    }
    setTimeout(() => { this.animating = false; this.exitMode() }, 900)
  },

  remove() {
    this.el.sceneEl.removeEventListener('loreJourneyRequested', this.onRequest)
    if (this.onHud && this.hud) {
      this.hud.removeEventListener('click', this.onHud)
      this.hud.removeEventListener('touchend', this.onHud)
    }
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud)
    if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel)
  },
}

export {loreJourneyComponent}
