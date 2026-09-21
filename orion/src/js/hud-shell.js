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
/* The HUD face. Six families are loaded and two are chosen by the variables below, so
   comparing a pairing is a one-line change rather than a hunt through the stylesheet:

     Digital Tech       ON TEST - a single unicase weight, currently driving BOTH roles at
                        once so it can be judged as one look before any split is decided.
                        Blocky segmented-display letterforms; lowercase renders identical to
                        uppercase (confirmed by rendering the glyphs, not just their metrics).
     Space Future Bold  the previous DISPLAY face - every button (.hud-pill, the tabs and
                        controls inside a card, the close orb) and the hint pill.
     Space Future Reg   the previous TEXT face - star-info and lore panel body copy. Real
                        lowercase at a genuine x-height (not near-cap like Origin Tech), so
                        mixed-case sentences read as prose rather than small caps.
     Origin Tech        the face before that, both roles at once. Kept loaded so reverting is
                        one line. NON-COMMERCIAL licence - see star-gallery/origin-tech/.
     Sigil Display      drawn for this project, caps only, carries the alchemical marks.
     Sigil Text         the same alphabet with the marks dropped, for small sizes.

   Paths are relative to index.html; webpack copies src/assets to dist/assets. js/hud-face.js
   chooses a face for the in-world text SEPARATELY - it still points at Origin Tech, because an
   in-world face needs its own generated MSDF atlas (see star-gallery/sigil-font/), which none
   of Digital Tech / Space Future have yet. Until that exists, the in-world "3D View" / "Lore"
   buttons stay in Origin Tech regardless of what is on test here. */
@font-face {
  font-family: 'Digital Tech';
  src: url('assets/fonts/DigitalTech-Regular.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Space Future Bold';
  src: url('assets/fonts/SpaceFuture-Bold.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Space Future Regular';
  src: url('assets/fonts/SpaceFuture-Regular.woff2') format('woff2');
  font-display: swap;
}
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
  /* The two variables below are the whole swap: point them at a different family and every
     button or every panel changes face in one edit, without a hunt through the stylesheet.
     They do not have to match each other - buttons and reading text are different jobs.
     Both point at Digital Tech right now, on test - see the comment above. */
  --hud-display: 'Digital Tech', Arial, sans-serif;
  --hud-text: 'Digital Tech', Arial, sans-serif;
  --u: 1vmin;
  --vh: 1vh;
  --accent: #4287f5;
  /* Two inks, because the two frames are opposites. A pill is pale marble, so its lettering is
     cut dark into the stone; the card's interior is smoked glass, so its lettering is light and
     the gold is the accent. Anything written on a frame takes one of these, never #fff. */
  --ink: #2b2318;
  --ink-dim: rgba(43, 35, 24, 0.68);
  --gold: #c9a24a;
  --gutter: clamp(8px, calc(3 * var(--u)), 16px);
  --gap: clamp(6px, calc(2 * var(--u)), 12px);
  --tap: clamp(44px, calc(12 * var(--u)), 52px);
  /* A round button's hit box, and the disc drawn inside it. Two numbers, because what you see
     and what you can hit are not the same thing here - see .hud-orb. */
  --orb-hit: 44px;
  --orb: 30px;
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
/* ---- the stone frames ----
   A pill is a nine-slice, not a stretched picture. The caps are the left and right slices and
   only the middle is stretched, so Gallery and Back to the constellation wear the same asset at
   completely different widths with the corner radius and the gold line identical on both. The
   caps are half the pill's height, because the ends are semicircles - hence calc(--tap / 2).

   The frames are pale marble, so the ink had to go dark. White text on cream is unreadable, and
   that is a consequence of the art direction rather than a preference. */
#hud .hud-pill {
  box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: calc(var(--gap) * 0.8);
  min-height: var(--tap);
  padding: 0 calc(var(--tap) * 0.5);
  font: var(--fs-ui)/1.1 var(--hud-display);
  letter-spacing: 0.04em;
  color: var(--ink);
  background: none;
  border: 0;
  /* pill.png is 624x287 and its ends are semicircles, so each cap slice is half the height:
     287 / 2 = 144. The rendered cap is half the pill's height for the same reason, which is
     what keeps the ends circular instead of oval as the label gets longer. */
  border-image: url('assets/ui/pill.png') 0 144 fill / 0 calc(var(--tap) / 2) stretch;
  /* The shadow is CSS, not baked into the asset: a baked one shows as a grey halo over the
     camera feed, where this falls on whatever is actually behind the pill. */
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
  white-space: nowrap; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: opacity 300ms ease, filter 200ms ease, transform 120ms ease;
}
#hud .hud-pill:active {
  transform: translateY(1px);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)) brightness(0.93);
}
#hud .hud-pill svg { width: 1.05em; height: 1.05em; flex: none; }
/* The hint wears the pill too. Its cap is sized from the pill's own height rather than the
   hint's, so a hint that wraps to two lines gets the cap of a one-line pill: the end stays the
   shape it is drawn as instead of being pulled into an oval by the extra line. */
