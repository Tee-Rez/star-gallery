const imageTargetComponent = () => ({
  schema: {
    name: {type: 'string'},
  },
  init() {
    const {object3D} = this.el
    const {name} = this.data
    object3D.visible = false

    const showImage = ({detail}) => {
      if (name !== detail.name) {
        return
      }
      object3D.position.copy(detail.position)
      object3D.quaternion.copy(detail.rotation)
      object3D.scale.set(detail.scale, detail.scale, 1)
      object3D.visible = true
    }

    const imageFound = (e) => {
      showImage(e)
    }

    const imageLost = (e) => {
      object3D.visible = false
    }

    this.el.sceneEl.addEventListener('xrimagefound', imageFound)
    this.el.sceneEl.addEventListener('xrimageupdated', showImage)
    this.el.sceneEl.addEventListener('xrimagelost', imageLost)
  },
})

const multiImageTargetComponent = () => ({
  schema: {
    name: {type: 'string'},
    names: {type: 'array', default: []},
  },

  init() {
    const {object3D} = this.el
    const {name, names} = this.data

    // Combine single name and array of names
    this.targetNames = []
    if (name && name !== '') {
      this.targetNames.push(name)
    }
    if (Array.isArray(names) && names.length > 0) {
      this.targetNames = this.targetNames.concat(names)
    }

    // If no valid names provided, log warning
    if (this.targetNames.length === 0) {
      console.warn('No valid image target names provided to multi-image-target component')
      return
    }

    // Start with object hidden
    object3D.visible = false

    // Track which target is currently active
    this.activeTarget = null

    // Create handlers for image events
    const showImage = ({detail}) => {
      // Check if the found image is one of our targets
      if (!this.targetNames.includes(detail.name)) {
        return
      }

      // Store active target name
      this.activeTarget = detail.name

      // Position the 3D object at the target
      object3D.position.copy(detail.position)
      object3D.quaternion.copy(detail.rotation)
      object3D.scale.set(detail.scale, detail.scale, 1)
      object3D.visible = true

      // Emit event with the specific target that was found
      this.el.emit('targetfound', {
        name: detail.name,
        position: detail.position,
        rotation: detail.rotation,
        scale: detail.scale,
      })
    }

    const imageFound = (e) => {
      showImage(e)
    }

    const imageLost = (e) => {
      // Only hide if the lost target is our active one
      if (this.targetNames.includes(e.detail.name) && e.detail.name === this.activeTarget) {
        object3D.visible = false
        this.activeTarget = null

        // Emit event with the specific target that was lost
        this.el.emit('targetlost', {
          name: e.detail.name,
        })
      }
    }

    // Listen for all target events on the scene
    this.el.sceneEl.addEventListener('xrimagefound', imageFound)
    this.el.sceneEl.addEventListener('xrimageupdated', showImage)
    this.el.sceneEl.addEventListener('xrimagelost', imageLost)

    // Store event handlers for cleanup
    this.imageFound = imageFound
    this.showImage = showImage
    this.imageLost = imageLost
  },

  update(oldData) {
    // Handle updates to the component properties
    const {name, names} = this.data

    // Rebuild targetNames array
    this.targetNames = []
    if (name && name !== '') {
      this.targetNames.push(name)
    }
    if (Array.isArray(names) && names.length > 0) {
      this.targetNames = this.targetNames.concat(names)
    }
  },

  remove() {
    // Clean up event listeners when component is removed
    this.el.sceneEl.removeEventListener('xrimagefound', this.imageFound)
    this.el.sceneEl.removeEventListener('xrimageupdated', this.showImage)
    this.el.sceneEl.removeEventListener('xrimagelost', this.imageLost)
  },
})

const spinComponent = {
  schema: {
    speed: {default: 2000},
    direction: {default: 'normal'},
    axis: {default: 'y'},
  },
  init() {
    const {el} = this
    el.setAttribute('animation__spin', {
      property: `object3D.rotation.${this.data.axis}`,
      from: 0,
      to: 360,
      dur: this.data.speed,
      dir: this.data.direction,
      loop: true,
      easing: 'linear',
    })
  },
}

const LoopMode = {
  once: THREE.LoopOnce,
  repeat: THREE.LoopRepeat,
  pingpong: THREE.LoopPingPong,
}

function regExpEscape(s) {
  return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
}

function wildcardToRegExp(s) {
  return new RegExp(`^${s.split(/\*+/).map(regExpEscape).join('.*')}$`)
}

