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

  showInfo(name, info, starColor, starSize, starType, designation) {
    this.currentStarName = name

    this.header.innerHTML = `
      <h2 style="margin: 0; color: ${this.data.borderColor}; font-size: 18px;">
        ${name}
      </h2>
      ${designation ? `<div style="margin: 2px 0 0 0; font-size: 12px; opacity: 0.75;">${designation}</div>` : ''}
    `
    this.content.innerHTML = this.formatStarInfo(info)

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
