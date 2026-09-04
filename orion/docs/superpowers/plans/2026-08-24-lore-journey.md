# Lore Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided, sourced "Lore" story journey that zooms through Orion's major stars with the detailed star model and cited mythology, and remove the fabricated esoteric text from the star-click panel.

**Architecture:** A new `lore-journey` A-Frame component owns all tour behavior (staging, zoom, rotation, HUD button, lore panel). It reuses the existing detailed `dynamic-star` component (one at a time), the recenter math from `reset-view-button`, and reads its stops + star entities from the `constellation-loader` component. The `portal-header` component gains a "Lore" trigger button. Because the AR camera is the phone and cannot move, all "camera movement" is done by transforming `#root` so the focused star swings in front of the current camera.

**Tech Stack:** A-Frame 1.3 (8frame), three.js (via `window.THREE`), 8th Wall `xrweb`, webpack. DOM overlays for HUD/panels.

## Global Constraints

- Everything shown in the lore panel must be **sourced** — no invented content. Use only the prose in Task 2.
- Runtime constellation data lives **embedded** in `src/js/constellation-loader.js` (`getEmbeddedConstellationData`), NOT the `orion.json` files.
- Star entities are keyed by **display name** (`entity.dataset.name`, e.g. `"Alnilam"`), and the visible core is `a-sphere:not(.cantap)`; the tap target is `a-sphere.cantap`.
- Only **one** detailed `dynamic-star` in the scene at a time — except the Belt stop (three).
- Stop-to-stop transition = **3000 ms**, `easeInOutQuad`.
- New components are registered in `src/app.js` via `AFRAME.registerComponent`, following the existing import/register pattern.
- Verify every task with: `npm run build` → serve `dist` → load in the in-app browser → inspect via `javascript_tool` / `read_console_messages`. Visual framing/rotation constants are tuned on-device.
- Not a git repo: the "Checkpoint" steps are optional; run `git init` first if you want real commits.

---

## File Structure

- **Create** `src/js/lore-journey.js` — the journey component (state, staging, zoom, rotation, HUD button, lore panel, end/recenter).
- **Modify** `src/js/portal-header.js` — add the "Lore" trigger button in the bottom band; emit `loreJourneyRequested`.
- **Modify** `src/js/constellation-loader.js` — drop the esoteric append in `formatStarInfo()`; add the `journey` array to the embedded data; instantiate `lore-journey`.
- **Modify** `src/app.js` — register the `lore-journey` component.

---

## Task 1: Remove the esoteric section from the star-click panel

**Files:**
- Modify: `src/js/constellation-loader.js` (the `formatStarInfo` method, ~lines 710-736)

**Interfaces:**
- Produces: `dataset.info` strings that no longer contain `"Esoteric significance:"`.

- [ ] **Step 1: Locate and remove the esoteric append**

In `formatStarInfo(starData)`, delete the block that appends the esoteric text:

```javascript
        // Add esoteric information if available
        if (starData.info.esoteric) {
          info += `\n\nEsoteric significance: ${starData.info.esoteric}`
        }
```

