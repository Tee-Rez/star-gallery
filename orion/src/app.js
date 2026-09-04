// Copyright (c) 2023 8th Wall, Inc.
// app.js - Updated for cursor-based placement

import {gridWallComponent} from './js/gridwall'
AFRAME.registerComponent('grid-wall', gridWallComponent)

import {portalComponent} from './js/portal'
AFRAME.registerComponent('portal', portalComponent)

import {portalHeaderComponent} from './js/portal-header'
AFRAME.registerComponent('portal-header', portalHeaderComponent)

import {loreJourneyComponent} from './js/lore-journey'
AFRAME.registerComponent('lore-journey', loreJourneyComponent)

import {galleryBackButtonComponent} from './js/gallery-back-button'
AFRAME.registerComponent('gallery-back-button', galleryBackButtonComponent)

import {starAudioComponent} from './js/star-audio'
AFRAME.registerComponent('star-audio', starAudioComponent)

// The back control is attached here rather than in the scene markup so it exists for every
// constellation, and from the first frame rather than only once a portal has been placed.
window.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  if (scene && !scene.hasAttribute('gallery-back-button')) {
    scene.setAttribute('gallery-back-button', '')
  }
  if (scene && !scene.hasAttribute('star-audio')) {
    scene.setAttribute('star-audio', '')
  }
})

import {tapPlaceCursorComponent} from './tap-place-cursor'
AFRAME.registerComponent('tap-place-cursor', tapPlaceCursorComponent)

import {resetViewButtonComponent} from './reset-view-button'
AFRAME.registerComponent('reset-view-button', resetViewButtonComponent)

import {spinComponent, rotateComponent} from './imgTarget-component'
AFRAME.registerComponent('spin', spinComponent)
AFRAME.registerComponent('rotate', rotateComponent)

import {constellationLoaderComponent} from './js/constellation-loader'
AFRAME.registerComponent('constellation-loader', constellationLoaderComponent)

import {hintControllerComponent} from './hint-controller'
AFRAME.registerComponent('hint-controller', hintControllerComponent)

import {dynamicStarComponent} from './dynamic-star'
AFRAME.registerComponent('dynamic-star', dynamicStarComponent)

import {starInfoOverlayComponent} from './star-info-overlay'
AFRAME.registerComponent('star-info-overlay', starInfoOverlayComponent)

import {dynamicStarControllerComponent} from './dynamic-star-controller'
AFRAME.registerComponent('dynamic-star-controller', dynamicStarControllerComponent)

// Modified look-at component that handles parent rotations properly
AFRAME.registerComponent('look-at', {
  schema: {
    type: 'selector',
  },

  init() {
    this.target = this.data
    this.tempEuler = new THREE.Euler()
    this.cameraWorldPos = new THREE.Vector3()
    this.objectWorldPos = new THREE.Vector3()
    this.objectWorldQuaternion = new THREE.Quaternion()
    this.targetRotation = new THREE.Quaternion()
    this.upVector = new THREE.Vector3(0, 1, 0)
  },

  tick() {
    if (!this.target) return

    const {object3D} = this.el

    // Get world positions
    this.target.object3D.getWorldPosition(this.cameraWorldPos)
    object3D.getWorldPosition(this.objectWorldPos)

    // Calculate the direction from object to camera in world space
    const direction = new THREE.Vector3()
    direction.subVectors(this.cameraWorldPos, this.objectWorldPos).normalize()

    // Create a matrix that looks at the camera
    const lookAtMatrix = new THREE.Matrix4()
    lookAtMatrix.lookAt(this.objectWorldPos, this.cameraWorldPos, this.upVector)

    // Extract quaternion from the look-at matrix
    this.targetRotation.setFromRotationMatrix(lookAtMatrix)

    // If there's a parent, convert from world space to local space
    if (object3D.parent) {
      const parentWorldQuaternion = new THREE.Quaternion()
      object3D.parent.getWorldQuaternion(parentWorldQuaternion)

      // Invert parent rotation and apply to our target rotation
      const inverseParentQuaternion = parentWorldQuaternion.clone().invert()
      this.targetRotation.premultiply(inverseParentQuaternion)
    }

    // Apply rotation to object
    object3D.quaternion.copy(this.targetRotation)

    // Fix the roll (Z-axis) to keep text upright
    this.tempEuler.setFromQuaternion(object3D.quaternion, 'YXZ')
    this.tempEuler.z = 0  // Zero out roll
    object3D.quaternion.setFromEuler(this.tempEuler)
  },
})

