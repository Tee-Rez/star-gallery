// reset-view-button.js - Button to recenter constellation in front of camera
//
// Deliberately a screen-fixed control rather than part of the portal HUD band: you reach for
// Recenter precisely when the constellation has drifted out of view, and a button living on
// the HUD is only readable once you are already facing it. It lives in the HUD layer's top row,
// right slot (see hud-shell.js), so the hint, the cards and Gallery all have rows of their own.
import {HUD} from './js/hud-shell'

const resetViewButtonComponent = {
  schema: {
    fadeTime: {type: 'number', default: 300},
    // Matches tap-place-cursor's placementDistance and standHeight. The two have to agree or
    // Recenter would move the portal to a different distance, or a different height, than the
    // one it was placed at.
    distance: {type: 'number', default: 3.5},  // Distance in front of camera
    standHeight: {type: 'number', default: 1.8},
    // Whether Recenter also resets 8th Wall's own tracking. The button used to move #root and
    // nothing else, which cannot help when the problem is that the tracker's floor estimate
    // has gone wrong - the content was being put back in front of a camera whose idea of the
    // room was already wrong.
    resetTracking: {type: 'boolean', default: true},
  },

  init() {
    this.isVisible = false
    this.isRecentering = false

    console.log('Reset view button component initialized')

    // Bind methods early
    this.handleClick = this.handleClick.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleMouseEnter = this.handleMouseEnter.bind(this)
    this.handleMouseLeave = this.handleMouseLeave.bind(this)

    this.createButton()

    // Listen for constellation placed event to show button
    this.el.sceneEl.addEventListener('constellationPlaced', () => {
      console.log('Constellation placed event received, showing button...')
      // Recenter is available inside deep-sky objects too, so there is no mode to defer to.
      setTimeout(() => this.showButton(), 500)
    })
  },

  createButton() {
    this.button = document.createElement('div')
    this.button.className = 'hud-pill'
    this.button.setAttribute('role', 'button')
    // Not tappable until it is shown. It used to be created accepting touches at zero opacity,
    // which swallowed any tap near the top centre while the portal was still being placed.
    this.button.style.opacity = '0'
    this.button.style.pointerEvents = 'none'
    this.button.style.transition = `opacity ${this.data.fadeTime}ms ease, background ${this.data.fadeTime}ms ease`
    this.button.textContent = 'Recenter'

    // Use bound methods
    this.button.addEventListener('mouseenter', this.handleMouseEnter)
    this.button.addEventListener('mouseleave', this.handleMouseLeave)
    this.button.addEventListener('touchstart', this.handleTouchStart)
    this.button.addEventListener('touchend', this.handleClick)
    this.button.addEventListener('click', this.handleClick)

    HUD.mount(this.button, 'top-end', 'recenter')
    console.log('Button created and added to the HUD')
  },

  handleMouseEnter() {
    if (this.isVisible && !this.isRecentering) {
      this.button.style.background = 'rgba(66, 135, 245, 0.3)'
    }
  },

  handleMouseLeave() {
    if (this.isVisible && !this.isRecentering) {
      this.button.style.background = 'rgba(0, 0, 0, 0.7)'
    }
  },

  handleTouchStart(e) {
    e.preventDefault()
    if (this.isVisible && !this.isRecentering) {
      this.button.style.background = 'rgba(66, 135, 245, 0.3)'
    }
  },

  handleClick(e) {
    e.preventDefault()
    e.stopPropagation()

    // Prevent duplicate calls
    if (this.isRecentering) {
      console.log('Already recentering, ignoring duplicate call')
      return
    }

    if (!this.isVisible) {
      console.warn('Cannot recenter: button not visible. isVisible =', this.isVisible)
      return
    }

    this.recenterConstellation()
  },

  recenterConstellation() {
    this.isRecentering = true

    const rootEl = document.querySelector('#root')
    const cameraEl = document.querySelector('a-camera') || document.querySelector('[camera]')

    if (!rootEl) {
      console.error('Root element not found for recentering')
      this.isRecentering = false
      return
    }

    if (!cameraEl) {
      console.error('Camera element not found')
      this.isRecentering = false
      return
    }

    const root3D = rootEl.object3D
    const camera3D = cameraEl.object3D

    // Reset the TRACKER first, then place against the frame it leaves behind. recenter() moves
    // 8th Wall's origin to the camera's current pose, so anything positioned before this call
    // would be left sitting in the old frame - which is the one that had gone wrong.
    if (this.data.resetTracking &&
        window.XR8 && window.XR8.XrController && window.XR8.isInitialized &&
        window.XR8.isInitialized()) {
      try {
        window.XR8.XrController.recenter()
      } catch (e) {
        console.warn('[reset-view-button] XR8 recenter failed, repositioning only:', e)
      }
    }

    // Get camera's world position
    const cameraWorldPos = new THREE.Vector3()
    camera3D.getWorldPosition(cameraWorldPos)

    // Flattened heading, matching tap-place-cursor: the portal stands on the floor a fixed
    // distance ahead whatever the phone's pitch, rather than being flung up or down with it.
    const cameraDirection = new THREE.Vector3(0, 0, -1)
    cameraDirection.applyQuaternion(camera3D.getWorldQuaternion(new THREE.Quaternion()))
    cameraDirection.y = 0
    if (cameraDirection.lengthSq() < 1e-6) cameraDirection.set(0, 0, -1)
    cameraDirection.normalize()

    const newPosition = new THREE.Vector3()
    newPosition.copy(cameraWorldPos)
    newPosition.addScaledVector(cameraDirection, this.data.distance)
    newPosition.y = this.data.standHeight

    root3D.position.copy(newPosition)

    // Yaw only, from the same flattened heading. lookAt(camera) would pitch the portal now
    // that it stands on the floor and the camera does not.
    root3D.rotation.set(0, Math.atan2(-cameraDirection.x, -cameraDirection.z), 0)

    // Visual feedback
    this.animateButtonFeedback()

    // Reset the flag after animation
    setTimeout(() => {
      this.isRecentering = false
    }, 800)
  },

  // A colour flash rather than a 'Recentering...' label: the longer label widened the pill
  // mid-tap and pushed into Gallery on narrow phones.
  animateButtonFeedback() {
    this.button.style.background = 'rgba(66, 135, 245, 0.5)'

    setTimeout(() => {
      this.button.style.background = 'rgba(0, 0, 0, 0.7)'
    }, 800)
  },

  showButton() {
    this.isVisible = true
    this.button.style.opacity = '1'
    this.button.style.pointerEvents = 'auto'
  },

  hideButton() {
    this.isVisible = false
    this.button.style.opacity = '0'
    this.button.style.pointerEvents = 'none'
  },

  remove() {
    if (this.button && this.button.parentNode) {
      this.button.removeEventListener('click', this.handleClick)
      this.button.removeEventListener('touchend', this.handleClick)
      this.button.removeEventListener('touchstart', this.handleTouchStart)
      this.button.removeEventListener('mouseenter', this.handleMouseEnter)
      this.button.removeEventListener('mouseleave', this.handleMouseLeave)
      this.button.parentNode.removeChild(this.button)
    }
  },
}

export {resetViewButtonComponent}
