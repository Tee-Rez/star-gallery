// star-info-overlay.js
// The star reading panel, laid out to match the Unity build (Portal.prefab -> PortalInfo).
//
// Unity draws a 1300x1900 portrait card: star name, designation, a separator rule, then the
// content, with the close button in the top-right corner. This keeps that arrangement and
// those proportions, but stays a DOM overlay rather than a world-space panel -- moving it
// into the scene would be a rewrite, not a layout change.
//
// Unity's Info/Sound tabs are deliberately absent: the web build has no star audio and no
// stellar physics in its data, so there is only one tab's worth of content to show.
const PANEL_ASPECT = '1300 / 1900'  // Unity's PortalInfo proportions

const starInfoOverlayComponent = {
  schema: {
    width: {type: 'number', default: 300},
    backgroundColor: {type: 'string', default: 'rgba(0, 0, 0, 0.8)'},
    borderColor: {type: 'string', default: '#4287f5'},
    borderWidth: {type: 'number', default: 2},
    fadeSpeed: {type: 'number', default: 350},  // Unity's StarInfoPanel fadeDuration
    padding: {type: 'number', default: 15},
  },

  init() {
    // Portrait card, vertically centred against the constellation rather than tucked into
    // the bottom corner, so it reads the way the Unity panel does beside the portal.
    this.overlay = document.createElement('div')
    this.overlay.id = 'star-info-overlay'
    this.overlay.style.cssText = `
      position: fixed;
      left: 15px;
      top: 50%;
      transform: translateY(-50%);
      width: min(${this.data.width}px, 46vw);
      aspect-ratio: ${PANEL_ASPECT};
      max-height: 72vh;
      background: ${this.data.backgroundColor};
      border: ${this.data.borderWidth}px solid ${this.data.borderColor};
      border-radius: 10px;
      padding: ${this.data.padding}px;
      color: white;
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${this.data.fadeSpeed}ms ease, visibility 0s linear ${this.data.fadeSpeed}ms;
      z-index: 1000;
      backdrop-filter: blur(5px);
      margin: 0;
      box-sizing: border-box;
      pointer-events: none;
    `

    const scrollbarStyle = document.createElement('style')
    scrollbarStyle.textContent = `
      #star-info-content::-webkit-scrollbar {
        width: 8px;
      }
      #star-info-content::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.3);
        border-radius: 10px;
      }
      #star-info-content::-webkit-scrollbar-thumb {
        background: ${this.data.borderColor};
        border-radius: 10px;
      }
      #star-info-content::-webkit-scrollbar-thumb:hover {
        background: #5c9aff;
      }
    `
    document.head.appendChild(scrollbarStyle)
    this.scrollbarStyle = scrollbarStyle

    // Header block: name, designation, separator -- Unity's top ~16% of the card.
    this.header = document.createElement('div')
    this.header.style.cssText = `
      flex: 0 0 auto;
      border-bottom: 1px solid rgba(255,255,255,0.25);
      padding-bottom: 8px;
      margin-bottom: 10px;
      padding-right: 28px;
    `
    this.overlay.appendChild(this.header)

    // Content fills the rest and scrolls on its own, so the header never scrolls away.
    this.content = document.createElement('div')
    this.content.id = 'star-info-content'
    this.content.style.cssText = `
      flex: 1 1 auto;
      overflow-y: auto;
      line-height: 1.4;
      font-size: 13px;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: ${this.data.borderColor} rgba(0,0,0,0.3);
    `
    this.overlay.appendChild(this.content)

    document.body.appendChild(this.overlay)

    // Bind methods
    this.showInfo = this.showInfo.bind(this)
    this.hideInfo = this.hideInfo.bind(this)
    this.handleStarClick = this.handleStarClick.bind(this)
    this.handleInfoClosed = this.handleInfoClosed.bind(this)

    this.createCloseButton()

    this.el.sceneEl.addEventListener('click', this.handleStarClick)

    // Listen for close events from dynamic star
    this.el.sceneEl.addEventListener('starInfoClosed', this.handleInfoClosed)

    // Initial state
    this.isVisible = false
  },

  createCloseButton() {
    const closeButton = document.createElement('div')
    closeButton.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 28px;
      height: 28px;
      background: rgba(0,0,0,0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 1001;
    `
    closeButton.innerHTML = '✕'
    closeButton.addEventListener('click', (event) => {
      this.hideInfo()
      event.stopPropagation()
    })
    this.overlay.appendChild(closeButton)
    this.closeButton = closeButton
  },

  handleStarClick(event) {
    const clickedEl = event.detail.intersectedEl
    if (!clickedEl || !clickedEl.matches('a-sphere.cantap')) return

    // If it's the dynamic star that was clicked, just hide
    if (clickedEl.closest('#dynamic-star')) {
      this.hideInfo()
      return
    }

    const starEntity = clickedEl.parentElement
    if (!starEntity) return

    const starName = starEntity.dataset.name
    const starInfo = starEntity.dataset.info
    const starDesignation = starEntity.dataset.designation

    if (starName && starInfo) {
      event.stopPropagation()

      if (this.isVisible && this.currentStarName === starName) {
        this.hideInfo()
      } else {
        // Get color and size information for dynamic star
        let starColor; let starSize; let
          starType

        // Get color from the visible star core (not the collision sphere)
        const starCore = starEntity.querySelector('a-sphere:not(.cantap)')
        if (starCore) {
          starColor = starCore.getAttribute('material').color
          starSize = parseFloat(starCore.getAttribute('radius') || 0.1)

          // Determine star type from color
          if (starColor.includes('ff44') || starColor.includes('ff00')) {
            starType = 'red'
          } else if (starColor.includes('44') || starColor.includes('aaf') || starColor.includes('bbf')) {
            starType = 'blue'
          } else {
            starType = 'white'
          }
        }

        this.showInfo(starName, starInfo, starColor, starSize, starType, starDesignation)
      }
    }
  },

  // The panel is handed strings, but the tone needs the star's own record - its spectral class
  // and any physics block. Looking it up by name here avoids threading the object through every
  // caller just for this one pane.
  starRecord(name) {
    const el = document.querySelector('[constellation-loader]')
    const loader = el && el.components['constellation-loader']
    const stars = (loader && loader.constellationData && loader.constellationData.stars) || []
    return stars.find(s => s.name === name) || null
  },

  starAudio() {
    const scene = this.el.sceneEl || document.querySelector('a-scene')
    return scene && scene.components['star-audio']
  },

  buildStarsongPane(name) {
    const audio = this.starAudio()
    const star = this.starRecord(name)

    if (!audio || !audio.isAvailable()) {
      return '<p style="opacity:.7;font-size:12px;">Audio is not available in this browser.</p>'
    }
    if (!star) {
      return '<p style="opacity:.7;font-size:12px;">No tone data for this star.</p>'
    }

    const d = audio.describe(star)
    const btn = 'width:100%;padding:10px;border:1px solid ' + this.data.borderColor +
      ';border-radius:8px;color:#eaf3ff;font-size:14px;cursor:pointer;'

    return `
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.5;">
        This tone comes from the star itself. Its size sets the pitch, and its surface
        temperature of about <b>${Math.round(d.physics.tempKelvin)} K</b> sets how bright the
        overtones are.
      </p>
      <div style="font-size:12px;margin-bottom:12px;line-height:1.6;">
        <div>Pitch: <b>${d.pitchHz.toFixed(1)} Hz</b></div>
        <div>True frequency: <b>${d.truePitchHz.toFixed(1)} Hz</b></div>
        <div style="opacity:.65;margin-top:6px;">
          ${d.physics.source === 'data'
            ? 'From measured values for this star.'
            : 'Estimated from its spectral class, so the tone is characteristic of the type rather than this individual star.'}
        </div>
      </div>
      <button data-starsong="musical" style="${btn}background:rgba(66,135,245,.25);margin-bottom:8px;">
        Play</button>
      <button data-starsong="true" style="${btn}background:rgba(0,0,0,.3);">
        True sound</button>
      <div style="margin-top:14px;padding-top:12px;
        border-top:1px solid rgba(255,255,255,0.2);">
        <div style="display:flex;justify-content:space-between;font-size:12px;
          margin-bottom:6px;opacity:.85;">
          <span>Volume</span><span data-volume-readout>${Math.round(audio.getVolume() * 100)}%</span>
        </div>
        <input data-volume type="range" min="0" max="100" step="1"
          value="${Math.round(audio.getVolume() * 100)}"
          style="width:100%;accent-color:${this.data.borderColor};">
      </div>`
  },

  // Rebound on every render, because the panel rewrites its body for each star.
  wireTabs(name) {
    this.content.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const want = btn.dataset.tab
        this.content.querySelectorAll('[data-pane]').forEach((pane) => {
          pane.style.display = pane.dataset.pane === want ? '' : 'none'
        })
        this.content.querySelectorAll('[data-tab]').forEach((b) => {
          b.style.background = b.dataset.tab === want ? 'rgba(66,135,245,.25)' : 'rgba(0,0,0,.3)'
        })
      })
    })

    // One shared level, so a change here shows up on every other star's slider. The panel
    // rebuilds per star and reads getVolume(), so nothing extra is needed to keep them in step.
    const slider = this.content.querySelector('[data-volume]')
    if (slider) {
      const readout = this.content.querySelector('[data-volume-readout]')
      const apply = (ev) => {
        ev.stopPropagation()
        const audio = this.starAudio()
        if (!audio) return
        const v = audio.setVolume(slider.value / 100)
        if (readout) readout.textContent = Math.round(v * 100) + '%'
      }
      slider.addEventListener('input', apply)
      // Dragging inside the panel must not reach the scene and place or select anything.
      slider.addEventListener('click', ev => ev.stopPropagation())
      slider.addEventListener('touchstart', ev => ev.stopPropagation())
      slider.addEventListener('mousedown', ev => ev.stopPropagation())
    }

    this.content.querySelectorAll('[data-starsong]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const audio = this.starAudio()
        const star = this.starRecord(name)
        if (!audio || !star) return
        audio.unlock()
        audio.playStar(star, btn.dataset.starsong === 'true'
          ? {mapping: 'fold', scale: 'true', hold: 2.5}
          : {mapping: 'compress', scale: 'pentatonic', hold: 2.5})
      })
    })
  },

  showInfo(name, info, starColor, starSize, starType, designation) {
    this.currentStarName = name

    this.header.innerHTML = `
      <h2 style="margin: 0; color: ${this.data.borderColor}; font-size: 18px;">
        ${name}
      </h2>
      ${designation ? `<div style="margin: 2px 0 0 0; font-size: 12px; opacity: 0.75;">${designation}</div>` : ''}
    `
    // Tabs mirror the Unity build's Info / Sound split. Starsong is opt-in: tapping a star
    // opens the panel but stays silent, and the tone only sounds when its button is pressed.
    this.content.innerHTML = `
      <div style="display:flex;gap:6px;margin:0 0 10px 0;">
        <button data-tab="info" style="flex:1;padding:6px;font-size:13px;cursor:pointer;
          border:1px solid ${this.data.borderColor};border-radius:6px;
          background:rgba(66,135,245,.25);color:#eaf3ff;">Info</button>
        <button data-tab="starsong" style="flex:1;padding:6px;font-size:13px;cursor:pointer;
          border:1px solid ${this.data.borderColor};border-radius:6px;
          background:rgba(0,0,0,.3);color:#eaf3ff;">Starsong</button>
      </div>
      <div data-pane="info">${this.formatStarInfo(info)}</div>
      <div data-pane="starsong" style="display:none;">${this.buildStarsongPane(name)}</div>`
    this.wireTabs(name)

    this.overlay.style.opacity = '1'
    this.overlay.style.visibility = 'visible'
    this.overlay.style.transition = `opacity ${this.data.fadeSpeed}ms ease, visibility 0s`
    this.overlay.style.pointerEvents = 'auto'
    this.isVisible = true

    // Scroll to top when showing new content
    this.content.scrollTop = 0

    // Emit an event with star details for dynamic star creation
    this.el.sceneEl.emit('starInfoRequested', {
      starName: name,
      starColor,
      starSize,
      starType,
    })
  },

  formatStarInfo(info) {
    // Split into paragraphs
    const paragraphs = info.split('\n\n')

    // Process each paragraph
    const processedParagraphs = paragraphs.map((paragraph) => {
      // Check if this is a bullet-point list
      if (paragraph.includes('• ')) {
        // Convert to a styled list
        const listItems = paragraph.split('• ').filter(item => item.trim() !== '')
        return `<ul style="list-style-type: none; padding-left: 0; margin: 8px 0;">${
          listItems.map(item => `<li style="margin-bottom: 5px; padding-left: 12px; position: relative;">
              <span style="position: absolute; left: 0; color: ${this.data.borderColor};">•</span>
              ${item.trim()}
            </li>`).join('')
        }</ul>`
      }

      // Regular paragraph
      return `<p style="margin: 0 0 10px 0;">${paragraph}</p>`
    })
    return processedParagraphs.join('')
  },

  hideInfo() {
    this.overlay.style.opacity = '0'
    this.overlay.style.transition =
      `opacity ${this.data.fadeSpeed}ms ease, visibility 0s linear ${this.data.fadeSpeed}ms`
    this.overlay.style.visibility = 'hidden'
    this.overlay.style.pointerEvents = 'none'
    this.isVisible = false
    this.currentStarName = null

    // Emit an event to notify that star info was closed
    this.el.sceneEl.emit('starInfoClosed')

    setTimeout(() => {
      if (!this.isVisible) {
        this.header.innerHTML = ''
        this.content.innerHTML = ''
      }
    }, this.data.fadeSpeed)
  },

  handleInfoClosed() {
    // Only hide if not already hidden
    if (this.isVisible) {
      this.hideInfo()
    }
  },

  remove() {
    // Clean up all event listeners
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay)
    }
    if (this.scrollbarStyle && this.scrollbarStyle.parentNode) {
      this.scrollbarStyle.parentNode.removeChild(this.scrollbarStyle)
    }
    this.el.sceneEl.removeEventListener('click', this.handleStarClick)
    this.el.sceneEl.removeEventListener('starInfoClosed', this.handleInfoClosed)
  },
}

export {starInfoOverlayComponent}
