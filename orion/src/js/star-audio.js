// js/star-audio.js
// Owns the AudioContext, the master gain and a pool of voices, and turns a star's data into a
// sounding tone. Attached to the scene; the info panel and the lore journey call into it.
//
// Nothing here plays on its own. Audio happens because the Starsong tab asked for it, or
// because a journey stop arrived.
import {StarVoice} from './star-voice'
import {physicsFor} from './star-physics'
import {nuMaxMicroHz, toPitchHz, quantize} from './star-tone'

const starAudioComponent = {
  schema: {
    baseHz: {type: 'number', default: 110},
    octaves: {type: 'int', default: 2},
    maxPartials: {type: 'int', default: 4},
    beatCents: {type: 'number', default: 6},
    voiceGain: {type: 'number', default: 0.18},
    attack: {type: 'number', default: 1.2},
    release: {type: 'number', default: 2.0},
    // Phones are already running SLAM, camera and bloom, so they get a smaller budget.
    maxVoices: {type: 'int', default: 0},  // 0 = choose from the device
  },

  init() {
    this.ctx = null
    this.master = null
    this.voices = []
    this.playing = new Map()   // starId -> voice
    this.range = null          // {min, max} nu_max across the loaded constellation

    const coarse = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    this.voiceBudget = this.data.maxVoices > 0 ? this.data.maxVoices : (coarse ? 6 : 12)

    // Browsers refuse to start audio without a gesture. The tap that places the portal is one,
    // and the Starsong buttons call unlock() too as a backstop.
    this.onGesture = this.unlock.bind(this)
    window.addEventListener('touchend', this.onGesture, {once: true})
    window.addEventListener('mousedown', this.onGesture, {once: true})
  },

  isAvailable() {
    return typeof (window.AudioContext || window.webkitAudioContext) === 'function'
  },

  // Safe to call repeatedly; creates the context on first use and resumes it if suspended.
  unlock() {
    if (!this.isAvailable()) return false
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx.state !== 'suspended'
  },

  // Compress needs the constellation's own nu_max span so its stars keep their relative order.
  computeRange(stars) {
    let min = Infinity
    let max = -Infinity
    stars.forEach((s) => {
      const p = physicsFor(s)
      const nu = nuMaxMicroHz(p.massSolar, p.radiusSolar, p.tempKelvin)
      if (nu > 0) { min = Math.min(min, nu); max = Math.max(max, nu) }
    })
    this.range = (min < max) ? {min, max} : {min: 1, max: 1e4}
    return this.range
  },

  loadedStars() {
    const el = document.querySelector('[constellation-loader]')
    const loader = el && el.components['constellation-loader']
    return (loader && loader.constellationData && loader.constellationData.stars) || []
  },

  pitchFor(star, opts) {
    const o = opts || {}
    const mapping = o.mapping || 'compress'
    const scale = o.scale || 'pentatonic'
    if (!this.range) this.computeRange(this.loadedStars().length ? this.loadedStars() : [star])
    const p = physicsFor(star)
    const nu = nuMaxMicroHz(p.massSolar, p.radiusSolar, p.tempKelvin)
    const hz = toPitchHz(nu, this.range.min, this.range.max, mapping, this.data.baseHz, this.data.octaves)
    return quantize(hz, this.data.baseHz, scale)
  },

  // What the Starsong tab shows: both renderings and the physics they came from.
  describe(star) {
    return {
      physics: physicsFor(star),
      pitchHz: this.pitchFor(star, {mapping: 'compress', scale: 'pentatonic'}),
      truePitchHz: this.pitchFor(star, {mapping: 'fold', scale: 'true'}),
    }
  },

  acquireVoice() {
    const free = this.voices.find(v => v.isFree)
    if (free) return free
    if (this.voices.length < this.voiceBudget) {
      const v = new StarVoice(this.ctx, this.master)
      this.voices.push(v)
      return v
    }
    // Pool exhausted: steal the oldest sounding voice, as the Unity build does.
    const oldestId = this.playing.keys().next().value
    const stolen = this.playing.get(oldestId)
    this.playing.delete(oldestId)
    stolen.stop()
    return stolen
  },

  playStar(star, opts) {
    if (!this.unlock()) return
    const o = opts || {}
    const gain = (o.gainScale === undefined ? 1 : o.gainScale) * this.data.voiceGain

    this.stopStar(star.id)
    const voice = this.acquireVoice()
    const p = physicsFor(star)
    voice.starId = star.id
    voice.configure({
      pitchHz: this.pitchFor(star, o),
      tempKelvin: p.tempKelvin,
      maxPartials: this.data.maxPartials,
      beatCents: this.data.beatCents,
    })

    const el = document.querySelector('[data-name="' + star.name + '"]')
    if (el && el.object3D && typeof THREE !== 'undefined') {
      const v = new THREE.Vector3()
      el.object3D.getWorldPosition(v)
      voice.setPosition(v.x, v.y, v.z)
    }

    this.playing.set(star.id, voice)
    voice.fadeIn(gain, this.data.attack)

    // hold, then fade to silence; omit `hold` to leave it sounding until stopped.
    if (o.hold > 0) {
      setTimeout(() => {
        if (this.playing.get(star.id) === voice) this.stopStar(star.id)
      }, (this.data.attack + o.hold) * 1000)
    }
  },

  // Group stops sound together. Quantizing to a scale is what stops this clashing.
  playChord(stars, opts) {
    const o = Object.assign({gainScale: 0.7}, opts || {})
    stars.forEach(s => this.playStar(s, o))
  },

  stopStar(id) {
    const voice = this.playing.get(id)
    if (!voice) return
    this.playing.delete(id)
    voice.fadeOut(this.data.release)
    setTimeout(() => {
      // Only release it if nothing has claimed the voice again in the meantime.
      if (!this.playing.has(voice.starId)) voice.stop()
    }, this.data.release * 1000 + 100)
  },

  stopAll() {
    Array.from(this.playing.keys()).forEach(id => this.stopStar(id))
  },

  remove() {
    window.removeEventListener('touchend', this.onGesture)
    window.removeEventListener('mousedown', this.onGesture)
    this.stopAll()
    this.voices.forEach(v => v.stop())
    this.voices = []
    if (this.ctx) this.ctx.close()
  },
}

export {starAudioComponent}