Leave the `basic` and `scientific` sections intact. (The `esoteric` fields remain in the data but are now unused by the click panel.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles with only the usual 2 webpack perf warnings.

- [ ] **Step 3: Verify in browser**

Serve `dist`, load the page, then in `javascript_tool`:

```javascript
(() => {
  const el = document.querySelector('[data-name="Betelgeuse"]');
  return { info: el.dataset.info, hasEsoteric: el.dataset.info.includes('Esoteric significance:') };
})();
```

Expected: `hasEsoteric: false`, and `info` still contains the basic + scientific text.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/constellation-loader.js && git commit -m "feat: remove fabricated esoteric text from star-click panel"
```

---

## Task 2: Add the sourced `journey` data to the embedded constellation

**Files:**
- Modify: `src/js/constellation-loader.js` (inside `getEmbeddedConstellationData`, the `'orion'` object — add a top-level `journey` array next to `stars`/`connections`)

**Interfaces:**
- Produces: `this.constellationData.journey` — an array of stop objects:
  `{ id: string, title: string, centerStarName: string, targetStarNames: string[], story: string, sources: string }`

- [ ] **Step 1: Add the journey array**

Inside the `'orion'` object (after `connections` / `deepSkyObjects`), add:

```javascript
'journey': [
  {
    id: 'betelgeuse',
    title: 'Betelgeuse',
    centerStarName: 'Betelgeuse',
    targetStarNames: ['Betelgeuse'],
    story: "Its name comes from the Arabic Yad al-Jawza', 'the Hand of Orion' — the familiar 'Betelgeuse' is a medieval mistranscription that turned the leading letter into a 'b'. Skywatchers everywhere remarked on its ember-red color: Ptolemy called it 'orange-tawny,' Chinese astronomers three centuries earlier recorded it as yellow, and the Inuit knew it as Ulluriajjuaq, 'the great star.' Aboriginal groups in South Australia preserved oral traditions of its changing brightness long before Western science confirmed it is a variable star. In fixed-star astrology it carries a martial, Mars-like nature, linked to honor and fortune.",
    sources: 'R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923); Wikipedia',
  },
  {
    id: 'bellatrix',
    title: 'Bellatrix',
    centerStarName: 'Bellatrix',
    targetStarNames: ['Bellatrix'],
    story: "Its Arabic title Al Najid, 'the Conqueror,' was rendered in the medieval Alfonsine Tables as 'the Female Warrior' — the Amazon Star, a name Bellatrix preserves in Latin. In the fixed-star astrology of Vivian Robson it promises great civil or military honor, but warns of sudden dishonor should fortune turn.",
    sources: 'R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)',
  },
  {
    id: 'belt',
    title: "Orion's Belt",
    centerStarName: 'Alnilam',
    targetStarNames: ['Alnitak', 'Alnilam', 'Mintaka'],
    story: "The three belt stars carry Arabic names — Al Nitak (the girdle), Al Nitham (the string of pearls), and Al Mintaqah (the belt). Across the world they have been read as a set: the Three Kings, the Three Marys, Jacob's Rod, the Golden Yard-arm. To the Maya they were the Three Hearthstones of Creation — the triangular hearth at the heart of every home, written across the sky, with the glowing Orion Nebula below as the smoke and fire of creation itself.",
    sources: 'R.H. Allen, Star Names (1899); Maya astronomy (Mexicolore); V. Robson, Fixed Stars (1923)',
  },
  {
    id: 'saiph',
    title: 'Saiph',
    centerStarName: 'Saiph',
    targetStarNames: ['Saiph'],
    story: "Saiph takes its name from the Arabic Saif al-Jabbar, 'the Sword of the Giant.' Quieter in lore than its neighbors, it holds a place in Maya cosmology as one of the Three Hearthstones of Creation, forming — with Rigel and the belt — the cosmic hearth around the nebula's fire.",
    sources: 'R.H. Allen, Star Names (1899); Maya astronomy (Mexicolore)',
  },
  {
    id: 'rigel',
    title: 'Rigel',
    centerStarName: 'Rigel',
    targetStarNames: ['Rigel'],
    story: "Rigel is the 'left foot of Orion,' from the Arabic Rijl Jawza'. Norse tradition remembered it as a toe of Aurvandil the Bold: the god Thor, carrying him across the icy rivers, broke off a frostbitten toe and flung it into the sky, where it became a star. Roman farmers, by contrast, blamed Rigel for winter storms. In astrology it is a star of Jupiter and Saturn — honor, riches, and lasting fortune.",
    sources: 'R.H. Allen, Star Names (1899); V. Robson, Fixed Stars (1923)',
  },
],
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles clean.

- [ ] **Step 3: Verify**

In `javascript_tool`:

```javascript
(() => {
  const loader = document.querySelector('[constellation-loader]').components['constellation-loader'];
  const j = loader.constellationData.journey;
  return { count: j.length, ids: j.map(s => s.id), beltTargets: j.find(s=>s.id==='belt').targetStarNames };
})();
```

Expected: `count: 5`, ids `['betelgeuse','bellatrix','belt','saiph','rigel']`, beltTargets `['Alnitak','Alnilam','Mintaka']`.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/constellation-loader.js && git commit -m "feat: add sourced Orion lore journey data"
```

---

## Task 3: Add the "Lore" trigger button to the portal frame

**Files:**
- Modify: `src/js/portal-header.js` (extend `build()` and add a handler)

**Interfaces:**
- Produces: a tappable button in the bottom band; on tap it emits `this.el.sceneEl.emit('loreJourneyRequested')`.
- Consumes: existing `portal-header` schema (`frameWidth`, `frameHeight`, `margin`, `color`).

- [ ] **Step 1: Add a bottom-band button in `build()`**

At the end of `build()` (after the count text is appended), add:

```javascript
    // Bottom band: "Lore" button that launches the story journey.
    const loreBtn = document.createElement('a-entity')
    loreBtn.setAttribute('geometry', {primitive: 'plane', width: 1.4, height: 0.6})
    loreBtn.setAttribute('material', {color: '#001a00', opacity: 0.85, shader: 'flat', side: 'double'})
    loreBtn.setAttribute('position', `0 ${-bandY} 0.02`)
    loreBtn.classList.add('cantap', 'clickable')
    loreBtn.setAttribute('text', {value: 'Lore', align: 'center', color: d.color, width: 4})
    this.onLoreClick = () => this.el.sceneEl.emit('loreJourneyRequested')
    loreBtn.addEventListener('click', this.onLoreClick)
    this.loreBtn = loreBtn
    this.container.appendChild(loreBtn)
```

- [ ] **Step 2: Clean up the listener in `clear()`**

In `clear()`, before removing the container, add:

```javascript
    if (this.loreBtn && this.onLoreClick) {
      this.loreBtn.removeEventListener('click', this.onLoreClick)
    }
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(() => {
  const header = document.querySelector('#portal-header');
  const btn = header.querySelector('.clickable[text]') || header.querySelector('a-entity[text*="Lore"]');
  let fired = false;
  document.querySelector('a-scene').addEventListener('loreJourneyRequested', () => { fired = true; }, {once:true});
  const b = Array.from(header.querySelectorAll('a-entity')).find(e => (e.getAttribute('text')||{}).value === 'Lore');
  b && b.emit('click');
  return { found: !!b, position: b && b.getAttribute('position'), eventFired: fired };
})();
```

Expected: `found: true`, position y is the negative band center (bottom band), `eventFired: true`.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/portal-header.js && git commit -m "feat: add Lore trigger button to portal frame"
```

---

## Task 4: Create the `lore-journey` component skeleton (mode enter/exit + HUD button)

**Files:**
- Create: `src/js/lore-journey.js`
- Modify: `src/app.js` (register component)
- Modify: `src/js/constellation-loader.js` (instantiate the component)

**Interfaces:**
- Produces: an A-Frame component `lore-journey` on the scene. Public methods used by later tasks: `startJourney()`, `enterMode()`, `exitMode()`, `getStops()`, `getStarEntity(name)`.
- Consumes: `loreJourneyRequested` event (Task 3); `constellation-loader` component data (Task 2).

- [ ] **Step 1: Create the component file**

Create `src/js/lore-journey.js`:

```javascript
// js/lore-journey.js - Guided "Lore" story journey through Orion's major stars.
const loreJourneyComponent = {
  schema: {
    focusDistance: {type: 'number', default: 2.0},   // units in front of camera for the focused star
    zoomScale: {type: 'number', default: 2.5},        // how much #root scales up during the journey
    transitionDur: {type: 'number', default: 3000},   // ms to glide between stops
    rotationSpeed: {type: 'number', default: 0.12},   // rad/sec slow orbit while parked
  },

  init() {
    this.active = false
    this.index = 0
    this.stops = []
    this.detailedStars = []
    this.animating = false

    this.onRequest = this.startJourney.bind(this)
    this.el.sceneEl.addEventListener('loreJourneyRequested', this.onRequest)

    this.createHudButton()
  },

  loader() {
    const el = document.querySelector('[constellation-loader]')
    return el ? el.components['constellation-loader'] : null
  },

  getStops() {
    const l = this.loader()
    return (l && l.constellationData && l.constellationData.journey) || []
  },

  getStarEntity(name) {
    return document.querySelector(`[data-name="${name}"]`)
  },

  createHudButton() {
    this.hud = document.createElement('div')
    this.hud.style.cssText = `
      position: fixed; bottom: 24px; right: 20px;
      background: rgba(0,0,0,0.7); color: #fff; padding: 12px 22px;
      border: 1px solid #4287f5; border-radius: 20px;
      font-family: Arial, sans-serif; font-size: 16px; z-index: 1000;
      cursor: pointer; opacity: 0; pointer-events: none;
      transition: opacity 300ms ease; user-select: none; -webkit-tap-highlight-color: transparent;`
    this.hud.textContent = 'Next Star'
    this.onHud = (e) => { e.preventDefault(); e.stopPropagation(); this.next() }
    this.hud.addEventListener('click', this.onHud)
    this.hud.addEventListener('touchend', this.onHud)
    document.body.appendChild(this.hud)
  },

  showHud(show) {
    this.hud.style.opacity = show ? '1' : '0'
    this.hud.style.pointerEvents = show ? 'auto' : 'none'
  },

  enterMode() {
    this.active = true
    // Force 3D depth view on.
    const l = this.loader()
    if (l && !l.data.showRealPositions) {
      l.data.showRealPositions = true
      l.updatePositions()
    }
    // Hide the Recenter button and suppress normal clicks.
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) reset.components['reset-view-button'].hideButton()
    this.el.sceneEl.emit('starInfoClosed') // close any open info panel
    this.showHud(true)
  },

  exitMode() {
    this.active = false
    this.showHud(false)
    this.clearDetailed()
    // Restore all basic spheres.
    document.querySelectorAll('[data-name]').forEach((s) => {
      const core = s.querySelector('a-sphere:not(.cantap)')
      if (core) core.setAttribute('visible', true)
    })
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) reset.components['reset-view-button'].showButton()
  },

  startJourney() {
    if (this.active) return
    this.stops = this.getStops()
    if (!this.stops.length) return
    this.index = 0
    this.enterMode()
    this.goToStop(0)  // implemented in Task 6
  },

  next() { /* implemented in Task 7 */ },
  goToStop() { /* implemented in Task 6 */ },
  clearDetailed() { /* implemented in Task 6 */ },

  remove() {
    this.el.sceneEl.removeEventListener('loreJourneyRequested', this.onRequest)
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud)
  },
}

export {loreJourneyComponent}
```

- [ ] **Step 2: Register in `app.js`**

After the `portal-header` registration, add:

```javascript
import {loreJourneyComponent} from './js/lore-journey'
AFRAME.registerComponent('lore-journey', loreJourneyComponent)
```

- [ ] **Step 3: Instantiate the component**

In `constellation-loader.js`, at the end of `createPortalHeader` (or in `createPortal`), ensure the scene has the component:

```javascript
    // Attach the lore-journey behavior to the scene once.
    const scene = this.el.sceneEl
    if (!scene.hasAttribute('lore-journey')) scene.setAttribute('lore-journey', '')
```

- [ ] **Step 4: Build and verify wiring**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(() => {
  const scene = document.querySelector('a-scene');
  const comp = scene.components['lore-journey'];
  comp && comp.startJourney();
  return { hasComp: !!comp, active: comp && comp.active, hudVisible: comp && comp.hud.style.opacity };
})();
```

Expected: `hasComp: true`, after `startJourney()` → `active: true`, `hudVisible: "1"`. Check `read_console_messages` for errors (goToStop is a stub, so no crash — it's an empty function).

- [ ] **Step 5: Checkpoint (optional)**

```bash
git add src/js/lore-journey.js src/app.js src/js/constellation-loader.js && git commit -m "feat: lore-journey component skeleton with HUD + mode enter/exit"
```

---

## Task 5: Lore panel (DOM) — render the sourced story

**Files:**
- Modify: `src/js/lore-journey.js` (add panel creation + `showLore(stop)` / `hideLore()`)

**Interfaces:**
- Produces: `showLore(stop)` renders `stop.title`, `stop.story`, `stop.sources`; `hideLore()` slides it away. Reuses the `star-info-overlay` visual style.

- [ ] **Step 1: Create the panel in `init()`**

Add to `init()` (after `createHudButton()`):

```javascript
    this.createPanel()
```

And add these methods:

```javascript
  createPanel() {
    this.panel = document.createElement('div')
    this.panel.id = 'lore-panel'
    this.panel.style.cssText = `
      position: fixed; bottom: 40px; left: -400px; width: 250px;
      background: rgba(0,0,0,0.8); border: 2px solid #4287f5; border-radius: 10px;
      padding: 15px; color: #fff; font-family: Arial, sans-serif;
      transition: left 500ms ease-out; z-index: 1000; backdrop-filter: blur(5px);
      max-height: 45vh; overflow-y: auto; box-sizing: border-box;`
    document.body.appendChild(this.panel)
  },

  showLore(stop) {
    this.panel.innerHTML = `
      <h2 style="margin:0 0 10px 0;color:#4287f5;font-size:18px;">${stop.title}</h2>
      <p style="margin:0 0 12px 0;line-height:1.5;font-size:13px;">${stop.story}</p>
      <div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:8px;font-size:11px;font-style:italic;opacity:0.8;">
        Sources: ${stop.sources}
      </div>`
    this.panel.scrollTop = 0
    this.panel.style.left = '15px'
  },

  hideLore() {
    this.panel.style.left = '-400px'
  },
```

- [ ] **Step 2: Clean up in `remove()`**

Add to `remove()`:

```javascript
    if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel)
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(() => {
  const comp = document.querySelector('a-scene').components['lore-journey'];
  const stops = comp.getStops();
  comp.showLore(stops[2]); // belt
  const p = document.getElementById('lore-panel');
  return { left: p.style.left, hasTitle: p.innerHTML.includes("Orion's Belt"), hasSources: p.innerHTML.includes('Mexicolore') };
})();
```

Expected: `left: "15px"`, `hasTitle: true`, `hasSources: true`.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/lore-journey.js && git commit -m "feat: lore panel renders sourced story + sources"
```

