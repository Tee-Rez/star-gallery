// // Create and append overlay HTML with single slider
// const createOverlayUI = () => {
//   const overlay = document.createElement('div')
//   overlay.innerHTML = `
//     <div id="bloom-controls" style="
//       position: fixed;
//       bottom: 20px;
//       left: 50%;
//       transform: translateX(-50%);
//       background: rgba(0, 0, 0, 0.7);
//       padding: 15px 20px;
//       border-radius: 10px;
//       z-index: 1000;
//       display: flex;
//       flex-direction: column;
//       align-items: center;
//       gap: 8px;
//       backdrop-filter: blur(5px);
//       box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
//     ">
//       <label for="bloom-slider" style="
//         color: white;
//         font-family: Arial, sans-serif;
//         font-size: 14px;
//         user-select: none;
//       ">Bloom Intensity</label>
//       <input type="range" id="bloom-slider" min="0" max="4" step="0.1" value="2" style="
//         width: 200px;
//         height: 20px;
//         -webkit-appearance: none;
//         background: rgba(255, 255, 255, 0.1);
//         border-radius: 10px;
//         outline: none;
//         transition: background 0.2s;
//       ">
//       <style>
//         #bloom-slider::-webkit-slider-thumb {
//           -webkit-appearance: none;
//           width: 20px;
//           height: 20px;
//           background: #4287f5;
//           border-radius: 50%;
//           cursor: pointer;
//           transition: all 0.2s;
//         }
//         #bloom-slider::-webkit-slider-thumb:hover {
//           background: #5c9aff;
//           transform: scale(1.1);
//         }
//         #bloom-slider::-moz-range-thumb {
//           width: 20px;
//           height: 20px;
//           background: #4287f5;
//           border-radius: 50%;
//           cursor: pointer;
//           border: none;
//           transition: all 0.2s;
//         }
//         #bloom-slider::-moz-range-thumb:hover {
//           background: #5c9aff;
//           transform: scale(1.1);
//         }
//         #bloom-slider::-webkit-slider-runnable-track {
//           height: 20px;
//           border-radius: 10px;
//         }
//         #bloom-slider::-moz-range-track {
//           height: 20px;
//           border-radius: 10px;
//         }
//       </style>
//     </div>
//   `
//   document.body.appendChild(overlay)
//   return overlay
// }

// // Create A-Frame component to handle the bloom control
// AFRAME.registerComponent('bloom-overlay-control', {
//   init() {
//     this.overlay = createOverlayUI()
//     this.slider = document.getElementById('bloom-slider')
    
//     const scene = this.el.sceneEl
//     const {renderer} = scene
//     this.bloomPass = renderer.effectComposer?.passes.find(pass => pass instanceof THREE.UnrealBloomPass)

//     this.slider.addEventListener('input', (event) => {
//       if (this.bloomPass) {
//         this.bloomPass.strength = parseFloat(event.target.value)
//       }
//     })
//   },

//   remove() {
//     if (this.overlay && this.overlay.parentNode) {
//       this.overlay.parentNode.removeChild(this.overlay)
//     }
//   }
// })

// export const initOverlayUI = () => {
//   const scene = document.querySelector('a-scene')
//   scene.setAttribute('bloom-overlay-control', '')
// }