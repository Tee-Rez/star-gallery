// star-info-overlay.js
// The star reading panel, following the Unity build's arrangement (Portal.prefab -> PortalInfo):
// star name, designation, a separator rule, then the content, with the close button in the
// top-right corner, and Info / Starsong tabs mirroring Unity's Info / Sound.
//
// It sits in the bottom-left of the screen, in the HUD layer's card row (see hud-shell.js):
// wide - up to 92% of the screen, capped at 600px - and no taller than about 45% of the visible
// height, with the content scrolling inside. The layer shows one card at a time in that row, so
// it can no longer open on top of the lore journey's story card.
import {HUD} from './js/hud-shell'

const starInfoOverlayComponent = {
  schema: {
    width: {type: 'number', default: 300},
    backgroundColor: {type: 'string', default: 'transparent'},   // unused: .hud-card paints the glass
    borderColor: {type: 'string', default: '#c9a24a'},
    borderWidth: {type: 'number', default: 2},
    fadeSpeed: {type: 'number', default: 350},  // Unity's StarInfoPanel fadeDuration
    padding: {type: 'number', default: 15},
  },

  init() {
    this.overlay = document.createElement('div')
    this.overlay.id = 'star-info-overlay'
    // Width and height come from the layer's card rules (.hud-card); only the look is set here.
    this.overlay.className = 'hud-card'
    // The panel's look - the marble frame, the smoked glass behind the text and the colour of
    // that text - is .hud-card in hud-shell.js. The card is a nine-slice image, so its own
    // border IS the frame; setting a border here would draw a second one on top of it. Only
    // layout and the fade are set locally.
    this.overlay.style.cssText = `
      font-family: var(--hud-text, Arial, sans-serif);
      display: flex;
      flex-direction: column;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${this.data.fadeSpeed}ms ease, visibility 0s linear ${this.data.fadeSpeed}ms;
      margin: 0;
      pointer-events: none;
    `

    const scrollbarStyle = document.createElement('style')
    scrollbarStyle.textContent = `
      /* Chromium ignores this width while the standard scrollbar-width is also set on the
         element, so the thin metric is the UA's, not 8px. Kept for the colours below and for
         engines without scrollbar-width. On a phone scrollbars are overlay anyway and reserve
         no width at all, which is the case the panel's widths are budgeted against. */
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
        background: #e0bf72;
      }
    `
    document.head.appendChild(scrollbarStyle)
    this.scrollbarStyle = scrollbarStyle

    // Header block: name, designation, separator -- Unity's top ~16% of the card.
    // The rule under the header is the gold line the source artwork drew across the glass. It
    // was taken out of the image because a nine-slice stretches the middle, which pulled the
    // line's position around with the panel's height; as a border it sits under the title at
    // any size. .hud-rule owns the colour.
    this.header = document.createElement('div')
    this.header.className = 'hud-rule'
    this.header.style.cssText = `
      flex: 0 0 auto;
      padding-bottom: 8px;
      margin-bottom: 10px;
      padding-right: var(--orb-hit);
    `
    this.overlay.appendChild(this.header)

    // Content fills the rest and scrolls on its own, so the header never scrolls away.
    this.content = document.createElement('div')
    this.content.id = 'star-info-content'
    // "hidden auto", not "overflow-y: auto". Declaring only one axis is a trap: per CSS
    // Overflow 3, when one axis is not visible the other's `visible` computes to `auto`, so
    // the div was a scroll container SIDEWAYS too and any single stray pixel painted a
    // horizontal bar across the panel. One did - the volume slider's 2px UA margins, which
    // width:100% does not account for. That is fixed at the slider, but naming both axes here
    // is what stops the next mistuned control bringing the bar back.
    this.content.style.cssText = `
      flex: 1 1 auto;
      overflow: hidden auto;
      line-height: 1.4;
      font-size: var(--fs-body);
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: ${this.data.borderColor} rgba(0,0,0,0.3);
    `
    this.overlay.appendChild(this.content)

    HUD.mount(this.overlay, 'sheet', 'star-card')

    // Bind methods
    this.showInfo = this.showInfo.bind(this)
    this.hideInfo = this.hideInfo.bind(this)
    this.handleStarClick = this.handleStarClick.bind(this)
    this.handleInfoClosed = this.handleInfoClosed.bind(this)
    this.handleDeepSkyInfo = this.handleDeepSkyInfo.bind(this)

    this.createCloseButton()

    this.el.sceneEl.addEventListener('click', this.handleStarClick)

    // Listen for close events from dynamic star
    this.el.sceneEl.addEventListener('starInfoClosed', this.handleInfoClosed)

    // A deep-sky object's orb reuses this same panel instead of opening its own.
    this.el.sceneEl.addEventListener('deepSkyInfoRequested', this.handleDeepSkyInfo)

    // Initial state
    this.isVisible = false
  },

  createCloseButton() {
    // A real button, not a div with a click listener: the div had no accessible name, could
    // not be reached by keyboard, and did not fire on Enter or Space. The glyph is decorative
    // - it is the aria-label that says what this does.
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', 'Close')
    // .hud-orb draws a small marble disc in the middle of a full-size box: the disc is 28px so
    // it tucks into the card's corner, the box stays var(--tap) so the tap target is still the
    // 44px it was raised to from 28. Shrinking what you see is not the same as shrinking what
    // you can hit, and only the first was asked for.
    //
    // top/right are 0 because the box is bigger than the disc - the disc's own margin inside
    // the box already insets it from the corner by (tap - orb) / 2.
    closeButton.className = 'hud-orb'
    closeButton.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      --orb: 28px;
      z-index: 1001;
    `
    closeButton.innerHTML = '<span aria-hidden="true">✕</span>'
    closeButton.addEventListener('click', (event) => {
      this.hideInfo()
      event.stopPropagation()
    })
    this.overlay.appendChild(closeButton)
    this.closeButton = closeButton
  },

  // True while the deep-sky layer has the constellation's own stars hidden behind a field.
  // three.js r137's Raycaster does not skip invisible objects, so a hidden star's collision
  // sphere still reports hits; without this a tap through the field would replace this panel
  // with the star's, and closing that panel would fire the layer's own auto-return listener.
  // A cluster replaces the figure rather than hiding it, so its stars stay tappable.
  deepSkyHidingStars() {
    const el = document.querySelector('[deep-sky-layer]')
    const c = el && el.components && el.components['deep-sky-layer']
    return !!(c && c.isActive() && c.suppressesStarTaps())
  },

  handleStarClick(event) {
    const clickedEl = event.detail.intersectedEl
    if (!clickedEl || !clickedEl.matches('a-sphere.cantap')) return
    if (this.deepSkyHidingStars()) return

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
    // Deep-sky objects (M42, M31, ...) aren't in the constellation's star list, so there is
    // no record to synthesise a tone from -- no mass, radius or temperature, no nu_max. Return
    // empty rather than a placeholder pane; wireTabs uses that to omit the tab entirely.
    const rec = this.starRecord(name)
    if (!rec) return ''

    const audio = this.starAudio()

    if (!audio || !audio.isAvailable()) {
      return '<p style="opacity:.7;font-size:12px;">Audio is not available in this browser.</p>'
    }

    const d = audio.describe(rec)
    const btn = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + this.data.borderColor +
      ';border-radius:8px;color:#f2ece0;font-size:13px;cursor:pointer;'

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
      <button data-starsong="musical" style="${btn}background:rgba(201,162,74,.22);margin-bottom:8px;">
        Play</button>
      <button data-starsong="true" style="${btn}background:rgba(0,0,0,.3);">
        True sound</button>
      <div style="margin-top:14px;padding-top:12px;
        border-top:1px solid rgba(201,162,74,0.3);">
        <div style="display:flex;justify-content:space-between;font-size:12px;
          margin-bottom:6px;opacity:.85;">
          <span>Volume</span><span data-volume-readout>${Math.round(audio.getVolume() * 100)}%</span>
        </div>
        <input data-volume type="range" min="0" max="100" step="1"
          value="${Math.round(audio.getVolume() * 100)}"
          style="width:100%;margin:0;accent-color:${this.data.borderColor};">
      </div>`
  },

  // Rebound on every render, because the panel rewrites its body for each star.
  wireTabs(name) {
    // buildStarsongPane returns '' for a deep-sky object (no star record, so no tone) --
    // hide that tab rather than wiring clicks into an empty pane.
    const starsongPane = this.content.querySelector('[data-pane="starsong"]')
    const hasStarsong = !!(starsongPane && starsongPane.innerHTML.trim())
    if (!hasStarsong) {
      const starsongTab = this.content.querySelector('[data-tab="starsong"]')
      if (starsongTab) starsongTab.style.display = 'none'
    }

    this.content.querySelectorAll('[data-tab]').forEach((btn) => {
      if (!hasStarsong && btn.dataset.tab === 'starsong') return
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

  // A deep-sky object reuses the star panel, minus Starsong: with no mass, radius or
  // temperature there is no nu_max, so there is no tone to offer.
  handleDeepSkyInfo(e) {
    const d = (e && e.detail) || {}
    const info = d.info || {}
    let body = ''
    if (info.basic) body += info.basic
    if (info.scientific) body += (body ? '\n\n' : '') + info.scientific
    if (d.sources) body += (body ? '\n\n' : '') + 'Sources: ' + d.sources
    // Inside a nebula or galaxy the object itself is zoomed by deep-sky-layer, so the
    // stand-in star must not also fly in. A cluster's stars still get one.
    this.showInfo(d.name, body, '#8fd8ff', 0.3, 'deep_sky', d.designation || '', !!d.suppressStar)
  },

  showInfo(name, info, starColor, starSize, starType, designation, suppressStar) {
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
          border:1px solid ${this.data.borderColor};border-radius:6px;min-width:0;
          background:rgba(201,162,74,.22);color:#f2ece0;">Info</button>
        <button data-tab="starsong" style="flex:1;padding:6px;font-size:13px;cursor:pointer;
          border:1px solid ${this.data.borderColor};border-radius:6px;min-width:0;
          background:rgba(0,0,0,.3);color:#f2ece0;">Starsong</button>
      </div>
      <div data-pane="info">${this.formatStarInfo(info)}</div>
      <div data-pane="starsong" style="display:none;">${this.buildStarsongPane(name)}</div>`
    this.wireTabs(name)

    // The layer keeps a closed card out of the layout entirely, so open the row first and let
    // one layout pass happen at opacity 0 - otherwise there is nothing to fade in from.
    if (!this.isVisible) {
      HUD.setPanel(true)
      void this.overlay.offsetWidth
    }
    this.overlay.style.opacity = '1'
    this.overlay.style.visibility = 'visible'
    this.overlay.style.transition = `opacity ${this.data.fadeSpeed}ms ease, visibility 0s`
    this.overlay.style.pointerEvents = 'auto'
    this.isVisible = true

    // Scroll to top when showing new content
    this.content.scrollTop = 0

    // Emit an event with star details for dynamic star creation
    if (!suppressStar) {
      this.el.sceneEl.emit('starInfoRequested', {
        starName: name,
        starColor,
        starSize,
        starType,
      })
    }
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

    // The row closes after the fade, which is also when a lore story card underneath comes back.
    setTimeout(() => {
      if (!this.isVisible) {
        this.header.innerHTML = ''
        this.content.innerHTML = ''
        HUD.setPanel(false)
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
    this.el.sceneEl.removeEventListener('deepSkyInfoRequested', this.handleDeepSkyInfo)
  },
}

export {starInfoOverlayComponent}
