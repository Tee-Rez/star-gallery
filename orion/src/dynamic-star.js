// dynamic-star.js
const dynamicStarComponent = {
  schema: {
    type: {type: 'string', default: 'blue'},  // blue, red, or white
    size: {type: 'number', default: 1},
    flareCount: {type: 'number', default: 6},
    minInterval: {type: 'number', default: 2000},
    maxInterval: {type: 'number', default: 6000},
    flareLifespan: {type: 'number', default: 3000},
  },

  init() {
    // Wait for next tick to ensure scene is ready before creating elements
    this.el.sceneEl.addEventListener('renderstart', () => {
      this.setupStar()
    })
    this.starElements = []
  },

  getRandomInterval() {
    return Math.random() * (this.data.maxInterval - this.data.minInterval) + this.data.minInterval
  },

  setupStar() {
    // Define material properties for each star type
    const starTypes = {
      blue: {
        src: '#blue-star-texture',
        emissive: '#4477ff',
        emissiveIntensity: 0.8,
        glowColor: '#4477ff',
        transparent: true,
        roughness: 0.3,
        metalness: 0.2,
      },
      red: {
        src: '#red-star-texture',
        emissive: '#ff4400',
        emissiveIntensity: 0.6,
        glowColor: '#ff4400',
        transparent: true,
        roughness: 0.4,
        metalness: 0.1,
      },
      white: {
        src: '#white-star-texture',
        emissive: '#ffffff',
        emissiveIntensity: 0.4,
        glowColor: '#ffffff',
        transparent: true,
        roughness: 0.2,
        metalness: 0.3,
      },
    }

    // Get properties for this star type
    const materialProps = starTypes[this.data.type] || starTypes.white

    // Create elements only if they don't already exist
    if (!this.outerSphere) {
      // Create outer textured sphere (main star surface)
      this.outerSphere = document.createElement('a-entity')
      this.outerSphere.setAttribute('geometry', {
        primitive: 'sphere',
        radius: this.data.size,
        segmentsWidth: 32,
        segmentsHeight: 32,
      })
      this.starElements.push(this.outerSphere)
    }

    // Update material properties
    this.outerSphere.setAttribute('material', {
      shader: 'standard',
      src: materialProps.src,
      emissive: materialProps.emissive,
      emissiveIntensity: materialProps.emissiveIntensity,
      metalness: materialProps.metalness,
      roughness: materialProps.roughness,
      repeat: '2 2',
    })

    if (!this.innerSphere) {
      // Create inner glowing sphere
      this.innerSphere = document.createElement('a-entity')
      this.innerSphere.setAttribute('geometry', {
        primitive: 'sphere',
        radius: this.data.size * 1.10,
        segmentsWidth: 32,
        segmentsHeight: 32,
      })
      this.starElements.push(this.innerSphere)
    }

    // Update inner sphere material
    this.innerSphere.setAttribute('material', {
      color: materialProps.glowColor,
      opacity: 0.3,
      transparent: true,
    })
    //this.innerSphere.setAttribute('data-bloom', 'bloom')

    // Add rotation animation to both spheres
    const rotationAnimation = {
      property: 'rotation',
      dur: 10000,
      easing: 'linear',
      loop: true,
      to: '0 360 0',
    }

    this.outerSphere.setAttribute('animation', rotationAnimation)
    this.innerSphere.setAttribute('animation', rotationAnimation)

    // Add spheres to the entity only if they're not already added
    if (!this.outerSphere.parentNode) {
      this.el.appendChild(this.innerSphere)
      this.el.appendChild(this.outerSphere)
    }
  },

  update(oldData) {
    // Only update if type or size changed
    if (oldData.type !== this.data.type || oldData.size !== this.data.size) {
      if (this.outerSphere) {
        // Update existing elements instead of recreating them
        const materialProps = {
          blue: {
            src: '#blue-star-texture',
            emissive: '#4477ff',
            emissiveIntensity: 0.8,
            glowColor: '#4477ff',
          },
          red: {
            src: '#red-star-texture',
            emissive: '#ff4400',
            emissiveIntensity: 0.6,
            glowColor: '#ff4400',
          },
          white: {
            src: '#white-star-texture',
            emissive: '#ffffff',
            emissiveIntensity: 0.4,
            glowColor: '#ffffff',
          },
        }[this.data.type] || {
          src: '#white-star-texture',
          emissive: '#ffffff',
          emissiveIntensity: 0.4,
          glowColor: '#ffffff',
        }

        // Update sphere sizes
        this.outerSphere.setAttribute('geometry', {
          primitive: 'sphere',
          radius: this.data.size,
        })
        this.innerSphere.setAttribute('geometry', {
          primitive: 'sphere',
          radius: this.data.size * 1.10,
        })

        // Update materials
        this.outerSphere.setAttribute('material', 'src', materialProps.src)
        this.outerSphere.setAttribute('material', 'emissive', materialProps.emissive)
        this.outerSphere.setAttribute('material', 'emissiveIntensity', materialProps.emissiveIntensity)

        this.innerSphere.setAttribute('material', 'color', materialProps.glowColor)
      } else {
        // Setup if not already done
        this.setupStar()
      }
    }
  },

  remove() {
    // Clean up - remove all created elements
    this.starElements.forEach((element) => {
      if (element && element.parentNode === this.el) {
        this.el.removeChild(element)
      }
    })

    this.starElements = []
    this.outerSphere = null
    this.innerSphere = null
  },
}

export {dynamicStarComponent}