---

## Task 6: Focus staging + detailed star spawn (single-star stop)

**Files:**
- Modify: `src/js/lore-journey.js` (implement `goToStop`, `frameStar`, `spawnDetailed`, `clearDetailed`)

**Interfaces:**
- Consumes: `THREE` (global), `dynamic-star` component, star entities.
- Produces: `goToStop(i)` frames the stop's center star in front of the camera (scaled), spawns detailed star(s) at the target star position(s), hides those stars' basic spheres, and shows the lore panel.

- [ ] **Step 1: Implement staging helpers**

Replace the `goToStop`/`clearDetailed` stubs with:

```javascript
  goToStop(i) {
    const stop = this.stops[i]
    if (!stop) return
    this.index = i
    this.clearDetailed()
    // Show all involved stars as detailed; hide their basic spheres.
    stop.targetStarNames.forEach((name) => this.spawnDetailed(name))
    // Frame the center star in front of the current camera.
    this.frameStar(this.getStarEntity(stop.centerStarName), false)
    this.showLore(stop)
    // Update HUD label (last stop => end).
    this.hud.textContent = (i === this.stops.length - 1) ? 'End the Journey' : 'Next Star'
  },

  spawnDetailed(name) {
    const starEntity = this.getStarEntity(name)
    if (!starEntity) return
    const core = starEntity.querySelector('a-sphere:not(.cantap)')
    const color = core ? core.getAttribute('material').color : '#ffffff'
    const size = core ? parseFloat(core.getAttribute('radius') || 0.1) : 0.1
    if (core) core.setAttribute('visible', false)   // hide basic sphere

    const detailed = document.createElement('a-entity')
    detailed.setAttribute('dynamic-star', {type: this.typeFromColor(color), size: size * 4})
    detailed.setAttribute('scale', '0 0 0')
    starEntity.appendChild(detailed)
    detailed.setAttribute('animation', {property: 'scale', to: '1 1 1', dur: 800, easing: 'easeOutElastic'})
    this.detailedStars.push({entity: detailed, core})
  },

  clearDetailed() {
    this.detailedStars.forEach(({entity, core}) => {
      if (core) core.setAttribute('visible', true)
      if (entity && entity.parentNode) entity.parentNode.removeChild(entity)
    })
    this.detailedStars = []
  },

  typeFromColor(color) {
    if (!color) return 'white'
    if (color.includes('ff5') || color.includes('ff4') || color.includes('ff0')) return 'red'
    if (color.includes('44') || color.includes('7a') || color.includes('aa') || color.includes('bb') || color.includes('99')) return 'blue'
    return 'white'
  },

  // Position #root so `starEntity` sits `focusDistance` in front of the camera, scaled up.
  frameStar(starEntity, animate) {
    if (!starEntity) return
    const root = document.querySelector('#root').object3D
    const cam = (document.querySelector('a-camera') || document.querySelector('[camera]')).object3D
    const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).normalize()
    const focal = camPos.clone().addScaledVector(fwd, this.data.focusDistance)

    // Target transform: scale up, face the camera, then translate so the star lands on `focal`.
    const targetScale = this.data.zoomScale
    const targetQuat = new THREE.Quaternion()
    const m = new THREE.Matrix4().lookAt(camPos, focal, new THREE.Vector3(0, 1, 0))
    targetQuat.setFromRotationMatrix(m)

    // Compute the position that puts the star at `focal` given target scale+rotation.
    root.scale.set(targetScale, targetScale, targetScale)
    root.quaternion.copy(targetQuat)
    root.updateMatrixWorld(true)
    const starWorld = new THREE.Vector3(); starEntity.object3D.getWorldPosition(starWorld)
    const targetPos = root.position.clone().add(focal.clone().sub(starWorld))
    root.position.copy(targetPos)

    // Store the focal point for the parked rotation (Task 7).
    this.focal = focal
  },
```

