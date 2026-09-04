// constellation-components.js
const constellationControllerComponent = {
  schema: {
    gridWidth: {type: 'number', default: 6},
    gridHeight: {type: 'number', default: 9},
    gridSize: {type: 'number', default: 0.5},
    gridColor: {type: 'color', default: '#1E90FF'},
    animationDuration: {type: 'number', default: 2000},
    showRealPositions: {type: 'boolean', default: false},
    rotationEnabled: {type: 'boolean', default: true},
    distanceScale: {type: 'number', default: 0.0009},
    zOffset: {type: 'number', default: 4},
    zDepthScale: {type: 'number', default: 0.3},  // Reduce to 30% of original z-depth
    starData: {
      type: 'array',
      // Real stellar distances and positions (x,y in relative angular position, z in light years)
      default: [
        {
          name: 'Betelgeuse',
          filler: false,
          position: {x: -1.367, y: 1.207, z: 0},
          realPosition: {x: -1.367, y: 1.207, z: -642.5},
          color: '#ff4400',
          size: 0.17,
          info: `Betelgeuse, the celestial ruby of Orion's shoulder, marks the Hunter's right side.

        • Named from Arabic "Yad al-Jauzā'" meaning "Hand of the Giant"
        • Age: 8-14 million years old - a cosmic infant despite its enormous size
        • Mass: 14-19 times the Sun's mass
        • Radius: 640-764 times the Sun's radius - if placed at our Sun's position, would extend beyond Jupiter's orbit
        • Luminosity: 65,000 times brighter than the Sun
        • Fate: Destined to explode as a supernova within ~100,000 years

        Esoteric significance: In ancient Egypt, Betelgeuse was associated with the god Osiris, symbolizing death and rebirth. Its distinctly red color has been linked to the blood of the warrior in many cultures. Medieval astrologers believed it granted fortune and martial honor when well-aspected, but could bring violence and danger when afflicted.`,
        },
        {
          name: 'Rigel',
          filler: false,
          position: {x: 1.197, y: -3.645, z: 0},
          realPosition: {x: 1.197, y: -3.645, z: -860},
          color: '#4477ff',
          size: 0.15,
          info: `Rigel, the commanding blue sentinel at Orion's foot, outshines even Betelgeuse despite being designated Beta Orionis.

        • Named from Arabic "Rijl al-Jabbār" meaning "Foot of the Great One"
        • Age: 8 million years old - extremely young for such a bright star
        • Mass: 21 times the Sun's mass
        • Radius: 74.1 times the Sun's radius
        • Luminosity: 120,000 times brighter than the Sun
        • Part of a multiple star system with at least three stellar companions

        Esoteric significance: Rigel has been associated with the teachings of sacred wisdom in esoteric traditions. Its intense blue light symbolizes divine knowledge and cosmic energy. Babylonians considered Rigel a guardian of winter skies. In naval traditions, Rigel was a critical navigational beacon, guiding ships through the winter seas, and was believed to protect sailors from storms when visible.`,
        },
        {
          name: 'Bellatrix',
          filler: false,
          position: {x: 0.672, y: 0.803, z: 0},
          realPosition: {x: 0.672, y: 0.803, z: -243},
          color: '#bbbbff',
          size: 0.1,
          info: `Bellatrix, the "Female Warrior" star, stands proud at Orion's left shoulder, one of the nearest bright stars in Orion.

        • Name derives from Latin "Bellatrix" meaning "Female Warrior" or "Amazon Star"
        • Age: 25.2 million years old
        • Mass: 7.7 times the Sun's mass
        • Radius: 5.75 times the Sun's radius
        • Luminosity: 9,211 times brighter than the Sun
        • Distance: 243 light-years - one of the closest major stars in Orion

        Esoteric significance: Bellatrix embodies the feminine warrior spirit and was revered by ancient cultures for its connection to female strength. In magical traditions, it was invoked for courage and battlefield victory. Arabic astrologers associated Bellatrix with sudden honor and quick success, but warned these might be followed by reversals if not approached with wisdom. The star represents the balance of aggression and strategy, force and finesse.`,
        },
        {
          name: 'Saiph',
          filler: false,
          position: {x: -1.17, y: -4.138, z: 0},
          realPosition: {x: -1.17, y: -4.138, z: -721},
          color: '#ffffff',
          size: 0.09,
          info: `Saiph, the often-overlooked guardian at Orion's right foot, nearly matches Rigel in stellar properties but appears dimmer from Earth.

        • Named from Arabic "Saif al-Jabbar" meaning "Sword of the Giant" (a historical misnomer)
        • Age: 11.1 million years old
        • Mass: 15.5-21.1 times the Sun's mass
        • Radius: 13-14 times the Sun's radius
        • Luminosity: 60,300 times brighter than the Sun
        • Destined to end its life in a spectacular supernova

        Esoteric significance: In esoteric traditions, Saiph represents hidden power and unrecognized potential. Though less celebrated than its counterparts, it contains equal cosmic energy. The star's name connection to the sword rather than the foot reveals how ancient observers perceived the constellation differently. Some mystical traditions view Saiph as a gateway to the underworld, marking one of the lower entrance points to celestial realms.`,
        },
        {
          name: 'Alnitak',
          filler: false,
          position: {x: -0.466, y: -1.540, z: 0},
          realPosition: {x: -0.466, y: -1.540, z: -817},
          color: '#99aaff',
          size: 0.1,
          info: `Alnitak, the easternmost jewel of Orion's Belt, anchors this famous cosmic alignment and illuminates spectacular nebulae in its vicinity.

        • Named from Arabic "Al-Niṭāq" meaning "The Belt"
        • Age: 6.4 million years old
        • Mass: Primary star - 33 times the Sun's mass
        • Radius: 20 times the Sun's radius
        • Luminosity: 250,000 times brighter than the Sun
        • A triple star system with two confirmed supernova candidates

        Esoteric significance: Alnitak guards the famous Horsehead and Flame Nebulae, serving as a cosmic lighthouse for these stellar nurseries. In mystical cosmology, it represents the first step on the spiritual journey symbolized by Orion's Belt. Alchemical traditions associated Alnitak with the transmutation of elements and the beginning of spiritual transformation. Some cultures viewed the three belt stars as judges of the dead, with Alnitak evaluating earthly accomplishments.`,
        },
        {
          name: 'Alnilam',
          filler: false,
          position: {x: -0.126, y: -1.279, z: 0},
          realPosition: {x: -0.126, y: -1.279, z: -1342},
          color: '#ffffff',
          size: 0.1,
          info: `Alnilam, the brilliant centerpiece of Orion's Belt, shines as Orion's brightest belt star despite being the most distant of the three.

        • Named from Arabic "Al-Niẓām" meaning "String of Pearls"
        • Age: 4.47 million years old - remarkably young
        • Mass: 40 times the Sun's mass
        • Luminosity: 419,600 times brighter than the Sun - among the most luminous stars visible to the naked eye
        • Distance: 1,342 light-years - furthest of the three belt stars

        Esoteric significance: Alnilam represents the center point of consciousness in mystical traditions, balancing between material and spiritual realms. Ancient Egyptian texts associate it with the transformation of the soul. The star's immense distance yet apparent brightness symbolizes how spiritual truths may appear clear despite their profound depth and mystery. In some traditions, Alnilam was considered a gateway to higher dimensions and cosmic knowledge.`,
        },
        {
          name: 'Mintaka',
          filler: false,
          position: {x: 0.121, y: -1.028, z: 0},
          realPosition: {x: 0.121, y: -1.028, z: -916},
          color: '#aaaaff',
          size: 0.1,
          info: `Mintaka, the westernmost sentinel of Orion's Belt, precisely marks the celestial equator, making it a perfect navigational reference point.

        • Named from Arabic "Al-Manṭaqa" meaning "The Belt"
        • Age: Multiple components ranging from 4-7 million years
        • Primary star mass: 17.8 times the Sun's mass
        • Radius: 13.1 times the Sun's radius
        • A complex multiple star system and eclipsing binary

        Esoteric significance: Mintaka's position directly on the celestial equator gives it special significance as a cosmic balancing point between northern and southern skies. In mystical traditions, it represents perfect equilibrium between opposing forces. Some ancient navigators believed Mintaka contained wayfinding magic that could prevent travelers from becoming lost. In esoteric astronomy, the star marks the final step in the spiritual journey represented by the Belt stars.`,
        },
        {
          name: 'Meissa',
          filler: false,
          position: {x: -0.021, y: 1.842, z: 0},
          realPosition: {x: -0.021, y: 1.842, z: -1055},
          color: '#ffffff',
          size: 0.07,
          info: `Meissa, the radiant beacon marking Orion's head, illuminates a spectacular ring of cosmic gas and dust.

        • Name from Arabic "Al-Maisan" meaning "The Shining One" (originally applied to another star)
        • Age: 4.2 million years old
        • Primary star mass: 34 times the Sun's mass
        • Center of the Lambda Orionis Cluster and the spectacular ring nebula Sh2-264

        Esoteric significance: Meissa represents the cosmic mind and divine intelligence in esoteric traditions. The circular nebula surrounding it (the "Head of Orion") symbolizes the halo of enlightenment or crown chakra in mystical interpretations. Ancient cultures saw Meissa as the seat of the heavenly judge or cosmic overseer. Some traditions believed contemplating this star could enhance mental clarity and inspired thinking.`,
        },
        {
          name: 'Pi3 Orionis',
          filler: true,
          position: {x: 2.328, y: 2.157, z: 0},
          realPosition: {x: 2.328, y: 2.157, z: -26},
          color: '#ffffff',
          size: 0.05,
          info: `Pi3 Orionis (Tabit), a nearby sun-like star, serves as an important stellar "standard candle" for astronomical classifications.

        • Named "Tabit" from Arabic "Al-Thabit" meaning "The Endurer" or "The Constant One"
        • Age: 1.04 billion years old - much older than most Orion stars
        • Mass: 1.288 times the Sun's mass
        • Distance: Just 26.32 light-years - one of the closest stars in Orion

        Esoteric significance: As one of the closest stars in Orion to Earth, Tabit has been associated with bringing distant cosmic wisdom into accessible form. Its name "The Endurer" connects it to perseverance and stability. In some esoteric systems, Tabit represents the foundation of knowledge upon which greater understanding is built. The star's role as a spectral standard mirrors its metaphysical significance as a baseline for measuring spiritual growth.`,
        },
        {
          name: 'Pi4 Orionis',
          filler: true,
          position: {x: 2.576, y: 1.100, z: 0},
          realPosition: {x: 2.576, y: 1.100, z: -1050},
          color: '#bbbbff',
          size: 0.07,
          info: `Pi4 Orionis, one of the stars forming Orion's shield, hides its true nature as a spectroscopic binary system.

        • Part of Orion's shield or bow asterism
        • Distance: 1,050 light-years
        • Primary star mass: 10.95 times the Sun's mass

        Esoteric significance: In esoteric traditions, Pi4 Orionis represents hidden duality and the concept that apparent singularities often contain multiple aspects. Its position in Orion's shield connects it to spiritual protection and cosmic guardianship. Some mystical systems associate this star with the veil between worlds and the ability to perceive beyond ordinary reality. Its binary nature symbolizes the eternal cosmic dance between complementary forces.`,
        },
        {
          name: 'Pi5 Orionis',
          filler: true,
          position: {x: 2.439, y: 0.262, z: 0},
          realPosition: {x: 2.439, y: 0.262, z: -1300},
          color: '#bbbbff',
          size: 0.06,
          info: `Pi5 Orionis, another sentinel of Orion's shield, constantly changes shape as its binary components orbit each other.

        • Part of Orion's shield or bow asterism
        • Spectral type: B2 III (blue giant)
        • Distance: 1,300 light-years
        • Primary star mass: 12 times the Sun's mass

        Esoteric significance: Pi5 Orionis embodies the principle of perpetual cosmic change and adaptation. Its ellipsoidal variations symbolize how spiritual entities may appear different depending on one's perspective or timing. In some traditions, the star represents the shield of divine protection that changes form to meet different challenges. The star's binary nature also symbolizes the union of greater and lesser forces working in harmony.`,
        },
        {
          name: 'Chi1 Orionis',
          filler: true,
          position: {x: -2.049, y: 4.266, z: 0},
          realPosition: {x: -2.049, y: 4.266, z: -28},
          color: '#fff4e8',
          size: 0.06,
          info: `Chi1 Orionis, a nearby solar-type star, provides insights into our Sun's possible future and past states.

        • Position: At the top of Orion's club
        • Distance: 28.4 light-years
        • Mass: 1.01 times the Sun's mass
        • Age: 300-400 million years old - much younger than our Sun

        Esoteric significance: Chi1 Orionis represents our cosmic siblings - stars similar to our Sun that remind us we are not alone in the universe. Its position in Orion's upraised club connects it to the power of conscious action and divine intervention. In some traditions, contemplating this star was believed to offer glimpses of our solar system's past and potential futures. Its similarity to our Sun made it a focus for those seeking to understand humanity's place in the cosmic order.`,
        },
        {
          name: 'Chi2 Orionis',
          filler: true,
          position: {x: -2.427, y: 2.882, z: 0},
          realPosition: {x: -2.427, y: 2.882, z: -1300},
          color: '#bbbbff',
          size: 0.06,
          info: `Chi2 Orionis, a massive blue supergiant, pulsates rhythmically while wielding the cosmic club of Orion.

        • Position: Near the top of Orion's club
        • Distance: 4,300 light-years - one of the most distant bright stars in Orion
        • Mass: 42.3 times the Sun's mass
        • Age: 5 million years - extremely young

        Esoteric significance: Chi2 Orionis symbolizes the rhythmic nature of cosmic power and divine intervention. Its position in Orion's club represents the capacity for decisive action from higher realms. The star's massive size but subtle variability reflects how great cosmic forces often operate in subtle pulses rather than constant output. In some traditions, this star was associated with the concept of divine timing - knowing when to act and when to hold back.`,
        },
        {
          name: 'Eta Orionis',
          filler: true,
          position: {x: -0.01, y: -2.357, z: 0},
          realPosition: {x: -0.01, y: -2.357, z: -1000},
          color: '#ffffff',
          size: 0.06,
          info: `Eta Orionis, a complex multiple star system, marks the celestial sword of the cosmic hunter.

        • Traditional Arabic names: "Algjebbah," "Ensis" (Latin for "sword"), and "Saiph"
        • Distance: 1,000 light-years
        • Primary star mass: 11 times the Sun's mass

        Esoteric significance: Eta Orionis embodies the principle of hidden complexity beneath apparent simplicity. Its multiple star nature reminds us that what appears as a single point of light may contain intricate systems. In warrior traditions, it was associated with the cosmic sword of discernment that cuts through illusion. The star's regular eclipses symbolize the rhythmic alternation between revelation and concealment in the quest for spiritual knowledge.`,
        },
        {
          name: 'Theta1 Orionis',
          filler: true,
          position: {x: -0.055, y: -2.783, z: 0},
          realPosition: {x: -0.055, y: -2.783, z: -1344},
          color: '#ffffff',
          size: 0.06,
          info: `Theta1 Orionis, the famous Trapezium Cluster, illuminates the heart of the Great Orion Nebula with its young, massive stars.

        • Central star cluster of the Orion Nebula (M42)
        • Distance: 1,344 light-years
        • Age: Only about 1 million years old
        • Contains multiple massive O and B-type stars
        • Primary star mass: 33 times the Sun's mass
        • Illuminates and shapes the surrounding nebula through stellar winds and radiation

        Esoteric significance: The Trapezium represents the creative center where cosmic forces manifest new stars and potentially planetary systems. In mystical traditions, it symbolizes the divine generative principle and the birthplace of souls. Some ancient cultures viewed this misty region as a gateway between the physical and spiritual realms. The four main stars arranged in a trapezoid pattern have been associated with the four classical elements or fundamental forces that structure reality.`,
        },
      ],
    },
  },

  init() {
    // Create separate containers for rotating and static elements
    this.rotatingContainer = document.createElement('a-entity')
    this.el.appendChild(this.rotatingContainer)

    // Create a static container for UI elements that shouldn't rotate
    this.staticContainer = document.createElement('a-entity')
    this.el.appendChild(this.staticContainer)

    this.stars = []
    this.connections = []

    this.createGridWalls()
    this.createConnections()
    this.createStars()
    this.setupInteractions()
    this.createViewToggle()

    // Add rotation component to rotating container only
    this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
    this.rotatingContainer.setAttribute('class', '.cantap')

    this.el.sceneEl.addEventListener('renderstart', () => {
      this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 16)
    })
  },

  createGridWalls() {
    const positions = ['left', 'right', 'top', 'bottom']

    positions.forEach((position) => {
      const wall = document.createElement('a-entity')
      wall.setAttribute('grid-wall', {
        position,
        width: this.data.gridWidth,  // Use wallWidth for X dimension
        height: this.data.gridHeight,  // Use wallHeight for Y dimension
        gridSize: this.data.gridSize,
        color: this.data.gridColor,
      })
      // Add to staticContainer instead of rotatingContainer
      this.staticContainer.appendChild(wall)
    })
  },

  createStars() {
    this.data.starData.forEach((star) => {
      const starEntity = document.createElement('a-entity')

      // Create main star sphere (visible part)
      const starCore = document.createElement('a-sphere')
      starCore.setAttribute('radius', star.size)
      starCore.setAttribute('id', star.name)
      starCore.setAttribute('material', {
        color: star.color,
        metalness: 0.3,
        roughness: 0.7,
      })
      // starCore.setAttribute('data-bloom', 'bloom')
      starEntity.appendChild(starCore)

      // Create text container for billboard effect
      const textContainer = document.createElement('a-entity')
      textContainer.setAttribute('id', 'TextContainer')
      textContainer.setAttribute('billboard', '')
      // Create enhanced text label with larger size
      const label = document.createElement('a-text')
      label.setAttribute('value', star.name)
      label.setAttribute('align', 'center')
      label.setAttribute('position', `0 ${star.size + 0.2} 0.02`)
      label.setAttribute('scale', '1.5 1.5 1.5')  // Larger text
      label.setAttribute('color', '#ffffff')
      label.setAttribute('width', '3')  // Adjusted width to match background
      label.setAttribute('font', 'exo2bold')
      textContainer.appendChild(label)

      starEntity.appendChild(textContainer)

      // NEW: Create larger invisible collision sphere for easier selection
      const collisionSphere = document.createElement('a-sphere')
      // Make collision sphere 3x larger than the visible star, but minimum size of 0.3
      const collisionRadius = Math.max(star.size * 3, 0.3)
      collisionSphere.setAttribute('radius', collisionRadius)
      collisionSphere.setAttribute('class', 'cantap')
      collisionSphere.setAttribute('material', {
        color: star.color,
        opacity: 0.0,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      })
      starEntity.appendChild(collisionSphere)

      // Set position and data attributes
      starEntity.setAttribute('position', star.position)
      starEntity.dataset.name = star.name
      starEntity.dataset.realX = star.realPosition.x
      starEntity.dataset.realY = star.realPosition.y
      starEntity.dataset.realZ = star.realPosition.z
      starEntity.dataset.info = star.info

      this.rotatingContainer.appendChild(starEntity)
      this.stars.push(starEntity)
    })
  },

  createConnections() {
    const connections = [
      [4, 5], [5, 6],  // Belt
      [0, 4], [4, 3],  // Left body
      [2, 6], [6, 1],  // Right Body
      [7, 0], [7, 2],  // Meissa's connections to Betelgeuse and Bellatrix
      [7, 9], [8, 9], [9, 10],  // bow connection
      [0, 12], [11, 12],  // betelgeuse to club connection
      [5, 13], [13, 14],  // belt to sword connection
    ]

    connections.forEach(([startIdx, endIdx]) => {
      const start = this.data.starData[startIdx].position
      const end = this.data.starData[endIdx].position

      const line = document.createElement('a-entity')
      line.setAttribute('id', 'connecting line')
      line.setAttribute('line', {
        start,
        end,
        color: '#4444ff',
        opacity: 0.8,
      })

      this.rotatingContainer.appendChild(line)
      this.connections.push(line)
    })
  },

  updateConnections() {
    const connections = [
      [4, 5], [5, 6],  // Belt
      [0, 4], [4, 3],  // Left body
      [2, 6], [6, 1],  // Right Body
      [7, 0], [7, 2],  // Meissa's connections to Betelgeuse and Bellatrix
      [2, 9], [8, 9], [9, 10],  // bow connection
      [0, 12], [11, 12],  // betelgeuse to club connection
      [5, 13], [13, 14],  // belt to sword connection
    ]

    connections.forEach((pair, index) => {
      const startStar = this.stars[pair[0]]
      const endStar = this.stars[pair[1]]
      const line = this.connections[index]

      if (startStar && endStar) {
        const startPos = startStar.getAttribute('position')
        const endPos = endStar.getAttribute('position')

        // Update line positions
        line.setAttribute('line', {
          start: {
            x: startPos.x,
            y: startPos.y,
            z: startPos.z,
          },
          end: {
            x: endPos.x,
            y: endPos.y,
            z: endPos.z,
          },
          color: '#ffffff',
          opacity: 0.8,
        })
      }
    })
  },

  setupInteractions() {
    this.stars.forEach((starEntity) => {
    // Find the collision sphere within the star entity
      const collisionSphere = starEntity.querySelector('a-sphere.cantap')
      const starCore = starEntity.querySelector('a-sphere:not(.cantap)')

      if (collisionSphere) {
        collisionSphere.addEventListener('click', () => {
          if (!this.isAnimating) {
          // Show visual feedback on star selection
            this.pulseStarOnSelect(starCore, collisionSphere)
          }
        })
      }
    })

    // Initialize raycaster state
    this.currentlyIntersected = null
  },

  // Updated pulseStarOnSelect method for constellation-components.js
  pulseStarOnSelect(starCore, collisionSphere) {
  // First, ensure any previous animations are cleared
    starCore.removeAttribute('animation__pulse')
    collisionSphere.removeAttribute('animation__fade')

    // Reset collision sphere opacity to ensure we start fresh
    collisionSphere.setAttribute('material', {
      color: starCore.getAttribute('material').color,
      opacity: 0.0,
      transparent: true,
    })

    // Pulse animation for the star
    starCore.setAttribute('animation__pulse', {
      property: 'scale',
      from: '1 1 1',
      to: '1.3 1.3 1.3',
      dur: 500,
      easing: 'easeOutElastic',
      loop: 1,
      dir: 'alternate',
    })

    // Make collision sphere visible with color
    const starColor = starCore.getAttribute('material').color
    collisionSphere.setAttribute('material', {
      color: starColor,
      opacity: 0.2,  // Slightly visible
      transparent: true,
    })

    // Animate collision sphere opacity with callback
    collisionSphere.setAttribute('animation__fade', {
      property: 'material.opacity',
      from: 0.2,
      to: 0.0,
      dur: 500,
      easing: 'easeOutQuad',
    })

    // Ensure opacity is reset to 0 when animation completes or is interrupted
    const resetOpacity = () => {
      collisionSphere.setAttribute('material', 'opacity', 0.0)
    }

    // Add event listener for animation completion
    collisionSphere.addEventListener('animationcomplete__fade', resetOpacity, {once: true})

    // Also set a backup timeout in case the animation event doesn't fire properly
    setTimeout(resetOpacity, 600)  // Slightly longer than animation duration
  },

  // Add a helper method to show selection state
  showSelectionState() {
  // Get the position of the camera
    const camera = document.querySelector('a-camera')
    if (!camera) return

    const cameraPosition = camera.getAttribute('position')

    // For each star, calculate distance to camera
    this.stars.forEach((star) => {
      const starPosition = star.getAttribute('position')
      const dx = cameraPosition.x - starPosition.x
      const dy = cameraPosition.y - starPosition.y
      const dz = cameraPosition.z - starPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // Adjust collision sphere size based on distance
      const collisionSphere = star.querySelector('a-sphere.cantap')
      if (collisionSphere) {
        const starCore = star.querySelector('a-sphere:not(.cantap)')
        const baseSize = parseFloat(starCore.getAttribute('radius')) * 3
        // Further stars get larger collision areas
        const scaleFactor = Math.min(distance / 10, 2)
        const newRadius = baseSize * scaleFactor
        collisionSphere.setAttribute('radius', newRadius)
      }
    })
  },

  createViewToggle() {
    const toggleButton = document.createElement('a-entity')
    toggleButton.setAttribute('geometry', {
      primitive: 'plane',
      width: 1.2,
      height: 0.5,
    })
    toggleButton.setAttribute('material', {
      color: '#2196F3',
      opacity: 0.9,
    })

    // Position the button at the bottom front of the frame
    toggleButton.setAttribute('position', '0 -4 2.9')

    toggleButton.setAttribute('text', {
      value: '3D View',
      align: 'center',
      color: 'white',
      width: 4,
    })
    toggleButton.classList.add('cantap', 'clickable')

    toggleButton.addEventListener('click', () => {
      this.data.showRealPositions = !this.data.showRealPositions
      toggleButton.setAttribute('text', 'value', this.data.showRealPositions ? '2D View' : '3D View')

      // Force a clean transition
      this.stars.forEach((star) => {
        star.removeAttribute('animation')
      })

      this.updatePositions()
    })

    // Add to static container instead of rotating container
    this.staticContainer.appendChild(toggleButton)
    this.toggleButton = toggleButton
  },

  updatePositions() {
    // Find the range of z values for scaling
    let minZ = Infinity
    let maxZ = -Infinity
    this.stars.forEach((star) => {
      const z = parseFloat(star.dataset.realZ)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    })
    const zRange = maxZ - minZ
    const gridRangeX = this.data.gridWidth  // Total range from -3 to 3 in X
    const gridRangeY = this.data.gridHeight  // Total range from -6 to 6 in Y
    const gridRange = 6

    const zScale = gridRange / zRange  // Scale factor to fit z values within grid

    const positionUpdates = []

    this.stars.forEach((star) => {
      let position
      if (this.data.showRealPositions) {
        const realZ = parseFloat(star.dataset.realZ)
        // Scale and center the z position within -3 to 3 range
        const scaledZ = ((realZ - minZ) * zScale - (gridRange / 2)) * -1 * this.data.zDepthScale  // Invert z for proper depth

        position = {
          x: parseFloat(star.dataset.realX) * (gridRangeX / 6),
          y: parseFloat(star.dataset.realY) * (gridRangeY / 10),
          z: scaledZ,
        }
      } else {
        position = {
          x: parseFloat(star.dataset.realX) * (gridRangeX / 6),
          y: parseFloat(star.dataset.realY) * (gridRangeY / 10),
          z: 0,
        }
      }

      positionUpdates.push({
        star,
        position,
      })
    })

    // Apply animations
    positionUpdates.forEach((update) => {
      update.star.setAttribute('animation', {
        property: 'position',
        to: update.position,
        dur: this.data.animationDuration,
        easing: 'easeInOutQuad',
      })
    })

    // Update connections during animation
    const startTime = performance.now()
    const updateDuringAnimation = () => {
      const currentTime = performance.now()
      const elapsed = currentTime - startTime

      if (elapsed < this.data.animationDuration) {
        this.updateConnections()
        requestAnimationFrame(updateDuringAnimation)
      } else {
        this.updateConnections()
      }
    }

    updateDuringAnimation()
  },

  findCentralStar() {
    let avgX = 0
    let avgY = 0
    let avgZ = 0

    this.stars.forEach((star) => {
      avgX += parseFloat(star.dataset.realX)
      avgY += parseFloat(star.dataset.realY)
      avgZ += parseFloat(star.dataset.realZ)
    })
    avgX /= this.stars.length
    avgY /= this.stars.length
    avgZ /= this.stars.length

    let closestStar = this.stars[0]
    let minDistance = Infinity

    this.stars.forEach((star) => {
      const realX = parseFloat(star.dataset.realX)
      const realY = parseFloat(star.dataset.realY)
      const realZ = parseFloat(star.dataset.realZ)

      const distance = Math.sqrt(
        Math.pow(realX - avgX, 2) +
        Math.pow(realY - avgY, 2) +
        Math.pow(realZ - avgZ, 2)
      )
      if (distance < minDistance) {
        minDistance = distance
        closestStar = star
      }
    })

    return closestStar
  },

  tick(time, delta) {
    if (this.connections.length > 0) {
      this.updateConnections()
    }

    // Update collision spheres based on camera distance (less frequently)
    if (time % 500 < 20) {  // Only run occasionally to save performance
      this.showSelectionState()
    }
  },

}