const MultipleMeshAnimationComponent = () => ({
  schema: {
    meshName: {default: '*'},
    clip: {default: '*'},
    duration: {default: 0},
    clampWhenFinished: {default: false, type: 'boolean'},
    crossFadeDuration: {default: 0},
    loop: {default: 'repeat', oneOf: Object.keys(LoopMode)},
    repetitions: {default: Infinity, min: 0},
    timeScale: {default: 1},
  },

  init() {
    /** @type {THREE.Mesh} */
    this.model = null
    /** @type {THREE.AnimationMixer} */
    this.mixer = null
    /** @type {Array<THREE.AnimationAction>} */
    this.activeActions = []

    const model = this.el.getObject3D('mesh')
    if (model) {
      this.load(model)
    } else {
      this.el.addEventListener('model-loaded', (e) => {
        this.load(e.detail.model)
      })
    }
  },

  load(model) {
    const {el} = this
    const {meshName} = this.data.meshName
    // if (meshName === '*') {
    this.model = model
    // } else {
    //   console.log(meshName)
    //   console.log(model.getObjectByName(meshName))
    //   this.model = model.getObjectByName(meshName)
    // }
    this.mixer = new THREE.AnimationMixer(model)
    this.mixer.addEventListener('loop', (e) => {
      el.emit('animation-loop', {action: e.action, loopDelta: e.loopDelta})
    })
    this.mixer.addEventListener('finished', (e) => {
      el.emit('animation-finished', {action: e.action, direction: e.direction})
    })
    if (this.data.clip) this.update({})
  },

  remove() {
    if (this.mixer) this.mixer.stopAllAction()
  },

  update(prevData) {
    if (!prevData) return

    const {data} = this
    const changes = AFRAME.utils.diff(data, prevData)

    // If selected clips have changed, restart animation.
    if ('clip' in changes) {
      this.stopAction()
      if (data.clip) this.playAction()
      return
    }

    // Otherwise, modify running actions.
    this.activeActions.forEach((action) => {
      if ('duration' in changes && data.duration) {
        action.setDuration(data.duration)
      }
      if ('clampWhenFinished' in changes) {
        action.clampWhenFinished = data.clampWhenFinished
      }
      if ('loop' in changes || 'repetitions' in changes) {
        action.setLoop(LoopMode[data.loop], data.repetitions)
      }
      if ('timeScale' in changes) {
        action.setEffectiveTimeScale(data.timeScale)
      }
    })
  },

  stopAction() {
    const {data} = this
    for (let i = 0; i < this.activeActions.length; i++) {
      data.crossFadeDuration
        ? this.activeActions[i].fadeOut(data.crossFadeDuration)
        : this.activeActions[i].stop()
    }
    this.activeActions.length = 0
  },

  playAction() {
    if (!this.mixer) return

    const {model} = this
    const {data} = this
    const clips = model.animations || (model.geometry || {}).animations || []

    if (!clips.length) return

    const re = wildcardToRegExp(data.clip)

    for (let clip, i = 0; (clip = clips[i]); i++) {
      if (clip.name.match(re)) {
        const action = this.mixer.clipAction(clip, model)
        action.enabled = true
        action.clampWhenFinished = data.clampWhenFinished
        if (data.duration) action.setDuration(data.duration)
        if (data.timeScale !== 1) action.setEffectiveTimeScale(data.timeScale)
        action
          .setLoop(LoopMode[data.loop], data.repetitions)
          .fadeIn(data.crossFadeDuration)
          .play()
        this.activeActions.push(action)
      }
    }
  },

  tick(t, dt) {
    if (this.mixer && !isNaN(dt)) this.mixer.update(dt / 1000)
  },
})
const rotateComponent = {
  schema: {
    // Enable/disable rotation for each axis
    enableX: {type: 'boolean', default: false},
    enableY: {type: 'boolean', default: false},
    enableZ: {type: 'boolean', default: false},

    // Shared min/max values for rotation speed (degrees per second)
    min: {type: 'number', default: 0},
    max: {type: 'number', default: 360},

    // Duration for one complete rotation in milliseconds
    duration: {type: 'number', default: 5000},
  },

  init() {
    this.speeds = {
      x: 0,
      y: 0,
      z: 0,
    }

    this.currentRotation = {x: 0, y: 0, z: 0}
    this.updateSpeeds()
    this.tick = this.tick.bind(this)
  },

  updateSpeeds() {
    const speedMultiplier = this.data.max / 360  // Convert max to a multiplier
    this.speeds = {
      x: this.data.enableX ? speedMultiplier : 0,
      y: this.data.enableY ? speedMultiplier : 0,
      z: this.data.enableZ ? speedMultiplier : 0,
    }
  },

  update(oldData) {
    // Update speeds if max value or enable flags change
    if (oldData.max !== this.data.max ||
        oldData.enableX !== this.data.enableX ||
        oldData.enableY !== this.data.enableY ||
        oldData.enableZ !== this.data.enableZ) {
      this.updateSpeeds()
    }
  },

  tick(time, deltaTime) {
    if (!deltaTime) return

    // Convert deltaTime to seconds and calculate rotation increment
    const timeScale = deltaTime / 1000

    // Update rotation based on speed
    this.currentRotation.x += this.speeds.x * 360 * timeScale
    this.currentRotation.y += this.speeds.y * 360 * timeScale
    this.currentRotation.z += this.speeds.z * 360 * timeScale

    // Apply rotation
    this.el.setAttribute('rotation', {
      x: this.currentRotation.x % 360,
      y: this.currentRotation.y % 360,
      z: this.currentRotation.z % 360,
    })
  },

  remove() {
    this.speeds = {x: 0, y: 0, z: 0}
  },

  pause() {
    this._pausedSpeeds = {...this.speeds}
    this.speeds = {x: 0, y: 0, z: 0}
  },

  play() {
    if (this._pausedSpeeds) {
      this.speeds = {...this._pausedSpeeds}
      this._pausedSpeeds = null
    }
  },
}

export {imageTargetComponent, multiImageTargetComponent, MultipleMeshAnimationComponent, rotateComponent, spinComponent}
