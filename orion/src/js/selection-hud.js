// js/selection-hud.js - the ring that lands on the star you tapped.
//
// Until now a tapped star only pulsed its own sphere for half a second (constellation-loader
// handleStarClick), and then nothing on screen said which star the open card belonged to. On a
// figure with a dozen stars that is a real question, and the card cannot answer it.
//
// So: one hud-element, moved under whichever star is selected. One, not one per star - there is
// only ever a single selection, and a new element per tap would mean a new shader program
// compiled mid-session, which is exactly the hitch you feel as a dropped frame.
//
// It parents under the star's own entity, which means it inherits everything for free: the
// figure's rotation, the 2D/3D toggle's position animation, and the hide when a deep-sky object
// is entered. Nothing here has to track any of that.

const HUD_PRESET = 'target'

const selectionHudComponent = {
  schema: {
    color: {type: 'color', default: '#8fd8ff'},
    // The ring's radius as a multiple of the star's own. Wide enough to sit clear of the star's
    // glow, tight enough not to touch its neighbours on a crowded figure.
    scale: {type: 'number', default: 3.2},
  },

  init() {
    this.current = null
    this.ensureHud()

    this.onStar = this.onStar.bind(this)
    this.onClosed = this.onClosed.bind(this)
    this.el.sceneEl.addEventListener('starInfoRequested', this.onStar)
    this.el.sceneEl.addEventListener('starInfoClosed', this.onClosed)
    // Inside a deep-sky object the constellation is hidden, and a ring left on a hidden star
    // would come back with it later still showing a selection that has been forgotten.
    this.el.sceneEl.addEventListener('deepSkyEntered', this.onClosed)
  },

  // The element lives on the scene between selections, and is rebuilt if it ever goes missing.
  // It has to be: entering a cluster calls swapFigure, which empties the rotating container and
  // takes any child of a star with it - including this, if it was still parented to one.
  ensureHud() {
    if (this.hud && this.hud.isConnected) return this.hud
    this.hud = document.createElement('a-entity')
    this.hud.classList.add('selection-hud')
    this.hud.setAttribute('hud-element', {
      preset: HUD_PRESET,
      radius: 0.3,
      color: this.data.color,
      visible: false,
    })
    this.el.sceneEl.appendChild(this.hud)
    this.current = null
    return this.hud
  },

  onStar(event) {
    const detail = event && event.detail
    if (!detail || !detail.starName) return
    // data-name is not stars-only - deep-sky markers carry one too. What makes an entity a star
    // is that it has a drawn core, so ask for that rather than trusting the name.
    const named = document.querySelectorAll(`[data-name="${CSS.escape(detail.starName)}"]`)
    let star = null
    named.forEach((el) => { if (!star && el.querySelector('a-sphere:not(.cantap)')) star = el })
    if (!star) return
    this.ensureHud()

    // The star's drawn radius, so the ring fits the star it is on rather than every star equally.
    const size = Number(detail.starSize) || 0.1
    this.hud.setAttribute('hud-element', {
      preset: HUD_PRESET,
      radius: size * this.data.scale,
      color: detail.starColor || this.data.color,
      // A brighter star reads as a fuller value ring - the one number the element already has
      // somewhere honest to take it from.
      value: Math.max(0.12, Math.min(1, size / 0.22)),
      visible: true,
    })
    if (this.current !== star) {
      star.appendChild(this.hud)      // appendChild moves it; there is never a second one
      this.current = star
    }
  },

  onClosed() {
    if (!this.hud || !this.hud.isConnected) return
    this.hud.setAttribute('hud-element', 'visible', false)
    // Left parented where it is: the element fades out over its own ramp, and moving it in the
    // same frame as hiding it would drag a visible ring across the sky.
  },

  remove() {
    this.el.sceneEl.removeEventListener('starInfoRequested', this.onStar)
    this.el.sceneEl.removeEventListener('starInfoClosed', this.onClosed)
    this.el.sceneEl.removeEventListener('deepSkyEntered', this.onClosed)
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud)
    this.hud = null
    this.current = null
  },
}

export {selectionHudComponent}
export default selectionHudComponent