- [ ] **Step 2: Build and verify staging**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(() => {
  const comp = document.querySelector('a-scene').components['lore-journey'];
  comp.startJourney();
  const detailed = document.querySelectorAll('[dynamic-star]').length;
  const betelCore = document.querySelector('[data-name="Betelgeuse"] a-sphere:not(.cantap)');
  return { detailedCount: detailed, betelBasicHidden: betelCore.getAttribute('visible') === false || betelCore.getAttribute('visible') === 'false', rootScale: document.querySelector('#root').object3D.scale.x };
})();
```

Expected: `detailedCount: 1` (Betelgeuse), `betelBasicHidden: true`, `rootScale` ≈ 2.5. Check `read_console_messages` — no errors.

- [ ] **Step 3: On-device visual check (note)**

The exact `focusDistance`/`zoomScale` that make the star "fill most of the view" are tuned on a phone. Defaults are a starting point; adjust the schema values after seeing it in AR.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/lore-journey.js && git commit -m "feat: frame + detailed-star spawn per journey stop"
```

---

## Task 7: Parked rotation + 3-second transitions (advance)

**Files:**
- Modify: `src/js/lore-journey.js` (add `tick`, implement `next`, add smooth transition to `frameStar`)

**Interfaces:**
- Consumes: `this.focal` (Task 6), `this.data.rotationSpeed`, `this.data.transitionDur`.
- Produces: `next()` advances to the next stop with a 3s glide (or ends on the last); `tick()` slowly orbits `#root` around `this.focal` while parked.

