const coachingOverlay = {
  schema: {
    targetImage: {type: 'string', default: ''},
    promptText: {type: 'string', default: 'Point your camera at the target image'},
  },

  init() {
    // Create main overlay container
    this.overlay = document.createElement('div')
    this.overlay.setAttribute('id', 'custom-coaching-overlay')
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      box-sizing: border-box;
    `

    // Create content container with hint-controller styling
    const contentContainer = document.createElement('div')
    contentContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #4287f5;
      border-radius: 20px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      backdrop-filter: blur(5px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    `

    // Image container
    const imageContainer = document.createElement('div')
    imageContainer.style.cssText = `
      width: 100%;
      max-width: 300px;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      padding: 15px;
    `

    const image = new Image()
    image.onload = () => {
      image.style.cssText = `
        max-width: 100%;
        max-height: 250px;
        object-fit: contain;
        border-radius: 8px;
      `
      imageContainer.appendChild(image)
    }
    image.onerror = () => {
      console.error('Failed to load image:', this.data.targetImage)
      const errorText = document.createElement('p')
      errorText.textContent = 'Target Image'
      errorText.style.cssText = `
        color: #4287f5;
        font-size: 18px;
        margin: 0;
      `
      imageContainer.appendChild(errorText)
    }

    // Check if targetImage is an asset ID
    const assetEl = document.getElementById(this.data.targetImage)
    if (assetEl && assetEl.tagName === 'IMG') {
      image.src = assetEl.src
    } else {
      image.src = this.data.targetImage
    }

    // Text container
    this.textContainer = document.createElement('div')
    this.textContainer.style.cssText = `
      width: 100%;
      text-align: center;
    `

    this.promptText = document.createElement('p')
    this.promptText.textContent = this.data.promptText
    this.promptText.style.cssText = `
      color: white;
      font-size: 18px;
      font-family: Arial, sans-serif;
      text-align: center;
      margin: 0;
      line-height: 1.5;
    `

    // Assemble the structure
    this.textContainer.appendChild(this.promptText)
    contentContainer.appendChild(imageContainer)
    contentContainer.appendChild(this.textContainer)
    this.overlay.appendChild(contentContainer)
    document.body.appendChild(this.overlay)

    // Event listeners
    this.el.sceneEl.addEventListener('xrimagefound', this.handleImageFound.bind(this))
    this.el.sceneEl.addEventListener('xrimageupdated', this.hideOverlay.bind(this))
    this.el.sceneEl.addEventListener('xrimagelost', this.showOverlay.bind(this))
  },

  update(oldData) {
    if (this.promptText && this.data.promptText !== oldData.promptText) {
      this.promptText.textContent = this.data.promptText
    }
  },

  handleImageFound() {
    this.hideOverlay()
    localStorage.setItem('hasSeenCoachingOverlay', 'true')
    this.hasSeenOverlay = true
  },

  hideOverlay() {
    if (this.overlay) {
      this.overlay.style.display = 'none'
    }
  },

  showOverlay() {
    if (this.overlay && !this.hasSeenOverlay) {
      this.overlay.style.display = 'flex'
    }
  },
}

export {coachingOverlay}
