// dynamic-star-controller.js
const dynamicStarControllerComponent = {
  schema: {
    portalSelector: {type: 'string', default: '#portal'},
    animationDuration: {type: 'number', default: 1500},
    starScale: {type: 'number', default: 4},
    // The selected star is a star-visual in plasma mode now, and its drawn footprint is far
    // wider than its body: the halo quad alone spans about five body radii, before the corona
    // and the prominence loops. Multiplying the figure-star size by starScale the way the old
    // lit sphere did would put a star three times the width of the constellation in the portal.
    // These three keep the footprint about what the old sphere occupied, and keep the spread
    // between a small star and a large one without letting the large one run away.
    plasmaScale: {type: 'number', default: 1.6},
    plasmaMin: {type: 'number', default: 0.10},
    plasmaMax: {type: 'number', default: 0.26},
  },

  init() {
    // Find the portal element by selector
    this.portalElement = document.querySelector(this.data.portalSelector)
    this.currentStar = null
    this.isAnimating = false
    this.isPendingRemoval = false

    // Bind methods
    this.createStar = this.createStar.bind(this)
    this.removeStar = this.removeStar.bind(this)
    this.handleDynamicStarClick = this.handleDynamicStarClick.bind(this)

    // Set up event listeners only after scene is fully loaded
    this.el.sceneEl.addEventListener('loaded', () => {
      this.el.sceneEl.addEventListener('starInfoRequested', this.createStar)
      this.el.sceneEl.addEventListener('starInfoClosed', this.removeStar)
    })
  },

  createStar(event) {
  // If there's already a star or we're in the middle of an animation, remove it first
    if (this.currentStar) {
      this.removeStar()
    }

    // Always proceed with star creation, regardless of current state
    // Either immediately or after a short delay to let cleanup finish
    if (this.isPendingRemoval) {
      setTimeout(() => {
        this.createStarImpl(event)
      }, 100)
    } else {
      this.createStarImpl(event)
    }
  },

  // 3. Add the createOrionNebula method to your dynamic-star-controller.js file

  // createOrionNebula(starName) {
  // // Create container for the nebula
  //   const nebulaContainer = document.createElement('a-entity')
  //   nebulaContainer.setAttribute('id', 'dynamic-star-container')  // Use same ID format for consistent removal
  //   nebulaContainer.setAttribute('position', '0 0 6')
  //   nebulaContainer.setAttribute('rotation', '90 0 0')

  //   // Create the nebula model
  //   const nebulaModel = document.createElement('a-entity')
  //   nebulaModel.setAttribute('id', 'dynamic-star')  // Use same ID format for consistent removal
  //   nebulaModel.setAttribute('gltf-model', '#orion-nebula-model')
  //   nebulaModel.setAttribute('scale', '0 0 0')  // Start with zero scale
  //   nebulaModel.setAttribute('class', 'cantap')

  //   // Add slow rotation animation for visual effect
  //   nebulaModel.setAttribute('animation__rotate', {
  //     property: 'rotation',
  //     to: '0 360 0',
  //     loop: true,
  //     dur: 120000,  // 2 minutes for a full rotation
  //     easing: 'linear',
  //   })

  //   // Add collision sphere to detect clicks - after parent is in the DOM
  //   const collisionSphere = document.createElement('a-entity')
  //   collisionSphere.setAttribute('class', 'cantap')
  //   collisionSphere.setAttribute('geometry', {
  //     primitive: 'sphere',
  //     radius: 2.0,  // Larger radius for easier interaction
  //   })
  //   collisionSphere.setAttribute('material', {
  //     opacity: 0.0,
  //     transparent: true,
  //     depthTest: false,
  //   })

  //   // Add elements to the scene hierarchy
  //   nebulaModel.appendChild(collisionSphere)
  //   nebulaContainer.appendChild(nebulaModel)
  //   this.portalElement.appendChild(nebulaContainer)

  //   // Add click listeners to the object
  //   this.addClickListeners(nebulaModel)

  //   // Animate nebula appearing
  //   this.isAnimating = true
  //   nebulaModel.setAttribute('animation', {
  //     property: 'scale',
  //     from: '0 0 0',
  //     to: starName === 'Theta1 Orionis' ? '0.6 0.6 0.6' : '0.5 0.5 0.5',  // Slightly different scale based on which star
  //     dur: this.data.animationDuration,
  //     easing: 'easeOutElastic',
  //   })

  //   // When animation completes
  //   nebulaModel.addEventListener('animationcomplete', () => {
  //     this.isAnimating = false
  //   }, {once: true})

  //   this.currentStar = nebulaContainer
  // },

  createStarImpl(event) {
    const {starName, starColor, starSize, starType, tempKelvin, spectralClass, magnitude} = event.detail

    // Get the portal position
    if (!this.portalElement) {
      console.error('Portal element not found')
      return
    }

    // If we're already animating, just proceed anyway
    // This ensures we always create a star on request

    // Create star container
    const starContainer = document.createElement('a-entity')
    starContainer.setAttribute('id', 'dynamic-star-container')
    starContainer.setAttribute('position', '0 0 0')  // Same Z as portal

    // Add container to scene first
    this.portalElement.appendChild(starContainer)
    this.currentStar = starContainer

    // Create the dynamic star
    const dynamicStar = document.createElement('a-entity')
    dynamicStar.setAttribute('id', 'dynamic-star')

    // Add star to container before setting components
    starContainer.appendChild(dynamicStar)

    // Now set components on the entity that's in the DOM
    dynamicStar.setAttribute('scale', '0 0 0')  // Start with zero scale
    dynamicStar.setAttribute('class', 'cantap')

    // The entered star. Same component the figure stars use, with its surface and prominences
    // switched on - so the thing you tapped and the thing that opens are recognisably the same
    // object, coloured from the same temperature, rather than two unrelated renderers.
    const radius = Math.max(
      this.data.plasmaMin,
      Math.min(this.data.plasmaMax, (starSize || 0.1) * this.data.plasmaScale))

    dynamicStar.setAttribute('star-visual', {
      radius,
      color: starColor || '#ffffff',
      tempKelvin: tempKelvin || 0,
      spectralClass: spectralClass || '',
      magnitude: typeof magnitude === 'number' ? magnitude : 3,
      surface: 0.85,
      surfaceScale: 18,
      prominence: 0.55,
      arcs: 16,
      spots: 0.45,
      haloScale: 2.6,
      // No diffraction spikes on a star you are standing next to: spikes are what a POINT
      // source does to a lens, and this one is resolved.
      glareSpan: 0,
      twinkle: 0,
    })

    // Add collision sphere to detect clicks - after parent is in the DOM
    const collisionSphere = document.createElement('a-entity')
    collisionSphere.setAttribute('class', 'cantap')
    collisionSphere.setAttribute('geometry', {
      primitive: 'sphere',
      radius: radius * 1.5,
    })
    collisionSphere.setAttribute('material', {
      opacity: 0.0,
      transparent: true,
      depthTest: false,
    })

    dynamicStar.appendChild(collisionSphere)

    // Add click listener
    this.addClickListeners(dynamicStar)

    // Animate star appearing
    this.isAnimating = true
    dynamicStar.setAttribute('animation', {
      property: 'scale',
      from: '0 0 0',
      to: '1 1 1',
      dur: this.data.animationDuration,
      easing: 'easeOutElastic',
    })

    // When animation completes
    dynamicStar.addEventListener('animationcomplete', () => {
      this.isAnimating = false
    }, {once: true})
  },

  addClickListeners(starEntity) {
    // Add click listeners to the star entity
    if (starEntity) {
      starEntity.addEventListener('click', this.handleDynamicStarClick)

      // Also add to any child with cantap class
      const tapElements = starEntity.querySelectorAll('.cantap')
      tapElements.forEach((el) => {
        el.addEventListener('click', this.handleDynamicStarClick)
      })
    }
  },

  removeClickListeners(starEntity) {
    // Remove click listeners from the star entity
    if (starEntity) {
      starEntity.removeEventListener('click', this.handleDynamicStarClick)

      // Also remove from any child with cantap class
      const tapElements = starEntity.querySelectorAll('.cantap')
      tapElements.forEach((el) => {
        el.removeEventListener('click', this.handleDynamicStarClick)
      })
    }
  },

  removeStar() {
    if (!this.currentStar) return

    this.isPendingRemoval = true

    const starContainer = this.currentStar
    const dynamicStar = starContainer.querySelector('#dynamic-star')

    // Clear reference immediately
    this.currentStar = null

    if (!dynamicStar) {
      // If no dynamic star (shouldn't happen), just remove container
      if (starContainer.parentNode) {
        starContainer.parentNode.removeChild(starContainer)
      }
      this.isPendingRemoval = false
      return
    }

    // Remove event listeners first
    this.removeClickListeners(dynamicStar)

    // Only animate if not already animating
    if (!this.isAnimating) {
      this.isAnimating = true

      // Animate disappearing
      dynamicStar.setAttribute('animation', {
        property: 'scale',
        from: '1 1 1',
        to: '0 0 0',
        dur: this.data.animationDuration / 2,
        easing: 'easeInQuad',
      })

      // Remove after animation
      dynamicStar.addEventListener('animationcomplete', () => {
        // Check if container still exists before trying to remove
        if (starContainer.parentNode) {
          // Dispose the star's geometry and materials before the DOM node goes.
          const starComponent = dynamicStar.components['star-visual']
          if (starComponent && typeof starComponent.remove === 'function') {
            starComponent.remove()
          }

          // Then remove from DOM
          starContainer.parentNode.removeChild(starContainer)
        }

        this.isAnimating = false
        this.isPendingRemoval = false
      }, {once: true})
    } else {
      // If already animating, just remove without animation
      if (starContainer.parentNode) {
        // Dispose the star's geometry and materials before the DOM node goes.
        const starComponent = dynamicStar.components['star-visual']
        if (starComponent && typeof starComponent.remove === 'function') {
          starComponent.remove()
        }

        // Then remove from DOM
        starContainer.parentNode.removeChild(starContainer)
      }
      this.isPendingRemoval = false
    }
  },

  handleDynamicStarClick(event) {
    event.stopPropagation()

    // Fire event to close info panel
    this.el.sceneEl.emit('starInfoClosed')
  },

  getStarTypeFromColor(color) {
    // Simple mapping from star colors to types
    if (!color) return 'white'

    if (color.includes('ff44') || color.includes('ff33') || color.includes('ff00')) {
      return 'red'
    } else if (color.includes('44') || color.includes('aaf') || color.includes('bbf')) {
      return 'blue'
    } else {
      return 'white'
    }
  },

  remove() {
    // Clean up event listeners
    this.el.sceneEl.removeEventListener('starInfoRequested', this.createStar)
    this.el.sceneEl.removeEventListener('starInfoClosed', this.removeStar)

    // Remove star if it exists
    if (this.currentStar && this.currentStar.parentNode) {
      this.currentStar.parentNode.removeChild(this.currentStar)
    }

    this.currentStar = null
  },
}

export {dynamicStarControllerComponent}