// const gridWallComponent = {
//   schema: {
//     position: {type: 'string'},  // left, right, top, bottom
//     width: {type: 'number', default: 6},
//     height: {type: 'number', default: 6},  // Now supports square frames
//     gridSize: {type: 'number', default: 1},
//     color: {type: 'color', default: '#1E90FF'},
//     borderWidth: {type: 'number', default: 0.02},
//     depth: {type: 'number', default: -3},  // Z position for all walls
//   },

//   init() {
//     this.createGridWall()
//   },

//   createGridWall() {
//     const {position, width, height, gridSize, color, borderWidth, depth} = this.data
//     const wall = document.createElement('a-entity')

//     // Configure wall position and rotation based on position
//     const wallConfig = this.getWallConfig(position, width, height, depth)

//     wall.setAttribute('id', position)
//     wall.setAttribute('position', wallConfig.position)
//     wall.setAttribute('rotation', wallConfig.rotation)

//     // Create grid lines based on wall dimensions
//     this.createGridLines(wall, wallConfig, gridSize, color, borderWidth)

//     this.el.appendChild(wall)
//   },

//   getWallConfig(position, width, height, depth) {
//     switch (position) {
//       case 'left':
//         return {
//           position: {x: -width / 2, y: 0, z: depth},
//           rotation: {x: 0, y: 90, z: 0},
//           gridWidth: height,  // When rotated, height becomes the visual width
//           gridHeight: width,  // When rotated, width becomes the visual height
//         }
//       case 'right':
//         return {
//           position: {x: width / 2, y: 0, z: depth},
//           rotation: {x: 0, y: -90, z: 0},
//           gridWidth: height,
//           gridHeight: width,
//         }
//       case 'top':
//         return {
//           position: {x: 0, y: height / 2, z: depth},
//           rotation: {x: -90, y: 0, z: 0},
//           gridWidth: width,
//           gridHeight: height,
//         }
//       case 'bottom':
//         return {
//           position: {x: 0, y: -height / 2, z: depth},
//           rotation: {x: 90, y: 0, z: 0},
//           gridWidth: width,
//           gridHeight: height,
//         }
//       default:
//         return {
//           position: {x: 0, y: 0, z: depth},
//           rotation: {x: 0, y: 0, z: 0},
//           gridWidth: width,
//           gridHeight: height,
//         }
//     }
//   },