- [ ] **Step 1: Add slow orbit in `tick()`**

```javascript
  tick(time, dt) {
    if (!this.active || this.animating || !this.focal || !dt) return
    const root = document.querySelector('#root').object3D
    const angle = this.data.rotationSpeed * (dt / 1000)
    const up = new THREE.Vector3(0, 1, 0)
    root.position.sub(this.focal).applyAxisAngle(up, angle).add(this.focal)
    root.rotateOnWorldAxis(up, angle)
  },
```

- [ ] **Step 2: Implement `next()` with the 3s transition**

```javascript
  next() {
    if (!this.active || this.animating) return
    if (this.index >= this.stops.length - 1) { this.endJourney(); return }
    this.transitionTo(this.index + 1)
  },

  transitionTo(i) {
    this.animating = true
    this.hideLore()
    this.clearDetailed()
    const stop = this.stops[i]
    const starEntity = this.getStarEntity(stop.centerStarName)
    const root = document.querySelector('#root').object3D

    // Compute the target transform (same math as frameStar, but capture start/end for a lerp).
    const start = {p: root.position.clone(), q: root.quaternion.clone(), s: root.scale.clone()}
    this.frameStar(starEntity, false)                // sets root to the TARGET transform
    const end = {p: root.position.clone(), q: root.quaternion.clone(), s: root.scale.clone()}
    // Reset to start; lerp over transitionDur.
    root.position.copy(start.p); root.quaternion.copy(start.q); root.scale.copy(start.s)

    const t0 = performance.now()
    const dur = this.data.transitionDur
    const step = () => {
      const k = Math.min((performance.now() - t0) / dur, 1)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2 // easeInOutQuad
      root.position.lerpVectors(start.p, end.p, e)
      root.scale.lerpVectors(start.s, end.s, e)
      root.quaternion.copy(start.q).slerp(end.q, e)
      if (k < 1) { requestAnimationFrame(step) } else {
        this.animating = false
        this.index = i
        stop.targetStarNames.forEach((n) => this.spawnDetailed(n))
        this.showLore(stop)
        this.hud.textContent = (i === this.stops.length - 1) ? 'End the Journey' : 'Next Star'
      }
    }
    requestAnimationFrame(step)
  },
```

