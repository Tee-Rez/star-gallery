// js/hud-shell.js - the one layer that owns the phone screen.
//
// Every button, message and card the app fixes to the screen used to position itself with its
// own top/left/bottom numbers, each written assuming where the others were. Those assumptions
// drifted - the lore card covered End the Journey, the hint pill ran into Recenter on small
// phones, a star card could open on top of the story card. This replaces all of that with rows.
//
//   top      Gallery on the left, Recenter on the right
//   message  the tutorial hint, one at a time
//   stage    the AR view. Nothing is ever mounted here.
//   sheet    the star info card or the lore story card, bottom-left, one at a time
//   actions  Back to the constellation, Next Star
//
// A component builds its element as before, then hands it to mount() instead of appending it
// to the body with position: fixed. A row can only line its children up or stack them, so two
// elements cannot land on the same spot however long a label or a description gets. Which
// elements a mode shows is decided here, in CSS, from attributes on the root - components only
// say what mode the app is in.
//
// Sizes are ranges tied to the screen: they scale with it and stop at a floor and a ceiling,
// so a small phone never drops below a 44px tap target and a tablet never gets giant pills.

const STYLE = `
/* The HUD face. Three families are loaded and one is chosen by the two variables below, so
   comparing them is a one-line change rather than a hunt through the stylesheet:

     Origin Tech        the active face. Has real lowercase, so mixed-case names and sentences
                        set normally. NON-COMMERCIAL licence - see star-gallery/origin-tech/.
     Sigil Display      drawn for this project, caps only, carries the alchemical marks.
     Sigil Text         the same alphabet with the marks dropped, for small sizes.

   Paths are relative to index.html; webpack copies src/assets to dist/assets. Keep these in step
   with js/hud-face.js, which chooses the face for the in-world text. */
@font-face {
  font-family: 'Origin Tech';
  src: url('assets/fonts/OriginTech-Regular.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Sigil Display';
  src: url('assets/fonts/SigilInscriptional-Regular.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Sigil Text';
  src: url('assets/fonts/SigilText-Regular.woff2') format('woff2');
  font-display: swap;
}

#hud {
  /* The two variables below are the whole swap: point them at a different family and the entire
     HUD changes face. js/hud-face.js does the same for the in-world text - keep them in step. */
  --hud-display: 'Origin Tech', Arial, sans-serif;
  --hud-text: 'Origin Tech', Arial, sans-serif;
  --u: 1vmin;
  --vh: 1vh;
  --accent: #4287f5;
  --gutter: clamp(8px, calc(3 * var(--u)), 16px);
  --gap: clamp(6px, calc(2 * var(--u)), 12px);
  --tap: clamp(44px, calc(12 * var(--u)), 52px);
  --fs-ui: clamp(14px, calc(4 * var(--u)), 17px);
  --fs-body: clamp(13px, calc(3.6 * var(--u)), 15px);
  --fs-caption: clamp(11px, calc(3.1 * var(--u)), 13px);
  /* The star card is double the width of a 46%-of-the-screen side card, capped at 600px, and
     rises no higher than 45% of the visible height less the actions row beneath it. */
  --card-w: min(600px, 92vw, 100%);
  --card-h: clamp(200px, calc(45 * var(--vh) - var(--gutter) - var(--tap) - var(--gap)), 440px);

  position: fixed;
  inset: 0;
  z-index: 700;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  grid-template-areas: "top" "message" "stage" "sheet" "actions";
  row-gap: var(--gap);
  padding:
    max(var(--gutter), env(safe-area-inset-top, 0px))
    max(var(--gutter), env(safe-area-inset-right, 0px))
    max(var(--gutter), env(safe-area-inset-bottom, 0px))
    max(var(--gutter), env(safe-area-inset-left, 0px));
  /* The layer itself never takes a touch: taps on empty screen reach the AR scene underneath.
     Each control opts back in while it is showing. */
  pointer-events: none;
  font-family: Arial, sans-serif;
  color: #fff;
}
/* The small viewport is the visible area with the browser's bars showing, which is the height
   a card can actually count on. */
@supports (height: 1svh) {
  #hud { --u: 1svmin; --vh: 1svh; }
}

#hud [data-region] { min-width: 0; min-height: 0; box-sizing: border-box; }
#hud [data-region="top"] {
  grid-area: top; display: flex; justify-content: space-between; align-items: flex-start; gap: var(--gap);
}
#hud [data-slot] { display: flex; align-items: center; gap: var(--gap); min-width: 0; }
#hud [data-region="message"] { grid-area: message; display: flex; justify-content: center; }
#hud [data-region="stage"] { grid-area: stage; }
#hud [data-region="sheet"] {
  grid-area: sheet; display: flex; flex-direction: column; align-items: flex-start; gap: var(--gap);
}
#hud [data-region="actions"] {
  grid-area: actions; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gap);
}

/* ---- shared looks ---- */
#hud .hud-pill {
  box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: calc(var(--gap) * 0.8);
  min-height: var(--tap);
  padding: 0 calc(var(--tap) * 0.4);
  /* The letter-spacing is not decoration: inscriptional capitals were cut with air between them,
     and set solid they close up and stop reading as separate letters. */
  font: var(--fs-ui)/1.1 var(--hud-display);
  letter-spacing: 0.06em;
  color: #fff; background: rgba(0, 0, 0, 0.7);
  border: 1px solid var(--accent); border-radius: calc(var(--tap) / 2);
  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  white-space: nowrap; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: opacity 300ms ease, background 300ms ease;
}
#hud .hud-pill svg { width: 1.05em; height: 1.05em; flex: none; }
#hud .hud-hint {
  box-sizing: border-box;
  max-width: min(100%, 26em);
  padding: calc(var(--gap) * 1.3) calc(var(--gutter) * 1.6);
  font: var(--fs-body)/1.45 var(--hud-text); letter-spacing: 0.05em; text-align: center;
  color: #fff; background: rgba(0, 0, 0, 0.7);
  border: 1px solid var(--accent); border-radius: calc(var(--tap) / 2.2);
  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  pointer-events: none;
}
#hud .hud-card {
  box-sizing: border-box;
  width: var(--card-w);
  max-height: var(--card-h);
}

/* ---- what each mode shows ----
   Modes: placement, constellation, lore, deep-sky. The panel state (a star or object card open)
   layers on top of any of them. These are !important because components still set their own
   inline display (the star card is an inline flex column), and an inline style would otherwise
   beat the layer's decision to take an element out. */
#hud[data-mode="placement"] [data-hud-id="recenter"],
#hud[data-mode="lore"] [data-hud-id="recenter"] { display: none !important; }

#hud:not([data-mode="deep-sky"]) [data-hud-id="deep-sky-back"] { display: none !important; }
#hud:not([data-mode="lore"]) [data-hud-id="lore-next"],
#hud:not([data-mode="lore"]) [data-hud-id="lore-card"] { display: none !important; }

/* Tutorial hints do not apply mid-journey or inside a deep-sky object. */
#hud[data-mode="lore"] [data-region="message"],
#hud[data-mode="deep-sky"] [data-region="message"] { display: none !important; }

/* One card at a time. A star tapped mid-journey takes the story card's place, and the story
   comes back when the star card closes. */
#hud:not([data-panel="open"]) [data-hud-id="star-card"] { display: none !important; }
#hud[data-panel="open"] [data-hud-id="lore-card"] { display: none !important; }

/* On short screens a card and a hint cannot both fit above the AR view, so the hint waits. */
@media (max-height: 700px) {
  #hud[data-panel="open"] [data-region="message"] { display: none !important; }
}

/* ---- 8th Wall owns the screen ----
   Loading, permission prompts, permission-denied and unsupported-browser screens are 8th Wall's,
   drawn at z-index 800 and up. The layer steps out of the way entirely rather than drawing
   Gallery or a hint over their text. */
#hud[data-engine="boot"], #hud[data-engine="loading"], #hud[data-engine="blocked"] { display: none !important; }
/* A runtime error stops the experience, so the only thing left worth offering is the way out -
   at the bottom, clear of the error text at the top. */
#hud[data-engine="fatal"] { z-index: 900; }
#hud[data-engine="fatal"] [data-region]:not([data-region="top"]) { display: none !important; }
#hud[data-engine="fatal"] [data-region="top"] { grid-area: actions; justify-content: flex-start; }
#hud[data-engine="fatal"] [data-hud-id]:not([data-hud-id="gallery"]) { display: none !important; }
`

