// js/portal-header.js
import {FONT, faceText} from './hud-face'
// The portal's HUD band, laid out to match the Unity build (Portal.prefab -> PortalHUD).
//
// Unity draws that HUD on a 4000x800 canvas at 0.001 scale, so its canvas units map 1:1 to
// world units at the default bandWidth of 4. Every measurement below is therefore kept in
// Unity canvas units and scaled exactly once, so the two projects stay directly comparable
// and re-measuring the prefab stays useful.
//
//   +--------------------- band 4000x800 ---------------------+
//   | +---- info 2100x900 ----+      +- buttons 1100x900 -+   |
//   | | Constellation Name:   |      |    [  3D View  ]   |   |
//   | | # of Stars:           |      |    [   Lore    ]   |   |
//   | +-----------------------+      +--------------------+   |
//   +---------------------------------------------------------+
//
// The buttons only emit events; the constellation-loader owns the 2D/3D view, the same way
// the Lore button delegates to lore-journey. That keeps this component presentational.
//
// Unity's Recenter control is deliberately not here: it would be self-defeating in the band,
// since if you can read this HUD you are already facing the constellation, so the control has
// to reach you when you are looking away. It lives at the top of the screen instead (see
// reset-view-button.js). Unity's third info line ("Lore Journey Taken") IS here now, driven by
// discovery-store visit counts pushed in from constellation-loader's refreshExploredCounts().
//
// Buttons are centred as a group, so the column stays balanced whatever it holds; at three
// buttons this reproduces Unity's spacing to within 5 canvas units.

// Layout, in Unity canvas units, read straight off Portal.prefab.
const U = {
  bandW: 4000,
  inset: 60,          // gap from the band edge to each group
  groupH: 900,
  infoW: 2100,
  buttonsW: 1100,
  edge: 10,           // border thickness of each group's box
  textX: 50,          // text inset from its group's left edge
  textY: [-50, -320, -590],  // top edge of each info line, from the group's top
  textH: 240,
  fontSize: 90,
  btnW: 960,
  btnH: 250,
  btnGap: 40,  // Unity stacks buttons 290 apart: 250 tall + 40 of gap
}

// The carved stone panels each group sits in (star-gallery/temple-panel/build-panel.py). They
// are modelled at the group sizes above in world units at bandWidth 4 - info 2.1 x 0.9, buttons
// 1.1 x 0.9 - with a smoked glass pane 4 mm behind the frame face for the text to sit on. The
// frame stands 60-72 mm proud of the mount plane, so it occludes the glass edge-on exactly as
// a real slab would. Both reference the same granite textures, fetched once.
const PANEL = {
  info: 'assets/models/temple-panel-info.glb',
  controls: 'assets/models/temple-panel-buttons.glb',
}

// A rounded rectangle, so HUD panels can carry the same corner radius as the star-info panel.
if (AFRAME.geometries && !AFRAME.geometries['hud-rounded-rect']) {
  AFRAME.registerGeometry('hud-rounded-rect', {
    schema: {
      width: {default: 1, min: 0},
      height: {default: 1, min: 0},
      radius: {default: 0.05, min: 0},
    },
    init(data) {
      const w = data.width
      const h = data.height
      const r = Math.min(data.radius, w / 2, h / 2)
      const x = -w / 2
      const y = -h / 2
      const s = new THREE.Shape()
      s.moveTo(x + r, y)
      s.lineTo(x + w - r, y)
      s.quadraticCurveTo(x + w, y, x + w, y + r)
      s.lineTo(x + w, y + h - r)
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      s.lineTo(x + r, y + h)
      s.quadraticCurveTo(x, y + h, x, y + h - r)
      s.lineTo(x, y + r)
      s.quadraticCurveTo(x, y, x + r, y)
      this.geometry = new THREE.ShapeGeometry(s, 12)
    },
  })
}