#hud .hud-hint {
  box-sizing: border-box;
  max-width: min(100%, 26em);
  min-height: var(--tap);
  padding: calc(var(--gap) * 1.1) calc(var(--tap) * 0.55);
  font: var(--fs-body)/1.45 var(--hud-text); letter-spacing: 0.04em; text-align: center;
  color: var(--ink);
  background: none;
  border: 0;
  border-image: url('assets/ui/pill.png') 0 144 fill / 0 calc(var(--tap) / 2) stretch;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.5));
  pointer-events: none;
}

/* ---- the glass card ----
   The star panel and the lore panel are the same frame at two sizes. It is a nine-slice like
   the pill, but rectangular, so all four rails hold their thickness while the middle stretches
   to whatever the content needs.

   The slice numbers are measured on the 468x403 asset: 31 in from each side, 37 from top and
   bottom, which lands just inside the glass. The rendered border keeps that 37:31 proportion
   (24:20) so the mitred corners of the marble stay square rather than shearing.

   'fill' is what paints the middle slice - the smoked glass - across the content box. Without
   it the nine-slice draws the frame and leaves a hole. The glass carries its own alpha, so the
   camera feed reads through the panel and nothing here needs a backdrop-filter.

   The asset was rebuilt for this: it came with a Greek-key meander along the bottom rail and a
   gold rule and diamond across the glass, and both of them are features a nine-slice stretches.
   See concepts/hud-frames/cutout.py. The rule is re-made below as a border under the header,
   where it stays one pixel thick at any panel size. */
#hud .hud-card {
  box-sizing: border-box;
  width: var(--card-w);
  max-height: var(--card-h);
  color: #f2ece0;
  background: none;
  /* Air between the frame and the words. The marble rail is the card's border, so without this
     the text starts on the very first pixel of glass and reads as cramped against the stone.
     It belongs here rather than inline on each panel: it is a consequence of the frame, so the
     rule that draws the frame should own it. An absolutely positioned child - the close orb -
     measures from the padding box and so is not pushed inwards by it. */
  padding: 10px 12px;
  border-style: solid;
  border-width: 24px 20px;
  border-image-source: url('assets/ui/card-glass.png');
  border-image-slice: 37 31 fill;
  border-image-repeat: stretch;
  border-radius: 0;
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.5));
}
/* Absolutely positioned children of a card - the close button - measure from the padding box,
   so they land inside the marble without having to know how thick it is. */
#hud .hud-card { position: relative; }
#hud .hud-card .hud-rule {
  border-bottom: 1px solid var(--gold);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}
/* A button does not inherit its font, so the tabs inside a card were the one thing on the
   screen still set in Arial. */
#hud .hud-card button { font-family: var(--hud-display); letter-spacing: 0.03em; }
/* Every control inside a card measures its width the way the card does. Without this a
   "width: 100%" button adds its padding and border ON TOP of the full width and pushes a
   horizontal scrollbar into the panel. */
#hud .hud-card button,
#hud .hud-card input,
#hud .hud-card select { box-sizing: border-box; max-width: 100%; }

/* ---- the round button ----
   orb.png is the pill's own two caps butted together - the ends are exact semicircles, so
   they close into a circle carrying the same marble, the same gold ring and the same edge
   softness as the pills beside it (see concepts/hud-frames/cutout.py).

   It is a BACKGROUND rather than a nine-slice, drawn at a fixed size in the middle of a
   larger box. That split is the point: the visible button is small enough to tuck into a
   card's corner, while the box it sits in stays a full finger-sized tap target. Shrinking
   both would have put the target back under 44px, which is what it was raised from.

   Marble is pale, so the glyph is cut dark into it, like a pill's lettering.

   The box is --orb-hit rather than --tap, and that is deliberate rather than lazy. --tap
   climbs to 52px on a big screen, and a 52px box in the card's corner reaches past the bottom
   of the header band into the scrolling region below it - where it would quietly eat the first
   touch of a flick begun in that corner. 44px is the figure the target has to clear (WCAG
   2.5.5 AAA; the AA floor in 2.5.8 is only 24px), and pinning it there keeps the whole box
   inside the header. */
#hud .hud-orb {
  box-sizing: border-box;
  width: var(--orb-hit); height: var(--orb-hit);
  display: flex; align-items: center; justify-content: center;
  font: calc(var(--fs-ui) * 0.78)/1 var(--hud-display);
  color: var(--ink);
  background: url('assets/ui/orb.png') center / var(--orb, 30px) var(--orb, 30px) no-repeat;
  border: 0; padding: 0;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  cursor: pointer; touch-action: manipulation;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: filter 200ms ease, transform 120ms ease;
}
#hud .hud-orb:active { transform: scale(0.94); filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)) brightness(0.93); }

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
