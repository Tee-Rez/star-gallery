// js/deep-sky-marker.js - "something is here" for a deep-sky object.
//
// A dashed ring that turns slowly. It is deliberately NOT a star: it carries no label sphere
// and never appears in the connection graph, because connections are built from the
// connections array and reference star ids only.
//
// Tapping uses the same convention as stars - an invisible .cantap sphere - so the existing
// raycaster needs no changes.
const deepSkyMarkerComponent = {
  schema: {
    radius: {type: 'number', default: 0.45},
    color: {type: 'color', default: '#8fd8ff'},
    segments: {type: 'int', default: 64},      // dashes are drawn as gaps in a line loop
    dashRatio: {type: 'number', default: 0.55},  // fraction of each segment that is drawn
    spin: {type: 'number', default: 0.6},      // radians per second
    visited: {type: 'boolean', default: false},
  },

  init() {
    this.ring = null
    this.hitEl = null
    this.build()
  },

  update(oldData) {
    if (!oldData || !Object.keys(oldData).length) return
    // Visits only change opacity, so avoid rebuilding the geometry for them.
    // A-Frame sends complete previous data, so check if only visited value changed.
    const others = Object.keys(this.data).some(k => k !== 'visited' && oldData[k] !== this.data[k])
    if (!others) {
      this.applyVisited()
      return
    }
    this.build()
  },

  build() {
    const THREE = window.THREE || AFRAME.THREE
    this.dispose()

    // Dashes as explicit segment pairs: LineDashedMaterial needs computeLineDistances and
    // behaves inconsistently across A-Frame's renderer settings, so draw the gaps instead.
    const pts = []
    const step = (Math.PI * 2) / this.data.segments
    for (let i = 0; i < this.data.segments; i++) {
      const a0 = i * step
      const a1 = a0 + step * this.data.dashRatio
      pts.push(
        new THREE.Vector3(Math.cos(a0) * this.data.radius, Math.sin(a0) * this.data.radius, 0),
        new THREE.Vector3(Math.cos(a1) * this.data.radius, Math.sin(a1) * this.data.radius, 0)
      )
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(this.data.color),
      transparent: true,
      opacity: this.data.visited ? 0.30 : 0.85,
      depthWrite: false,
    })
    this.ring = new THREE.LineSegments(geometry, material)
    this.el.setObject3D('ring', this.ring)

    this.ensureTapTarget()
  },

  // Stars use a .cantap sphere for selection; matching that keeps the raycaster untouched.
  ensureTapTarget() {
    let hit = this.el.querySelector('a-sphere.cantap')
    if (!hit) {
      hit = document.createElement('a-sphere')
      hit.setAttribute('class', 'cantap')
      hit.setAttribute('material', {
        color: this.data.color,
        opacity: 0.12,
        transparent: true,
        side: 'double',
        depthTest: true,
        depthWrite: false,
      })
      this.el.appendChild(hit)
      this.hitEl = hit
    }
    hit.setAttribute('radius', Math.max(this.data.radius, 0.35))
  },

  applyVisited() {
    if (this.ring) this.ring.material.opacity = this.data.visited ? 0.30 : 0.85
  },

  setVisited(v) {
    this.el.setAttribute('deep-sky-marker', 'visited', !!v)
  },

  tick(time, delta) {
    if (this.ring) this.ring.rotation.z += (delta / 1000) * this.data.spin
  },

  dispose() {
    if (!this.ring) return
    this.el.removeObject3D('ring')
    this.ring.geometry.dispose()
    this.ring.material.dispose()
    this.ring = null
  },

  remove() {
    this.dispose()
    if (this.hitEl && this.hitEl.parentNode) {
      this.hitEl.parentNode.removeChild(this.hitEl)
    }
    this.hitEl = null
  },
}

export {deepSkyMarkerComponent}
export default deepSkyMarkerComponent
