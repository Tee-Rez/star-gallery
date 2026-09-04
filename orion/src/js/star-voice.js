// js/star-voice.js
// One star's voice. Additive synthesis: a handful of sine partials, with the fundamental split
// into a detuned triplet whose interference is the shimmer.
//
// The Unity build hand-rolls a sample loop with its own sine table because Unity makes you own
// the audio thread. The browser already owns it, so this is an OscillatorNode graph instead -
// and `detune` is natively in cents, so the rotation-splitting parameter transfers literally.
import {heat} from './star-tone'

class StarVoice {
  constructor(ctx, destination) {
    this.ctx = ctx
    this.starId = null
    this.pitchHz = 0
    this.oscillators = []

    // Per-voice gain, then a panner so the tone comes from where the star is.
    this.gain = ctx.createGain()
    this.gain.gain.value = 0

    this.panner = ctx.createPanner()
    this.panner.panningModel = 'equalpower'
    this.panner.distanceModel = 'inverse'
    this.panner.refDistance = 1.5
    this.panner.maxDistance = 40

    this.gain.connect(this.panner)
    this.panner.connect(destination)
  }

  get isFree() { return this.starId === null }

  // Builds the partial stack. Hotter stars carry more overtones; cool red ones stay close to a
  // pure sine. Amplitudes are normalised so a bright star is not simply louder than a dim one.
  configure(opts) {
    this.stopOscillators()

    const {pitchHz, tempKelvin, maxPartials, beatCents} = opts
    this.pitchHz = pitchHz

    const h = heat(tempKelvin)
    const partials = Math.max(1, Math.min(maxPartials,
      Math.round(1 + (maxPartials - 1) * (0.3 + h * 0.7))))

    const specs = []
    let total = 0
    for (let p = 1; p <= partials; p++) {
      const a = 1 / Math.pow(p, 1.7)
      const f = pitchHz * p
      if (p === 1 && beatCents > 0.01) {
        // Rotation splits the fundamental: prograde waves shift up, retrograde down.
        specs.push({f, a: a / 3, detune: 0})
        specs.push({f, a: a / 3, detune: beatCents})
        specs.push({f, a: a / 3, detune: -beatCents})
      } else {
        specs.push({f, a, detune: 0})
      }
      total += a
    }

    specs.forEach((s) => {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = s.f
      osc.detune.value = s.detune
      const g = this.ctx.createGain()
      g.gain.value = total > 0 ? s.a / total : 0
      osc.connect(g)
      g.connect(this.gain)
      osc.start()
      this.oscillators.push(osc)
    })
  }

  setPosition(x, y, z) {
    // positionX/Y/Z are AudioParams in current browsers; older ones only have setPosition.
    if (this.panner.positionX) {
      this.panner.positionX.value = x
      this.panner.positionY.value = y
      this.panner.positionZ.value = z
    } else {
      this.panner.setPosition(x, y, z)
    }
  }

  // setTargetAtTime is an exponential approach; a time constant of seconds/3 lands within a few
  // percent of the target after `seconds`, which matches Unity's per-sample glide closely enough.
  fadeIn(gain, seconds) {
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setTargetAtTime(gain, now, Math.max(0.01, seconds) / 3)
  }

  fadeOut(seconds) {
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setTargetAtTime(0, now, Math.max(0.01, seconds) / 3)
  }

  stopOscillators() {
    this.oscillators.forEach((o) => {
      try { o.stop() } catch (e) { /* already stopped */ }
      o.disconnect()
    })
    this.oscillators = []
  }

  stop() {
    this.stopOscillators()
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    this.gain.gain.value = 0
    this.starId = null
    this.pitchHz = 0
  }
}

export {StarVoice}
export default StarVoice
