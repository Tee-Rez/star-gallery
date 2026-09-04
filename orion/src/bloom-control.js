// const bloomControlComponent = () => ({
//   init() {
//     const camera = document.querySelector('a-camera')

//     // Create container for slider
//     const container = document.createElement('a-entity')
//     container.setAttribute('position', '0 -0.9 -2')

//     // Create slider background
//     const sliderBg = document.createElement('a-plane')
//     sliderBg.setAttribute('width', '1')
//     sliderBg.setAttribute('height', '0.1')
//     sliderBg.setAttribute('color', '#2f2f2f')
//     container.appendChild(sliderBg)

//     // Create slider handle
//     const handle = document.createElement('a-plane')
//     handle.setAttribute('width', '0.05')
//     handle.setAttribute('height', '0.15')
//     handle.setAttribute('color', '#4287f5')
//     handle.setAttribute('position', '0 0 0.001')
//     handle.classList.add('clickable')
//     container.appendChild(handle)

//     // Create label
//     const label = document.createElement('a-text')
//     label.setAttribute('value', 'Bloom Intensity')
//     label.setAttribute('align', 'center')
//     label.setAttribute('position', '0 0.1 0')
//     label.setAttribute('scale', '0.25 0.25 0.25')
//     container.appendChild(label)

//     // Add container to camera
//     camera.appendChild(container)

//     // Interaction variables
//     let isDragging = false
//     const sliderWidth = 1
//     const handleWidth = 0.05
//     const maxX = (sliderWidth - handleWidth) / 2
//     const minX = -maxX

//     // Get reference to UnrealBloomPass
//     const {effectComposer} = this.el.sceneEl.renderer
//     const bloomPass = effectComposer?.passes.find(pass => pass instanceof THREE.UnrealBloomPass)

//     // Initial strength value
//     let currentStrength = 2  // Default value

//     // Handle mouse/touch events
//     handle.addEventListener('mousedown', () => {
//       isDragging = true
//     })

//     document.addEventListener('mouseup', () => {
//       isDragging = false
//     })

//     document.addEventListener('mousemove', (event) => {
//       if (!isDragging) return

//       // Get mouse position relative to slider
//       const rect = this.el.sceneEl.canvas.getBoundingClientRect()
//       const x = ((event.clientX - rect.left) / rect.width) * 2 - 1

//       // Constrain handle position
//       const newX = THREE.MathUtils.clamp(x * maxX, minX, maxX)
//       handle.setAttribute('position', `${newX} 0 0.001`)

//       // Calculate bloom strength (0 to 4 range)
//       currentStrength = ((newX - minX) / (maxX - minX)) * 4

//       // Update bloom effect
//       if (bloomPass) {
//         bloomPass.strength = currentStrength
//       }
//     })
//   },
// })

// export { bloomControlComponent }
