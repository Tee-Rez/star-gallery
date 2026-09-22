// constellation-loader.js
import {defaultStore} from './discovery-store'
import {resolveLayer} from './deep-sky-field'
import {faceText} from './hud-face'

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
        // this.data is rebuilt from the cached attribute on every A-Frame update, so a value set
        // only on this.data is silently reverted: ?c=andromeda fell back to Orion whenever an
        // update landed before the figure loaded. Writing the cache as well makes it stick.
        this.setConstellationFile(requested)
      } else if (requested) {
        console.warn('Unknown constellation requested:', requested)
      }
    } catch (e) {
      console.warn('Could not read constellation from URL:', e)
    }

    // Entering or leaving a cluster swaps the star set, so the ratio has to be recomputed
    // against whichever figure is on screen - refreshExploredCounts reads the current one.
    this.onExploredChanged = () => this.refreshExploredCounts()
    this.el.sceneEl.addEventListener('deepSkyVisited', this.onExploredChanged)
    this.el.sceneEl.addEventListener('deepSkyEntered', this.onExploredChanged)
    this.el.sceneEl.addEventListener('deepSkyExited', this.onExploredChanged)

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
      this.refreshExploredCounts()

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

  // The one safe way to change constellationFile after init - see the note in init().
  setConstellationFile(id) {
    if (this.attrValue && typeof this.attrValue === 'object') this.attrValue.constellationFile = id
    this.data.constellationFile = id
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
            "id": "alnitak",
            "hip": 26727,
            "name": "Alnitak",
            "designation": "ζ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.708,
              "y": -2.035
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
            "hip": 26311,
            "name": "Alnilam",
            "designation": "ε Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.423,
              "y": -1.847
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
            "hip": 25930,
            "name": "Mintaka",
            "designation": "δ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.159,
              "y": -1.62
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
            "id": "64_orionis",
            "hip": 28691,
            "name": "64 Orionis",
            "designation": "64 Orionis",
            "isMajor": false,
            "position2D": {
              "x": -2.056,
              "y": 3.464
            },
            "distance": 714.9,
            "magnitude": 5.13,
            "spectralClass": "B6:III/V",
            "color": "#a8bcff",
            "size": 0.06,
            "stellarType": "blue_white_giant",
            "physics": {
              "massSolar": 4.6,
              "radiusSolar": 6.63,
              "tempKelvin": 11260,
              "note": "Catalogue values: typical for spectral type B6:III/V. Not hand-checked."
            }
          },
          {
            "id": "xi_orionis",
            "hip": 29426,
            "name": "Xi Orionis",
            "designation": "ξ Orionis",
            "isMajor": false,
            "position2D": {
              "x": -2.609,
              "y": 2.061
            },
            "distance": 606,
            "magnitude": 4.48,
            "spectralClass": "B3V",
            "color": "#a8bcff",
            "size": 0.063,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 4.38,
              "radiusSolar": 6.45,
              "tempKelvin": 14450,
              "note": "Catalogue values: typical for spectral type B3V. Not hand-checked."
            }
          },
          {
            "id": "nu_orionis",
            "hip": 29038,
            "name": "Nu Orionis",
            "designation": "ν Orionis",
            "isMajor": false,
            "position2D": {
              "x": -2.333,
              "y": 2.192
            },
            "distance": 514.4,
            "magnitude": 4.397,
            "spectralClass": "B4V",
            "color": "#a8bcff",
            "size": 0.065,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 4.04,
              "radiusSolar": 5.98,
              "tempKelvin": 13600,
              "note": "Catalogue values: typical for spectral type B4V. Not hand-checked."
            }
          },
          {
            "id": "chi1_orionis",
            "hip": 27913,
            "name": "Chi1 Orionis",
            "designation": "χ Orionis",
            "isMajor": false,
            "position2D": {
              "x": -1.501,
              "y": 3.594
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
            "id": "mu_orionis",
            "hip": 28614,
            "name": "Mu Orionis",
            "designation": "μ Orionis",
            "isMajor": false,
            "position2D": {
              "x": -2.031,
              "y": 0.881
            },
            "distance": 154.8,
            "magnitude": 5,
            "spectralClass": "A2   V",
            "color": "#ffffff",
            "size": 0.06,
            "stellarType": "white_main_sequence",
            "physics": {
              "massSolar": 2.1,
              "radiusSolar": 3.39,
              "tempKelvin": 7760,
              "note": "Catalogue values: Allende Prieto & Lambert 1999. Not hand-checked."
            }
          },
          {
            "id": "betelgeuse",
            "hip": 27989,
            "name": "Betelgeuse",
            "designation": "α Orionis",
            "isMajor": true,
            "position2D": {
              "x": -1.589,
              "y": 0.311
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
            "id": "saiph",
            "hip": 27366,
            "name": "Saiph",
            "designation": "κ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -1.166,
              "y": -4.05
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
            "id": "rigel",
            "hip": 24436,
            "name": "Rigel",
            "designation": "β Orionis",
            "isMajor": true,
            "position2D": {
              "x": 0.947,
              "y": -3.655
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
            "hip": 25336,
            "name": "Bellatrix",
            "designation": "γ Orionis",
            "isMajor": true,
            "position2D": {
              "x": 0.267,
              "y": 0.038
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
            "id": "meissa",
            "hip": 26207,
            "name": "Meissa",
            "designation": "λ Orionis",
            "isMajor": true,
            "position2D": {
              "x": -0.348,
              "y": 0.929
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
            "hip": 22449,
            "name": "Tabit",
            "designation": "π³ Orionis",
            "isMajor": true,
            "position2D": {
              "x": 2.464,
              "y": 0.215
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
            "hip": 22549,
            "name": "Pi4 Orionis",
            "designation": "π4 Orionis",
            "isMajor": true,
            "position2D": {
              "x": 2.384,
              "y": -0.128
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
            "id": "5_orionis",
            "hip": 22730,
            "name": "5 Orionis",
            "designation": "5 Orionis",
            "isMajor": false,
            "position2D": {
              "x": 2.259,
              "y": -0.909
            },
            "distance": 589.3,
            "magnitude": 5.324,
            "spectralClass": "M1 III",
            "color": "#ff7744",
            "size": 0.06,
            "stellarType": "red_giant",
            "physics": {
              "massSolar": 1.5,
              "radiusSolar": null,
              "tempKelvin": 3500,
              "note": "Catalogue values: typical for spectral type M1 III. Not hand-checked."
            }
          },
          {
            "id": "pi6_orionis",
            "hip": 23123,
            "name": "Pi6 Orionis",
            "designation": "π6 Orionis",
            "isMajor": false,
            "position2D": {
              "x": 1.934,
              "y": -1.111
            },
            "distance": 936.9,
            "magnitude": 4.459,
            "spectralClass": "K0/1 III",
            "color": "#ffb066",
            "size": 0.064,
            "stellarType": "orange_giant",
            "physics": {
              "massSolar": 1.5,
              "radiusSolar": 94.63,
              "tempKelvin": 4200,
              "note": "Catalogue values: typical for spectral type K0/1 III. Not hand-checked."
            }
          },
          {
            "id": "pi2_orionis",
            "hip": 22509,
            "name": "Pi2 Orionis",
            "designation": "π² Orionis",
            "isMajor": false,
            "position2D": {
              "x": 2.406,
              "y": 0.702
            },
            "distance": 224.3,
            "magnitude": 4.35,
            "spectralClass": "A0Vnp lambda Boo",
            "color": "#ffffff",
            "size": 0.066,
            "stellarType": "white_main_sequence",
            "physics": {
              "massSolar": 2.51,
              "radiusSolar": 2.95,
              "tempKelvin": 9330,
              "note": "Catalogue values: Allende Prieto & Lambert 1999. Not hand-checked."
            }
          },
          {
            "id": "pi1_orionis",
            "hip": 22845,
            "name": "Pi1 Orionis",
            "designation": "π¹ Orionis",
            "isMajor": false,
            "position2D": {
              "x": 2.131,
              "y": 1.01
            },
            "distance": 116.3,
            "magnitude": 4.648,
            "spectralClass": "A3VakB9.5mB9.5 lambda Boo",
            "color": "#ffffff",
            "size": 0.06,
            "stellarType": "white_main_sequence",
            "physics": {
              "massSolar": 1.91,
              "radiusSolar": 1.66,
              "tempKelvin": 8710,
              "note": "Catalogue values: Allende Prieto & Lambert 1999. Not hand-checked."
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
            "from": "64_orionis",
            "to": "xi_orionis",
            "type": "figure"
          },
          {
            "from": "xi_orionis",
            "to": "nu_orionis",
            "type": "figure"
          },
          {
            "from": "nu_orionis",
            "to": "chi1_orionis",
            "type": "figure"
          },
          {
            "from": "xi_orionis",
            "to": "mu_orionis",
            "type": "figure"
          },
          {
            "from": "mu_orionis",
            "to": "betelgeuse",
            "type": "figure"
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
            "from": "saiph",
            "to": "rigel",
            "type": "figure"
          },
          {
            "from": "rigel",
            "to": "mintaka",
            "type": "body"
          },
          {
            "from": "mintaka",
            "to": "bellatrix",
            "type": "body"
          },
          {
            "from": "bellatrix",
            "to": "meissa",
            "type": "body"
          },
          {
            "from": "meissa",
            "to": "betelgeuse",
            "type": "body"
          },
          {
            "from": "bellatrix",
            "to": "pi3_orionis",
            "type": "figure"
          },
          {
            "from": "pi3_orionis",
            "to": "pi4_orionis",
            "type": "bow"
          },
          {
            "from": "pi4_orionis",
            "to": "5_orionis",
            "type": "figure"
          },
          {
            "from": "5_orionis",
            "to": "pi6_orionis",
            "type": "figure"
          },
          {
            "from": "pi3_orionis",
            "to": "pi2_orionis",
            "type": "figure"
          },
          {
            "from": "pi2_orionis",
            "to": "pi1_orionis",
            "type": "figure"
          },
          {
            "from": "nu_orionis",
            "to": "mu_orionis",
            "type": "figure"
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
              "x": -0.368,
              "y": -2.917
            },
            "distance": 1344,
            "magnitude": 4,
            "size": 1.5,
            "description": "The Great Orion Nebula, one of the brightest nebulae in the sky and the nearest region of massive star formation to the Sun.",
            "field": {
              "count": 3200,
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
            "sources": "Wikipedia, Orion Nebula; Messier catalogue",
            "render": {
              "mode": "particles",
              "steps": 24,
              "density": 7,
              "absorb": 2.4,
              "emission": 4.6,
              "marchPad": 1.15,
              "detail": 3,
              "light": 0.8,
              "premul": 1,
              "white": 4.5,
              "emitRho": 2.2,
              "turbulence": 4.2,
              "contrast": 2.8,
              "dust": 0.35,
              "coreGain": 1.4,
              "clouds": 6,
              "layout": 2,
              "clump": 0.45,
              "clumpScale": 0.8,
              "seed": 15,
              "stretch": 1.25,
              "flatten": 1.15,
              "falloff": 0.9,
              "warp": 0.7,
              "tilt": 0,
              "hollow": 0.15,
              "shellR": 0.45,
              "shellK": 2.6,
              "bipolar": 0.25,
              "lobeSharp": 0.2,
              "lobeBias": 0.35,
              "lobeAz": 125,
              "lobeEl": 32,
              "striate": 0.75,
              "striaGain": 2.2,
              "ionAmt": 1,
              "knotQ": 0.009,
              "ion0": 0.015,
              "ion1": 0.42,
              "ionDens": 1.2,
              "baseHue": 342,
              "midHue": 302,
              "coreHue": 205,
              "hotGain": 2,
              "sat": 0.66,
              "spread": 0.2,
              "darkAbsorb": 6,
              "darkR": 0.4,
              "darkX": -0.34,
              "darkY": 0.34,
              "darkZ": 0.02,
              "darkAz": 20,
              "darkEl": -35,
              "darkScallop": 0.05,
              "darkScale": 9,
              "darkEdge": 0.012,
              "dark2R": 0.09,
              "dark2X": -0.2,
              "dark2Y": -0.18,
              "dark2Z": 0.05,
              "darkHue": 24,
              "darkLev": 0.045,
              "rimGain": 3,
              "rimW": 0.02,
              "sunSize": 0.018,
              "sunBright": 1.8,
              "sunHue": 200,
              "sunHalo": 6,
              "sunKnotBright": 2.6,
              "sunX": -0.06,
              "sunY": 0.02,
              "sunZ": 0,
              "fieldCount": 2400,
              "fieldPx": 1.9,
              "fieldRadius": 0.62,
              "fieldBright": 0.6,
              "fieldAlpha": 1.6,
              "fieldCap": 34,
              "fieldPsf": 10,
              "fieldHalo": 0.05,
              "fieldGlareAt": 22,
              "fieldGlare": 2.5,
              "fieldMinDist": 2.2,
              "partCount": 1000,
              "partSize": 0.005,
              "partHue": 124,
              "partTwinkle": 0.9,
              "partDrift": 0.02
            }
          },
          {
            "id": "m43",
            "name": "De Mairan's Nebula",
            "designation": "M43, NGC 1982",
            "type": "emission_nebula",
            "layer": "none",
            "position2D": {
              "x": -0.382,
              "y": -2.885
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
            "hip": 677,
            "name": "Alpheratz",
            "designation": "α Andromedae",
            "isMajor": true,
            "position2D": {
              "x": 3.005,
              "y": -1.972
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
            "hip": 3092,
            "name": "Delta Andromedae",
            "designation": "δ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": 1.031,
              "y": -1.599
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
            "id": "mirach",
            "hip": 5447,
            "name": "Mirach",
            "designation": "β Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -0.779,
              "y": -0.253
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
            "hip": 9640,
            "name": "Almach",
            "designation": "γ¹ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -3.6,
              "y": 2
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
            "hip": 4436,
            "name": "Mu Andromedae",
            "designation": "μ Andromedae",
            "isMajor": true,
            "position2D": {
              "x": -0.031,
              "y": 0.548
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
            "hip": 3881,
            "name": "Nu Andromedae",
            "designation": "ν Andromedae",
            "isMajor": false,
            "position2D": {
              "x": 0.341,
              "y": 1.284
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
          }
        ],
        "connections": [
          {
            "from": "alpheratz",
            "to": "delta_and",
            "type": "body"
          },
          {
            "from": "delta_and",
            "to": "mirach",
            "type": "body"
          },
          {
            "from": "almach",
            "to": "mirach",
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
              "x": 0.718,
              "y": 1.349
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
              "spin": 0.02,
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
            "sources": "al-Sufi, Book of Fixed Stars (c. 964); Wikipedia, Andromeda Galaxy",
            "render": {
              "mode": "galaxy",
              "tilt": 40,
              "roll": -34,
              "viewScale": 1.4,
              "seed": 39,
              "steps": 3,
              "density": 11,
              "absorb": 4,
              "emission": 6.2,
              "light": 0,
              "turbulence": 4,
              "contrast": 2.8,
              "dust": 0,
              "warp": 0,
              "clump": 0.1,
              "clumpScale": 0.5,
              "galCull": 0.0018,
              "galRadius": 0.49,
              "galThick": 0.03,
              "galFlare": 0.25,
              "galFalloff": 1.6,
              "galBulge": 0.036,
              "galBulgeGain": 0.45,
              "galBulgeFlat": 0.72,
              "galBulgeLift": 0.9,
              "galBulgeSoft": 0.45,
              "galArms": 6,
              "galWind": 6.5,
              "galArmWidth": 12,
              "galArmFloor": 0.14,
              "galArmWobble": 0.35,
              "galFrag": 0.25,
              "galFragAlong": 8,
              "galFragAcross": 0.45,
              "laneAmt": 1,
              "galDustAbsorb": 64,
              "laneK": 360,
              "laneWind": 1,
              "laneOff": -0.13,
              "lane2": 0.45,
              "laneThick": 0.3,
              "laneIn": 0.1,
              "laneOut": 0.8,
              "laneWob": 0.3,
              "galDustBlue": 0.55,
              "galDustVeil": 0.8,
              "darkHue": 22,
              "darkLev": 0.1,
              "galPal": 1,
              "colIn": 0.02,
              "colSlope": 3.2,
              "colArm": 0.7,
              "colNoise": 0.09,
              "colDense": 0.16,
              "colDenseK": 3,
              "bulgeMix": 0.9,
              "creamHue": 44,
              "creamSat": 0.4,
              "creamLev": 0.88,
              "peachHue": 26,
              "peachSat": 0.68,
              "peachLev": 0.66,
              "armHue": 214,
              "armSat": 1.4,
              "armLev": 0.7,
              "sat": 0.85,
              "spread": 0.85,
              "baseHue": 228,
              "coreHue": 138,
              "ionAmt": 0,
              "emitRho": 1.5,
              "white": 3.4,
              "hueKeep": 0.9,
              "hueBreak": 7,
              "premul": 1,
              "sunSize": 0.026,
              "sunBright": 0.28,
              "sunHue": 44,
              "starCount": 36000,
              "starPx": 1.2,
              "starPsf": 10,
              "starHalo": 0.05,
              "starGlare": 1.4,
              "starRamp": 0.6,
              "starMidHue": 28,
              "starThick": 1.1,
              "starScatter": 0.08,
              "starBulge": 0.05,
              "starArmHue": 214,
              "starLaneCut": 0.5,
              "starSize": 0.0075,
              "partHue": 30,
              "partTwinkle": 0.3,
              "knotFrac": 0.12,
              "knotHue": 205,
              "knotR0": 0.42,
              "hiiFrac": 0.13,
              "hiiHue": 332,
              "fieldCount": 250,
              "fieldRadius": 1.45,
              "fieldPx": 1.3,
              "fieldPsf": 12,
              "fieldBright": 0.8,
              "fieldAlpha": 1.7,
              "fieldCap": 40,
              "fieldHalo": 0.05,
              "fieldGlareAt": 18,
              "fieldGlare": 3,
              "fieldMinDist": 0.5,
              "fieldLock": 1,
              "fgBright": 26,
              "fgTemp": 0.1,
              "fgX": -0.22,
              "fgY": 0.16,
              "fgZ": 0.2,
              "fgGlare": 1,
              "comp1X": 0.1,
              "comp1Y": -0.12,
              "comp1Z": 0.1,
              "comp1R": 0.055,
              "comp1Flat": 1.35,
              "comp1Rot": -30,
              "comp1Bright": 1,
              "comp1Core": 1.8,
              "comp1Hue": 44,
              "comp2X": -0.22,
              "comp2Y": 0.17,
              "comp2Z": -0.05,
              "comp2R": 0.1,
              "comp2Flat": 1.7,
              "comp2Rot": -26,
              "comp2Bright": 0.5,
              "comp2Core": 1.15,
              "comp2Hue": 40,
              "galBound": 1,
              "fieldBoxX": 0.22,
              "fieldBoxY": 0.18,
              "fieldBoxZ0": -0.22,
              "fieldBoxZ1": 0.2,
              "fieldConc": 0.85,
              "fieldConcR": 0.22,
              "starArmSharp": 3
            }
          },
          {
            "id": "m32",
            "name": "M32",
            "designation": "M32, NGC 221",
            "type": "dwarf_elliptical_galaxy",
            "layer": "none",
            "position2D": {
              "x": 0.725,
              "y": 1.234
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
              "x": 0.84,
              "y": 1.473
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
              "x": 4.831,
              "y": 2.352
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
              "x": -3.43,
              "y": 0.629
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
      'taurus': {
        "metadata": {
          "name": "Taurus",
          "displayName": "Taurus the Bull",
          "description": "Taurus is a large, bright constellation of the northern winter sky. The V-shaped Hyades cluster forms the bull’s face with orange Aldebaran as its eye, two long horns run out to Elnath and Zeta Tauri, and a shoulder and forelegs reach west toward Omicron. It contains the Pleiades, the brightest open cluster in the sky, and the Crab Nebula, the remnant of a star seen to explode in 1054.",
          "mythology": "Babylonian astronomy knew this figure as GU4.AN.NA, the Bull of Heaven, sent by Ishtar to kill Gilgamesh and destroyed by Enkidu, who threw its hindquarters into the sky — which is why the constellation has only a front half. Greek writers told it as Zeus in the form of a white bull carrying off Europa, or as Io transformed into a heifer; Acusilaus named it the Cretan Bull. To the early Hebrews it was the first constellation of the zodiac, marked by the letter Aleph.",
          "season": "winter",
          "hemisphere": "northern",
          "abbreviation": "Tau"
        },
        "portal": {
          "width": 8,
          "height": 6,
          "borderColor": "#00ff00",
          "doorHeight": 6,
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
          "gridHeight": 6,
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
          "height": 6,
          "depth": 6,
          "cellSize": 0.5,
          "color": "#00ff00",
          "opacity": 0.6,
          "wallZ": -1.6
        },
        "stars": [
          {
            "id": "elnath",
            "hip": 25428,
            "name": "Elnath",
            "designation": "β Tauri",
            "isMajor": true,
            "position2D": {
              "x": -2.852,
              "y": 2.351
            },
            "distance": 131,
            "magnitude": 1.65,
            "spectralClass": "B7III",
            "color": "#bbccff",
            "size": 0.13,
            "stellarType": "blue_white_giant",
            "physics": {
              "massSolar": 5,
              "radiusSolar": 4.79,
              "tempKelvin": 13600,
              "note": "Primary; mercury-manganese peculiar star; also catalogued as Gamma Aurigae, shared between Taurus and Auriga"
            },
            "info": {
              "basic": "Elnath is the tip of the northern horn. Its name is Arabic, al-nath, \"the butting one\" — the horn doing the goring. It sits on the border with Auriga and was once counted as a star of both figures.",
              "scientific": {
                "class": "B7 III blue-white giant",
                "temperature": "About 13,600 K",
                "mass": "Roughly 5 times the Sun",
                "radius": "About 4.8 times the Sun",
                "feature": "The second-brightest star in Taurus, and shared historically with Auriga as Gamma Aurigae"
              }
            }
          },
          {
            "id": "tau_tauri",
            "hip": 21881,
            "name": "Tau Tauri",
            "designation": "τ Tauri",
            "isMajor": false,
            "position2D": {
              "x": -0.718,
              "y": 0.946
            },
            "distance": 400,
            "magnitude": 4.27,
            "spectralClass": "B3V",
            "color": "#a8bcff",
            "size": 0.055,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 4.55,
              "radiusSolar": 3.35,
              "tempKelvin": 14880,
              "note": "Catalogue values: typical for spectral type B2.5V. Not hand-checked."
            },
            "info": {
              "basic": "Tau Tauri lies along the line running out to the northern horn tip, well beyond the Hyades and unrelated to them.",
              "scientific": {
                "class": "B3 V blue-white main sequence",
                "temperature": "About 17,000 K",
                "distance": "Around 400 light-years — far behind the Hyades",
                "feature": "Mass and radius are not published for this star, so its tone is estimated from its spectral class rather than measured"
              }
            }
          },
          {
            "id": "epsilon_tauri",
            "hip": 20889,
            "name": "Ain",
            "designation": "ε Tauri",
            "isMajor": true,
            "position2D": {
              "x": -0.041,
              "y": 0.122
            },
            "distance": 155,
            "magnitude": 3.53,
            "spectralClass": "K0III",
            "color": "#ffb877",
            "size": 0.085,
            "stellarType": "orange_giant",
            "physics": {
              "massSolar": 2.458,
              "radiusSolar": 12.46,
              "tempKelvin": 4880,
              "note": "Primary (Ain), the northern eye of the bull; hosts exoplanet Epsilon Tauri b (Amateru)"
            },
            "info": {
              "basic": "Epsilon Tauri carries the name Ain, Arabic for \"eye\" — the bull’s second eye, opposite Aldebaran across the face.",
              "scientific": {
                "class": "K0 III orange giant",
                "temperature": "About 4,880 K",
                "mass": "Roughly 2.5 times the Sun",
                "radius": "About 12 times the Sun",
                "feature": "Hosts a confirmed giant planet — one of the few known in an open cluster"
              }
            }
          },
          {
            "id": "aldebaran",
            "hip": 21421,
            "name": "Aldebaran",
            "designation": "α Tauri",
            "isMajor": true,
            "position2D": {
              "x": -0.419,
              "y": -0.45
            },
            "distance": 65,
            "magnitude": 0.87,
            "spectralClass": "K5III",
            "color": "#ffb066",
            "size": 0.16,
            "stellarType": "orange_giant",
            "physics": {
              "massSolar": 1.03,
              "radiusSolar": 45.1,
              "tempKelvin": 3900,
              "note": "Primary component, alpha Tauri A; companion alpha Tauri B is a faint M dwarf"
            },
            "info": {
              "basic": "Aldebaran is the bull’s eye, and its name says what it does: al-dabaran, \"the follower\", because it rises behind the Pleiades and chases them across the sky all night. It looks like the brightest member of the Hyades cluster, but it is not a member at all.",
              "scientific": {
                "class": "K5 III orange giant",
                "temperature": "About 3,900 K",
                "mass": "Roughly the Sun’s mass",
                "radius": "About 45 times the Sun’s radius",
                "feature": "Not a Hyades member — it lies 65 light-years away, less than half the cluster’s 153, and merely falls along the same line of sight"
              }
            }
          },
          {
            "id": "zeta_tauri",
            "hip": 26451,
            "name": "Tianguan",
            "designation": "ζ Tauri",
            "isMajor": true,
            "position2D": {
              "x": -3.6,
              "y": 0.745
            },
            "distance": 417,
            "magnitude": 2.97,
            "spectralClass": "B4IIIp",
            "color": "#a8bcff",
            "size": 0.085,
            "stellarType": "blue_white_giant",
            "physics": {
              "massSolar": 11.2,
              "radiusSolar": 5.5,
              "tempKelvin": 15500,
              "note": "Component A, primary of a single-lined spectroscopic binary; Be shell star"
            },
            "info": {
              "basic": "Zeta Tauri is the tip of the southern horn, and the signpost for the Crab Nebula — the wreck of a star that exploded here in 1054.",
              "scientific": {
                "class": "B4 III peculiar blue-white giant",
                "temperature": "About 15,500 K",
                "mass": "Roughly 11 times the Sun",
                "radius": "About 5.5 times the Sun",
                "feature": "A Be shell star, spinning fast enough to fling out a disc of its own gas"
              }
            }
          },
          {
            "id": "gamma_tauri",
            "hip": 20205,
            "name": "Prima Hyadum",
            "designation": "γ Tauri",
            "isMajor": true,
            "position2D": {
              "x": 0.416,
              "y": -0.641
            },
            "distance": 154,
            "magnitude": 3.65,
            "spectralClass": "G8III",
            "color": "#fff0c8",
            "size": 0.08,
            "stellarType": "yellow_giant",
            "physics": {
              "massSolar": 2.7,
              "radiusSolar": 11.94,
              "tempKelvin": 4844,
              "note": "Primary; apex/nose of the Hyades V, red clump giant"
            },
            "info": {
              "basic": "Gamma Tauri, Prima Hyadum — \"the first of the Hyades\" — marks the point of the V, where the bull’s face narrows toward the muzzle and the shoulder line begins.",
              "scientific": {
                "class": "G8 III yellow giant",
                "temperature": "About 4,840 K",
                "mass": "Roughly 2.7 times the Sun",
                "radius": "About 12 times the Sun",
                "feature": "A confirmed Hyades member at 154 light-years"
              }
            }
          },
          {
            "id": "delta1_tauri",
            "hip": 20455,
            "name": "Secunda Hyadum",
            "designation": "δ Tauri",
            "isMajor": true,
            "position2D": {
              "x": 0.25,
              "y": -0.229
            },
            "distance": 153,
            "magnitude": 3.77,
            "spectralClass": "G8III",
            "color": "#fff0c8",
            "size": 0.078,
            "stellarType": "yellow_giant",
            "physics": {
              "massSolar": 2.75,
              "radiusSolar": 14.9,
              "tempKelvin": 4819,
              "note": "Component Aa (Secunda Hyadum), the visible evolved giant of a spectroscopic binary"
            },
            "info": {
              "basic": "Delta-1 Tauri, Secunda Hyadum, \"the second of the Hyades\" — the companion name to Gamma, following it across the sky.",
              "scientific": {
                "class": "G8 III yellow giant",
                "temperature": "About 4,820 K",
                "mass": "Roughly 2.8 times the Sun",
                "radius": "About 15 times the Sun",
                "feature": "A Hyades member; one of the cluster’s several evolved giants"
              }
            }
          },
          {
            "id": "lambda_tauri",
            "hip": 18724,
            "name": "Lambda Tauri",
            "designation": "λ Tauri",
            "isMajor": true,
            "position2D": {
              "x": 1.439,
              "y": -1.304
            },
            "distance": 370,
            "magnitude": 3.41,
            "spectralClass": "B3V",
            "color": "#a8bcff",
            "size": 0.085,
            "stellarType": "blue_white_main_sequence",
            "physics": {
              "massSolar": 7.18,
              "radiusSolar": 6.4,
              "tempKelvin": 18700,
              "note": "Component A"
            },
            "info": {
              "basic": "Lambda Tauri, Bibing, is where the bull’s neck meets its shoulder — the junction the whole front of the animal hangs from. It is an eclipsing binary: two stars orbiting so closely that each passes in front of the other every four days, dimming the pair by a third.",
              "scientific": {
                "class": "B3 V blue-white main sequence, with an A-type companion",
                "temperature": "About 18,700 K",
                "mass": "Roughly 7.2 times the Sun",
                "radius": "About 6.4 times the Sun",
                "feature": "An Algol-type eclipsing binary with a 3.95-day period"
              }
            }
          },
          {
            "id": "omicron_tauri",
            "hip": 15900,
            "name": "Omicron Tauri",
            "designation": "ο Tauri",
            "isMajor": true,
            "position2D": {
              "x": 3.476,
              "y": -2.005
            },
            "distance": 211,
            "magnitude": 3.61,
            "spectralClass": "G8III",
            "color": "#fff0c8",
            "size": 0.08,
            "stellarType": "yellow_giant",
            "physics": {
              "massSolar": 3.21,
              "radiusSolar": 20.28,
              "tempKelvin": 5094,
              "note": "Component A"
            },
            "info": {
              "basic": "Omicron Tauri marks the end of the bull’s foreleg, the westernmost point of the whole figure.",
              "scientific": {
                "class": "G8 III yellow giant",
                "temperature": "About 5,100 K",
                "mass": "Roughly 3.2 times the Sun",
                "radius": "About 20 times the Sun",
                "feature": "An iron-poor giant, catalogued G8 III Fe-1 for its weak iron lines"
              }
            }
          },
          {
            "id": "theta2_tauri",
            "hip": 20894,
            "name": "Chamukuy",
            "designation": "θ² Tauri",
            "isMajor": true,
            "position2D": {
              "x": -0.044,
              "y": -0.59
            },
            "distance": 149,
            "magnitude": 3.4,
            "spectralClass": "A7III",
            "color": "#ffffff",
            "size": 0.085,
            "stellarType": "white_giant",
            "physics": {
              "massSolar": 2.86,
              "radiusSolar": 4.4,
              "tempKelvin": 7800,
              "note": "Component Aa (Chamukuy); brighter of the theta Tauri pair"
            },
            "info": {
              "basic": "Theta-2 Tauri, or Chamukuy, sits in the Hyades V. It has a near twin, Theta-1, so close beside it that the pair reads as a single point to the unaided eye — which is why only one of them is drawn here.",
              "scientific": {
                "class": "A7 III white giant",
                "temperature": "About 7,800 K",
                "mass": "Roughly 2.9 times the Sun",
                "radius": "About 4.4 times the Sun",
                "feature": "The brightest true member of the Hyades cluster"
              }
            }
          },
          {
            "id": "68_tauri",
            "hip": 20648,
            "name": "68 Tauri",
            "designation": "68 Tauri",
            "isMajor": false,
            "position2D": {
              "x": 0.119,
              "y": -0.147
            },
            "distance": 148.4,
            "magnitude": 4.298,
            "spectralClass": "A1V",
            "color": "#ffffff",
            "size": 0.068,
            "stellarType": "white_main_sequence",
            "physics": {
              "massSolar": 2.29,
              "radiusSolar": 2.29,
              "tempKelvin": 8910,
              "note": "Catalogue values: Allende Prieto & Lambert 1999. Not hand-checked."
            }
          },
          {
            "id": "atlas",
            "hip": 17847,
            "name": "Atlas",
            "designation": "27 Tauri",
            "isMajor": true,
            "position2D": {
              "x": 1.922,
              "y": 1.241
            },
            "distance": 398.8,
            "magnitude": 3.63,
            "spectralClass": "B7III",
            "color": "#a8bcff",
            "size": 0.084,
            "stellarType": "blue_white_giant",
            "physics": {
              "massSolar": 4.2,
              "radiusSolar": 7.92,
              "tempKelvin": 10470,
              "note": "Catalogue values: typical for spectral type B7III. Not hand-checked."
            }
          }
        ],
        "connections": [
          {
            "from": "elnath",
            "to": "tau_tauri",
            "type": "horn"
          },
          {
            "from": "tau_tauri",
            "to": "epsilon_tauri",
            "type": "horn"
          },
          {
            "from": "aldebaran",
            "to": "zeta_tauri",
            "type": "horn"
          },
          {
            "from": "gamma_tauri",
            "to": "delta1_tauri",
            "type": "face"
          },
          {
            "from": "gamma_tauri",
            "to": "lambda_tauri",
            "type": "shoulder"
          },
          {
            "from": "lambda_tauri",
            "to": "omicron_tauri",
            "type": "figure"
          },
          {
            "from": "aldebaran",
            "to": "epsilon_tauri",
            "type": "figure"
          },
          {
            "from": "aldebaran",
            "to": "theta2_tauri",
            "type": "face"
          },
          {
            "from": "theta2_tauri",
            "to": "gamma_tauri",
            "type": "face"
          },
          {
            "from": "epsilon_tauri",
            "to": "68_tauri",
            "type": "figure"
          },
          {
            "from": "68_tauri",
            "to": "delta1_tauri",
            "type": "figure"
          },
          {
            "from": "delta1_tauri",
            "to": "atlas",
            "type": "figure"
          }
        ],
        "deepSkyObjects": [
          {
            "id": "m45",
            "name": "Pleiades",
            "designation": "M45, the Seven Sisters",
            "type": "open_cluster",
            "layer": "cluster",
            "position2D": {
              "x": 2.388,
              "y": 1.65
            },
            "distance": 444,
            "magnitude": 1.6,
            "size": 2,
            "description": "The brightest open cluster in the sky, and the one almost every culture on Earth has named.",
            "stars": [
              {
                "id": "alcyone",
                "name": "Alcyone",
                "designation": "η Tauri (25 Tauri)",
                "isMajor": true,
                "position2D": {
                  "x": -1.292,
                  "y": -0.722
                },
                "distance": 440,
                "magnitude": 2.87,
                "spectralClass": "B7IIIe",
                "color": "#bbccff",
                "size": 0.09,
                "stellarType": "blue_white_giant",
                "physics": {
                  "massSolar": 6,
                  "radiusSolar": 9.28,
                  "tempKelvin": 12258,
                  "note": "5.9-6.1 Msun midpoint; equatorial/polar radius 10.56/8.0 Rsun (rapid rotator, oblate), mean used"
                },
                "info": {
                  "basic": "Alcyone is the brightest of the Seven Sisters and the one the others gather around.",
                  "scientific": {
                    "class": "B7 III blue-white giant",
                    "temperature": "About 12,300 K",
                    "mass": "Roughly 6 times the Sun",
                    "feature": "A rapid rotator with a disc of ejected gas"
                  }
                }
              },
              {
                "id": "electra",
                "name": "Electra",
                "designation": "17 Tauri",
                "isMajor": true,
                "position2D": {
                  "x": 2.247,
                  "y": -0.671
                },
                "distance": 444,
                "magnitude": 3.7,
                "spectralClass": "B6IIIe",
                "color": "#bbccff",
                "size": 0.08,
                "stellarType": "blue_white_giant",
                "physics": {
                  "massSolar": 4.65,
                  "radiusSolar": 6.06,
                  "tempKelvin": 13484,
                  "note": "4.6-4.7 Msun midpoint"
                },
                "info": {
                  "basic": "Electra, one of the seven sisters, and in some tellings the Lost Pleiad who veiled herself in grief over the fall of Troy.",
                  "scientific": {
                    "class": "B6 III blue-white giant",
                    "temperature": "About 13,500 K",
                    "mass": "Roughly 4.7 times the Sun",
                    "feature": "Spins near its break-up speed, flattening it noticeably"
                  }
                }
              },
              {
                "id": "maia",
                "name": "Maia",
                "designation": "20 Tauri",
                "isMajor": true,
                "position2D": {
                  "x": 0.956,
                  "y": 0.839
                },
                "distance": 444,
                "magnitude": 3.87,
                "spectralClass": "B8III",
                "color": "#bbccff",
                "size": 0.075,
                "stellarType": "blue_white_giant",
                "physics": {
                  "massSolar": 4.74,
                  "radiusSolar": 6.61,
                  "tempKelvin": 12550,
                  "note": "Primary; illuminates the Maia Nebula (NGC 1432)"
                },
                "info": {
                  "basic": "Maia, eldest of the sisters and in Greek myth the mother of Hermes.",
                  "scientific": {
                    "class": "B8 III blue-white giant",
                    "temperature": "About 12,600 K",
                    "mass": "Roughly 4.7 times the Sun",
                    "feature": "Lends its name to the Maia nebulosity the cluster is drifting through"
                  }
                }
              },
              {
                "id": "merope",
                "name": "Merope",
                "designation": "23 Tauri",
                "isMajor": true,
                "position2D": {
                  "x": 0.28,
                  "y": -1.655
                },
                "distance": 460,
                "magnitude": 4.18,
                "spectralClass": "B6IVe",
                "color": "#a8bcff",
                "size": 0.062,
                "stellarType": "blue_white_subgiant",
                "physics": {
                  "massSolar": 4.25,
                  "radiusSolar": 4.79,
                  "tempKelvin": 14550,
                  "note": "Primary; illuminates the Merope Nebula (NGC 1435)"
                },
                "info": {
                  "basic": "Merope is the sister who married a mortal and, ashamed, hides her face — the other candidate for the Lost Pleiad.",
                  "scientific": {
                    "class": "B6 IV blue-white subgiant",
                    "temperature": "About 14,600 K",
                    "mass": "Roughly 4.3 times the Sun",
                    "feature": "Wrapped in the brightest of the cluster’s reflection nebulae"
                  }
                }
              },
              {
                "id": "taygeta",
                "name": "Taygeta",
                "designation": "19 Tauri",
                "isMajor": false,
                "position2D": {
                  "x": 1.791,
                  "y": 1.432
                },
                "distance": 410,
                "magnitude": 4.3,
                "spectralClass": "B6IV",
                "color": "#a8bcff",
                "size": 0.056,
                "stellarType": "blue_white_subgiant",
                "physics": {
                  "massSolar": 4.41,
                  "radiusSolar": 4.36,
                  "tempKelvin": 13696,
                  "note": "Component Aa (19 Tauri Aa, Taygeta); Ab is a fainter companion, mass 3.2 Msun"
                },
                "info": {
                  "basic": "Taygeta, a sister of the Pleiades and in myth a mother of Lacedaemon, founder of Sparta.",
                  "scientific": {
                    "class": "B6 IV blue-white subgiant",
                    "temperature": "About 13,700 K",
                    "mass": "Roughly 4.4 times the Sun",
                    "feature": "A spectroscopic binary"
                  }
                }
              },
              {
                "id": "celaeno",
                "name": "Celaeno",
                "designation": "16 Tauri",
                "isMajor": false,
                "position2D": {
                  "x": 2.342,
                  "y": 0.376
                },
                "distance": 442,
                "magnitude": 5.45,
                "spectralClass": "B7V",
                "color": "#a8bcff",
                "size": 0.05,
                "stellarType": "blue_white_main_sequence",
                "physics": {
                  "massSolar": 4,
                  "radiusSolar": 2.34,
                  "tempKelvin": 12800,
                  "note": "Primary"
                },
                "info": {
                  "basic": "Celaeno is faint enough that it hovers at the edge of naked-eye visibility, and is sometimes itself called the Lost Pleiad.",
                  "scientific": {
                    "class": "B7 V blue-white main sequence",
                    "temperature": "About 12,800 K",
                    "mass": "Roughly 4 times the Sun",
                    "feature": "At magnitude 5.4, visible only in a dark sky"
                  }
                }
              },
              {
                "id": "asterope",
                "name": "Asterope",
                "designation": "21 Tauri (Sterope)",
                "isMajor": false,
                "position2D": {
                  "x": 0.844,
                  "y": 1.949
                },
                "distance": 431,
                "magnitude": 5.76,
                "spectralClass": "B8V",
                "color": "#a8bcff",
                "size": 0.05,
                "stellarType": "blue_white_main_sequence",
                "info": {
                  "basic": "Asterope, also called Sterope, is a close double — two stars the eye reads as one faint point.",
                  "scientific": {
                    "class": "B8 V blue-white main sequence",
                    "distance": "About 431 light-years",
                    "feature": "Mass and radius are not published, so its tone is estimated from its spectral class rather than measured"
                  }
                }
              },
              {
                "id": "atlas",
                "name": "Atlas",
                "designation": "27 Tauri",
                "isMajor": true,
                "position2D": {
                  "x": -3.569,
                  "y": -1.022
                },
                "distance": 444,
                "magnitude": 3.63,
                "spectralClass": "B8III",
                "color": "#bbccff",
                "size": 0.08,
                "stellarType": "blue_white_giant",
                "physics": {
                  "massSolar": 5.04,
                  "radiusSolar": 7.145,
                  "tempKelvin": 12525,
                  "note": "Component Aa1 (primary); equatorial/polar radius 7.81/6.48 Rsun (rapid rotator), mean used"
                },
                "info": {
                  "basic": "Atlas is not a sister but their father, the Titan condemned to hold up the sky — fitting company for stars fixed in it.",
                  "scientific": {
                    "class": "B8 III blue-white giant",
                    "temperature": "About 12,500 K",
                    "mass": "Roughly 5 times the Sun",
                    "feature": "A triple system"
                  }
                }
              },
              {
                "id": "pleione",
                "name": "Pleione",
                "designation": "28 Tauri",
                "isMajor": false,
                "position2D": {
                  "x": -3.6,
                  "y": -0.527
                },
                "distance": 450,
                "magnitude": 5.05,
                "spectralClass": "B8Vne",
                "color": "#a8bcff",
                "size": 0.05,
                "stellarType": "blue_white_main_sequence",
                "physics": {
                  "massSolar": 2.888,
                  "radiusSolar": 4.17,
                  "tempKelvin": 11058,
                  "note": "Primary; Be shell star, variable between about 4.77 and 5.50 mag, 5.05 used as representative"
                },
                "info": {
                  "basic": "Pleione is the mother of the sisters, and the cluster takes its name from her. She sits so close to Atlas that the two look like one star to most eyes.",
                  "scientific": {
                    "class": "B8 V shell star",
                    "temperature": "About 11,100 K",
                    "mass": "Roughly 2.9 times the Sun",
                    "feature": "Throws off shells of gas periodically, changing brightness as it does"
                  }
                }
              }
            ],
            "connections": [
              {
                "from": "atlas",
                "to": "pleione",
                "type": "body"
              },
              {
                "from": "atlas",
                "to": "alcyone",
                "type": "body"
              },
              {
                "from": "alcyone",
                "to": "merope",
                "type": "body"
              },
              {
                "from": "merope",
                "to": "electra",
                "type": "body"
              },
              {
                "from": "electra",
                "to": "celaeno",
                "type": "body"
              },
              {
                "from": "celaeno",
                "to": "taygeta",
                "type": "body"
              },
              {
                "from": "taygeta",
                "to": "maia",
                "type": "body"
              },
              {
                "from": "maia",
                "to": "alcyone",
                "type": "body"
              },
              {
                "from": "maia",
                "to": "asterope",
                "type": "body"
              }
            ],
            "info": {
              "basic": "The Seven Sisters — daughters of Atlas and Pleione in Greek myth, and half-sisters of the Hyades. Nearly every culture that recorded them counted seven, yet most people see only six, and \"Lost Pleiad\" stories exist across the world to explain the missing one. Japan calls the cluster Subaru, \"to cluster together\"; Māori call it Matariki; pre-Islamic Arabia knew it as al-Thurayyā. Seven dots on the Nebra sky disc, buried in Germany around 1600 BC, are thought to be these stars.",
              "scientific": {
                "type": "Open cluster of over 1,000 stars, about 25% of them brown dwarfs",
                "distance": "About 444 light-years (Gaia DR3), settling a long dispute after Hipparcos measured a closer 385",
                "age": "Between 75 and 150 million years — lithium dating suggests about 115 million",
                "feature": "The blue haze around the brightest sisters is not left over from their birth: it is an unrelated dust cloud the cluster is passing through at about 18 km/s",
                "future": "Gravitational tugs from the galaxy will disperse it in roughly 250 million years"
              }
            },
            "sources": "Wikipedia, Pleiades; Hesiod, Works and Days; Homer, Iliad; MUL.APIN (by 627 BC); Riccioli, Astronomia Reformata (1665)"
          },
          {
            "id": "m1",
            "name": "Crab Nebula",
            "designation": "M1, NGC 1952",
            "type": "supernova_remnant",
            "layer": "none",
            "position2D": {
              "x": -3.413,
              "y": 0.922
            },
            "distance": 6500,
            "magnitude": 8.4,
            "size": 0.1,
            "description": "The wreckage of a star seen to explode on 4 July 1054, recorded by Chinese astronomers as a guest star bright enough to see in daylight. Not in the explorable layer: a supernova remnant is a filamentary web, which the gas-cloud generator does not honestly represent."
          }
        ],
        "journey": [
          {
            "id": "aldebaran",
            "title": "The Follower",
            "view": "2d",
            "centerStarName": "Aldebaran",
            "targetStarNames": [
              "Aldebaran"
            ],
            "story": "Aldebaran is the bull’s eye, and Arab astronomers named it for what it does rather than what it is: al-dabaran, \"the follower\". It rises behind the Pleiades and pursues them across the sky all night without ever catching them. To the early Hebrews Taurus was the first constellation of the zodiac, represented by Aleph, the first letter. The eye is a deception, though. Aldebaran looks like the brightest member of the Hyades cluster spread around it, but it is not a member at all — it sits 65 light-years away, less than half the cluster’s distance, and merely happens to fall along the same line of sight.",
            "sources": "Wikipedia, Taurus (constellation); Wikipedia, Hyades (star cluster)"
          },
          {
            "id": "hyades",
            "title": "The Rainy Sisters",
            "view": "2d",
            "centerStarName": "Prima Hyadum",
            "targetStarNames": [
              "Prima Hyadum",
              "Secunda Hyadum",
              "Ain",
              "Chamukuy"
            ],
            "story": "The V that forms the bull’s face is the Hyades, the nearest open cluster to us and one of the best studied. In Greek myth they were five daughters of Atlas and half-sisters of the Pleiades; when their brother Hyas died they wept without stopping and were set in the sky, where their rising came to mean rain. England kept the same association under a plainer name, calling them the April Rainers in the folk song Green Grow the Rushes, O. Homer put them on the shield of Achilles in Book 18 of the Iliad. The names of the two brightest carry the order they were seen in: Gamma is Prima Hyadum, the first of the Hyades, and Delta is Secunda Hyadum, the second.",
            "sources": "Wikipedia, Hyades (star cluster); Homer, Iliad, Book 18"
          },
          {
            "id": "bull_of_heaven",
            "title": "The Bull of Heaven",
            "view": "2d",
            "centerStarName": "Aldebaran",
            "targetStarNames": [
              "Aldebaran",
              "Prima Hyadum",
              "Elnath"
            ],
            "story": "This is one of the oldest figures in the sky, and the stories agree it is a bull even when they agree on nothing else. Babylonian astronomy called it GU4.AN.NA, the Bull of Heaven; in the Epic of Gilgamesh, Ishtar sends that bull to kill Gilgamesh for refusing her, and Enkidu tears off its hindquarters and hurls them into the sky — which is why the figure has no back half. Greek writers made it Zeus, who took the form of a white bull to carry off the Phoenician princess Europa, or else Io, whom Zeus turned into a heifer to hide her from Hera; Acusilaus identified it instead with the Cretan Bull of Heracles. In Egypt the constellation vanished into the Sun’s glare as spring began, and that sacrifice was read as the renewal of the land.",
            "sources": "Wikipedia, Taurus (constellation); Epic of Gilgamesh; Acusilaus"
          },
          {
            "id": "guest_star",
            "title": "The Guest Star of 1054",
            "view": "2d",
            "centerStarName": "Tianguan",
            "targetStarNames": [
              "Tianguan"
            ],
            "story": "On 4 July 1054 a star appeared beside the southern horn and reached magnitude −4 — bright enough to be seen in broad daylight. Chinese historical texts recorded it as a guest star. It was not only watched from China: a painting in a New Mexico canyon and pottery from the same period appear to depict the event. Then it faded, and nobody knew what had been there until John Bevis found a small smudge in the same place in 1731. That smudge is the Crab Nebula, the expanding wreckage of the star that exploded, now magnitude 8.4 and needing a telescope. It is one of the very few objects in the sky whose exact birthday is written down.",
            "sources": "Wikipedia, Taurus (constellation); Chinese historical records of SN 1054"
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

  // Push the visit counts onto the HUD. Called after the header exists, whenever a star or
  // deep-sky object is discovered.
  refreshExploredCounts() {
    const header = document.querySelector('#portal-header')
    if (!header || !this.constellationData) return
    const cid = this.data.constellationFile
    const stars = this.constellationData.stars || []
    const objects = (this.constellationData.deepSkyObjects || [])
      .filter(o => resolveLayer(o) !== 'none')

    header.setAttribute('portal-header', {
      starsExplored: defaultStore.countVisited(cid, stars.map(s => s.id)),
      starCount: stars.length,
      deepSkyExplored: defaultStore.countVisited(cid, objects.map(o => o.id)),
      deepSkyTotal: objects.length,
    })
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
    this.shaftFrontZ = frontZ

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
    faceText(label)
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
      // The spec: layer missing means derive it from type; unrecognised means none.
      // Shared with deep-sky-layer.enter(), so a marker exists exactly when entry works.
      const layer = resolveLayer(obj)
      if (layer === 'none') return
      // A marked object with no position cannot be placed. Skipping it costs one marker;
      // letting it through throws right below, and during a cluster restore that strands
      // the layer over a half-rebuilt figure with no way back.
      if (!obj.position2D) {
        console.warn('[constellation-loader] deep-sky object has no position2D, skipping:', obj.id)
        return
      }

      const entity = document.createElement('a-entity')
      // One size for every deep-sky marker, everywhere. Angular size used to drive this,
      // but the Pleiades' 2 degrees produced a ring four times a bright star's radius, with
      // a hitbox that outranked every star beneath it. The ring is only a signpost - tapping
      // it zooms into the object - so it need not represent the object's true extent.
      const radius = 0.22
      // "Once visited, the ring dims" - seeded here so it survives a reload, and kept
      // in step during the session by deep-sky-layer.dimMarker().
      entity.setAttribute('deep-sky-marker', {
        radius,
        visited: defaultStore.isVisited(this.data.constellationFile, obj.id),
      })

      const label = document.createElement('a-entity')
      label.setAttribute('billboard', '')
      const text = document.createElement('a-text')
      text.setAttribute('value', obj.name)
      text.setAttribute('align', 'center')
      text.setAttribute('position', `0 ${radius + 0.22} 0.02`)
      text.setAttribute('scale', '1.5 1.5 1.5')
      text.setAttribute('color', '#bfe4ff')
      text.setAttribute('width', '3')
      faceText(text)
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

  // True while the deep-sky layer has the constellation's OWN stars hidden behind a
  // field. three.js r137's Raycaster does not skip invisible objects and A-Frame 1.3.0
  // adds no visibility filter, so a hidden star's collision sphere still reports hits;
  // every consumer of a star tap has to ask. A cluster replaces the figure rather than
  // hiding it, so its stars stay tappable. Guards for the component being absent.
  deepSkyHidingStars() {
    const el = document.querySelector('[deep-sky-layer]')
    const c = el && el.components && el.components['deep-sky-layer']
    return !!(c && c.isActive() && c.suppressesStarTaps())
  },

  setupInteractions() {
    this.stars.forEach((starEntity) => {
      const collisionSphere = starEntity.querySelector('a-sphere.cantap')
      const starCore = starEntity.querySelector('a-sphere:not(.cantap)')

      if (collisionSphere) {
        collisionSphere.addEventListener('click', () => {
          if (this.deepSkyHidingStars()) return
          if (!this.isAnimating) {
            this.pulseStarOnSelect(starCore, collisionSphere)
            // Entities carry the star's NAME in dataset.name, not its id, so look up by name.
            const record = (this.constellationData.stars || [])
              .find(s => s.name === starEntity.dataset.name)
            if (record && defaultStore.mark(this.data.constellationFile, record.id)) {
              this.refreshExploredCounts()
              // A cluster completes when every one of its stars is visited, and this is
              // the only moment that answer can change. deep-sky-layer listens while a
              // cluster is open. Payload: {constellation, id} - both plain strings.
              this.el.sceneEl.emit('starVisited', {
                constellation: this.data.constellationFile, id: record.id,
              })
            }
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
      const base = comp.data.radius
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
    this.setConstellationFile(constellationName)

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
    this.el.sceneEl.removeEventListener('deepSkyVisited', this.onExploredChanged)
    this.el.sceneEl.removeEventListener('deepSkyEntered', this.onExploredChanged)
    this.el.sceneEl.removeEventListener('deepSkyExited', this.onExploredChanged)
    this.clearConstellation()
  },
}

export {constellationLoaderComponent}
