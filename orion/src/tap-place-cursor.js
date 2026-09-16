// tap-place-cursor.js - Star-shaped cursor for wall placement
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

  // Where the cursor is right now, in world space: straight out from the camera. Read from
  // the object3D rather than recomputed, so it is exactly the spot the viewer is looking at.
  cursorWorldPosition() {
    return this.el.object3D.getWorldPosition(new THREE.Vector3())
  },

  placeConstellation() {
    console.log('========== PLACING CONSTELLATION ==========')

    const cursorLocation = this.cursorWorldPosition()
    console.log('Cursor location:', cursorLocation)

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

    // Calculate rotation to face the camera
    const cameraPosition = new THREE.Vector3()
    this.camera.object3D.getWorldPosition(cameraPosition)

    const direction = new THREE.Vector3()
    direction.subVectors(cameraPosition, cursorLocation).normalize()

    // Calculate angle for Y rotation (yaw)
    const angle = Math.atan2(direction.x, direction.z) * 180 / Math.PI

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
