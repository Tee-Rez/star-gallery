// tap-place-cursor.js - the reticle for wall placement
//
// The cursor entity is a CHILD OF THE CAMERA, parked straight ahead at placementDistance.
// That is the whole trick: parented to the camera it stays pinned to the centre of the
// screen and faces the viewer by construction, with no per-frame work and nothing to drift.
//
// It used to raycast against an invisible plane instead, and that plane was a child of the
// camera while being positioned in WORLD space every frame - so the camera's own transform
// was applied to it twice and the hit point wandered as you moved. The cursor, and the spot
// the constellation landed on, wandered with it.
import {HUD} from './js/hud-shell'
const tapPlaceCursorComponent = {
  schema: {
    placementDistance: {type: 'number', default: 2.5},  // Distance from camera to place cursor
    // Where the portal's ORIGIN sits above the floor. The frame is drawn +/- height/4 around
    // that origin (portal.js: height 9 -> halfFrameHeight 2.25), so 2.25 stands the bottom
    // edge of the frame on y=0.
    //
    // This is the number to change if the portal sits too high or too low - it is the only
    // thing deciding the portal's height off the ground.
    standHeight: {type: 'number', default: 2.25},
  },

  init() {
    console.log('tap-place-cursor component initializing...')

    this.camera = document.getElementById('camera')

    if (!this.camera) {
      console.error('Camera not found!')
      return
    }

    console.log('Camera found:', this.camera)

    // Track if constellation has been placed
    this.hasPlaced = false

    // Sit dead ahead of the camera. Set here rather than trusting the markup so
    // placementDistance stays the single source of truth for where this lands.
    this.el.object3D.position.set(0, 0, -this.data.placementDistance)

    // The reticle is a layered ring and nothing else, so it reads as an instrument looking for
    // a surface rather than a sticker on the screen. (It used to ring a star-burst image.)
    // Added from here rather than the markup
    // because the markup exists twice (body.html and the flattened index.html) and the two
    // have to be edited in step; this file is the one that owns the cursor either way.
    //
    // 'reticle' is the HUD lab's "Reticle stack" - brackets, a dashed ring and compass ticks
    // built for exactly this job (fixed at the centre of the screen, aiming rather than
    // marking an object). Its own bottom loading bar is left out at the source: a placement
    // cursor is waiting for a tap, not loading anything.
    //
    // billboard: false - the cursor is a child of the camera, so it already faces the user and
    // the billboard maths would resolve to identity every frame for nothing.
    this.hud = document.createElement('a-entity')
    this.hud.setAttribute('hud-element', {
      preset: 'reticle',
      radius: 0.5,
      color: '#8fd8ff',
      opacity: 0.85,
      rate: 0.8,
      billboard: false,
    })
    this.el.appendChild(this.hud)

    // Bind handlers
    this.handleClick = this.handleClick.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)

    // Wait a bit for scene to be fully ready
    setTimeout(() => {
      this.addClickListeners()
    }, 1000)
  },

  addClickListeners() {
    console.log('Adding click listeners...')

    try {
      // Listen for multiple event types to catch both mouse and touch
      const {canvas} = this.el.sceneEl

      if (canvas) {
        console.log('Canvas found, adding listeners')
        // Mouse events
        canvas.addEventListener('mousedown', this.handleClick, {passive: false})
        canvas.addEventListener('click', this.handleClick, {passive: false})

        // Touch events - with passive: false to allow preventDefault
        canvas.addEventListener('touchstart', this.handleTouchStart, {passive: false})
        canvas.addEventListener('touchend', this.handleClick, {passive: false})

        console.log('Canvas listeners added')
      } else {
        console.warn('Canvas not found, trying scene element')
      }

      // Also listen on the scene as backup
      this.el.sceneEl.addEventListener('click', this.handleClick)

      // Listen on document as ultimate fallback
      document.addEventListener('mousedown', this.handleClick, {passive: false})
      document.addEventListener('touchstart', this.handleTouchStart, {passive: false})

      console.log('All click listeners successfully added')
    } catch (error) {
      console.error('Error adding click listeners:', error)
    }
  },

  removeClickListeners() {
    console.log('Removing all click listeners from cursor component...')

    // Clean up event listeners
    const {canvas} = this.el.sceneEl
    if (canvas) {
      canvas.removeEventListener('mousedown', this.handleClick)
      canvas.removeEventListener('click', this.handleClick)
      canvas.removeEventListener('touchstart', this.handleTouchStart)
      canvas.removeEventListener('touchend', this.handleClick)
      console.log('Canvas listeners removed')
    }

    if (this.el.sceneEl) {
      this.el.sceneEl.removeEventListener('click', this.handleClick)
      console.log('Scene listeners removed')
    }

    document.removeEventListener('mousedown', this.handleClick)
    document.removeEventListener('touchstart', this.handleTouchStart)
    console.log('Document listeners removed')

    console.log('✅ All click listeners removed - stars should now be clickable')
  },

  handleTouchStart(event) {
    // Only process if not yet placed
    if (this.hasPlaced) {
      return
    }

    console.log('Touch start detected!')
    console.log('Touch registered, hasPlaced:', this.hasPlaced)

    // Call handleClick
    this.handleClick(event)
  },

  handleClick(event) {
    // If already placed, ignore completely and let event pass through
    if (this.hasPlaced) {
      return
    }

    // A touch on a screen control - Gallery, say - is not a request to place the portal. These
    // listeners sit on the whole document, so without this a tap on Gallery would place the
    // portal and navigate away at the same time.
    if (HUD.isHudEvent(event)) {
      return
    }

    console.log('========== CLICK/TAP DETECTED ==========')
    console.log('Event type:', event.type)
    console.log('Has placed:', this.hasPlaced)

    // Check if we should filter this click
    let shouldSkip = false

    // Only check for A-Frame intersected elements if this is an A-Frame click event
    if (event.detail && event.detail.intersectedEl) {
      console.log('A-Frame click event with intersectedEl:', event.detail.intersectedEl)
      const clickedEl = event.detail.intersectedEl

      // Don't place if clicking on stars or UI buttons
      const isStarOrUI = clickedEl.matches('a-sphere.cantap') ||
                        clickedEl.matches('.clickable') ||
                        clickedEl.closest('.cantap') ||
                        clickedEl.closest('.clickable')

      if (isStarOrUI) {
        console.log('Clicked on star or UI, not placing')
        shouldSkip = true
      }
    } else {
      console.log('Raw click/touch event (not A-Frame) - this is good!')
    }

    if (shouldSkip) {
      console.log('Skipping this click')
      return
    }

    console.log('Attempting to place constellation...')

    try {
      this.placeConstellation()
    } catch (error) {
      console.error('Error placing constellation:', error)
      console.error('Error stack:', error.stack)
    }
  },

  // Where the portal actually goes: on the FLOOR, a fixed distance ahead, regardless of how
  // the phone happens to be tilted.
  //
  // It used to land wherever the reticle was - dead ahead of the camera, which put it floating
  // at eye height with nothing under it. Two things were wrong with that. 8th Wall's world
  // tracking is a floor-plane estimate that it keeps recalculating from feature points, and its
  // own guidance is that surface-aligned content sits with its base at y=0; content hanging in
  // mid-air has no relationship to the plane being tracked. And in practice, once you are
  // looking at something several metres away at eye level the floor leaves the frame entirely,
  // which is exactly when that plane estimate goes bad and everything anchored to it slides.
  //
  // Flattening the heading also makes the distance predictable: pitch the phone down and the
  // portal stays the same distance away instead of landing at your feet.
  placementPoint() {
    const cam = this.camera.object3D
    const camPos = cam.getWorldPosition(new THREE.Vector3())
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
      cam.getWorldQuaternion(new THREE.Quaternion()))
    fwd.y = 0
    // Pointing straight up or straight down leaves no heading to flatten; keep the last usable
    // one rather than normalising a zero vector into NaN and losing the portal entirely.
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()

    const p = camPos.clone().addScaledVector(fwd, this.data.placementDistance)
    p.y = this.data.standHeight
    return {point: p, forward: fwd}
  },

  placeConstellation() {
    console.log('========== PLACING CONSTELLATION ==========')

    const {point: cursorLocation, forward} = this.placementPoint()
    console.log('Placing at floor point:', cursorLocation)

    this.hasPlaced = true

    // IMPORTANT: Remove all click listeners immediately after placement
    this.removeClickListeners()

    // Hide the cursor
    this.el.setAttribute('visible', 'false')
    console.log('Cursor hidden')

    // Get the root entity and position it at cursor location
    const root = document.getElementById('root')

    if (!root) {
      console.error('Root element not found!')
      return
    }

    console.log('Root element found:', root)

    // Position at cursor location
    root.setAttribute('position', {
      x: cursorLocation.x,
      y: cursorLocation.y,
      z: cursorLocation.z,
    })
    console.log('Root positioned at:', cursorLocation)

    // Face back down the heading it was placed along. Taken from the flattened forward rather
    // than from (camera - portal): those differ now that the portal is on the floor and the
    // camera is not, and the vertical component would tilt the portal.
    const angle = Math.atan2(-forward.x, -forward.z) * 180 / Math.PI

    root.setAttribute('rotation', `0 ${angle} 0`)
    console.log('Root rotation set to:', angle)

    // Make root visible
    root.setAttribute('visible', 'true')
    console.log('Root made visible')

    // Emit event to start portal animation
    this.el.sceneEl.emit('constellationPlaced')
    console.log('constellationPlaced event emitted')

    console.log('========== CONSTELLATION PLACED SUCCESSFULLY ==========')
  },

  remove() {
    console.log('Removing tap-place-cursor component')
    this.removeClickListeners()
  },
}

export {tapPlaceCursorComponent}