//   createGridLines(wall, config, gridSize, color, borderWidth) {
//     const {gridWidth, gridHeight} = config

//     // Calculate number of lines needed
//     const verticalLines = Math.floor(gridWidth / gridSize) + 1
//     const horizontalLines = Math.floor(gridHeight / gridSize) + 1

//     // Create vertical lines
//     for (let i = 0; i < verticalLines; i++) {
//       const line = document.createElement('a-entity')
//       line.setAttribute('id', `${i}-vertical`)

//       line.setAttribute('geometry', {
//         primitive: 'box',
//         width: borderWidth,
//         height: gridHeight,
//         depth: borderWidth,
//       })

//       line.setAttribute('material', {
//         color,
//         opacity: 0.6,
//         transparent: true,
//       })

//       // Position line along the width
//       const xPos = (i * gridSize) - (gridWidth / 2)
//       line.setAttribute('position', `${xPos} 0 0`)

//       wall.appendChild(line)
//     }

//     // Create horizontal lines
//     for (let i = 0; i < horizontalLines; i++) {
//       const line = document.createElement('a-entity')
//       line.setAttribute('id', `${i}-horizontal`)

//       line.setAttribute('geometry', {
//         primitive: 'box',
//         width: gridWidth,
//         height: borderWidth,
//         depth: borderWidth,
//       })

//       line.setAttribute('material', {
//         color,
//         opacity: 0.6,
//         transparent: true,
//       })

//       // Position line along the height
//       const yPos = (i * gridSize) - (gridHeight / 2)
//       line.setAttribute('position', `0 ${yPos} 0`)

//       wall.appendChild(line)
//     }
//   },
// }

export {
  constellationControllerComponent
}