// Billboard component for keeping text facing camera
AFRAME.registerComponent('billboard', {
  schema: {
    active: {default: true},
  },

  init() {
    this.cameraEl = document.querySelector('[camera]')
    this.cameraWorldPosition = new THREE.Vector3()
    this.worldPosition = new THREE.Vector3()
    this.dummyObj = new THREE.Object3D()
    this.currentOrientation = window.orientation || 0
    this.isLandscape = window.innerWidth > window.innerHeight
    this.initialQuaternion = new THREE.Quaternion()

    if (this.el.object3D) {
      this.initialQuaternion.copy(this.el.object3D.quaternion)
    }

    this.lastOrientationCheck = 0
    this.orientationCheckInterval = 1000
    this.isForcingOrientation = false
    this.lastRotation = null

    this.onResize = this.onResize.bind(this)
    window.addEventListener('resize', this.onResize)
  },

  onResize() {
    const newIsLandscape = window.innerWidth > window.innerHeight
    if (this.isLandscape !== newIsLandscape) {
      this.isLandscape = newIsLandscape
      setTimeout(() => {
        this.forceOrientationUpdate()
      }, 300)
    }
  },

  forceOrientationUpdate() {
    if (this.isForcingOrientation) return
    this.isForcingOrientation = true

    if (this.el.object3D) {
      this.el.object3D.quaternion.copy(this.initialQuaternion)
      this.updateBillboard(true)
      this.initialQuaternion.copy(this.el.object3D.quaternion)
    }

    setTimeout(() => {
      this.isForcingOrientation = false
    }, 500)
  },

  updateBillboard(isForced = false) {
    if (!this.el.object3D || !this.cameraEl) return

    const {object3D} = this.el
    const cameraObject3D = this.cameraEl.object3D

    object3D.getWorldPosition(this.worldPosition)
    cameraObject3D.getWorldPosition(this.cameraWorldPosition)

    const dx = this.cameraWorldPosition.x - this.worldPosition.x
    const dz = this.cameraWorldPosition.z - this.worldPosition.z

    this.dummyObj.position.copy(this.worldPosition)
    this.dummyObj.lookAt(this.cameraWorldPosition)

    const euler = new THREE.Euler().setFromQuaternion(
      this.dummyObj.quaternion,
      'YXZ'
    )

    euler.x = 0  // No vertical tilt
    euler.z = 0  // No roll
    const billboardQuaternion = new THREE.Quaternion().setFromEuler(euler)

    if (object3D.parent) {
      const parentWorldQuaternion = new THREE.Quaternion()
      object3D.parent.getWorldQuaternion(parentWorldQuaternion)
      parentWorldQuaternion.invert()
      billboardQuaternion.premultiply(parentWorldQuaternion)
    }

    object3D.quaternion.copy(billboardQuaternion)

    if (isForced) {
      const objectUp = new THREE.Vector3(0, 1, 0)
      object3D.localToWorld(objectUp.copy(new THREE.Vector3(0, 1, 0)))
      objectUp.sub(this.worldPosition).normalize()

      const worldUp = new THREE.Vector3(0, 1, 0)
      const dotProduct = objectUp.dot(worldUp)

      if (dotProduct < 0) {
        const correction = new THREE.Quaternion()
        correction.setFromEuler(new THREE.Euler(0, 0, Math.PI))
        object3D.quaternion.multiply(correction)
      }
    }
  },

  tick(time) {
    if (!this.data.active) return
    this.updateBillboard(false)
  },

  remove() {
    window.removeEventListener('resize', this.onResize)
  },
})
