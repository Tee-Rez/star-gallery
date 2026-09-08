// constellation-loader.js
const constellationLoaderComponent = {
  schema: {
    constellationFile: {type: 'string', default: 'orion'},
    rotationEnabled: {type: 'boolean', default: true},
    showRealPositions: {type: 'boolean', default: false},
    animationDuration: {type: 'number', default: 2000},
  },

  init() {
    console.log('Constellation loader init started...')

    // One build serves every constellation: ?c=<id> (or ?constellation=<id>) selects which.
    // Unknown ids fall through to the markup default rather than failing to load.
    try {
      const requested = new URLSearchParams(window.location.search).get('c') ||
        new URLSearchParams(window.location.search).get('constellation')
      if (requested && this.getEmbeddedConstellationData(requested)) {
        console.log('Constellation requested via URL:', requested)
        this.data.constellationFile = requested
      } else if (requested) {
        console.warn('Unknown constellation requested:', requested)
      }
    } catch (e) {
      console.warn('Could not read constellation from URL:', e)
    }

    // Wait for A-Frame and 8th Wall to be fully ready
    if (this.el.sceneEl.hasLoaded) {
      this.initConstellation()
    } else {
      this.el.sceneEl.addEventListener('loaded', () => {
        this.initConstellation()
      })
    }
  },

  async initConstellation() {
    console.log('Starting constellation initialization...')

    try {
      // Load constellation data (now embedded)
      await this.loadConstellationData()
      console.log('Constellation data loaded successfully')

      // Create separate containers for rotating and static elements
      this.rotatingContainer = document.createElement('a-entity')
      this.el.appendChild(this.rotatingContainer)

      this.staticContainer = document.createElement('a-entity')
      this.el.appendChild(this.staticContainer)

      this.stars = []
      this.connections = []
      this.deepSkyMarkers = []
      this.isAnimating = false
      this.restoringFigure = false

      console.log('Starting constellation creation...')

      // Create all constellation elements with delays to prevent blocking
      await this.createPortalAsync()
      console.log('Portal created')

      await this.createGridWallsAsync()
      console.log('Grid walls created')

      await this.createStarsAsync()
      console.log('Stars created:', this.stars.length)

      await this.createConnectionsAsync()
      console.log('Connections created:', this.connections.length)

      this.createDeepSkyMarkers()

      this.setupInteractions()
      console.log('Interactions setup')

      this.createViewToggle()
      console.log('View toggle created')

      // Add rotation component to rotating container only
      this.rotatingContainer.setAttribute('xrextras-one-finger-rotate', '')
      this.rotatingContainer.setAttribute('class', '.cantap')

      // Setup tick function
      this.el.sceneEl.addEventListener('renderstart', () => {
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 16)
      })
      console.log('Tick function setup complete')

      console.log('Constellation loader initialization complete!')

      // Signal that we're ready
      this.el.emit('constellation-ready')
    } catch (error) {
      console.error('Error in constellation loader init:', error)
      // Try to continue with fallback data
      this.loadFallbackData()
      console.log('Loaded fallback data, continuing...')
    }
  },

  async createPortalAsync() {
    return new Promise((resolve) => {
      this.createPortal()
      setTimeout(resolve, 10)  // Small delay to prevent blocking
    })
  },

  async createGridWallsAsync() {
    return new Promise((resolve) => {
      this.createGridWalls()
      setTimeout(resolve, 10)
    })
  },

  async createStarsAsync() {
    return new Promise((resolve) => {
      this.createStars()
      setTimeout(resolve, 50)  // Longer delay after creating many stars
    })
  },

  async createConnectionsAsync() {
    return new Promise((resolve) => {
      this.createConnections()
      setTimeout(resolve, 10)
    })
  },

  async loadConstellationData() {
    console.log('Loading constellation data for:', this.data.constellationFile)

    try {
      // Use embedded constellation data for 8th Wall compatibility
      const constellationData = this.getEmbeddedConstellationData(this.data.constellationFile)

      if (constellationData) {
        this.constellationData = constellationData
        console.log(`✅ Loaded embedded constellation data for: ${this.constellationData.metadata.name}`)
        console.log('Stars count:', this.constellationData.stars.length)
        console.log('Connections count:', this.constellationData.connections.length)

        this.applyConstellationSettings()
        console.log('Settings applied successfully')

        // Pitches are relative to THIS constellation's nu_max span, so the range is recomputed
        // on every load; any tone still sounding belongs to the previous figure.
        const sceneEl = this.el.sceneEl
        const audio = sceneEl && sceneEl.components['star-audio']
        if (audio) {
          audio.stopAll()
          audio.computeRange(this.constellationData.stars)
        }

        return true
      } else {
        throw new Error(`No embedded data found for constellation: ${this.data.constellationFile}`)
      }
    } catch (error) {
      console.error('❌ Error loading constellation data:', error)
      // Fallback to hardcoded data if constellation not found
      this.loadFallbackData()
      return false
    }
  },

  getEmbeddedConstellationData(constellationName) {
    const constellations = {
      'orion': {
        "metadata": {
          "name": "Orion",
          "displayName": "Orion the Hunter",
          "description": "Orion constellation is one of the brightest and best-known constellations in the night sky. It lies on the celestial equator and dominates the evening sky from November to February.",
          "mythology": "In Greek mythology, it is associated with the hunter Orion, a legendary figure with exceptional skill and strength.",
          "season": "winter",
          "hemisphere": "both",
          "abbreviation": "Ori"
        },
        "portal": {
          "width": 6,
          "height": 9,
          "borderColor": "#00ff00",
          "doorHeight": 7,
          "doorDuration": 4000,
          "lineDrawDuration": 1000,
          "lineDelay": 100,
          "position": {
            "x": 0,
            "y": 0,
            "z": 0.1
          }
        },
        "display": {
          "gridWidth": 6,
          "gridHeight": 9,
          "gridSize": 0.5,
          "gridColor": "#00ff00",
          "distanceScale": 0.0009,
          "zDepthScale": 0.7,
          "scale": {
            "x": 0.5,
            "y": 0.5,
            "z": 0.5
          },
          "position": {
            "x": 0,
            "y": 0,
            "z": -1.5
          }
        },
        "gridBox": {
          "width": 6,
          "height": 9,
          "depth": 6,
          "cellSize": 0.5,
          "color": "#00ff00",
          "opacity": 0.6,
          "wallZ": -1.6
        },
        "stars": [
          {
            "id": "betelgeuse",
            "name": "Betelgeuse",
            "designation": "α Orionis",
            "isMajor": true,
            "position2D": {
              "x": -1.442,
              "y": 0.979
            },
            "distance": 642.5,
            "magnitude": 0.5,
            "spectralClass": "M1-M2 Ia-ab",
            "color": "#ff4400",
            "size": 0.17,
            "stellarType": "red_supergiant",
            "physics": {
              "massSolar": 16.5,
              "radiusSolar": 700,
              "tempKelvin": 3700,
              "note": "Ranges 14-19 M, 640-764 R, 3600-3800 K; midpoints"
            },
            "info": {
              "basic": "Betelgeuse, the celestial ruby of Orion's shoulder, marks the Hunter's right side.",
              "scientific": {
                "age": "8-14 million years old",
                "mass": "14-19 times the Sun's mass",
                "radius": "640-764 times the Sun's radius - if placed at our Sun's position, would extend beyond Jupiter's orbit",
                "luminosity": "65,000 times brighter than the Sun",
                "temperature": "3,600-3,800 K",
                "fate": "Destined to explode as a supernova within ~100,000 years"
              }
            }
          },
          {
            "id": "rigel",
            "name": "Rigel",
            "designation": "β Orionis",
            "isMajor": true,
            "position2D": {
              "x": 0.883,
              "y": -2.633
            },
            "distance": 860,
            "magnitude": 0.13,
            "spectralClass": "B8 Ia",
            "color": "#4477ff",
            "size": 0.15,
            "stellarType": "blue_supergiant",
            "physics": {
              "massSolar": 21,
              "radiusSolar": 74.1,
              "tempKelvin": 12100
            },
            "info": {
              "basic": "Rigel, the commanding blue sentinel at Orion's foot, outshines even Betelgeuse despite being designated Beta Orionis.",
              "scientific": {
                "age": "8 million years old - extremely young for such a bright star",
                "mass": "21 times the Sun's mass",
                "radius": "74.1 times the Sun's radius",
                "luminosity": "120,000 times brighter than the Sun",
                "temperature": "12,100 K",
                "composition": "Part of a multiple star system with at least three stellar companions"
              }
            }
          },
          {
            "id": "bellatrix",
            "name": "Bellatrix",
            "designation": "γ Orionis",
            "isMajor": true,
            "position2D": {
              "x": 0.268,
              "y": 0.727
            },
            "distance": 243,
            "magnitude": 1.64,
            "spectralClass": "B2 III",
            "color": "#bbbbff",
            "size": 0.1,
            "stellarType": "blue_giant",
            "physics": {
              "massSolar": 7.7,
              "radiusSolar": 5.75,
              "tempKelvin": 21800
            },
            "info": {
              "basic": "Bellatrix, the 'Female Warrior' star, stands proud at Orion's left shoulder, one of the nearest bright stars in Orion.",
              "scientific": {
                "age": "25.2 million years old",
                "mass": "7.7 times the Sun's mass",
                "radius": "5.75 times the Sun's radius",
                "luminosity": "9,211 times brighter than the Sun",
                "temperature": "21,800 K",
                "distance": "243 light-years - one of the closest major stars in Orion"
              }
            }
          },
          {
            "id": "saiph",
            "name": "Saiph",
            "designation": "κ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -1.035,
              "y": -2.986
            },
            "distance": 721,
            "magnitude": 2.09,
            "spectralClass": "B0.5 Ia",
            "color": "#ffffff",
            "size": 0.09,
            "stellarType": "blue_supergiant",
            "physics": {
              "massSolar": 18.3,
              "radiusSolar": 13.5,
              "tempKelvin": 25700,
              "note": "Ranges 15.5-21.1 M, 13-14 R; midpoints"
            },
            "info": {
              "basic": "Saiph, the often-overlooked guardian at Orion's right foot, nearly matches Rigel in stellar properties but appears dimmer from Earth.",
              "scientific": {
                "age": "11.1 million years old",
                "mass": "15.5-21.1 times the Sun's mass",
                "radius": "13-14 times the Sun's radius",
                "luminosity": "60,300 times brighter than the Sun",
                "temperature": "25,700 K",
                "fate": "Destined to end its life in a spectacular supernova"
              }
            }
          },
          {
            "id": "alnitak",
            "name": "Alnitak",
            "designation": "ζ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.625,
              "y": -1.17
            },
            "distance": 817,
            "magnitude": 1.77,
            "spectralClass": "O9.5 Ib",
            "color": "#99aaff",
            "size": 0.1,
            "stellarType": "blue_supergiant",
            "physics": {
              "massSolar": 33,
              "radiusSolar": 20,
              "tempKelvin": 29500,
              "note": "Primary"
            },
            "info": {
              "basic": "Alnitak, the easternmost jewel of Orion's Belt, anchors this famous cosmic alignment and illuminates spectacular nebulae in its vicinity.",
              "scientific": {
                "age": "6.4 million years old",
                "mass": "Primary star - 33 times the Sun's mass",
                "radius": "20 times the Sun's radius",
                "luminosity": "250,000 times brighter than the Sun",
                "temperature": "29,500 K",
                "composition": "A triple star system with two confirmed supernova candidates"
              }
            }
          },
          {
            "id": "alnilam",
            "name": "Alnilam",
            "designation": "ε Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.364,
              "y": -0.999
            },
            "distance": 1342,
            "magnitude": 1.69,
            "spectralClass": "B0 Ia",
            "color": "#ffffff",
            "size": 0.1,
            "stellarType": "blue_supergiant",
            "physics": {
              "massSolar": 40,
              "radiusSolar": 30.62,
              "tempKelvin": 26540
            },
            "info": {
              "basic": "Alnilam, the brilliant centerpiece of Orion's Belt, shines as Orion's brightest belt star despite being the most distant of the three.",
              "scientific": {
                "age": "4.47 million years old - remarkably young",
                "mass": "40 times the Sun's mass",
                "radius": "30.62 times the Sun's radius",
                "luminosity": "419,600 times brighter than the Sun - among the most luminous stars visible to the naked eye",
                "temperature": "26,540 K",
                "distance": "1,342 light-years - furthest of the three belt stars"
              }
            }
          },
          {
            "id": "mintaka",
            "name": "Mintaka",
            "designation": "δ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.123,
              "y": -0.792
            },
            "distance": 916,
            "magnitude": 2.23,
            "spectralClass": "O9.5 II",
            "color": "#aaaaff",
            "size": 0.1,
            "stellarType": "blue_bright_giant",
            "physics": {
              "massSolar": 17.8,
              "radiusSolar": 13.1,
              "tempKelvin": 31400,
              "note": "Aa1, the eclipsing primary"
            },
            "info": {
              "basic": "Mintaka, the westernmost sentinel of Orion's Belt, precisely marks the celestial equator, making it a perfect navigational reference point.",
              "scientific": {
                "age": "Multiple components ranging from 4-7 million years",
                "mass": "Primary star mass: 17.8 times the Sun's mass",
                "radius": "13.1 times the Sun's radius",
                "luminosity": "190,000 times the Sun's luminosity",
                "composition": "A complex multiple star system and eclipsing binary",
                "position": "Located directly on the celestial equator"
              }
            }
          },
          {
            "id": "meissa",
            "name": "Meissa",
            "designation": "λ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.299,
              "y": 1.551
            },
            "distance": 1055,
            "magnitude": 3.7,
            "spectralClass": "O8 III",
            "color": "#ffffff",
            "size": 0.07,
            "stellarType": "blue_giant",
            "physics": {
              "massSolar": 34,
              "radiusSolar": 13.4,
              "tempKelvin": 35000,
              "note": "Primary"
            },
            "info": {
              "basic": "Meissa, the radiant beacon marking Orion's head, illuminates a spectacular ring of cosmic gas and dust.",
              "scientific": {
                "age": "4.2 million years old",
                "mass": "Primary star mass: 34 times the Sun's mass",
                "radius": "13.4 times the Sun's radius",
                "luminosity": "200,000 times the Sun's luminosity",
                "temperature": "35,000 K",
                "feature": "Center of the Lambda Orionis Cluster and the spectacular ring nebula Sh2-264"
              }
            }
          },
          {
            "id": "pi3_orionis",
            "name": "Pi3 Orionis",
            "designation": "π³ Orionis (Tabit)",
            "isMajor": true,
            "position2D": {
              "x": 2.293,
              "y": 0.891
            },
            "distance": 26,
            "magnitude": 3.65,
            "spectralClass": "F6 V",
            "color": "#ffffff",
            "size": 0.05,
            "stellarType": "yellow_white_main_sequence",
            "physics": {
              "massSolar": 1.288,
              "radiusSolar": 1.317,
              "tempKelvin": 6518
            },
            "info": {
              "basic": "Pi3 Orionis (Tabit), a nearby sun-like star, serves as an important stellar 'standard candle' for astronomical classifications.",
              "scientific": {
                "age": "1.04 billion years old - much older than most Orion stars",
                "mass": "1.288 times the Sun's mass",
                "radius": "1.317 times the Sun's radius",
                "luminosity": "2.816 times the Sun's luminosity",
                "temperature": "6,518 K",
                "distance": "Just 26.32 light-years - one of the closest stars in Orion"
              }
            }
          },
          {
            "id": "pi4_orionis",
            "name": "Pi4 Orionis",
            "designation": "π⁴ Orionis",
            "isMajor": true,
            "position2D": {
              "x": 2.216,
              "y": 0.575
            },
            "distance": 1050,
            "magnitude": 3.685,
            "spectralClass": "B2 III",
            "color": "#bbbbff",
            "size": 0.07,
            "stellarType": "blue_giant",
            "physics": {
              "massSolar": 10.95,
              "radiusSolar": 9.1,
              "tempKelvin": 21874,
              "note": "Primary"
            },
            "info": {
              "basic": "Pi4 Orionis, one of the stars forming Orion's shield, hides its true nature as a spectroscopic binary system.",
              "scientific": {
                "age": "15.4 million years",
                "mass": "Primary star: 10.95 times the Sun's mass",
                "radius": "9.1 times the Sun's radius",
                "luminosity": "19,726 times the Sun's luminosity",
                "temperature": "21,874 K",
                "composition": "Spectroscopic binary system with orbital period of 9.5 days"
              }
            }
          },
          {
            "id": "pi5_orionis",
            "name": "Pi5 Orionis",
            "designation": "π⁵ Orionis",
            "isMajor": true,
            "position2D": {
              "x": 2.045,
              "y": -0.159
            },
            "distance": 1300,
            "magnitude": 3.69,
            "spectralClass": "B2 III",
            "color": "#bbbbff",
            "size": 0.06,
            "stellarType": "blue_giant",
            "physics": {
              "massSolar": 12,
              "radiusSolar": 12,
              "tempKelvin": 14496
            },
            "info": {
              "basic": "Pi5 Orionis, another sentinel of Orion's shield, constantly changes shape as its binary components orbit each other.",
              "scientific": {
                "age": "Multiple components with varying ages",
                "mass": "Primary: 12 times the Sun's mass, Secondary: 5 times the Sun's mass",
                "luminosity": "Primary: 11,262 times the Sun, Secondary: 525-741 times the Sun",
                "composition": "Spectroscopic binary with 3.7-day orbital period",
                "variability": "Ellipsoidal variable star - brightness varies by 0.05 magnitudes"
              }
            }
          },
          {
            "id": "chi1_orionis",
            "name": "Chi1 Orionis",
            "designation": "χ¹ Orionis",
            "isMajor": false,
            "position2D": {
              "x": -1.378,
              "y": 4.05
            },
            "distance": 28,
            "magnitude": 4.38,
            "spectralClass": "G0 V",
            "color": "#fff4e8",
            "size": 0.06,
            "stellarType": "yellow_main_sequence",
            "physics": {
              "massSolar": 1.01,
              "radiusSolar": 0.983,
              "tempKelvin": 5883
            },
            "info": {
              "basic": "Chi1 Orionis, a nearby solar-type star, provides insights into our Sun's possible future and past states.",
              "scientific": {
                "age": "300-400 million years old - much younger than our Sun",
                "mass": "1.01 times the Sun's mass",
                "radius": "0.983 times the Sun's radius",
                "luminosity": "1.042 times the Sun's luminosity",
                "temperature": "5,883 K",
                "composition": "RS Canum Venaticorum variable in binary system"
              }
            }
          },
          {
            "id": "chi2_orionis",
            "name": "Chi2 Orionis",
            "designation": "χ² Orionis",
            "isMajor": false,
            "position2D": {
              "x": -1.921,
              "y": 4.04
            },
            "distance": 1300,
            "magnitude": 4.63,
            "spectralClass": "B2 Ia",
            "color": "#bbbbff",
            "size": 0.06,
            "stellarType": "blue_supergiant",
            "physics": {
              "massSolar": 42.3,
              "radiusSolar": 61.9,
              "tempKelvin": 19000
            },
            "info": {
              "basic": "Chi2 Orionis, a massive blue supergiant, pulsates rhythmically while wielding the cosmic club of Orion.",
              "scientific": {
                "age": "5 million years - extremely young",
                "mass": "42.3 times the Sun's mass",
                "luminosity": "446,000 times the Sun's luminosity",
                "temperature": "19,000 K",
                "variability": "Alpha Cygni variable with 2.8-day period"
              }
            }
          },
          {
            "id": "c_orionis",
            "name": "42 Orionis",
            "designation": "c Orionis (42 Ori)",
            "isMajor": false,
            "position2D": {
              "x": -0.318,
              "y": -1.839
            },
            "distance": 900,
            "magnitude": 4.59,
            "spectralClass": "B1 V",
            "color": "#9db4ff",
            "size": 0.06,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 12,
              "radiusSolar": 7,
              "tempKelvin": 25400,
              "note": "Component Aa; Wikipedia, not in the Unity table"
            },
            "info": {
              "basic": "42 Orionis, also called c Orionis, is a hot blue-white star at the top of Orion's Sword, just below the Belt. Its light illuminates the reflection nebula NGC 1977, nicknamed the Running Man Nebula.",
              "scientific": {
                "class": "B1V main-sequence star",
                "temperature": "About 25,000 K",
                "mass": "Roughly 11 times the Sun's mass",
                "feature": "Marks the hilt of Orion's Sword, between the Belt and the Orion Nebula"
              }
            }
          },
          {
            "id": "theta1_orionis",
            "name": "Theta1 Orionis",
            "designation": "θ¹ Orionis (Trapezium)",
            "isMajor": false,
            "position2D": {
              "x": -0.311,
              "y": -1.967
            },
            "distance": 1344,
            "magnitude": 4,
            "spectralClass": "O7 V",
            "color": "#ffffff",
            "size": 0.06,
            "stellarType": "blue_main_sequence",
            "physics": {
              "massSolar": 33.5,
              "radiusSolar": 8.91,
              "tempKelvin": 39000,
              "note": "Component C1"
            },
            "info": {
              "basic": "Theta1 Orionis, the famous Trapezium Cluster, illuminates the heart of the Great Orion Nebula with its young, massive stars.",
              "scientific": {
                "age": "Only about 1 million years old",
                "mass": "Primary star: 33 times the Sun's mass",
                "composition": "Contains multiple massive O and B-type stars arranged in trapezoid pattern",
                "luminosity": "Primary: 204,000 times the Sun's luminosity",
                "feature": "Central star cluster of the Orion Nebula (M42)"
              }
            }
          }
        ],
        "connections": [
          {
            "from": "alnitak",
            "to": "alnilam",
            "type": "belt"
          },
          {
            "from": "alnilam",
            "to": "mintaka",
            "type": "belt"
          },
          {
            "from": "betelgeuse",
            "to": "alnitak",
            "type": "body"
          },
          {
            "from": "alnitak",
            "to": "saiph",
            "type": "body"
          },
          {
            "from": "bellatrix",
            "to": "mintaka",
            "type": "body"
          },
          {
            "from": "mintaka",
            "to": "rigel",
            "type": "body"
          },
          {
            "from": "meissa",
            "to": "betelgeuse",
            "type": "body"
          },
          {
            "from": "meissa",
            "to": "bellatrix",
            "type": "body"
          },
          {
            "from": "bellatrix",
            "to": "pi4_orionis",
            "type": "bow"
          },
          {
            "from": "pi3_orionis",
            "to": "pi4_orionis",
            "type": "bow"
          },
          {
            "from": "pi4_orionis",
            "to": "pi5_orionis",
            "type": "bow"
          },
          {
            "from": "betelgeuse",
            "to": "chi2_orionis",
            "type": "club"
          },
          {
            "from": "chi2_orionis",
            "to": "chi1_orionis",
            "type": "club"
          },
          {
            "from": "alnilam",
            "to": "c_orionis",
            "type": "sword"
          },
          {
            "from": "c_orionis",
            "to": "theta1_orionis",
            "type": "sword"
          }
        ],
        "deepSkyObjects": [
          {
            "id": "m42",
            "name": "Orion Nebula",
            "designation": "M42, NGC 1976",
            "type": "emission_nebula",
            "layer": "nebula",
            "position2D": {
              "x": -0.312,
              "y": -1.968
            },
            "distance": 1344,
            "magnitude": 4,
            "size": 1.5,
            "description": "The Great Orion Nebula, one of the brightest nebulae in the sky and the nearest region of massive star formation to the Sun.",
            "field": {
              "count": 5000,
              "spread": 3.4,
              "sizeRatio": 0.13,
              "opacity": 0.24,
              "spin": 0.05,
              "turbulence": 3.6,
              "contrast": 3.2,
              "cores": 4,
              "coreGain": 0.9,
              "dust": 0.8,
              "fill": 1.9,
              "embedded": 4,
              "colors": "#eaf2ff,#ffe0c4,#ff4d6a,#8e1e46"
            },
            "info": {
              "basic": "The Great Orion Nebula, the middle \"star\" of Orion's sword and the nearest region of massive star formation to the Sun. It is bright enough to see with the unaided eye as a fuzzy patch, and the only nebula most people ever see that way.",
              "scientific": "An emission nebula about 1,344 light-years away and some 24 light-years across, lit by the Trapezium - a knot of hot young stars whose ultraviolet light ionises the surrounding hydrogen and makes it glow. Depth here is expressive, not measured: the object is placed at the back of the constellation box rather than at its true distance."
            },
            "sources": "Wikipedia, Orion Nebula; Messier catalogue"
          },
          {
            "id": "m43",
            "name": "De Mairan's Nebula",
            "designation": "M43, NGC 1982",
            "type": "emission_nebula",
            "layer": "none",
            "position2D": {
              "x": -0.325,
              "y": -1.939
            },
            "distance": 1300,
            "magnitude": 9,
            "size": 0.5,
            "description": "A smaller emission nebula separated from M42 by a dark lane of dust."
          }
        ],
        "journey": [
          {
            "id": "betelgeuse",
            "title": "Betelgeuse",
            "centerStarName": "Betelgeuse",
            "targetStarNames": [
              "Betelgeuse"
            ],
            "story": "Its name comes from the Arabic Yad al-Jawza', 'the Hand of Orion' — the familiar 'Betelgeuse' is a medieval mistranscription that turned the leading letter into a 'b'. Skywatchers everywhere remarked on its ember-red color: Ptolemy called it 'orange-tawny,' Chinese astronomers three centuries earlier recorded it as yellow, and the Inuit knew it as Ulluriajjuaq, 'the great star.' Aboriginal groups in South Australia preserved oral traditions of its changing brightness long before Western science confirmed it is a variable star. In fixed-star astrology it carries a martial, Mars-like nature, linked to honor and fortune.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923); Wikipedia"
          },
          {
            "id": "bellatrix",
            "title": "Bellatrix",
            "centerStarName": "Bellatrix",
            "targetStarNames": [
              "Bellatrix"
            ],
            "story": "Its Arabic title Al Najid, 'the Conqueror,' was rendered in the medieval Alfonsine Tables as 'the Female Warrior' — the Amazon Star, a name Bellatrix preserves in Latin. In the fixed-star astrology of Vivian Robson it promises great civil or military honor, but warns of sudden dishonor should fortune turn.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)"
          },
          {
            "id": "belt",
            "title": "Orion's Belt",
            "view": "2d",
            "detailScale": 1.2,
            "centerStarName": "Alnilam",
            "targetStarNames": [
              "Alnitak",
              "Alnilam",
              "Mintaka"
            ],
            "story": "The three belt stars carry Arabic names — Al Nitak (the girdle), Al Nitham (the string of pearls), and Al Mintaqah (the belt). Across the world they have been read as a set: the Three Kings, the Three Marys, Jacob's Rod, the Golden Yard-arm. To the Maya they were the Three Hearthstones of Creation — the triangular hearth at the heart of every home, written across the sky, with the glowing Orion Nebula below as the smoke and fire of creation itself.",
            "sources": "R.H. Allen, Star Names (1899); Maya astronomy (Mexicolore); V. Robson, Fixed Stars (1923)"
          },
          {
            "id": "saiph",
            "title": "Saiph",
            "centerStarName": "Saiph",
            "targetStarNames": [
              "Saiph"
            ],
            "story": "Saiph takes its name from the Arabic Saif al-Jabbar, 'the Sword of the Giant.' Quieter in lore than its neighbors, it holds a place in Maya cosmology as one of the Three Hearthstones of Creation, forming — with Rigel and the belt — the cosmic hearth around the nebula's fire.",
            "sources": "R.H. Allen, Star Names (1899); Maya astronomy (Mexicolore)"
          },
          {
            "id": "rigel",
            "title": "Rigel",
            "centerStarName": "Rigel",
            "targetStarNames": [
              "Rigel"
            ],
            "story": "Rigel is the 'left foot of Orion,' from the Arabic Rijl Jawza'. Norse tradition remembered it as a toe of Aurvandil the Bold: the god Thor, carrying him across the icy rivers, broke off a frostbitten toe and flung it into the sky, where it became a star. Roman farmers, by contrast, blamed Rigel for winter storms. In astrology it is a star of Jupiter and Saturn — honor, riches, and lasting fortune.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)"
          }
        ]
      },
      'andromeda': {
        "metadata": {
          "name": "Andromeda",
          "displayName": "Andromeda the Chained Princess",
          "description": "Andromeda is a large northern constellation whose brightest stars form a long chain running east from the Great Square of Pegasus. It is best known for hosting the Andromeda Galaxy (M31), the nearest large spiral galaxy to the Milky Way and the most distant object visible to the unaided eye.",
          "mythology": "In Greek myth Andromeda was the daughter of King Cepheus and Queen Cassiopeia. Boasting of her daughter's beauty, Cassiopeia offended the sea nymphs, and Andromeda was chained to a rock as a sacrifice to the sea monster Cetus. She was rescued by Perseus, who arrived bearing the head of Medusa.",
          "season": "autumn",
          "hemisphere": "northern",
          "abbreviation": "And"
        },
        "portal": {
          "width": 8,
          "height": 7,
          "borderColor": "#00ff00",
          "doorHeight": 7,
          "doorDuration": 4000,
          "lineDrawDuration": 1000,
          "lineDelay": 100,
          "position": {
            "x": 0,
            "y": 0,
            "z": 0.1
          }
        },
        "display": {
          "gridWidth": 8,
          "gridHeight": 7,
          "gridSize": 0.5,
          "gridColor": "#00ff00",
          "distanceScale": 0.0009,
          "zDepthScale": 0.7,
          "scale": {
            "x": 0.5,
            "y": 0.5,
            "z": 0.5
          },
          "position": {
            "x": 0,
            "y": 0,
            "z": -1.5
          }
        },
        "gridBox": {
          "width": 8,
          "height": 7,
          "depth": 7,
          "cellSize": 0.5,
          "color": "#00ff00",
          "opacity": 0.6,
          "wallZ": -1.6
        },
        "stars": [
          {
            "id": "alpheratz",
            "name": "Alpheratz",
            "designation": "α Andromedae",
            "isMajor": true,
            "position2D": {
              "x": 1.199,
              "y": -2.034
            },
            "distance": 97,
            "magnitude": 2.07,
            "spectralClass": "B8IVpMnHg",
            "color": "#bbccff",
            "size": 0.13,
            "stellarType": "blue_white_subgiant",
            "physics": {
              "massSolar": 3.63,
              "radiusSolar": 2.94,
              "tempKelvin": 11950,
              "note": "Primary"
            },
            "info": {
              "basic": "Alpheratz marks the head of the chained princess and doubles as the northeastern corner of the Great Square of Pegasus, the only star shared between the two figures.",
              "scientific": {
                "class": "B8IV mercury-manganese subgiant",
                "temperature": "About 13,800 K",
                "mass": "Roughly 3.8 times the Sun's mass",
                "luminosity": "About 240 times the Sun",
                "feature": "The brightest known mercury-manganese star; a spectroscopic binary"
              }
            }
          },
          {
            "id": "delta_and",
            "name": "Delta Andromedae",
            "designation": "δ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -0.211,
              "y": -1.693
            },
            "distance": 101,
            "magnitude": 3.27,
            "spectralClass": "K3III",
            "color": "#ffb877",
            "size": 0.085,
            "stellarType": "orange_giant",
            "physics": {
              "massSolar": 1.3,
              "radiusSolar": 14.45,
              "tempKelvin": 4315,
              "note": "Component Aa"
            },
            "info": {
              "basic": "Delta Andromedae sits between Alpheratz and Mirach along the princess's body, a quiet orange giant relatively close to the Sun.",
              "scientific": {
                "class": "K3III orange giant",
                "temperature": "About 4,800 K",
                "luminosity": "Roughly 55 times the Sun",
                "feature": "A binary system with a faint companion"
              }
            }
          },
          {
            "id": "epsilon_and",
            "name": "Epsilon Andromedae",
            "designation": "ε Andromedae",
            "isMajor": false,
            "position2D": {
              "x": -0.18,
              "y": -2.02
            },
            "distance": 169,
            "magnitude": 4.34,
            "spectralClass": "G5III",
            "color": "#ffeec0",
            "size": 0.055,
            "stellarType": "yellow_giant",
            "physics": {
              "massSolar": 1.01,
              "radiusSolar": 9.04,
              "tempKelvin": 5082
            },
            "info": {
              "basic": "Epsilon Andromedae carries the chain south from Delta toward the border with Pisces.",
              "scientific": {
                "class": "G5III yellow giant",
                "temperature": "About 4,900 K",
                "feature": "A yellow giant marking the southern chain of Andromeda"
              }
            }
          },
          {
            "id": "zeta_and",
            "name": "Zeta Andromedae",
            "designation": "ζ Andromedae",
            "isMajor": false,
            "position2D": {
              "x": -0.618,
              "y": -3.1
            },
            "distance": 181,
            "magnitude": 4.08,
            "spectralClass": "K1II",
            "color": "#ffc088",
            "size": 0.06,
            "stellarType": "orange_bright_giant",
            "physics": {
              "massSolar": 2.6,
              "radiusSolar": 15.9,
              "tempKelvin": 4665,
              "note": "Component Aa"
            },
            "info": {
              "basic": "Zeta Andromedae ends the southern chain, a heavily spotted orange giant.",
              "scientific": {
                "class": "K1II orange bright giant",
                "feature": "An RS Canum Venaticorum variable; interferometry has directly imaged huge starspots on its surface"
              }
            }
          },
          {
            "id": "mirach",
            "name": "Mirach",
            "designation": "β Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -1.476,
              "y": -0.639
            },
            "distance": 199,
            "magnitude": 2.07,
            "spectralClass": "M0III",
            "color": "#ff7744",
            "size": 0.13,
            "stellarType": "red_giant",
            "physics": {
              "massSolar": 2.49,
              "radiusSolar": 86.4,
              "tempKelvin": 3762,
              "note": "Primary"
            },
            "info": {
              "basic": "Mirach is the ruddy heart of Andromeda and the sky's most useful signpost: star-hoppers follow it north to find the Andromeda Galaxy.",
              "scientific": {
                "class": "M0III red giant",
                "temperature": "About 3,800 K",
                "radius": "Roughly 100 times the Sun's radius",
                "luminosity": "About 1,900 times the Sun",
                "feature": "A semiregular variable; the galaxy NGC 404 lies close by on the sky and is nicknamed Mirach's Ghost"
              }
            }
          },
          {
            "id": "almach",
            "name": "Almach",
            "designation": "γ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -3.463,
              "y": 1.137
            },
            "distance": 355,
            "magnitude": 2.1,
            "spectralClass": "K3IIb",
            "color": "#ffb066",
            "size": 0.12,
            "stellarType": "orange_bright_giant",
            "physics": {
              "massSolar": 14.5,
              "radiusSolar": 98.5,
              "tempKelvin": 4248,
              "note": "Gamma-1 Andromedae A"
            },
            "info": {
              "basic": "Almach marks the princess's foot and is one of the finest double stars in the sky, showing a striking gold and blue-green contrast in a small telescope.",
              "scientific": {
                "class": "K3IIb orange bright giant",
                "temperature": "About 4,250 K",
                "luminosity": "Roughly 2,000 times the Sun",
                "feature": "Actually a quadruple system: the golden primary is paired with a blue companion that is itself a triple star"
              }
            }
          },
          {
            "id": "mu_and",
            "name": "Mu Andromedae",
            "designation": "μ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -0.892,
              "y": -0.085
            },
            "distance": 136,
            "magnitude": 3.86,
            "spectralClass": "A5V",
            "color": "#ffffff",
            "size": 0.07,
            "stellarType": "white_main_sequence",
            "physics": {
              "massSolar": 2.21,
              "radiusSolar": 3.03,
              "tempKelvin": 8320
            },
            "info": {
              "basic": "Mu Andromedae is the first step on the star-hop from Mirach toward the Andromeda Galaxy.",
              "scientific": {
                "class": "A5V white main-sequence star",
                "temperature": "About 8,000 K",
                "feature": "Together with Nu Andromedae it points the way to M31"
              }
            }
          },
          {
            "id": "nu_and",
            "name": "Nu Andromedae",
            "designation": "ν Andromedae",
            "isMajor": false,
            "position2D": {
              "x": -0.59,
              "y": 0.432
            },
            "distance": 679,
            "magnitude": 4.53,
            "spectralClass": "B5V",
            "color": "#a8bcff",
            "size": 0.05,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 5.9,
              "radiusSolar": 3.4,
              "tempKelvin": 14851,
              "note": "Component A"
            },
            "info": {
              "basic": "Nu Andromedae lies about a degree from the Andromeda Galaxy, making it the final marker for finding M31 by eye.",
              "scientific": {
                "class": "B5V blue-white main-sequence star",
                "temperature": "About 15,000 K",
                "feature": "A close line-of-sight neighbour of M31, though it lies within our own galaxy"
              }
            }
          },
          {
            "id": "phi_and",
            "name": "Phi Andromedae",
            "designation": "φ Andromedae",
            "isMajor": false,
            "position2D": {
              "x": -1.233,
              "y": 1.767
            },
            "distance": 736,
            "magnitude": 4.26,
            "spectralClass": "B7III",
            "color": "#aabbff",
            "size": 0.06,
            "stellarType": "blue_giant",
            "info": {
              "basic": "Phi Andromedae continues the northern arm of the constellation toward Cassiopeia.",
              "scientific": {
                "class": "B7III blue giant",
                "feature": "A Be shell star with a circumstellar disc of ejected gas"
              }
            }
          },
          {
            "id": "51_and",
            "name": "51 Andromedae",
            "designation": "51 And (Nembus)",
            "isMajor": true,
            "position2D": {
              "x": -2.2,
              "y": 2.223
            },
            "distance": 174,
            "magnitude": 3.59,
            "spectralClass": "K3III",
            "color": "#ffb877",
            "size": 0.075,
            "stellarType": "orange_giant",
            "physics": {
              "massSolar": 1.75,
              "radiusSolar": 20.91,
              "tempKelvin": 4316
            },
            "info": {
              "basic": "51 Andromedae, officially named Nembus, ends the northern arm. Ptolemy counted it as part of Perseus before Flamsteed moved it into Andromeda.",
              "scientific": {
                "class": "K3III orange giant",
                "temperature": "About 4,400 K",
                "feature": "Its Bayer letter was lost when the star changed constellations, leaving only a Flamsteed number"
              }
            }
          },
          {
            "id": "pi_and",
            "name": "Pi Andromedae",
            "designation": "π Andromedae",
            "isMajor": false,
            "position2D": {
              "x": -0.098,
              "y": -1.098
            },
            "distance": 656,
            "magnitude": 4.34,
            "spectralClass": "B5V",
            "color": "#a8bcff",
            "size": 0.055,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 5.8,
              "radiusSolar": 4.7,
              "tempKelvin": 15000,
              "note": "Component A"
            },
            "info": {
              "basic": "Pi Andromedae begins the long western chain that trails away from the princess's body.",
              "scientific": {
                "class": "B5V blue-white main-sequence star",
                "feature": "A spectroscopic binary with a close companion"
              }
            }
          },
          {
            "id": "iota_and",
            "name": "Iota Andromedae",
            "designation": "ι Andromedae",
            "isMajor": false,
            "position2D": {
              "x": 2.135,
              "y": 1.052
            },
            "distance": 502,
            "magnitude": 4.29,
            "spectralClass": "B8V",
            "color": "#b3c4ff",
            "size": 0.06,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 3.1,
              "radiusSolar": 4.6,
              "tempKelvin": 12620
            },
            "info": {
              "basic": "Iota Andromedae anchors the small northwestern group of stars that closes the constellation's chain.",
              "scientific": {
                "class": "B8V blue-white main-sequence star",
                "temperature": "About 12,000 K"
              }
            }
          },
          {
            "id": "kappa_and",
            "name": "Kappa Andromedae",
            "designation": "κ Andromedae",
            "isMajor": false,
            "position2D": {
              "x": 2.014,
              "y": 1.259
            },
            "distance": 170,
            "magnitude": 4.15,
            "spectralClass": "B9IVn",
            "color": "#bbccff",
            "size": 0.06,
            "stellarType": "blue_white_subgiant",
            "physics": {
              "massSolar": 2.768,
              "radiusSolar": 2.303,
              "tempKelvin": 10342,
              "note": "Equatorial values"
            },
            "info": {
              "basic": "Kappa Andromedae is a fast-spinning blue-white star that made headlines for its directly imaged companion.",
              "scientific": {
                "class": "B9IV blue-white subgiant",
                "feature": "Hosts Kappa Andromedae b, a substellar companion captured in direct images in 2012"
              }
            }
          },
          {
            "id": "lambda_and",
            "name": "Lambda Andromedae",
            "designation": "λ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": 2.05,
              "y": 1.721
            },
            "distance": 84,
            "magnitude": 3.81,
            "spectralClass": "G8III-IV",
            "color": "#fff0c8",
            "size": 0.07,
            "stellarType": "yellow_giant",
            "physics": {
              "massSolar": 1.47,
              "radiusSolar": 7.787,
              "tempKelvin": 4633
            },
            "info": {
              "basic": "Lambda Andromedae is a nearby yellow giant whose brightness wavers as enormous starspots rotate across its face.",
              "scientific": {
                "class": "G8III-IV yellow giant",
                "feature": "An RS Canum Venaticorum variable; its light varies as heavily spotted regions turn in and out of view"
              }
            }
          },
          {
            "id": "omicron_and",
            "name": "Omicron Andromedae",
            "designation": "ο Andromedae",
            "isMajor": true,
            "position2D": {
              "x": 3.6,
              "y": 1.173
            },
            "distance": 692,
            "magnitude": 3.62,
            "spectralClass": "B6III",
            "color": "#aabbff",
            "size": 0.075,
            "stellarType": "blue_giant",
            "physics": {
              "massSolar": 6.5,
              "radiusSolar": 11.5,
              "tempKelvin": 14540,
              "note": "Component Aa"
            },
            "info": {
              "basic": "Omicron Andromedae closes the western end of the chain, near the border with Lacerta.",
              "scientific": {
                "class": "B6III blue giant",
                "feature": "A variable shell star in a multiple system, shedding gas into a surrounding disc"
              }
            }
          }
        ],
        "connections": [
          {
            "from": "almach",
            "to": "mirach",
            "type": "body"
          },
          {
            "from": "mirach",
            "to": "delta_and",
            "type": "body"
          },
          {
            "from": "delta_and",
            "to": "alpheratz",
            "type": "body"
          },
          {
            "from": "mirach",
            "to": "mu_and",
            "type": "arm"
          },
          {
            "from": "mu_and",
            "to": "nu_and",
            "type": "arm"
          },
          {
            "from": "nu_and",
            "to": "phi_and",
            "type": "arm"
          },
          {
            "from": "phi_and",
            "to": "51_and",
            "type": "arm"
          },
          {
            "from": "delta_and",
            "to": "pi_and",
            "type": "chain"
          },
          {
            "from": "pi_and",
            "to": "iota_and",
            "type": "chain"
          },
          {
            "from": "iota_and",
            "to": "omicron_and",
            "type": "chain"
          },
          {
            "from": "iota_and",
            "to": "kappa_and",
            "type": "chain"
          },
          {
            "from": "kappa_and",
            "to": "lambda_and",
            "type": "chain"
          },
          {
            "from": "delta_and",
            "to": "epsilon_and",
            "type": "chain"
          },
          {
            "from": "epsilon_and",
            "to": "zeta_and",
            "type": "chain"
          }
        ],
        "deepSkyObjects": [
          {
            "id": "m31",
            "name": "Andromeda Galaxy",
            "designation": "M31, NGC 224",
            "type": "spiral_galaxy",
            "layer": "galaxy",
            "position2D": {
              "x": -0.315,
              "y": 0.462
            },
            "distance": 2537000,
            "magnitude": 3.44,
            "size": 2,
            "description": "The nearest large spiral galaxy to the Milky Way and the most distant object visible to the unaided eye. It spans about six times the width of the full Moon on the sky and is approaching us at roughly 110 km/s.",
            "field": {
              "count": 8000,
              "spread": 4,
              "sizeRatio": 0.02,
              "opacity": 0.85,
              "spin": 0.1,
              "arms": 2,
              "wind": 4.4,
              "scatter": 0.55,
              "bulge": 0.22,
              "colors": "#fff3d2,#ffdca0,#cfd8ff,#8fa8e0"
            },
            "info": {
              "basic": "The Andromeda Galaxy - the faint smudge the Persian astronomer al-Sufi wrote down in about 964 CE as a \"little cloud\". It is the most distant thing the unaided eye can see, and it spans about six times the width of the full Moon on the sky.",
              "scientific": "A barred spiral galaxy roughly 2,537,000 light-years away, approaching the Milky Way at about 110 km/s. Edwin Hubble identified Cepheid variables in it in 1925 and settled the question of whether such objects lay inside our own galaxy - they did not. Depth here is expressive, not measured: at its true distance it would flatten the whole constellation, so it sits at the back of the box instead."
            },
            "sources": "al-Sufi, Book of Fixed Stars (c. 964); Wikipedia, Andromeda Galaxy"
          },
          {
            "id": "m32",
            "name": "M32",
            "designation": "M32, NGC 221",
            "type": "dwarf_elliptical_galaxy",
            "layer": "none",
            "position2D": {
              "x": -0.315,
              "y": 0.378
            },
            "distance": 2490000,
            "magnitude": 8.08,
            "size": 0.5,
            "description": "A compact dwarf elliptical satellite of the Andromeda Galaxy, stripped down by its giant neighbour."
          },
          {
            "id": "m110",
            "name": "M110",
            "designation": "M110, NGC 205",
            "type": "dwarf_elliptical_galaxy",
            "layer": "none",
            "position2D": {
              "x": -0.222,
              "y": 0.545
            },
            "distance": 2690000,
            "magnitude": 8.07,
            "size": 0.6,
            "description": "The second bright satellite galaxy of M31, unusual among dwarf ellipticals for still holding dust and young stars."
          },
          {
            "id": "ngc7662",
            "name": "Blue Snowball Nebula",
            "designation": "NGC 7662",
            "type": "planetary_nebula",
            "layer": "none",
            "position2D": {
              "x": 2.636,
              "y": 0.988
            },
            "distance": 5600,
            "magnitude": 8.3,
            "size": 0.3,
            "description": "A bright planetary nebula that shows as a small blue-green disc, the cast-off shell of a dying Sun-like star."
          },
          {
            "id": "ngc752",
            "name": "NGC 752",
            "designation": "NGC 752, Caldwell 28",
            "type": "open_cluster",
            "layer": "none",
            "position2D": {
              "x": -3.453,
              "y": 0.107
            },
            "distance": 1300,
            "magnitude": 5.7,
            "size": 1.2,
            "description": "A large, loose open cluster of about 60 stars near Almach, old enough that its brightest members have evolved into giants."
          }
        ],
        "journey": [
          {
            "id": "alpheratz",
            "title": "Alpheratz",
            "view": "2d",
            "centerStarName": "Alpheratz",
            "targetStarNames": [
              "Alpheratz"
            ],
            "story": "Alpheratz sits at the princess's head, but it began as part of a horse. Arab astronomers called it Al Surrat al Faras, 'the Navel of the Horse,' when it belonged to Pegasus, and Greek writers from Aratus onward treated it as a joint star shared by both figures - it still carries the old designation delta Pegasi. Only later did it become Al Ras al Mar'ah al Musalsalah, 'the Head of the Woman in Chains.' Chinese astronomers paired it with Gamma Pegasi as Bi, the Wall: the eastern wall of the imperial palace and the emperor's library. In fixed-star astrology it carries the nature of Jupiter and Venus - independence, riches, honour and a keen intellect.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923); Ptolemy, Almagest"
          },
          {
            "id": "mirach",
            "title": "Mirach",
            "view": "2d",
            "centerStarName": "Mirach",
            "targetStarNames": [
              "Mirach"
            ],
            "story": "Mirach takes its name from the Arabic mi'zar, a girdle or waist-cloth, and medieval Latin charts called it Cingulum, the belt, and Ventrale, the belly. Arab astronomers also knew it as Al Janb al Musalsalah, 'the Side of the Chained Woman.' Earlier still it belonged to a different figure altogether - the great Fish - where it marked Al Batn al Hut, 'the Belly of the Fish,' the 26th lunar mansion. Robson gives it the nature of Venus: beauty, a brilliant mind, devotion, and good fortune in marriage. Today it serves a plainer purpose - it is the signpost every stargazer follows north to find the Andromeda Galaxy.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)"
          },
          {
            "id": "almach",
            "title": "Almach",
            "view": "2d",
            "centerStarName": "Almach",
            "targetStarNames": [
              "Almach"
            ],
            "story": "Almach marks the princess's foot, and its name has nothing to do with her. Al 'Anak al 'Ard means 'the Earth-kid' - a small predatory Arabian animal like a badger, known locally as Al Barid. The name was used by Al Tizini and by the fifteenth-century Tartar astronomer Ulug Beg, and Allen took its oddity as a sign of very early Arab star-lore. Thomas Hyde recorded the alternative Al Rijl al Musalsalah, 'the Woman's Foot.' Chinese astronomers gave it a grander title - Tien Ta Tseang, 'Heaven's Great General,' honourable and eminent. Robson assigns it the nature of Venus: honour, eminence and artistic ability. Through a telescope it splits into a celebrated gold and blue-green pair.",
            "sources": "R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)"
          },
          {
            "id": "chains",
            "title": "The Chains",
            "view": "2d",
            "detailScale": 1.2,
            "centerStarName": "Kappa Andromedae",
            "targetStarNames": [
              "Omicron Andromedae",
              "Lambda Andromedae",
              "Kappa Andromedae",
              "Iota Andromedae"
            ],
            "story": "Ptolemy listed Andromeda among his original forty-eight constellations in the Almagest, and in his description Alpha marks her head while Omicron and Lambda are her chains. The story behind them is the oldest in this sky: Cassiopeia boasted that her daughter outshone the sea nymphs, Poseidon sent the monster Cetus, and an oracle told King Cepheus that only his daughter's sacrifice would save the kingdom. She was chained to a rock, and rescued by Perseus. The chained figure is not only Greek - Sanskrit texts describe Antarmada bound to a rock, a resemblance scholars have long remarked on. Other skies saw something else entirely: in the Marshall Islands these stars form the body of a porpoise, with Cassiopeia as its tail and Aries its head.",
            "sources": "Ptolemy, Almagest (2nd c.); R.H. Allen, Star Names (1899); Wikipedia"
          },
          {
            "id": "m31",
            "title": "The Little Cloud",
            "view": "2d",
            "detailScale": 2.5,
            "centerStarName": "Nu Andromedae",
            "targetStarNames": [
              "Mu Andromedae",
              "Nu Andromedae"
            ],
            "story": "In about 964 CE the Persian astronomer Abd al-Rahman al-Sufi recorded a faint smudge here in his Book of Fixed Stars, calling it a small cloud. It is the earliest known written reference to a galaxy beyond our own, and Arab charts marked it simply as the Little Cloud, part of a figure they called al-Hut, the fish. Simon Marius described it through a telescope in 1612, and Messier catalogued it as M31 in 1764. For centuries nobody knew what it was. In 1917 Heber Curtis found novae within it and argued for 'island universes'; in 1925 Edwin Hubble identified Cepheid variable stars in it with the 100-inch Hooker telescope and settled the question. The Little Cloud was another galaxy, two and a half million light-years away. The universe got a great deal larger that year.",
            "sources": "al-Sufi, Book of Fixed Stars (c. 964); Wikipedia"
          }
        ]
      },
    }

    return constellations[constellationName] || null
  },

  applyConstellationSettings() {
    // Apply display settings from constellation data
    const {display} = this.constellationData
    if (display) {
      this.gridWidth = display.gridWidth || 6
      this.gridHeight = display.gridHeight || 9
      this.gridSize = display.gridSize || 0.5
      this.gridColor = display.gridColor || '#00ff00'
      this.distanceScale = display.distanceScale || 0.0009
      this.zDepthScale = display.zDepthScale || 0.7

      // The grid box is the volume the constellation is drawn inside. It is per-constellation
      // data; fall back to the portal/display values so older data keeps working unchanged.
      const portalCfg = this.constellationData.portal || {}
      const box = this.constellationData.gridBox || {}
      this.portalWidth = portalCfg.width || this.gridWidth
      this.portalHeight = portalCfg.height || this.gridHeight
      this.gridBox = {
        width: box.width || this.gridWidth,
        height: box.height || this.gridHeight,
        depth: box.depth || this.portalWidth,
        cellSize: box.cellSize || this.gridSize,
        color: box.color || this.gridColor,
        opacity: box.opacity !== undefined ? box.opacity : 0.6,
        wallZ: box.wallZ !== undefined ? box.wallZ : -1.6,
      }

      // Apply scale and position to the entire container
      if (display.scale) {
        this.el.setAttribute('scale', display.scale)
      }
      if (display.position) {
        this.el.setAttribute('position', display.position)
      }
    }
  },

  loadFallbackData() {
    // Fallback Orion data in case constellation not found
    this.constellationData = {
      metadata: {
        name: 'Orion',
        displayName: 'Orion the Hunter',
      },
      portal: {
        width: 6,
        height: 9,
        borderColor: '#00ff00',
        doorHeight: 10,
        doorDuration: 4000,
        position: {x: 0, y: 0, z: 0.1},
      },
      display: {
        gridWidth: 6,
        gridHeight: 9,
        gridSize: 0.5,
        gridColor: '#00ff00',
        distanceScale: 0.0009,
        zDepthScale: 0.7,
        scale: {x: 0.5, y: 0.5, z: 0.5},
        position: {x: 0, y: 0, z: -1.5},
      },
      stars: [
        {
          id: 'betelgeuse',
          name: 'Betelgeuse',
          position2D: {x: -1.367, y: 1.207},
          distance: 642.5,
          color: '#ff4400',
          size: 0.17,
          info: 'Betelgeuse, the red supergiant star...',
        },
      ],
      connections: [],
    }
    this.applyConstellationSettings()
  },

  createPortal() {
    const portalConfig = this.constellationData.portal
    if (!portalConfig) return

    console.log('Creating portal with config:', portalConfig)

    // Create the main portal container
    const portal = document.querySelector('#portal')
    portal.setAttribute('portal', {
      width: portalConfig.width,
      height: portalConfig.height,
      borderColor: portalConfig.borderColor,
      borderWidth: portalConfig.borderWidth || 0.03,
      doorHeight: portalConfig.doorHeight,
      doorDuration: portalConfig.doorDuration,
      lineDrawDuration: portalConfig.lineDrawDuration,
      lineDelay: portalConfig.lineDelay,
    })
    portal.setAttribute('position', portalConfig.position)

    // Add the signage frame (constellation name + star count) around the portal opening.
    // The portal border is drawn at width/4 x height/4, so the DRAWN frame is width/2 x height/2.
    this.createPortalHeader(portal, portalConfig)

    console.log('Portal component created and configured')
  },

  createPortalHeader(portal, portalConfig) {
    // Reuse a single header entity if createPortal runs again (e.g. switching constellations).
    let header = portal.querySelector('#portal-header')
    if (!header) {
      header = document.createElement('a-entity')
      header.setAttribute('id', 'portal-header')
      portal.appendChild(header)
    }

    header.setAttribute('portal-header', {
      label: (this.constellationData.metadata && this.constellationData.metadata.name) || 'Constellation',
      starCount: this.constellationData.stars ? this.constellationData.stars.length : 0,
      frameWidth: portalConfig.width / 2,
      frameHeight: portalConfig.height / 2,
      // Colour is deliberately NOT taken from portalConfig.borderColor: the portal frame keeps
      // the constellation green, while the HUD band matches the star-info panel palette.
    })

    // Attach the lore-journey and deep-sky-layer behaviors to the scene once.
    const scene = this.el.sceneEl
    if (!scene.hasAttribute('lore-journey')) scene.setAttribute('lore-journey', '')
    if (!scene.hasAttribute('deep-sky-layer')) scene.setAttribute('deep-sky-layer', '')
  },

  createGridWalls() {
    const positions = ['left', 'right', 'top', 'bottom']

    // The shaft should open exactly at the portal plane. This entity is offset and scaled
    // relative to the portal, so convert the portal plane into local space to get the front
    // edge; the walls then centre themselves along the shaft from there.
    const portalCfg = this.constellationData.portal || {}
    const display = this.constellationData.display || {}
    const portalZ = (portalCfg.position && portalCfg.position.z) || 0
    const offsetZ = (display.position && display.position.z) || 0
    const scaleZ = (display.scale && display.scale.z) || 1
    const frontZ = (portalZ - offsetZ) / scaleZ

    positions.forEach((position) => {
      const wall = document.createElement('a-entity')
      wall.setAttribute('grid-wall', {
        position,
        width: this.gridBox.width,
        height: this.gridBox.height,
        depth: this.gridBox.depth,
        frontZ,
        gridSize: this.gridBox.cellSize,
        color: this.gridBox.color,
        opacity: this.gridBox.opacity,
      })
      this.staticContainer.appendChild(wall)
    })
  },

  createStars() {
    console.log('Creating stars...')

    if (!this.constellationData.stars) {
      console.error('No star data found!')
      return
    }

    console.log('Processing', this.constellationData.stars.length, 'stars')

    this.constellationData.stars.forEach((starData, index) => {
      try {
        console.log(`Creating star ${index + 1}:`, starData.name)
        const starEntity = this.createStarEntity(starData)
        this.rotatingContainer.appendChild(starEntity)
        this.stars.push(starEntity)
        console.log(`✅ Star ${starData.name} created successfully`)
      } catch (error) {
        console.error(`❌ Error creating star ${starData.name}:`, error)
      }
    })

    console.log(`Total stars created: ${this.stars.length}`)
  },

  createStarEntity(starData) {
    const starEntity = document.createElement('a-entity')

    // Create main star sphere (visible part)
    const starCore = document.createElement('a-sphere')
    starCore.setAttribute('radius', starData.size)
    starCore.setAttribute('id', starData.name)
    starCore.setAttribute('material', {
      color: starData.color,
      metalness: 0.3,
      roughness: 0.7,
    })
    starEntity.appendChild(starCore)

    // Create text container for billboard effect
    const textContainer = document.createElement('a-entity')
    textContainer.setAttribute('id', 'TextContainer')
    textContainer.setAttribute('billboard', '')

    // Create enhanced text label
    const label = document.createElement('a-text')
    label.setAttribute('value', starData.name)
    label.setAttribute('align', 'center')
    label.setAttribute('position', `0 ${starData.size + 0.2} 0.02`)
    label.setAttribute('scale', '1.5 1.5 1.5')
    label.setAttribute('color', '#ffffff')
    label.setAttribute('width', '3')
    label.setAttribute('font', 'exo2bold')
    textContainer.appendChild(label)
    starEntity.appendChild(textContainer)

    // Create larger collision sphere for easier selection.
    // NOTE: made semi-transparent (was opacity 0.0) to visualize the real hit box.
    // Its radius is driven live by showSelectionState() to starData.size * 3..6 (camera-distance based).
    const collisionSphere = document.createElement('a-sphere')
    const collisionRadius = Math.max(starData.size * 3, 0.3)
    collisionSphere.setAttribute('radius', collisionRadius)
    collisionSphere.setAttribute('class', 'cantap')
    collisionSphere.setAttribute('material', {
      color: starData.color,
      opacity: 0.25,
      transparent: true,
      side: 'double',
      depthTest: true,
      depthWrite: false,
    })
    starEntity.appendChild(collisionSphere)

    // Set position and data attributes
    starEntity.setAttribute('position', {
      x: starData.position2D.x,
      y: starData.position2D.y,
      z: 0,  // Push stars behind portal
    })
    starEntity.dataset.name = starData.name
    starEntity.dataset.designation = starData.designation || ''
    starEntity.dataset.realX = starData.position2D.x
    starEntity.dataset.realY = starData.position2D.y
    starEntity.dataset.realZ = starData.distance ? -starData.distance : 0
    starEntity.dataset.info = this.formatStarInfo(starData)

    return starEntity
  },

  // Deep-sky objects that are in the layer get a marker. Objects with layer 'none' - the
  // companions of a marked primary, and anything deferred - are skipped: two dashed rings
  // 0.03 units apart, which is what M42 and M43 are, would be untappable.
  createDeepSkyMarkers() {
    this.deepSkyMarkers = []
    const objects = this.constellationData.deepSkyObjects || []

    objects.forEach((obj) => {
      const layer = obj.layer || 'none'
      if (layer === 'none') return

      const entity = document.createElement('a-entity')
      // Angular size varies hugely; floor it so a small object stays tappable.
      const radius = Math.max(0.28, Math.min(0.9, (obj.size || 1) * 0.32))
      entity.setAttribute('deep-sky-marker', {radius})

      const label = document.createElement('a-entity')
      label.setAttribute('billboard', '')
      const text = document.createElement('a-text')
      text.setAttribute('value', obj.name)
      text.setAttribute('align', 'center')
      text.setAttribute('position', `0 ${radius + 0.22} 0.02`)
      text.setAttribute('scale', '1.5 1.5 1.5')
      text.setAttribute('color', '#bfe4ff')
      text.setAttribute('width', '3')
      text.setAttribute('font', 'exo2bold')
      label.appendChild(text)
      entity.appendChild(label)

      entity.setAttribute('position', {x: obj.position2D.x, y: obj.position2D.y, z: 0})
      entity.dataset.deepSkyId = obj.id
      entity.dataset.name = obj.name
      entity.dataset.realX = obj.position2D.x
      entity.dataset.realY = obj.position2D.y
      entity.dataset.realZ = obj.distance ? -obj.distance : 0

      this.rotatingContainer.appendChild(entity)
      this.deepSkyMarkers.push(entity)
    })

    console.log('Deep-sky markers created:', this.deepSkyMarkers.length)
  },

  getDeepSkyById(id) {
    return (this.constellationData.deepSkyObjects || []).find(o => o.id === id) || null
  },

  formatStarInfo(starData) {
    let info = ''

    // Basic description
    if (starData.info) {
      if (typeof starData.info === 'string') {
        info = starData.info
      } else if (starData.info.basic) {
        info = starData.info.basic

        // Add scientific data if available
        if (starData.info.scientific) {
          info += '\n\n'
          const sci = starData.info.scientific
          if (sci.age) info += `• Age: ${sci.age}\n`
          if (sci.mass) info += `• Mass: ${sci.mass}\n`
          if (sci.radius) info += `• Radius: ${sci.radius}\n`
          if (sci.luminosity) info += `• Luminosity: ${sci.luminosity}\n`
          if (sci.fate) info += `• Fate: ${sci.fate}\n`
        }
      }
    }

    // Fallback basic info from star properties
    if (!info) {
      info = `${starData.name} is a ${starData.spectralClass || 'star'}`
      if (starData.distance) {
        info += ` located ${starData.distance} light-years away.`
      }
      if (starData.magnitude) {
        info += ` It has an apparent magnitude of ${starData.magnitude}.`
      }
    }

    return info
  },

  createConnections() {
    if (!this.constellationData.connections) return

    this.constellationData.connections.forEach((connectionData) => {
      const startStar = this.findStarById(connectionData.from)
      const endStar = this.findStarById(connectionData.to)

      if (startStar && endStar) {
        const line = this.createConnectionLine(startStar, endStar, connectionData.type)
        this.rotatingContainer.appendChild(line)
        this.connections.push(line)
      }
    })
  },

  findStarById(starId) {
    return this.stars.find(star => star.dataset.name.toLowerCase() === starId.toLowerCase() ||
      this.getStarDataById(starId)?.name === star.dataset.name)
  },

  getStarDataById(starId) {
    return this.constellationData.stars.find(star => star.id === starId || star.name.toLowerCase() === starId.toLowerCase())
  },

  createConnectionLine(startStar, endStar, connectionType = 'default') {
    const startPos = startStar.getAttribute('position')
    const endPos = endStar.getAttribute('position')

    const line = document.createElement('a-entity')
    line.setAttribute('id', 'connecting-line')
    line.setAttribute('line', {
      start: startPos,
      end: endPos,
      color: this.getConnectionColor(connectionType),
      opacity: 0.8,   // Make sure lines are visible from start
      visible: true,  // Explicitly set visible
    })

    console.log(`🔗 Created connection line from ${startStar.dataset.name} to ${endStar.dataset.name}`)

    return line
  },

  getConnectionColor(connectionType) {
    const colorMap = {
      'belt': '#ffffff',
      'body': '#4444ff',
      'bow': '#4444ff',
      'club': '#4444ff',
      'sword': '#4444ff',
      'default': '#4444ff',
    }
    return colorMap[connectionType] || colorMap.default
  },

  updateConnections() {
    if (!this.constellationData.connections) return

    this.constellationData.connections.forEach((connectionData, index) => {
      const startStar = this.findStarById(connectionData.from)
      const endStar = this.findStarById(connectionData.to)
      const line = this.connections[index]

      if (startStar && endStar && line) {
        const startPos = startStar.getAttribute('position')
        const endPos = endStar.getAttribute('position')

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
          color: this.getConnectionColor(connectionData.type),
          opacity: 0.8,
        })
      }
    })
  },

  setupInteractions() {
    this.stars.forEach((starEntity) => {
      const collisionSphere = starEntity.querySelector('a-sphere.cantap')
      const starCore = starEntity.querySelector('a-sphere:not(.cantap)')

      if (collisionSphere) {
        collisionSphere.addEventListener('click', () => {
          if (!this.isAnimating) {
            this.pulseStarOnSelect(starCore, collisionSphere)
          }
        })
      }
    })

    this.currentlyIntersected = null
  },

  pulseStarOnSelect(starCore, collisionSphere) {
    // Clear any previous animations
    starCore.removeAttribute('animation__pulse')
    collisionSphere.removeAttribute('animation__fade')

    // Reset collision sphere opacity
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
      opacity: 0.2,
      transparent: true,
    })

    // Animate collision sphere opacity
    collisionSphere.setAttribute('animation__fade', {
      property: 'material.opacity',
      from: 0.2,
      to: 0.0,
      dur: 500,
      easing: 'easeOutQuad',
    })

    // Reset opacity when animation completes
    const resetOpacity = () => {
      collisionSphere.setAttribute('material', 'opacity', 0.0)
    }

    collisionSphere.addEventListener('animationcomplete__fade', resetOpacity, {once: true})
    setTimeout(resetOpacity, 600)
  },

  // The 2D/3D control itself lives in the portal HUD band (see js/portal-header.js), which
  // draws it alongside the other controls. This only owns the behavior, so the button can be
  // repositioned without touching the view logic. Called on every (re)load, hence the guard.
  createViewToggle() {
    if (this.viewToggleBound) return

    this.onViewToggleRequested = () => {
      this.data.showRealPositions = !this.data.showRealPositions

      // Force a clean transition
      this.stars.forEach((star) => {
        star.removeAttribute('animation')
      })

      this.updatePositions()
    }

    this.el.sceneEl.addEventListener('viewToggleRequested', this.onViewToggleRequested)
    this.viewToggleBound = true

    // Publish the starting mode so the HUD label matches before the first tap.
    this.announceView()
  },

  // Single place the current view mode is announced from, so the HUD label cannot go stale.
  // updatePositions() is the choke point every change runs through, including the lore
  // journey's enter/exit, which sets showRealPositions directly.
  announceView() {
    this.el.sceneEl.emit('viewToggleChanged', {is3D: this.data.showRealPositions})
  },

  updatePositions(instant = false) {
    // Depth uses each star's REAL distance, scaled by ONE uniform factor so the most
    // distant star fits `depthExtent`. Proportions stay truthful (twice as far => twice as
    // deep), and the whole depth range is CENTERED so its mid-plane stays at z=0 (the 2D
    // center): the cloud expands forward AND backward, not just backward. This keeps it
    // centered on the rotation pivot so it stays inside the portal box when rotated.
    let maxAbsZ = 0
    this.stars.forEach((star) => {
      maxAbsZ = Math.max(maxAbsZ, Math.abs(parseFloat(star.dataset.realZ)))
    })
    const depthExtent = ((this.gridBox && this.gridBox.depth) || 6) * (this.zDepthScale || 0.7)

    // Find the proportional depth range so we can recenter its mid-plane on the origin.
    let minDepth = Infinity
    let maxDepth = -Infinity
    this.stars.forEach((star) => {
      const d = maxAbsZ > 0 ? (parseFloat(star.dataset.realZ) / maxAbsZ) * depthExtent : 0
      minDepth = Math.min(minDepth, d)
      maxDepth = Math.max(maxDepth, d)
    })
    const depthMid = (minDepth + maxDepth) / 2

    this.announceView()

    const positionUpdates = []

    this.stars.forEach((star) => {
      let position
      if (this.data.showRealPositions) {
        const realZ = parseFloat(star.dataset.realZ)  // = -distance
        const scaledZ = (maxAbsZ > 0 ? (realZ / maxAbsZ) * depthExtent : 0) - depthMid

        position = {
          x: parseFloat(star.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(star.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: scaledZ,
        }
      } else {
        position = {
          x: parseFloat(star.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(star.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: 0,
        }
      }

      positionUpdates.push({
        star,
        position,
      })
    })

    // Deep-sky objects are clamped INTO the box; the box is never extended to reach them.
    // M31 sits 2.54 million light-years away against Andromeda's 44-700 ly stars, so honest
    // scaling would flatten the figure to a plane. Depth here is expressive, not measured -
    // the real distance is stated in the object's info instead.
    const halfBox = depthExtent / 2
    ;(this.deepSkyMarkers || []).forEach((marker) => {
      let position
      if (this.data.showRealPositions) {
        const realZ = parseFloat(marker.dataset.realZ)
        const raw = (maxAbsZ > 0 ? (realZ / maxAbsZ) * depthExtent : 0) - depthMid
        position = {
          x: parseFloat(marker.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(marker.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: Math.max(-halfBox, Math.min(halfBox, raw)),
        }
      } else {
        position = {
          x: parseFloat(marker.dataset.realX) * (this.gridWidth / (this.portalWidth || 6)),
          y: parseFloat(marker.dataset.realY) * (this.gridHeight / (this.portalHeight || 9)),
          z: 0,
        }
      }
      positionUpdates.push({star: marker, position})
    })

    // Apply animations (or snap instantly when requested, e.g. during the lore journey).
    positionUpdates.forEach((update) => {
      if (instant) {
        update.star.removeAttribute('animation')
        update.star.setAttribute('position', update.position)
      } else {
        update.star.setAttribute('animation', {
          property: 'position',
          to: update.position,
          dur: this.data.animationDuration,
          easing: 'easeInOutQuad',
        })
      }
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

  showSelectionState() {
    const camera = document.querySelector('a-camera')
    if (!camera) return

    const cameraPosition = camera.getAttribute('position')

    this.stars.forEach((star) => {
      const starPosition = star.getAttribute('position')
      const dx = cameraPosition.x - starPosition.x
      const dy = cameraPosition.y - starPosition.y
      const dz = cameraPosition.z - starPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      const collisionSphere = star.querySelector('a-sphere.cantap')
      if (collisionSphere) {
        const starCore = star.querySelector('a-sphere:not(.cantap)')
        const baseSize = parseFloat(starCore.getAttribute('radius')) * 3
        const scaleFactor = Math.min(distance / 10, 2)
        const newRadius = baseSize * scaleFactor
        collisionSphere.setAttribute('radius', newRadius)
      }
    })

    // Markers get the same camera-distance growth as stars, or they become impossible to
    // hit once the constellation is placed across the room.
    ;(this.deepSkyMarkers || []).forEach((marker) => {
      const p = marker.getAttribute('position')
      const dx = cameraPosition.x - p.x, dy = cameraPosition.y - p.y, dz = cameraPosition.z - p.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const hit = marker.querySelector('a-sphere.cantap')
      const comp = marker.components['deep-sky-marker']
      if (!hit || !comp) return
      const base = Math.max(comp.data.radius, 0.35)
      hit.setAttribute('radius', base * Math.min(Math.max(distance / 10, 1), 2))
    })
  },

  tick(time, delta) {
    if (this.connections.length > 0) {
      this.updateConnections()
    }

    // Update collision spheres based on camera distance
    if (time % 500 < 20) {
      this.showSelectionState()
    }
  },

  // Method to dynamically load a different constellation
  async loadConstellation(constellationName) {
    // Clear existing constellation
    this.clearConstellation()

    // Update data path
    this.data.constellationFile = constellationName

    // Reload data and recreate constellation
    await this.loadConstellationData()
    this.createPortal()
    this.createGridWalls()
    this.createStars()
    this.createConnections()
    this.setupInteractions()
    this.createViewToggle()
  },

  clearConstellation() {
    // Remove all children from containers
    while (this.rotatingContainer.firstChild) {
      this.rotatingContainer.removeChild(this.rotatingContainer.firstChild)
    }
    while (this.staticContainer.firstChild) {
      this.staticContainer.removeChild(this.staticContainer.firstChild)
    }

    // Reset arrays
    this.stars = []
    this.connections = []
    this.deepSkyMarkers = []
  },

  // Swap the figure inside the portal without disturbing the frame.
  //
  // #portal is a markup element and the grid walls live in staticContainer, so only
  // rotatingContainer holds stars and connection lines. Rebuilding just that container is
  // what lets a star cluster stand in for the constellation without making this whole
  // component re-entrant.
  swapFigure(figure) {
    if (!figure || !Array.isArray(figure.stars) || !figure.stars.length) {
      console.warn('[constellation-loader] swapFigure refused: no stars')
      return false
    }

    // Remember the real figure the first time we leave it.
    if (!this.baseFigure && !this.restoringFigure) {
      this.baseFigure = {
        stars: this.constellationData.stars,
        connections: this.constellationData.connections,
        deepSkyObjects: this.constellationData.deepSkyObjects,
      }
    }

    while (this.rotatingContainer.firstChild) {
      this.rotatingContainer.removeChild(this.rotatingContainer.firstChild)
    }
    this.stars = []
    this.connections = []
    this.deepSkyMarkers = []

    this.constellationData.stars = figure.stars
    this.constellationData.connections = figure.connections || []
    this.constellationData.deepSkyObjects = figure.deepSkyObjects || []

    this.createStars()
    this.createConnections()
    this.createDeepSkyMarkers()
    this.setupInteractions()
    this.updatePositions(true)

    // Tones are ranged across the set on screen, so a new set needs a new range.
    const audioEl = document.querySelector('[star-audio]')
    const audio = audioEl && audioEl.components['star-audio']
    if (audio && audio.computeRange) audio.computeRange(figure.stars)

    return true
  },

  restoreFigure() {
    if (!this.baseFigure) return false
    const base = this.baseFigure
    // Suppress swapFigure's first-swap capture: without this it would record the figure we
    // are leaving (the cluster) as the new base, and the real constellation would be lost.
    this.restoringFigure = true
    const ok = this.swapFigure(base)
    this.restoringFigure = false
    if (ok) this.baseFigure = null      // only forget the base once we are actually back
    return ok
  },

  remove() {
    this.clearConstellation()
  },
}

export {constellationLoaderComponent}
