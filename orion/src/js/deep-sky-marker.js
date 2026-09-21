// js/deep-sky-marker.js - "something is here" for a deep-sky object.
//
// A layered ring that turns slowly. It is deliberately NOT a star: it carries no label sphere
// and never appears in the connection graph, because connections are built from the
// connections array and reference star ids only.
//
// The ring is a hud-element (js/hud-elements.js) - a stack of layers on a camera-facing plane,
// rather than the single flat dashed circle this used to draw. Two reasons beyond the look:
// the old ring lay in its own XY plane, so it collapsed to a line when the user stood to one
// side of the constellation, and it could only ever say one thing. The stack always faces the
// user, and its layers can carry the object's state - explored or not, how far a scan has got.
//
// Tapping uses the same convention as stars - an invisible .cantap sphere - so the existing
// raycaster needs no changes.
const deepSkyMarkerComponent = {
  schema: {
    radius: {type: 'number', default: 0.45},
    color: {type: 'color', default: '#8fd8ff'},
    spin: {type: 'number', default: 0.6},      // radians per second
    visited: {type: 'boolean', default: false},
    // How hard the layered ring burns, and how much of the tap sphere shows. The sphere is only
    // there to say "this volume is touchable"; the ring is the thing to look at, so it carries
    // the light and the sphere stays a hint.
    intensity: {type: 'number', default: 1.8},
    shell: {type: 'number', default: 0.04},
    // The same ring means two different things depending on where it hangs:
    //   select - among the constellation's stars; tapping ENTERS the object
    //   detail - inside the entered object; tapping opens its INFO panel
    // One component, two roles, so the two rings are visually identical by construction.
    role: {type: 'string', default: 'select'},
    // Which layered element to draw. The select marker sits among the stars and has to read at
    // the size of a thumbnail, so it gets the quiet one; the detail marker is alone inside the
    // object with room around it, so it gets the full stack.
    preset: {type: 'string', default: ''},
    // An expanding wave leaving the ring, to say it can be tapped. -1 means "decide from the
    // role"; a number overrides. See pulseFor().
    pulse: {type: 'number', default: -1},
  },

  init() {
    this.ring = null
    this.hitEl = null
    this.onTap = this.onTap.bind(this)
    this.build()
  },

  update(oldData) {
    if (!oldData || !Object.keys(oldData).length) return
    // Visits only change opacity, so avoid rebuilding the geometry for them.
    // A-Frame sends complete previous data, so check if only visited value changed.
    const others = Object.keys(this.data).some(k => k !== 'visited' && oldData[k] !== this.data[k])
    if (!others) {
      this.applyVisited()
      return
    }
    this.build()
  },

  // Which element each role draws, unless the caller names one.
  //
  // Both roles draw the same 'gyro' (the HUD lab's "Gyroscope rings") - they used to differ,
  // the detail ring getting the fuller 'orrery' stack and the select ring the quieter 'idle',
  // on the theory that a marker among a field of stars needs to read at thumbnail size while
  // the detail ring has a whole object's worth of empty space around it. That distinction is
  // gone now by request; what still tells the two apart is size (radius differs per role,
  // see build() below) and the pulse (pulseFor() - detail only).
  presetFor() {
    if (this.data.preset) return this.data.preset
    return 'gyro'
  },

  // Whether this ring sends out the "tap me" wave, unless the caller names a value.
  //
  // The detail ring does, because inside an entered object it is the ONLY thing there is to
  // tap - it sits in the bottom front corner of the portal box looking like part of the frame,
  // and nothing else on screen says it is a control. The select rings in the constellation view
  // do not, because there they sit among stars that are all tappable, so a wave singling them
  // out would say something that is not true. Pass pulse explicitly to override either way.
  //
  // A visited object still pulses. The wave means "this can be tapped", which stays true after
  // a visit; what changes is opacity, and the wave is multiplied by it like every other layer,
  // so a visited ring's wave dims in step rather than disappearing.
  pulseFor() {
    if (this.data.pulse >= 0) return this.data.pulse
    // 0.45, not 1: at full amplitude the wave outshone every continuous curve in the ring
    // it is attached to, which inverts the hierarchy - the eye reads the wave as the object
    // and the object as its background. An invitation should be quieter than the thing it
    // is inviting you to touch.
    return this.data.role === 'detail' ? 0.45 : 0
  },

  build() {
    this.dispose()

    // The element's own entity, so the plane can billboard without turning the hit sphere with
    // it. It is drawn a little outside the tap radius: the layers read as an aura around what
    // you touch rather than as the touch target itself.
    this.ring = document.createElement('a-entity')
    this.ring.classList.add('deep-sky-hud')
    this.ring.setAttribute('hud-element', {
      preset: this.presetFor(),
      radius: this.data.radius * 1.15,
      color: this.data.color,
      rate: Math.max(this.data.spin, 0.05) / 0.6,   // the old spin, in the element's own terms
      opacity: this.data.visited ? 0.42 : 1,
      intensity: this.data.intensity,
      pulse: this.pulseFor(),
    })
    this.el.appendChild(this.ring)

    this.ensureTapTarget()
  },

  // Stars use a .cantap sphere for selection; matching that keeps the raycaster untouched.
  //
  // The hit sphere is created here, inside init() -> build(), which A-Frame runs at least one
  // microtask after this.el is appended to its parent. A caller wiring listeners onto this
  // sphere synchronously right after appendChild would always find it null, so this component
  // owns its own tap listener instead of exposing the sphere for someone else to wire.
  ensureTapTarget() {
    let hit = this.el.querySelector('a-sphere.cantap')
    if (!hit) {
      hit = document.createElement('a-sphere')
      hit.setAttribute('class', 'cantap')
      hit.setAttribute('material', {
        color: this.data.color,
        opacity: this.data.shell,
        transparent: true,
        side: 'double',
        depthTest: true,
        depthWrite: false,
      })
      this.el.appendChild(hit)
      this.hitEl = hit
    }
    // The tap target IS the ring. It used to be 1.5x larger to make a small ring easier to
    // hit, but that halo overlapped neighbouring stars and read as a different size to what
    // is drawn.
    hit.setAttribute('radius', this.data.radius)

    // build() can re-run on update() (a non-'visited' data change), so guard against attaching
    // the click listener twice onto the same (or a freshly-created) hit sphere.
    if (this.hitEl && !this.hitListenerAttached) {
      this.hitEl.addEventListener('click', this.onTap)
      this.hitListenerAttached = true
    }
  },

  // Loader-shaped guard, mirroring the star click handler's `if (!this.isAnimating)`: read the
  // loader straight off the DOM since this component has no other channel to it.
  onTap() {
    const loaderEl = document.querySelector('[constellation-loader]')
    const loader = loaderEl && loaderEl.components['constellation-loader']
    if (loader && loader.isAnimating) return
    const event = this.data.role === 'detail' ? 'deepSkyDetailRequested' : 'deepSkyRequested'
    this.el.sceneEl.emit(event, {id: this.el.dataset.deepSkyId})
  },

  // "Once visited, the ring dims." The element fades as a whole rather than the line alone,
  // because every layer in the stack should step back together.
  applyVisited() {
    if (this.ring) this.ring.setAttribute('hud-element', 'opacity', this.data.visited ? 0.42 : 1)
  },

  setVisited(v) {
    this.el.setAttribute('deep-sky-marker', 'visited', !!v)
  },

  // No tick: the element runs its own clock and turns its own layers, each at its own rate.
  // A single rotation.z applied to everything at once is what made the old ring read as flat.

  dispose() {
    if (!this.ring) return
    if (this.ring.parentNode) this.ring.parentNode.removeChild(this.ring)
    this.ring = null
  },

  remove() {
    this.dispose()
    if (this.hitEl) {
      this.hitEl.removeEventListener('click', this.onTap)
      if (this.hitEl.parentNode) this.hitEl.parentNode.removeChild(this.hitEl)
    }
    this.hitEl = null
    this.hitListenerAttached = false
  },
}

export {deepSkyMarkerComponent}
export default deepSkyMarkerComponent
