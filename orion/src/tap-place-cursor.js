// tap-place-cursor.js - Star-shaped cursor for wall placement
const tapPlaceCursorComponent = {
  schema: {
    placementDistance: {type: 'number', default: 2.5},  // Distance from camera to place cursor
  },

  init() {
    console.log('tap-place-cursor component initializing...')

    this.raycaster = new THREE.Raycaster()
    this.camera = document.getElementById('camera')

    if (!this.camera) {
      console.error('Camera not found!')
      return
    }

    this.threeCamera = this.camera.getObject3D('camera')

    if (!this.threeCamera) {
      console.error('Three.js camera not found!')
      return
    }

    console.log('Camera found:', this.camera)

    // Track if constellation has been placed
    this.hasPlaced = false

    // 2D coordinates of the raycast origin (center of screen)
    this.rayOrigin = new THREE.Vector2(0, 0)

    this.cursorLocation = new THREE.Vector3(0, 0, 0)
    this.cursorNormal = new THREE.Vector3(0, 0, 1)

    // Create invisible plane for raycasting when no surface detected
    this.createVirtualWall()

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

  createVirtualWall() {
    console.log('Creating virtual wall...')

    try {
      // Create an invisible plane in front of camera for cursor placement
      this.virtualWall = document.createElement('a-plane')
      this.virtualWall.setAttribute('id', 'virtual-wall')
      this.virtualWall.setAttribute('width', '100')
      this.virtualWall.setAttribute('height', '100')
      this.virtualWall.setAttribute('position', `0 0 -${this.data.placementDistance}`)
      this.virtualWall.setAttribute('rotation', '90 0 0')
      this.virtualWall.setAttribute('visible', 'false')
      this.virtualWall.setAttribute('material', {
        opacity: 0,
        transparent: true,
      })

      this.camera.appendChild(this.virtualWall)
      console.log('Virtual wall created successfully')
    } catch (error) {
      console.error('Error creating virtual wall:', error)
    }
  },

  placeConstellation() {
    console.log('========== PLACING CONSTELLATION ==========')
    console.log('Cursor location:', this.cursorLocation)

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
      x: this.cursorLocation.x,
      y: this.cursorLocation.y,
      z: this.cursorLocation.z,
    })
    console.log('Root positioned at:', this.cursorLocation)

    // Calculate rotation to face the camera
    const cameraPosition = new THREE.Vector3()
    this.threeCamera.getWorldPosition(cameraPosition)

    const direction = new THREE.Vector3()
    direction.subVectors(cameraPosition, this.cursorLocation).normalize()

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

  tick() {
    if (this.hasPlaced) return

    if (!this.virtualWall || !this.threeCamera) return

    // Update virtual wall position to always be in front of camera
    const cameraWorldPos = new THREE.Vector3()
    this.threeCamera.getWorldPosition(cameraWorldPos)

    const cameraForward = new THREE.Vector3(0, 0, -1)
    cameraForward.applyQuaternion(this.threeCamera.quaternion)

    const wallPosition = cameraWorldPos.clone()
    wallPosition.addScaledVector(cameraForward, this.data.placementDistance)

    this.virtualWall.object3D.position.copy(wallPosition)
    this.virtualWall.object3D.quaternion.copy(this.threeCamera.quaternion)

    // Raycast from camera center to find surface
    this.raycaster.setFromCamera(this.rayOrigin, this.threeCamera)

    // Try to intersect with virtual wall
    const intersects = this.raycaster.intersectObject(this.virtualWall.object3D, true)

    if (intersects.length > 0) {
      const [intersect] = intersects
      this.cursorLocation.copy(intersect.point)
      this.cursorNormal.copy(intersect.face.normal)
    }

    // Update cursor position and rotation
    this.el.object3D.position.copy(this.cursorLocation)

    // Make cursor face camera (billboard effect)
    this.el.object3D.quaternion.copy(this.threeCamera.quaternion)

    // Offset slightly toward camera to avoid z-fighting
    const offset = new THREE.Vector3(0, 0, 0.01)
    offset.applyQuaternion(this.threeCamera.quaternion)
    this.el.object3D.position.add(offset)
  },

  remove() {
    console.log('Removing tap-place-cursor component')
    this.removeClickListeners()
  },
}

export {tapPlaceCursorComponent}