- [ ] **Step 3: Build and verify advance**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(async () => {
  const comp = document.querySelector('a-scene').components['lore-journey'];
  comp.startJourney();
  comp.next();
  await new Promise(r => setTimeout(r, 3300));
  return { index: comp.index, animating: comp.animating, hud: comp.hud.textContent, panelHasBellatrix: document.getElementById('lore-panel').innerHTML.includes('Bellatrix') };
})();
```

Expected: after ~3.3s → `index: 1`, `animating: false`, panel shows Bellatrix.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/lore-journey.js && git commit -m "feat: 3s stop transitions + slow orbit around focused star"
```

---

## Task 8: Belt stop (3 detailed, Alnilam centered) + End the Journey

**Files:**
- Modify: `src/js/lore-journey.js` (implement `endJourney`; verify belt handling already works via `targetStarNames`)

**Interfaces:**
- Consumes: `reset-view-button` recenter (via its component) or the same math.
- Produces: `endJourney()` recenters the constellation to front view and calls `exitMode()`.

- [ ] **Step 1: Implement `endJourney()`**

```javascript
  endJourney() {
    this.animating = true
    this.hideLore()
    this.clearDetailed()
    this.focal = null
    // Reuse the existing recenter to restore the front view.
    const reset = document.querySelector('[reset-view-button]')
    if (reset && reset.components['reset-view-button']) {
      const rc = reset.components['reset-view-button']
      rc.isVisible = true          // allow recenter even though the button is hidden
      rc.recenterConstellation()
    }
    setTimeout(() => { this.animating = false; this.exitMode() }, 900)
  },
```