let root = null
const regions = {}

function ensure() {
  if (root) return root
  const style = document.createElement('style')
  style.id = 'hud-style'
  style.textContent = STYLE
  document.head.appendChild(style)

  root = document.createElement('div')
  root.id = 'hud'
  root.dataset.engine = 'boot'
  root.dataset.mode = 'placement'
  root.dataset.panel = 'closed'
  root.innerHTML =
    '<div data-region="top"><div data-slot="start"></div><div data-slot="end"></div></div>' +
    '<div data-region="message"></div>' +
    '<div data-region="stage" aria-hidden="true"></div>' +
    '<div data-region="sheet"></div>' +
    '<div data-region="actions"></div>'
  document.body.appendChild(root)
  root.querySelectorAll('[data-region]').forEach((el) => { regions[el.dataset.region] = el })
  regions.start = root.querySelector('[data-slot="start"]')
  regions.end = root.querySelector('[data-slot="end"]')

  watchEngine()
  return root
}

// Place an element in a region. `region` is top-start, top-end, message, sheet or actions.
// The element keeps its own look; the region decides where it goes and what it sits beside.
function mount(el, region, id) {
  ensure()
  const target = region === 'top-start' ? regions.start
    : region === 'top-end' ? regions.end
      : regions[region]
  if (!target || region === 'stage') throw new Error('[hud] no region to mount into: ' + region)
  if (id) el.dataset.hudId = id
  target.appendChild(el)
  return el
}