const portalHeaderComponent = {
  schema: {
    label: {type: 'string', default: 'Orion'},      // constellation name, or the object you are in
    kind: {type: 'string', default: ''},             // Galaxy / Nebula / Cluster, empty outside one
    explored: {type: 'string', default: ''},         // yes / no, for an object with no stars to count
    starCount: {type: 'int', default: 0},            // number of stars
    starsExplored: {type: 'int', default: 0},        // stars visited, of starCount
    deepSkyExplored: {type: 'int', default: 0},      // deep-sky objects visited
    deepSkyTotal: {type: 'int', default: 0},         // 0 hides the line entirely
    frameWidth: {type: 'number', default: 3},        // portal's DRAWN frame width (world units)
    frameHeight: {type: 'number', default: 4.5},     // portal's DRAWN frame height (world units)
    bandWidth: {type: 'number', default: 4},         // world width of the whole HUD band
    bandGap: {type: 'number', default: 0.25},        // clearance between portal frame and band
    color: {type: 'color', default: '#4287f5'},          // star-info panel accent / border
    textColor: {type: 'color', default: '#ffffff'},      // star-info panel body text
    backgroundColor: {type: 'color', default: '#000000'},
    backgroundOpacity: {type: 'number', default: 0.8},   // panel background rgba(0,0,0,0.8)
    cornerRadius: {type: 'number', default: 0.06},       // panel border-radius 10px
    stone: {type: 'boolean', default: true},             // carved stone groups; false = flat panels
    buttonFill: {type: 'color', default: '#000000'},
    font: {type: 'string', default: FONT},           // matches the star labels
    z: {type: 'number', default: 0.06},              // Unity's PortalHUD z offset
  },

  init() {
    this.onViewChanged = this.onViewChanged.bind(this)
    this.el.sceneEl.addEventListener('viewToggleChanged', this.onViewChanged)

    this.build()
  },

  // Rebuild if the data changes after creation (e.g. a different constellation is loaded).
  update(oldData) {
    if (oldData && Object.keys(oldData).length > 0) {
      this.clear()
      this.build()
    }
  },

  build() {
    const d = this.data
    const s = d.bandWidth / U.bandW  // Unity canvas units -> world units

    this.scale = s
    this.buttons = []

    const groupH = U.groupH * s
    const halfBand = d.bandWidth / 2
    const infoW = U.infoW * s
    const buttonsW = U.buttonsW * s
    const inset = U.inset * s

    // The band hangs below the portal's drawn frame rather than overlapping the opening.
    const bandY = -(d.frameHeight / 2) - d.bandGap - (groupH / 2)

    // One container holds everything so remove()/update() can clean up in a single call.
    this.container = document.createElement('a-entity')
    this.container.setAttribute('position', `0 ${bandY} ${d.z}`)

    // Left: the constellation's read-out. Right: the controls.
    const info = this.makeGroup(-halfBand + inset + (infoW / 2), infoW, groupH, PANEL.info)
    const controls = this.makeGroup(halfBand - inset - (buttonsW / 2), buttonsW, groupH, PANEL.controls)

    // Inside a deep-sky object the subject of this band is the object, not the constellation.
    this.addLine(info, d.kind ? `${d.kind}: ${d.label}` : `Constellation Name: ${d.label}`, 0, infoW)

    // A nebula or a galaxy has no stars to count, so the line that would report 0 / 0 reports
    // the only progress it has instead: whether you have opened it. A cluster keeps the star
    // count - it IS a star figure, and that count is its tracker.
    if (d.explored) {
      this.addLine(info, `Explored: ${d.explored === 'yes' ? 'Yes' : 'Not yet'}`, 1, infoW)
    } else {
      this.addLine(info, `# of Stars Explored: ${d.starsExplored} / ${d.starCount}`, 1, infoW)
    }

    // Unity carries this line too. Constellations with nothing in the layer omit it rather
    // than advertising "0 / 0".
    if (d.deepSkyTotal > 0) {
      this.addLine(info, `Deep Sky Explored: ${d.deepSkyExplored} / ${d.deepSkyTotal}`, 2, infoW)
    }

    // Label shows the mode the button switches TO, matching the Unity build.
    const controlCount = 2
    this.viewButton = this.addButton(controls, '3D View', 0, controlCount, () =>
      this.el.sceneEl.emit('viewToggleRequested'))
    this.addButton(controls, 'Lore', 1, controlCount, () =>
      this.el.sceneEl.emit('loreJourneyRequested'))

    // The loader announces every later change, but it may have announced the starting mode
    // before this HUD existed, so adopt whatever mode it is already in.
    const loaderEl = document.querySelector('[constellation-loader]')
    const loader = loaderEl && loaderEl.components['constellation-loader']
    if (loader) this.onViewChanged({detail: {is3D: loader.data.showRealPositions}})

    this.el.appendChild(this.container)
  },

  // A bordered box, positioned along the band and holding its own contents.
  makeGroup(x, width, height, model) {
    const group = document.createElement('a-entity')
    group.setAttribute('position', `${x} 0 0`)
    if (this.data.stone && model) {
      // The model is authored for bandWidth 4; any other width scales it with the band.
      const k = this.data.bandWidth / 4
      const panel = document.createElement('a-entity')
      panel.setAttribute('gltf-model', model)
      panel.setAttribute('scale', `${k} ${k} ${k}`)
      // Appended first so it draws before the text and buttons that follow it: the renderer
      // does not sort, and the glass is a blended surface the text has to composite over.
      group.appendChild(panel)
    } else {
      this.createBorder(group, width / 2, height / 2)
    }
    this.container.appendChild(group)
    return group
  },

  // One left-aligned read-out line, placed from the group's top edge like Unity's
  // top-left-pivoted text rects.
  addLine(group, value, index, groupWidth) {
    const s = this.scale
    const capHeight = U.fontSize * s
    const maxWidth = groupWidth - (2 * U.textX * s)
    const top = (U.groupH / 2) * s

    const text = document.createElement('a-text')
    text.setAttribute('value', value)
    text.setAttribute('color', this.data.textColor)
    // The face decides the atlas, the shader and negate together - they are not separable.
    // The atlas filename deliberately avoids the '-msdf.' substring, which means a-text does
    // NOT force its msdf shader and would otherwise fall back to the single-channel sdf one,
    // reading our green channel as coverage. faceText sets all three.
    faceText(text)
    if (this.data.font !== FONT) text.setAttribute('font', this.data.font)
    text.setAttribute('width', maxWidth)
    // wrapCount sets the glyph size for a given width; ~0.62em average advance per character.
    text.setAttribute('wrap-count', Math.max(8, Math.round(maxWidth / (capHeight * 0.62))))
    text.setAttribute('align', 'left')
    text.setAttribute('anchor', 'left')
    text.setAttribute('baseline', 'center')
    text.setAttribute(
      'position',
      `${-groupWidth / 2 + (U.textX * s)} ${top + ((U.textY[index] - (U.textH / 2)) * s)} 0.01`
    )
    group.appendChild(text)
    return text
  },

  // One tappable button in the control column, centred as part of the whole stack.
  addButton(group, value, index, total, onClick) {
    const s = this.scale
    const w = U.btnW * s
    const h = U.btnH * s
    const top = (U.groupH / 2) * s
    const stackH = (total * U.btnH) + ((total - 1) * U.btnGap)
    const offset = ((U.groupH - stackH) / 2) + (index * (U.btnH + U.btnGap))

    const button = document.createElement('a-entity')
    // Invisible hit plane: the visible panel is drawn by addPanel in front of it.
    button.setAttribute('geometry', {primitive: 'plane', width: w, height: h})
    button.setAttribute('material', {shader: 'flat', opacity: 0, transparent: true, side: 'double'})
    button.setAttribute('position', `0 ${top - ((offset + (U.btnH / 2)) * s)} 0.01`)
    // Behind the entity origin, because the button label renders at local z 0.
    this.addPanel(button, w, h, -0.002)
    button.setAttribute('text', {
      value,
      align: 'center',
      color: this.data.color,
      width: w * 2.2,
    })
    button.classList.add('cantap', 'clickable')
    button.addEventListener('click', onClick)

    this.buttons.push({el: button, onClick})
    group.appendChild(button)
    return button
  },

  setButtonLabel(button, value) {
    if (button) button.setAttribute('text', 'value', value)
  },

  // ---- state announced by the components that own the behavior ----

  onViewChanged(event) {
    const is3D = event.detail && event.detail.is3D
    this.setButtonLabel(this.viewButton, is3D ? '2D View' : '3D View')
  },

  // A rounded panel: accent-coloured border ring with a translucent dark fill, matching the
  // star-info panel styling (2px solid #4287f5 over rgba(0,0,0,0.8), 10px corners).
  createBorder(parent, halfW, halfH) {
    this.addPanel(parent, halfW * 2, halfH * 2, 0)
  },

  addPanel(parent, w, h, z) {
    const d = this.data
    const bw = U.edge * this.scale
    const r = Math.min(d.cornerRadius, w / 2, h / 2)

    const border = document.createElement('a-entity')
    border.setAttribute('geometry', {primitive: 'hud-rounded-rect', width: w, height: h, radius: r})
    border.setAttribute('material', {color: d.color, shader: 'flat', side: 'double'})
    border.setAttribute('position', `0 0 ${z}`)
    parent.appendChild(border)

    const fill = document.createElement('a-entity')
    fill.setAttribute('geometry', {
      primitive: 'hud-rounded-rect',
      width: Math.max(w - (2 * bw), 0.001),
      height: Math.max(h - (2 * bw), 0.001),
      radius: Math.max(r - bw, 0),
    })
    fill.setAttribute('material', {
      color: d.backgroundColor,
      shader: 'flat',
      side: 'double',
      opacity: d.backgroundOpacity,
      transparent: true,
    })
    fill.setAttribute('position', `0 0 ${z + 0.001}`)
    parent.appendChild(fill)
    return fill
  },

  clear() {
    if (this.buttons) {
      this.buttons.forEach(({el, onClick}) => el.removeEventListener('click', onClick))
      this.buttons = []
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
    this.container = null
    this.viewButton = null
  },

  remove() {
    this.el.sceneEl.removeEventListener('viewToggleChanged', this.onViewChanged)
    this.clear()
  },
}

export {portalHeaderComponent}