- [ ] **Step 2: Verify the Belt stop shows three detailed stars centered on Alnilam**

Run: `npm run build`, reload. In `javascript_tool`:

```javascript
(async () => {
  const comp = document.querySelector('a-scene').components['lore-journey'];
  comp.startJourney();
  comp.next(); await new Promise(r=>setTimeout(r,3300)); // Bellatrix
  comp.next(); await new Promise(r=>setTimeout(r,3300)); // Belt
  const detailed = document.querySelectorAll('[dynamic-star]').length;
  const beltCores = ['Alnitak','Alnilam','Mintaka'].map(n => document.querySelector(`[data-name="${n}"] a-sphere:not(.cantap)`).getAttribute('visible'));
  return { index: comp.index, detailedCount: detailed, beltBasicHidden: beltCores, focalSet: !!comp.focal };
})();
```

Expected: `index: 2`, `detailedCount: 3`, all three belt basics hidden (`false`), `focalSet: true` (Alnilam is the center).

- [ ] **Step 3: Verify End the Journey**

In `javascript_tool`:

```javascript
(async () => {
  const comp = document.querySelector('a-scene').components['lore-journey'];
  // fast-forward to last stop
  comp.startJourney();
  for (let i=0;i<4;i++){ comp.next(); await new Promise(r=>setTimeout(r,3300)); }
  const hudAtEnd = comp.hud.textContent;
  comp.next(); // triggers endJourney
  await new Promise(r=>setTimeout(r,1000));
  const anyDetailed = document.querySelectorAll('[dynamic-star]').length;
  const betelVisible = document.querySelector('[data-name="Betelgeuse"] a-sphere:not(.cantap)').getAttribute('visible');
  return { hudAtEnd, active: comp.active, anyDetailed, betelVisible };
})();
```

