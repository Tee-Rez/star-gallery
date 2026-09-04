// js/gridwall.js
// One side of the grid box: a flat grid of thin lines forming a shaft that recedes from the
// portal opening, giving the opening a sense of depth.
//
// The box is `width` x `height` (the portal opening) by `depth` (how far it recedes), so each
// wall spans two of those three axes, and which two depends on which wall it is:
//
//   left / right  ->  depth x height
//   top / bottom  ->  width x depth
//
// That pairing is the whole trick. It used to be picked by comparing width against height,
// which happened to work on Orion's 6x9 portal and nothing else: on any other aspect the side
// walls were sized by the opening's width rather than its depth, so they overshot on one axis
// while the top and bottom fell short on the other, and the corners never met.
const gridWallComponent = {
  schema: {
    position: {type: 'string'},              // left, right, top, bottom
    width: {type: 'number', default: 6},     // opening width
    height: {type: 'number', default: 9},    // opening height
    depth: {type: 'number', default: 6},     // how far the shaft recedes
    frontZ: {type: 'number', default: 0},    // z of the shaft's front edge (the opening plane)
    gridSize: {type: 'number', default: 0.5},
    color: {type: 'color', default: '#00ff00'},
    opacity: {type: 'number', default: 0.6},
    borderWidth: {type: 'number', default: 0.02},
    lineDepth: {type: 'number', default: 0.01},
  },

  init() {
    this.createGridWall()
  },

  createGridWall() {
    const cfg = this.getWallConfig()

    const wall = document.createElement('a-entity')
    wall.setAttribute('id', this.data.position)
    wall.setAttribute('position', cfg.position)
    wall.setAttribute('rotation', cfg.rotation)

    this.createGridLines(wall, cfg.gridWidth, cfg.gridHeight)

    this.el.appendChild(wall)
  },

  // Each wall sits on its edge of the opening and is centred along the shaft, so its front
  // edge lands on the opening plane and its corners meet the portal frame.
  getWallConfig() {
    const {position, width, height, depth, frontZ} = this.data
    const z = frontZ - (depth / 2)

    switch (position) {
      case 'left':
        return {position: {x: -width / 2, y: 0, z},
          rotation: {x: 0, y: 90, z: 0},
          gridWidth: depth, gridHeight: height}
      case 'right':
        return {position: {x: width / 2, y: 0, z},
          rotation: {x: 0, y: -90, z: 0},
          gridWidth: depth, gridHeight: height}
      case 'top':
        return {position: {x: 0, y: height / 2, z},
          rotation: {x: -90, y: 0, z: 0},
          gridWidth: width, gridHeight: depth}
      case 'bottom':
        return {position: {x: 0, y: -height / 2, z},
          rotation: {x: 90, y: 0, z: 0},
          gridWidth: width, gridHeight: depth}
      default:
        return {position: {x: 0, y: 0, z},
          rotation: {x: 0, y: 0, z: 0},
          gridWidth: width, gridHeight: height}
    }
  },

  createGridLines(wall, gridWidth, gridHeight) {
    const {gridSize, color, opacity, borderWidth, lineDepth} = this.data

    // Cell counts are rounded and the spacing derived back from them, so the last line always
    // lands exactly on the far edge. Stepping by a raw gridSize instead would leave a partial
    // cell (or an extra line past the edge) whenever a dimension is not a whole number of cells.
    const cols = Math.max(1, Math.round(gridWidth / gridSize))
    const rows = Math.max(1, Math.round(gridHeight / gridSize))
    const colStep = gridWidth / cols
    const rowStep = gridHeight / rows

    for (let i = 0; i <= cols; i++) {
      const line = document.createElement('a-entity')
      line.setAttribute('geometry', {
        primitive: 'box', width: borderWidth, height: gridHeight, depth: lineDepth,
      })
      line.setAttribute('material', {color, opacity, transparent: true})
      line.setAttribute('position', `${(i * colStep) - (gridWidth / 2)} 0 0`)
      wall.appendChild(line)
    }

    for (let j = 0; j <= rows; j++) {
      const line = document.createElement('a-entity')
      line.setAttribute('geometry', {
        primitive: 'box', width: gridWidth, height: borderWidth, depth: lineDepth,
      })
      line.setAttribute('material', {color, opacity, transparent: true})
      line.setAttribute('position', `0 ${(j * rowStep) - (gridHeight / 2)} 0`)
      wall.appendChild(line)
    }
  },
}

export {gridWallComponent}