function setMode(mode) {
  ensure().dataset.mode = mode
}

function getMode() {
  return ensure().dataset.mode
}

function setPanel(open) {
  ensure().dataset.panel = open ? 'open' : 'closed'
}

// A touch that lands on one of the layer's controls. Non-interactive parts of the layer have
// pointer-events: none, so they are never an event's target - only a real control can be.
function isHudEvent(event) {
  const t = event && event.target
  return !!(t && t.closest && root && root.contains(t))
}

// ---- tracking 8th Wall's own screens ----
//
// xrextras appends #loadingContainer while it loads and removes it once AR is running; when it
// shows a permission-denied or in-app-browser screen instead, the container stays. The landing
// page appends #almostthereContainer for an unsupported browser, and the runtime-error handler
// appends #runtimeErrorContainer only when something fails. So presence on the page is exactly
// "8th Wall owns the screen" - no restyling of their markup, only reading it.
function engineState() {
  if (document.getElementById('runtimeErrorContainer')) return 'fatal'
  if (document.getElementById('almostthereContainer')) return 'blocked'
  if (document.getElementById('loadingContainer')) return 'loading'
  return null
}

let settled = false
function refreshEngine() {
  if (!root) return
  const state = engineState()
  if (state) {
    root.dataset.engine = state
    settled = true
  } else if (settled) {
    root.dataset.engine = 'none'
  }
}

function watchEngine() {
  new MutationObserver(refreshEngine).observe(document.body, {childList: true})

  // Until the loading screen has been seen, an empty page means "not started yet", not "done".
  // These are the moments it is safe to decide there is no engine screen coming.
  const settle = () => { settled = true; refreshEngine() }
  const hook = () => {
    const scene = document.querySelector('a-scene')
    if (!scene) return
    scene.addEventListener('realityready', settle)
    scene.addEventListener('realityerror', refreshEngine)
    if (scene.hasLoaded) setTimeout(settle, 0)
    else scene.addEventListener('loaded', () => setTimeout(settle, 0), {once: true})
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook, {once: true})
  else hook()
  // A last resort, so a page with no 8th Wall screen at all can never leave the layer hidden.
  setTimeout(settle, 6000)
  // The layer may be created after the loading screen already went up.
  refreshEngine()
}

// Mode changes that follow directly from scene events live here, so no component needs to know
// about the layer just to report them.
function watchScene() {
  const scene = document.querySelector('a-scene')
  if (!scene) return
  scene.addEventListener('constellationPlaced', () => {
    if (getMode() === 'placement') setMode('constellation')
  })
  scene.addEventListener('deepSkyEntered', () => setMode('deep-sky'))
  scene.addEventListener('deepSkyExited', () => setMode('constellation'))
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchScene, {once: true})
  else watchScene()
}

const HUD = {ensure, mount, setMode, getMode, setPanel, isHudEvent}

export {HUD}
export default HUD
