// js/gallery-back-button.js
// A screen-locked "back to the gallery" control in the top-left corner.
//
// It is a DOM overlay rather than a world-space entity for the same reason Recenter is: it has
// to stay reachable no matter where the constellation is or which way the phone is pointing.
// Styling follows the star-info panel (translucent black, #4287f5 border, blur), so the whole
// HUD reads as one system.
//
// It lives in the HUD layer's top row, left slot (see hud-shell.js), with Recenter in the right
// slot of the same row - side by side in one row, so they cannot overlap.
import {HUD} from './hud-shell'

const galleryBackButtonComponent = {
  schema: {
    // Where the gallery index lives, relative to this experience. In the hosted gallery each
    // constellation is served from its own folder, so the menu is one level up.
    menuUrl: {type: 'string', default: '../'},
    label: {type: 'string', default: 'Gallery'},
    accent: {type: 'color', default: '#4287f5'},
    fadeTime: {type: 'number', default: 300},
  },

  init() {
    this.handleClick = this.handleClick.bind(this)
    this.handleEnter = this.handleEnter.bind(this)
    this.handleLeave = this.handleLeave.bind(this)
    this.createButton()
  },

  createButton() {
    const d = this.data

    this.button = document.createElement('div')
    this.button.id = 'gallery-back-button'
    this.button.setAttribute('role', 'button')
    this.button.setAttribute('aria-label', 'Back to the constellation gallery')
    this.button.className = 'hud-pill'
    // Always showing, so always tappable. Size, spacing and the pill shape come from the layer.
    this.button.style.pointerEvents = 'auto'
    this.button.style.paddingInlineStart = 'calc(var(--tap) * 0.28)'
    this.button.style.borderColor = d.accent

    // Stylised chevron, drawn rather than typed so it keeps its weight at any size.
    this.button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 4 L7 12 L15 20" stroke="${d.accent}" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>${d.label}</span>
    `

    this.button.addEventListener('click', this.handleClick)
    this.button.addEventListener('touchend', this.handleClick)
    this.button.addEventListener('mouseenter', this.handleEnter)
    this.button.addEventListener('mouseleave', this.handleLeave)

    HUD.mount(this.button, 'top-start', 'gallery')
  },

  handleEnter() {
    this.button.style.background = 'rgba(66, 135, 245, 0.3)'
  },

  handleLeave() {
    this.button.style.background = 'rgba(0, 0, 0, 0.7)'
  },

  handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (this.navigating) return
    this.navigating = true
    window.location.href = this.data.menuUrl
  },

  remove() {
    if (this.button && this.button.parentNode) {
      this.button.removeEventListener('click', this.handleClick)
      this.button.removeEventListener('touchend', this.handleClick)
      this.button.removeEventListener('mouseenter', this.handleEnter)
      this.button.removeEventListener('mouseleave', this.handleLeave)
      this.button.parentNode.removeChild(this.button)
    }
  },
}

export {galleryBackButtonComponent}