Expected: `hudAtEnd: "End the Journey"`, after end → `active: false`, `anyDetailed: 0`, `betelVisible: true` (basics restored). Check `read_console_messages` — no errors.

- [ ] **Step 4: Checkpoint (optional)**

```bash
git add src/js/lore-journey.js && git commit -m "feat: belt stop (3 detailed) + end-of-journey recenter and restore"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** esoteric removal (Task 1); sourced data (Task 2); Lore button (Task 3); mode enter/exit + HUD + suppress clicks + hide Recenter (Task 4); lore panel (Task 5); framing + detailed star + hide basic (Task 6); 3s transitions + orbit (Task 7); belt stop (Alnilam center, 3 detailed) + End→recenter+restore (Task 8). All spec sections covered.
- **Type consistency:** method names (`startJourney`, `goToStop`, `frameStar`, `spawnDetailed`, `clearDetailed`, `next`, `transitionTo`, `endJourney`, `enterMode`, `exitMode`, `showLore`, `hideLore`) are defined before use across tasks; `this.focal`, `this.detailedStars`, `this.stops`, `this.index`, `this.animating` are introduced in Task 4/6 and used consistently.
- **Data keys:** stops use `centerStarName` / `targetStarNames` (display names) matching `[data-name="…"]` lookups.

## Known on-device tuning items (not blockers)

- `focusDistance`, `zoomScale`, detailed-star `size * 4`, and `rotationSpeed` are starting values; fine-tune in AR so the focused star "fills most of the view" and the orbit reads well.
- Confirm the detailed star's z-order vs. the hider walls at the zoomed scale; if it clips, lift the detailed entity's local z or the focus distance.
