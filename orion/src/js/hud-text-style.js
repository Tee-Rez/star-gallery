// js/hud-text-style.js - feed the colour uniforms to a-text's material.
//
// Registering a custom shader is not enough on its own. a-text builds its material itself, from
// ITS OWN schema (value, color, opacity, alphaTest, negate, map...), and passes only those
// through to the shader. A uniform the shader declares but a-text has never heard of - edgeColor,
// coreWidth - is simply never set, so the shader runs with its defaults and the text comes out
// plain. Putting a `material` component on the entity is worse: it fights a-text for ownership
// and the text disappears altogether.
//
// So this reaches the material after a-text has built it and writes the uniforms directly. It
// re-applies on textfontset, because a-text rebuilds the material when the font finishes loading
// and would otherwise throw the values away.
//
//   <a-text value="ORION" shader="hud-text" hud-text-style="edgeColor: #f0b458; coreColor: #ffd27a">

/* global AFRAME */

const THREE = window.THREE || AFRAME.THREE

const hudTextStyleComponent = {
  schema: {
    edgeColor: {type: 'color', default: '#f0b458'},
    edgeWidth: {type: 'number', default: 1.6},
    coreColor: {type: 'color', default: '#ffffff'},
    coreWidth: {type: 'number', default: 2.6},
    glowColor: {type: 'color', default: '#f0b458'},
    glowWidth: {type: 'number', default: 1.4},
    glowStrength: {type: 'number', default: 0},
    alphaTest: {type: 'number', default: 0.02},
  },

  init() {
    this.apply = this.apply.bind(this)
    // a-text rebuilds its material once the font JSON and atlas have loaded.
    this.el.addEventListener('textfontset', this.apply)
    this.apply()
  },

  update() {
    this.apply()
  },

  apply() {
    const mesh = this.el.getObject3D('text')
    const mat = mesh && mesh.material
    if (!mat || !mat.uniforms) return
    const u = mat.uniforms
    const d = this.data
    const set = (name, value) => { if (u[name]) u[name].value = value }
    const col = (name, hex) => { if (u[name]) u[name].value = new THREE.Color(hex) }

    col('edgeColor', d.edgeColor)
    col('coreColor', d.coreColor)
    col('glowColor', d.glowColor)
    set('edgeWidth', d.edgeWidth)
    set('coreWidth', d.coreWidth)
    set('glowWidth', d.glowWidth)
    set('glowStrength', d.glowStrength)
    // The band outside the glyph edge is where a rim and a glow live, and a-text's default
    // alphaTest of 0.5 discards exactly that band.
    set('alphaTest', d.alphaTest)
    mat.transparent = true
    mat.needsUpdate = true
  },

  remove() {
    this.el.removeEventListener('textfontset', this.apply)
  },
}

export {hudTextStyleComponent}
export default hudTextStyleComponent
