// js/portal.js - Fixed z-ordering so border is visible
const portalComponent = {
  schema: {
    width: {type: 'number', default: 6},
    height: {type: 'number', default: 9},
    borderColor: {type: 'color', default: '#00ff00'},
    borderWidth: {type: 'number', default: 0.03},
    doorHeight: {type: 'number', default: 10},
    doorDuration: {type: 'number', default: 4000},
    lineDrawDuration: {type: 'number', default: 1000},
    lineDelay: {type: 'number', default: 100},
  },

  init() {
    console.log('========== PORTAL COMPONENT INITIALIZING ==========')
    console.log('Portal config:', this.data)

    this.portalAnimationStarted = false
    this.squarePoints = this.calculateSquarePoints()

    // Create hider walls first (they'll be behind the border)
    this.createHiderWalls()

    // Create border in front of hider walls
    this.createAnimatedBorder()

    // Listen for constellation placement event
    this.el.sceneEl.addEventListener('constellationPlaced', () => {
      console.log('========== CONSTELLATION PLACED EVENT RECEIVED ==========')
      if (!this.portalAnimationStarted) {
        console.log('Starting portal animation after delay...')
        setTimeout(() => {
          this.startPortalAnimation()
        }, 500)
      } else {
        console.log('Portal animation already started, ignoring event')
      }
    })

    console.log('Portal component initialization complete, waiting for constellationPlaced event')
  },

  createHiderWalls() {
    console.log('Creating hider walls...')

    const hiderWallsContainer = document.querySelector('#hider-walls')
    if (!hiderWallsContainer) {
      console.error('❌ Hider walls container not found!')
      return
    }

    const hiderWallSize = 15

    // Each wall slides out until its inner edge meets the drawn frame, so the travel is
    // half the wall plus the frame half-extent. Those half-extents must be the SAME ones
    // the border is drawn at (see calculateSquarePoints), which is why they are derived
    // here rather than fixed: they used to be hardcoded to Orion (1.5 and 2.25, i.e. 6/4
    // and 9/4), which on any other portal left a gap on one axis and clipped the opening
    // on the other.
    const halfFrameWidth = this.data.width / 4
    const halfFrameHeight = this.data.height / 4

    this.finalLeftRightPosition = (hiderWallSize / 2) + halfFrameWidth
    this.finalTopBottomPosition = (hiderWallSize / 2) + halfFrameHeight

    // Create all hider walls at z: 0 (behind the border which will be at z: 0.05)
    const leftWall = document.createElement('a-plane')
    leftWall.setAttribute('id', 'left-hider')
    leftWall.setAttribute('width', hiderWallSize)
    leftWall.setAttribute('height', hiderWallSize)
    leftWall.setAttribute('position', '0 0 0.04')  // Start at center, z=0
    leftWall.setAttribute('xrextras-hider-material', '')
    hiderWallsContainer.appendChild(leftWall)

    const rightWall = document.createElement('a-plane')
    rightWall.setAttribute('id', 'right-hider')
    rightWall.setAttribute('width', hiderWallSize)
    rightWall.setAttribute('height', hiderWallSize)
    rightWall.setAttribute('position', '0 0 0.04')  // Start at center, z=0
    rightWall.setAttribute('xrextras-hider-material', '')
    hiderWallsContainer.appendChild(rightWall)

    const topWall = document.createElement('a-plane')
    topWall.setAttribute('id', 'top-hider')
    topWall.setAttribute('width', hiderWallSize)
    topWall.setAttribute('height', hiderWallSize)
    topWall.setAttribute('position', '0 0 0.04')  // Start at center, z=0
    topWall.setAttribute('xrextras-hider-material', '')
    hiderWallsContainer.appendChild(topWall)

    const bottomWall = document.createElement('a-plane')
    bottomWall.setAttribute('id', 'bottom-hider')
    bottomWall.setAttribute('width', hiderWallSize)
    bottomWall.setAttribute('height', hiderWallSize)
    bottomWall.setAttribute('position', '0 0 0.04')  // Start at center, z=0
    bottomWall.setAttribute('xrextras-hider-material', '')
    hiderWallsContainer.appendChild(bottomWall)

    console.log('✅ Hider walls created at z=0 (behind border)')
  },

  calculateSquarePoints() {
    const halfWidth = this.data.width / 4
    const halfHeight = this.data.height / 4
    return [
      {x: -halfWidth, y: halfHeight, z: 0.01},  // Border in front of hider walls
      {x: halfWidth, y: halfHeight, z: 0.01},
      {x: halfWidth, y: -halfHeight, z: 0.01},
      {x: -halfWidth, y: -halfHeight, z: 0.01},
    ]
  },

  createAnimatedBorder() {
    console.log('Creating animated border...')

    const borderEntity = document.createElement('a-entity')
    this.borderSegments = []

    const edges = [
      [0, 1],  // Top
      [1, 2],  // Right
      [2, 3],  // Bottom
      [3, 0],  // Left
    ]

    edges.forEach(([startIdx, endIdx], index) => {
      const start = this.squarePoints[startIdx]
      const end = this.squarePoints[endIdx]
      const segmentContainer = document.createElement('a-entity')

      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI

      segmentContainer.setAttribute('position', `${start.x} ${start.y} ${start.z}`)
      segmentContainer.setAttribute('rotation', `0 0 ${angle}`)
      segmentContainer.setAttribute('scale', '0 1 1')

      const borderPlane = document.createElement('a-plane')
      borderPlane.setAttribute('width', length)
      borderPlane.setAttribute('height', this.data.borderWidth)
      borderPlane.setAttribute('material', {
        color: this.data.borderColor,
        opacity: 0,
        transparent: true,
        shader: 'flat',
        side: 'double',  // Make sure border is visible from both sides
      })

      // Center the plane on its local x-axis, keep z at 0 (in front of parent)
      borderPlane.setAttribute('position', `${length / 2} 0 0`)

      segmentContainer.appendChild(borderPlane)
      this.borderSegments.push(segmentContainer)
      borderEntity.appendChild(segmentContainer)
    })

    this.el.appendChild(borderEntity)
    console.log(`✅ Created ${this.borderSegments.length} border segments at z=0.05`)
  },

  startPortalAnimation() {
    if (this.portalAnimationStarted) {
      console.warn('Portal animation already started!')
      return
    }

    if (!this.borderSegments || this.borderSegments.length === 0) {
      console.error('❌ No border segments found!')
      return
    }

    this.portalAnimationStarted = true
    console.log('========== STARTING PORTAL BORDER ANIMATION ==========')

    const animateSegment = (index) => {
      if (index >= this.borderSegments.length) {
        console.log('All border segments animated, starting hider walls animation')
        setTimeout(() => {
          this.startHiderWallsAnimation()
        }, this.data.lineDelay)
        return
      }

      console.log(`Animating border segment ${index + 1}/${this.borderSegments.length}`)

      const segmentContainer = this.borderSegments[index]
      const borderPlane = segmentContainer.firstChild

      segmentContainer.setAttribute('scale', '0 1 1')
      borderPlane.setAttribute('material', 'opacity', 0)

      segmentContainer.setAttribute('animation__scale', {
        property: 'scale',
        from: '0 1 1',
        to: '1 1 1',
        dur: this.data.lineDrawDuration,
        easing: 'easeInOutQuad',
      })

      borderPlane.setAttribute('animation__fade', {
        property: 'material.opacity',
        from: 0,
        to: 1,
        dur: this.data.lineDrawDuration,
        easing: 'easeInOutQuad',
      })

      segmentContainer.addEventListener('animationcomplete__scale', () => {
        setTimeout(() => {
          animateSegment(index + 1)
        }, this.data.lineDelay)
      }, {once: true})
    }

    animateSegment(0)
  },

  startHiderWallsAnimation() {
    console.log('========== STARTING HIDER WALLS ANIMATION ==========')

    const leftWall = document.querySelector('#left-hider')
    const rightWall = document.querySelector('#right-hider')
    const topWall = document.querySelector('#top-hider')
    const bottomWall = document.querySelector('#bottom-hider')

    if (!leftWall || !rightWall || !topWall || !bottomWall) {
      console.error('❌ Could not find all hider walls!')
      return
    }

    console.log('✅ All hider walls found, starting expansion animation')

    const {finalLeftRightPosition, finalTopBottomPosition} = this

    // Animate from center (0,0,0) to final positions
    leftWall.setAttribute('animation__expand', {
      property: 'position',
      from: '0 0 0',
      to: `-${finalLeftRightPosition} 0 0`,
      dur: this.data.doorDuration,
      easing: 'easeInOutQuad',
    })

    rightWall.setAttribute('animation__expand', {
      property: 'position',
      from: '0 0 0',
      to: `${finalLeftRightPosition} 0 0`,
      dur: this.data.doorDuration,
      easing: 'easeInOutQuad',
    })

    topWall.setAttribute('animation__expand', {
      property: 'position',
      from: '0 0 0',
      to: `0 ${finalTopBottomPosition} 0`,
      dur: this.data.doorDuration,
      easing: 'easeInOutQuad',
    })

    bottomWall.setAttribute('animation__expand', {
      property: 'position',
      from: '0 0 0',
      to: `0 -${finalTopBottomPosition} 0`,
      dur: this.data.doorDuration,
      easing: 'easeInOutQuad',
    })

    console.log('Hider walls expansion animation started')

    bottomWall.addEventListener('animationcomplete__expand', () => {
      console.log('========== PORTAL EXPANSION COMPLETE ==========')
      this.el.sceneEl.emit('portalOpened')
    }, {once: true})
  },

  remove() {
    this.el.sceneEl.removeEventListener('constellationPlaced', this.startPortalAnimation)
  },
}

export {portalComponent}
