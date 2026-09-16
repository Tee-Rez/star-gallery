// hint-controller.js - Updated for cursor placement
const hintControllerComponent = {
  schema: {
    hintDelay: {type: 'number', default: 2000},
    hintDuration: {type: 'number', default: 5000},
    fadeTime: {type: 'number', default: 1000},
    placementHintText: {type: 'string', default: 'Tap on a wall to place your constellation portal'},
    rotationHintText: {type: 'string', default: 'Drag your finger around to rotate the constellation'},
    viewToggleHintText: {type: 'string', default: 'Tap the button at the bottom to switch between 2D and 3D views'},
    tapHintText: {type: 'string', default: 'Tap on any star to learn more about it'},
    completeText: {type: 'string', default: 'Great! Explore the stars at your own pace'},
  },

  init() {
    this.hasPlaced = false
    this.hasRotated = false
    this.hasTappedStar = false
    this.hasToggledView = false
    this.currentHint = null
    this.portalOpened = false
    this.rotationThreshold = 0.05
    this.lastRotation = null
    this.currentHintPhase = 0  // 0: placement, 1: rotation, 2: view toggle, 3: tap star, 4: complete
    this.rotatingContainer = null
    // Inside a deep-sky object none of these hints apply, so they go quiet there. Progress is
    // still recorded while they are quiet: a step done inside counts, and on the way back out
    // the sequence picks up at whichever step is now next.
    this.suspended = false
    this.resumeTimer = null
    this.completionTimer = null
    this.tutorialFinished = false

    // Create hint container
    this.hintContainer = document.createElement('div')
    this.hintContainer.style.cssText = `
      position: fixed;
      bottom: 80%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 12px 20px;
      border-radius: 20px;
      font-family: Arial, sans-serif;
      font-size: 16px;
      text-align: center;
      opacity: 0;
      transition: opacity ${this.data.fadeTime}ms ease;
      z-index: 1000;
      pointer-events: none;
      max-width: 80%;
      border: 1px solid #4287f5;
      backdrop-filter: blur(5px);
    `
    document.body.appendChild(this.hintContainer)

    // Setup event listeners
    this.setupEventListeners()

    // Show placement hint immediately
    setTimeout(() => {
      this.showPlacementHint()
    }, 1000)

    // Listen for constellation ready event
    this.el.sceneEl.addEventListener('constellation-ready', () => {
      console.log('Constellation ready event received')
      this.findRotatingContainer()
    })

    // Listen for constellation placed event
    this.el.sceneEl.addEventListener('constellationPlaced', () => {
      console.log('Constellation placed event received')
      this.onConstellationPlaced()
    })

    // Listen for portal opened event
    this.el.sceneEl.addEventListener('portalOpened', () => {
      console.log('Portal opened event received')
      this.onPortalOpened()
    })

    this.onDeepSkyEntered = () => this.suspend()
    this.onDeepSkyExited = () => this.resume()
    this.el.sceneEl.addEventListener('deepSkyEntered', this.onDeepSkyEntered)
    this.el.sceneEl.addEventListener('deepSkyExited', this.onDeepSkyExited)
  },

  suspend() {
    this.suspended = true
    clearTimeout(this.resumeTimer)
    // A completion message cut short has not been read, so it has not finished: let it come
    // back with the rest rather than counting it as shown.
    clearTimeout(this.completionTimer)
    this.hideCurrentHint()
  },

  resume() {
    this.suspended = false
    if (!this.portalOpened || this.tutorialFinished) return
    clearTimeout(this.resumeTimer)
    // A beat after the constellation comes back, so the hint does not land on top of the
    // transition. Re-checked on firing, in case another object was entered in the meantime.
    this.resumeTimer = setTimeout(() => {
      if (!this.suspended) this.progressToNextHint()
    }, this.data.fadeTime)
  },

  findRotatingContainer() {
    const constellationLoader = document.querySelector('a-entity[constellation-loader]')

    if (constellationLoader) {
      const {children} = constellationLoader
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.hasAttribute('xrextras-one-finger-rotate')) {
          this.rotatingContainer = child
          console.log('Found rotating container:', this.rotatingContainer)

          if (this.rotatingContainer && this.rotatingContainer.object3D) {
            this.lastRotation = this.rotatingContainer.object3D.rotation.clone()
            console.log('Initial rotation stored:', this.lastRotation)
          }
          break
        }
      }
    }

    if (!this.rotatingContainer) {
      console.warn('Could not find rotating container')
      setTimeout(() => this.findRotatingContainer(), 500)
    } else {
      this.el.sceneEl.addEventListener('renderstart', () => {
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 100)
      })
    }
  },

  setupEventListeners() {
    // The 2D/3D button lives in the portal's HUD band and asks for the change with this event.
    // viewToggleChanged is NOT used: the lore journey switches the view itself and announces
    // it the same way, which would tick this step off without the user ever touching the button.
    this.el.sceneEl.addEventListener('viewToggleRequested', () => {
      this.onViewToggled()
    })

    // Detect star tap
    this.el.sceneEl.addEventListener('click', (e) => {
      const clickedEl = e.detail.intersectedEl
      if (clickedEl && clickedEl.matches('a-sphere.cantap')) {
        const starEntity = clickedEl.parentElement
        if (starEntity && starEntity.dataset.name) {
          this.onStarTapped()
        }
      }
    })

    // Listen for star info panel events
    this.el.sceneEl.addEventListener('starInfoRequested', () => {
      this.onStarTapped()
    })
  },

  onConstellationPlaced() {
    this.hasPlaced = true
    console.log('Constellation has been placed')

    // Hide placement hint
    if (this.currentHintPhase === 0) {
      this.hideCurrentHint()
    }

    // Don't show next hint yet - wait for portal to open
  },

  onPortalOpened() {
    if (this.portalOpened) return

    this.portalOpened = true
    console.log('Portal opened, starting hint sequence')

    // Make sure we have the rotating container
    if (!this.rotatingContainer) {
      this.findRotatingContainer()
    }

    // Store initial rotation if we have the container
    if (this.rotatingContainer && this.rotatingContainer.object3D && !this.lastRotation) {
      this.lastRotation = this.rotatingContainer.object3D.rotation.clone()
      console.log('Initial rotation stored at portal open:', this.lastRotation)
    }

    // Start with rotation hint after delay
    setTimeout(() => {
      this.progressToNextHint()
    }, this.data.hintDelay)
  },

  progressToNextHint() {
    if (!this.hasPlaced) {
      this.currentHintPhase = 0
      this.showPlacementHint()
    } else if (!this.hasRotated) {
      this.currentHintPhase = 1
      this.showRotationHint()
    } else if (!this.hasToggledView) {
      this.currentHintPhase = 2
      this.showViewToggleHint()
    } else if (!this.hasTappedStar) {
      this.currentHintPhase = 3
      this.showTapHint()
    } else {
      this.currentHintPhase = 4
      this.showCompletionHint()
    }
  },

  tick() {
    if (!this.rotatingContainer || this.hasRotated || !this.lastRotation) return

    const currentRotation = this.rotatingContainer.object3D.rotation
    const rotationDiff = Math.abs(currentRotation.y - this.lastRotation.y)

    if (rotationDiff > 0.001) {
      console.log('Rotation detected:', rotationDiff, 'threshold:', this.rotationThreshold)
    }

    if (rotationDiff > this.rotationThreshold) {
      this.onRotating()
    }

    this.lastRotation = currentRotation.clone()
  },

  onRotating() {
    if (this.hasRotated) return

    this.hasRotated = true
    console.log('User has rotated the constellation')

    if (this.portalOpened && this.currentHintPhase === 1) {
      this.hideCurrentHint()
      setTimeout(() => this.progressToNextHint(), 1000)
    }
  },

  onViewToggled() {
    if (this.hasToggledView) return

    this.hasToggledView = true
    console.log('User has toggled 2D/3D view')

    if (this.portalOpened && this.currentHintPhase === 2) {
      this.hideCurrentHint()
      setTimeout(() => this.progressToNextHint(), 1000)
    }
  },

  onStarTapped() {
    if (this.hasTappedStar) return

    this.hasTappedStar = true
    console.log('User has tapped a star')

    if (this.portalOpened && this.currentHintPhase === 3) {
      this.hideCurrentHint()
      setTimeout(() => this.progressToNextHint(), 1000)
    }
  },

  showPlacementHint() {
    if (this.hasPlaced) {
      this.progressToNextHint()
      return
    }

    console.log('Displaying placement hint')
    this.showHint(this.data.placementHintText)
  },

  showRotationHint() {
    if (this.hasRotated) {
      this.progressToNextHint()
      return
    }

    console.log('Displaying rotation hint')
    this.showHint(this.data.rotationHintText)
  },

  showViewToggleHint() {
    if (this.hasToggledView) {
      this.progressToNextHint()
      return
    }

    console.log('Displaying view toggle hint')
    this.showHint(this.data.viewToggleHintText)
  },

  showTapHint() {
    if (this.hasTappedStar) {
      this.progressToNextHint()
      return
    }

    console.log('Displaying tap hint')
    this.showHint(this.data.tapHintText)
  },

  showCompletionHint() {
    if (this.tutorialFinished || this.suspended) return
    console.log('Displaying completion hint')
    this.showHint(this.data.completeText)

    clearTimeout(this.completionTimer)
    this.completionTimer = setTimeout(() => {
      this.hideCurrentHint()
      this.tutorialFinished = true
    }, this.data.hintDuration)
  },

  showHint(text) {
    // Deliberately silent rather than queued: resume() asks progressToNextHint() again, which
    // works out the right step from what has been done, so nothing needs remembering here.
    if (this.suspended) return
    this.hideCurrentHint()
    this.hintContainer.textContent = text
    this.hintContainer.style.opacity = '1'
    this.currentHint = text
  },

  hideCurrentHint() {
    if (this.currentHint) {
      this.hintContainer.style.opacity = '0'
      this.currentHint = null
    }
  },

  remove() {
    clearTimeout(this.resumeTimer)
    clearTimeout(this.completionTimer)
    this.el.sceneEl.removeEventListener('deepSkyEntered', this.onDeepSkyEntered)
    this.el.sceneEl.removeEventListener('deepSkyExited', this.onDeepSkyExited)
    if (this.hintContainer && this.hintContainer.parentNode) {
      this.hintContainer.parentNode.removeChild(this.hintContainer)
    }
  },
}

export {hintControllerComponent}
